import { config } from '../config'
import type { ApiMessage } from './chat'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(`${config.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, '連不上伺服器(Render 免費方案可能正在喚醒,約 30~60 秒)')
  }
  if (!resp.ok) {
    let detail = resp.statusText
    try {
      const j = await resp.json()
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* keep statusText */
    }
    if (resp.status === 429) detail = '送太快了,請稍等一下'
    throw new ApiError(resp.status, detail)
  }
  return resp.json() as Promise<T>
}

export function postMessage(input: {
  sessionId: string
  senderName: string
  content: string
  clientMessageId: string
}): Promise<ApiMessage> {
  return post<ApiMessage>(`/api/sessions/${input.sessionId}/messages`, {
    sender_name: input.senderName,
    content: input.content,
    app_id: config.appId,
    client_message_id: input.clientMessageId,
  })
}

export function postFeedback(messageId: string, voterKey: string, rating: 1 | -1) {
  return post<{ message_id: string; up: number; down: number }>(`/api/messages/${messageId}/feedback`, {
    voter_key: voterKey,
    rating,
  })
}
