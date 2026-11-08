// Pure chat-state helpers (no React, no network) — unit tested in chat.test.ts.

export type SenderRole = 'user' | 'assistant' | 'system'

export interface Message {
  id: string
  sessionId: string
  parentId: string | null
  senderName: string
  senderRole: SenderRole
  content: string
  appId: number | null
  clientMessageId: string | null
  createdAt: string
  /** local only: sent but not yet confirmed by the API */
  pending?: boolean
  /** local only: API call failed, can be retried */
  failed?: boolean
}

/** Row as returned by Supabase (UPPERCASE columns). */
export interface DbMessageRow {
  MESSAGE_ID: string
  SESSION_ID: string
  PARENT_MESSAGE_ID: string | null
  SENDER_NAME: string
  SENDER_ROLE: SenderRole
  CONTENT: string
  APP_ID: number | null
  CLIENT_MESSAGE_ID: string | null
  IS_DELETED?: boolean
  CREATED_AT: string
}

/** Row as returned by FastAPI (snake_case). */
export interface ApiMessage {
  message_id: string
  session_id: string
  parent_message_id: string | null
  sender_name: string
  sender_role: SenderRole
  content: string
  app_id: number | null
  client_message_id: string | null
  created_at: string
}

export function fromDbRow(r: DbMessageRow): Message {
  return {
    id: r.MESSAGE_ID,
    sessionId: r.SESSION_ID,
    parentId: r.PARENT_MESSAGE_ID,
    senderName: r.SENDER_NAME,
    senderRole: r.SENDER_ROLE,
    content: r.CONTENT,
    appId: r.APP_ID,
    clientMessageId: r.CLIENT_MESSAGE_ID,
    createdAt: r.CREATED_AT,
  }
}

export function fromApi(r: ApiMessage): Message {
  return {
    id: r.message_id,
    sessionId: r.session_id,
    parentId: r.parent_message_id,
    senderName: r.sender_name,
    senderRole: r.sender_role,
    content: r.content,
    appId: r.app_id,
    clientMessageId: r.client_message_id,
    createdAt: r.created_at,
  }
}

const ts = (m: Message) => Date.parse(m.createdAt)

/**
 * Merge incoming messages into the list.
 * The same message can arrive 3 ways (optimistic local copy, API response, realtime INSERT),
 * so we match on server id OR client_message_id; a confirmed copy always replaces a pending one.
 */
export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const out = [...current]
  for (const msg of incoming) {
    const idx = out.findIndex(
      (m) => m.id === msg.id || (msg.clientMessageId != null && m.clientMessageId === msg.clientMessageId),
    )
    if (idx === -1) {
      out.push(msg)
    } else if (out[idx].pending || out[idx].failed || !msg.pending) {
      out[idx] = msg
    }
  }
  return out.sort((a, b) => ts(a) - ts(b) || a.id.localeCompare(b.id))
}

export function markFailed(current: Message[], clientMessageId: string): Message[] {
  return current.map((m) =>
    m.clientMessageId === clientMessageId && m.pending ? { ...m, pending: false, failed: true } : m,
  )
}

// ---------------------------------------------------------------- feedback

export interface FeedbackRow {
  MESSAGE_ID: string
  VOTER_KEY: string
  RATING: number
}

/** key = `${messageId}|${voterKey}` → rating; one vote per voter per message, like the DB constraint */
export type FeedbackMap = Record<string, number>

export function applyFeedback(map: FeedbackMap, rows: FeedbackRow[]): FeedbackMap {
  const next = { ...map }
  for (const r of rows) next[`${r.MESSAGE_ID}|${r.VOTER_KEY}`] = r.RATING
  return next
}

export interface FeedbackSummary {
  up: number
  down: number
  mine: number | null
}

export function summarizeFeedback(map: FeedbackMap, voterKey: string): Record<string, FeedbackSummary> {
  const out: Record<string, FeedbackSummary> = {}
  for (const [key, rating] of Object.entries(map)) {
    const sep = key.indexOf('|')
    const messageId = key.slice(0, sep)
    const voter = key.slice(sep + 1)
    const s = (out[messageId] ??= { up: 0, down: 0, mine: null })
    if (rating === 1) s.up++
    else if (rating === -1) s.down++
    if (voter === voterKey) s.mine = rating
  }
  return out
}

// ---------------------------------------------------------------- misc

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // fallback for old Android WebViews / insecure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function formatTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return time
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}
