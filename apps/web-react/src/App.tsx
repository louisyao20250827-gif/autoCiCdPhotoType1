import { useLayoutEffect, useRef, useState } from 'react'
import { Composer } from './components/Composer'
import { MessageItem } from './components/MessageItem'
import { isEmbedded, missingConfig } from './config'
import { useChat, type ConnectionState } from './hooks/useChat'
import { loadName, saveName } from './lib/storage'

export default function App() {
  const missing = missingConfig()
  if (missing.length > 0) return <ConfigError missing={missing} />
  return <ChatRoom />
}

function ChatRoom() {
  const chat = useChat()
  const [name, setName] = useState(loadName)
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const prependAnchor = useRef<number | null>(null)
  const [showJump, setShowJump] = useState(false)
  const lastId = chat.messages.at(-1)?.id

  // keep view pinned to bottom for new messages; keep position when older ones are prepended
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (prependAnchor.current != null) {
      el.scrollTop += el.scrollHeight - prependAnchor.current
      prependAnchor.current = null
      return
    }
    const last = chat.messages.at(-1)
    if (atBottom.current || (last?.pending && last.senderName === name)) {
      el.scrollTop = el.scrollHeight
      setShowJump(false)
    } else {
      setShowJump(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, chat.messages.length])

  function onScroll() {
    const el = scroller.current!
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom.current) setShowJump(false)
  }

  function loadOlder() {
    prependAnchor.current = scroller.current?.scrollHeight ?? null
    void chat.loadOlder()
  }

  function jumpToBottom() {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className={`mx-auto flex h-dvh w-full flex-col bg-slate-50 dark:bg-slate-950 ${isEmbedded ? '' : 'max-w-3xl sm:border-x sm:border-slate-200 sm:dark:border-slate-800'}`}>
      <header className={`flex items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 ${isEmbedded ? 'py-2' : 'py-3'}`}>
        <div>
          <h1 className={`font-semibold text-slate-900 dark:text-slate-50 ${isEmbedded ? 'text-base' : 'text-lg'}`}>公開大廳</h1>
          {!isEmbedded && <p className="text-xs text-slate-500 dark:text-slate-400">所有人都看得到這裡的訊息</p>}
        </div>
        <ConnectionBadge state={chat.connection} />
      </header>

      <div ref={scroller} onScroll={onScroll} className="relative flex-1 overflow-y-auto overscroll-contain py-2" aria-live="polite">
        {chat.loading && <p className="p-6 text-center text-sm text-slate-500">載入中…</p>}

        {chat.loadError && (
          <div className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            讀取失敗:{chat.loadError}
            <button type="button" onClick={() => void chat.reload()} className="ml-2 font-medium underline">
              重新整理
            </button>
          </div>
        )}

        {chat.hasMore && !chat.loading && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={loadOlder}
              disabled={chat.loadingOlder}
              className="rounded-full px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-slate-800"
            >
              {chat.loadingOlder ? '載入中…' : '載入更早的訊息'}
            </button>
          </div>
        )}

        {!chat.loading && !chat.loadError && chat.messages.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">還沒有訊息,來說第一句話吧!</p>
        )}

        <ul>
          {chat.messages.map((m) => (
            <MessageItem
              key={m.clientMessageId ?? m.id}
              message={m}
              mine={!!name && m.senderName === name && m.senderRole === 'user'}
              feedback={chat.feedbackSummary[m.id]}
              onVote={(r) => void chat.vote(m.id, r)}
              onRetry={() => chat.retry(m)}
            />
          ))}
        </ul>
      </div>

      {showJump && (
        <div className="pointer-events-none relative">
          <button
            type="button"
            onClick={jumpToBottom}
            className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1.5 text-sm text-white shadow-lg"
          >
            有新訊息 ↓
          </button>
        </div>
      )}

      {chat.sendError && (
        <div role="alert" className="flex items-center justify-between gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <span>{chat.sendError}</span>
          <button type="button" onClick={chat.clearSendError} aria-label="關閉" className="px-1">
            ✕
          </button>
        </div>
      )}

      <div className="pb-[env(safe-area-inset-bottom)]">
        <Composer
          name={name}
          onNameChange={(n) => {
            setName(n)
            saveName(n)
          }}
          onSend={(content) => {
            atBottom.current = true
            chat.send(name, content)
          }}
        />
      </div>
    </div>
  )
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const map = {
    live: { text: '即時連線', dot: 'bg-emerald-500' },
    connecting: { text: '連線中', dot: 'bg-amber-400 animate-pulse' },
    offline: { text: '已離線', dot: 'bg-red-500' },
  }[state]
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className={`h-2 w-2 rounded-full ${map.dot}`} aria-hidden />
      {map.text}
    </span>
  )
}

function ConfigError({ missing }: { missing: string[] }) {
  return (
    <div className="mx-auto max-w-lg p-6 text-slate-800 dark:text-slate-100">
      <h1 className="mb-2 text-lg font-semibold">缺少環境變數</h1>
      <p className="mb-3 text-sm">請在 Vercel 專案(或本機 .env.local)設定:</p>
      <ul className="list-inside list-disc font-mono text-sm">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  )
}
