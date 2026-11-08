import { useState, type FormEvent, type KeyboardEvent } from 'react'

const MAX_LEN = 4000

interface Props {
  name: string
  onNameChange: (name: string) => void
  onSend: (content: string) => void
}

export function Composer({ name, onNameChange, onSend }: Props) {
  const [text, setText] = useState('')
  const [editingName, setEditingName] = useState(!name)
  const [draftName, setDraftName] = useState(name)

  const trimmed = text.trim()
  const canSend = !!name && trimmed.length > 0 && trimmed.length <= MAX_LEN

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!canSend) return
    onSend(trimmed)
    setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter = newline; ignore Enter while an IME (注音/倉頡) is composing
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  function saveName(e: FormEvent) {
    e.preventDefault()
    const n = draftName.trim().slice(0, 50)
    if (!n) return
    onNameChange(n)
    setEditingName(false)
  }

  if (editingName || !name) {
    return (
      <form onSubmit={saveName} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <label htmlFor="name" className="shrink-0 text-sm text-slate-600 dark:text-slate-300">
          你的暱稱
        </label>
        <input
          id="name"
          autoFocus
          maxLength={50}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="例如:小明"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={!draftName.trim()}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          開始聊天
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={submit} className="border-t border-slate-200 bg-white px-3 pb-3 pt-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          以 <b className="font-medium text-slate-700 dark:text-slate-200">{name}</b> 發言 ·{' '}
          <button type="button" onClick={() => { setDraftName(name); setEditingName(true) }} className="text-indigo-600 hover:underline dark:text-indigo-400">
            修改
          </button>
        </span>
        {text.length > MAX_LEN * 0.9 && (
          <span className={text.length > MAX_LEN ? 'text-red-600' : ''}>
            {text.length}/{MAX_LEN}
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="輸入訊息,Enter 送出,Shift+Enter 換行"
          aria-label="訊息內容"
          className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none [field-sizing:content] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 font-medium text-white transition-opacity disabled:opacity-40"
        >
          送出
        </button>
      </div>
    </form>
  )
}
