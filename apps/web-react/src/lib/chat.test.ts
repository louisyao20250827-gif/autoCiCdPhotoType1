import { describe, expect, it } from 'vitest'
import {
  applyFeedback,
  markFailed,
  mergeMessages,
  summarizeFeedback,
  type Message,
} from './chat'

const msg = (over: Partial<Message>): Message => ({
  id: 'id-' + Math.random(),
  sessionId: 's',
  parentId: null,
  senderName: 'A',
  senderRole: 'user',
  content: 'hi',
  appId: 1,
  clientMessageId: null,
  createdAt: '2026-11-08T00:00:00Z',
  ...over,
})

describe('mergeMessages', () => {
  it('sorts by createdAt', () => {
    const a = msg({ id: 'a', createdAt: '2026-11-08T00:02:00Z' })
    const b = msg({ id: 'b', createdAt: '2026-11-08T00:01:00Z' })
    expect(mergeMessages([], [a, b]).map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('replaces the optimistic copy with the confirmed one (matched by client id)', () => {
    const pending = msg({ id: 'local', clientMessageId: 'c1', pending: true })
    const confirmed = msg({ id: 'server', clientMessageId: 'c1' })
    const out = mergeMessages([pending], [confirmed])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'server' })
    expect(out[0].pending).toBeUndefined()
  })

  it('does not duplicate when realtime and API both deliver the same message', () => {
    const confirmed = msg({ id: 'server', clientMessageId: 'c1' })
    const out = mergeMessages(mergeMessages([], [confirmed]), [{ ...confirmed }])
    expect(out).toHaveLength(1)
  })

  it('never downgrades a confirmed message back to pending', () => {
    const confirmed = msg({ id: 'server', clientMessageId: 'c1' })
    const latePending = msg({ id: 'local', clientMessageId: 'c1', pending: true })
    expect(mergeMessages([confirmed], [latePending])[0].id).toBe('server')
  })

  it('a retried failed message is replaced on success', () => {
    const failed = markFailed([msg({ id: 'local', clientMessageId: 'c1', pending: true })], 'c1')
    expect(failed[0].failed).toBe(true)
    const out = mergeMessages(failed, [msg({ id: 'server', clientMessageId: 'c1' })])
    expect(out[0]).toMatchObject({ id: 'server' })
    expect(out[0].failed).toBeUndefined()
  })
})

describe('feedback', () => {
  it('counts one vote per voter and tracks my own rating', () => {
    let map = applyFeedback({}, [
      { MESSAGE_ID: 'm1', VOTER_KEY: 'me', RATING: 1 },
      { MESSAGE_ID: 'm1', VOTER_KEY: 'other', RATING: 1 },
      { MESSAGE_ID: 'm2', VOTER_KEY: 'other', RATING: -1 },
    ])
    map = applyFeedback(map, [{ MESSAGE_ID: 'm1', VOTER_KEY: 'me', RATING: -1 }]) // change vote
    const s = summarizeFeedback(map, 'me')
    expect(s.m1).toEqual({ up: 1, down: 1, mine: -1 })
    expect(s.m2).toEqual({ up: 0, down: 1, mine: null })
  })
})
