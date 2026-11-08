import { APP_LABELS } from '../config'
import { formatTime, type FeedbackSummary, type Message } from '../lib/chat'

interface Props {
  message: Message
  mine: boolean
  feedback?: FeedbackSummary
  onVote: (rating: 1 | -1) => void
  onRetry: () => void
}

export function MessageItem({ message: m, mine, feedback, onVote, onRetry }: Props) {
  if (m.senderRole === 'system') {
    return (
      <li className="flex justify-center px-4 py-2">
        <span className="rounded-full bg-slate-200/70 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {m.content}
        </span>
      </li>
    )
  }

  const confirmed = !m.pending && !m.failed
  return (
    <li className={`flex px-3 py-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
        <div className="mb-0.5 flex items-center gap-1.5 px-1 text-xs text-slate-500 dark:text-slate-400">
          {!mine && <span className="font-medium text-slate-700 dark:text-slate-200">{m.senderName}</span>}
          {m.appId != null && APP_LABELS[m.appId] && (
            <span className="rounded bg-slate-200 px-1 py-px text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {APP_LABELS[m.appId]}
            </span>
          )}
          <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
        </div>

        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed shadow-sm ${
            mine
              ? 'rounded-br-md bg-indigo-600 text-white'
              : 'rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
          } ${m.pending ? 'opacity-60' : ''} ${m.failed ? 'ring-2 ring-red-500' : ''}`}
        >
          {m.content}
        </div>

        {m.failed && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 px-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
          >
            送出失敗,點此重試
          </button>
        )}
        {m.pending && <span className="mt-0.5 px-1 text-[11px] text-slate-400">傳送中…</span>}

        {confirmed && (
          <div className="mt-0.5 flex gap-1 px-1">
            <VoteButton label="讚" icon="👍" count={feedback?.up ?? 0} active={feedback?.mine === 1} onClick={() => onVote(1)} />
            <VoteButton label="倒讚" icon="👎" count={feedback?.down ?? 0} active={feedback?.mine === -1} onClick={() => onVote(-1)} />
          </div>
        )}
      </div>
    </li>
  )
}

function VoteButton(props: { label: string; icon: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.active}
      onClick={props.onClick}
      className={`flex min-h-7 items-center gap-1 rounded-full px-2 text-xs transition-colors ${
        props.active
          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
          : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300'
      }`}
    >
      <span aria-hidden>{props.icon}</span>
      {props.count > 0 && <span className="tabular-nums">{props.count}</span>}
    </button>
  )
}
