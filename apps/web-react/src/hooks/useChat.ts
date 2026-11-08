import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../config'
import { ApiError, postFeedback, postMessage } from '../lib/api'
import {
  applyFeedback,
  fromApi,
  fromDbRow,
  markFailed,
  mergeMessages,
  newId,
  summarizeFeedback,
  type DbMessageRow,
  type FeedbackMap,
  type FeedbackRow,
  type Message,
} from '../lib/chat'
import { getVoterKey } from '../lib/storage'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 50
export type ConnectionState = 'connecting' | 'live' | 'offline'

async function fetchPage(before?: string): Promise<Message[]> {
  let q = supabase
    .from('CHAT_MESSAGES')
    .select('*')
    .eq('SESSION_ID', config.sessionId)
    .eq('IS_DELETED', false)
    .order('CREATED_AT', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) q = q.lt('CREATED_AT', before)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data as DbMessageRow[]).map(fromDbRow)
}

async function fetchFeedback(messageIds: string[]): Promise<FeedbackRow[]> {
  if (messageIds.length === 0) return []
  const { data, error } = await supabase
    .from('MESSAGE_FEEDBACK')
    .select('MESSAGE_ID,VOTER_KEY,RATING')
    .in('MESSAGE_ID', messageIds)
  if (error) throw new Error(error.message)
  return data as FeedbackRow[]
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [feedback, setFeedback] = useState<FeedbackMap>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [sendError, setSendError] = useState<string | null>(null)
  const voterKey = getVoterKey()
  const wasLive = useRef(false)

  const loadLatest = useCallback(async () => {
    try {
      const page = await fetchPage()
      setMessages((cur) => mergeMessages(cur, page))
      setHasMore((prev) => prev || page.length === PAGE_SIZE)
      const fb = await fetchFeedback(page.map((m) => m.id))
      setFeedback((cur) => applyFeedback(cur, fb))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLatest()

    const channel = supabase
      .channel(`session:${config.sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'CHAT_MESSAGES', filter: `SESSION_ID=eq.${config.sessionId}` },
        (payload) => setMessages((cur) => mergeMessages(cur, [fromDbRow(payload.new as DbMessageRow)])),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'MESSAGE_FEEDBACK' }, (payload) => {
        const row = payload.new as Partial<FeedbackRow>
        if (row.MESSAGE_ID && row.VOTER_KEY && row.RATING != null) {
          setFeedback((cur) => applyFeedback(cur, [row as FeedbackRow]))
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // after a reconnect, refetch to fill anything missed while offline
          if (wasLive.current) void loadLatest()
          wasLive.current = true
          setConnection('live')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('offline')
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadLatest])

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m.pending && !m.failed)
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await fetchPage(oldest.createdAt)
      setMessages((cur) => mergeMessages(cur, page))
      setHasMore(page.length === PAGE_SIZE)
      const fb = await fetchFeedback(page.map((m) => m.id))
      setFeedback((cur) => applyFeedback(cur, fb))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingOlder(false)
    }
  }, [messages, loadingOlder])

  const deliver = useCallback(async (local: Message) => {
    try {
      const saved = await postMessage({
        sessionId: config.sessionId,
        senderName: local.senderName,
        content: local.content,
        clientMessageId: local.clientMessageId!,
      })
      setMessages((cur) => mergeMessages(cur, [fromApi(saved)]))
      setSendError(null)
    } catch (e) {
      setMessages((cur) => markFailed(cur, local.clientMessageId!))
      setSendError(e instanceof ApiError ? e.message : '送出失敗')
    }
  }, [])

  const send = useCallback(
    (senderName: string, content: string) => {
      const local: Message = {
        id: `local-${newId()}`,
        sessionId: config.sessionId,
        parentId: null,
        senderName,
        senderRole: 'user',
        content,
        appId: config.appId,
        clientMessageId: newId(),
        createdAt: new Date().toISOString(),
        pending: true,
      }
      setMessages((cur) => mergeMessages(cur, [local]))
      void deliver(local)
    },
    [deliver],
  )

  /** Same client_message_id → the API returns the original if the first attempt actually landed. */
  const retry = useCallback(
    (m: Message) => {
      const again = { ...m, pending: true, failed: false }
      setMessages((cur) => cur.map((x) => (x.clientMessageId === m.clientMessageId ? again : x)))
      void deliver(again)
    },
    [deliver],
  )

  const vote = useCallback(
    async (messageId: string, rating: 1 | -1) => {
      const key = `${messageId}|${voterKey}`
      const previous = feedback[key]
      setFeedback((cur) => ({ ...cur, [key]: rating })) // optimistic
      try {
        await postFeedback(messageId, voterKey, rating)
      } catch (e) {
        setFeedback((cur) => {
          const next = { ...cur }
          if (previous === undefined) delete next[key]
          else next[key] = previous
          return next
        })
        setSendError(e instanceof ApiError ? e.message : '投票失敗')
      }
    },
    [feedback, voterKey],
  )

  const feedbackSummary = useMemo(() => summarizeFeedback(feedback, voterKey), [feedback, voterKey])

  return {
    messages,
    feedbackSummary,
    loading,
    loadError,
    hasMore,
    loadingOlder,
    connection,
    sendError,
    clearSendError: () => setSendError(null),
    send,
    retry,
    vote,
    loadOlder,
    reload: loadLatest,
  }
}
