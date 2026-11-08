import { newId } from './chat'

// localStorage can throw in private mode / some WebViews — never let it break the app.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export const loadName = () => read('chat.name') ?? ''
export const saveName = (name: string) => write('chat.name', name)

let cachedVoterKey: string | null = null
/** Random per-device id used for one-vote-per-message until login exists. */
export function getVoterKey(): string {
  if (cachedVoterKey) return cachedVoterKey
  let key = read('chat.voterKey')
  if (!key) {
    key = `dev-${newId()}`
    write('chat.voterKey', key)
  }
  cachedVoterKey = key
  return key
}
