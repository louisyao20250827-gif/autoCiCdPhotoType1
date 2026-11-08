export const LOBBY_SESSION_ID = '00000000-0000-4000-8000-000000000001'

const VALID_APP_IDS = [1, 2, 3, 4, 5] as const
export type AppId = (typeof VALID_APP_IDS)[number]

function resolveAppId(): AppId {
  // The Flutter WebView shell (#4) loads the WebView build (#2) with ?app_id=4
  // so messages typed inside the APK are tagged correctly.
  const fromUrl = Number(new URLSearchParams(window.location.search).get('app_id'))
  if ((VALID_APP_IDS as readonly number[]).includes(fromUrl)) return fromUrl as AppId
  const fromEnv = Number(import.meta.env.VITE_APP_ID ?? 1)
  return (VALID_APP_IDS as readonly number[]).includes(fromEnv) ? (fromEnv as AppId) : 1
}

export const config = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL ?? '') as string,
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string,
  apiBaseUrl: ((import.meta.env.VITE_API_BASE_URL ?? '') as string).replace(/\/$/, ''),
  appId: resolveAppId(),
  sessionId: LOBBY_SESSION_ID,
}

/** WebView builds (2, 4) get a compact header and no outer page chrome. */
export const isEmbedded = config.appId === 2 || config.appId === 4

export function missingConfig(): string[] {
  const missing: string[] = []
  if (!config.supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!config.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  if (!config.apiBaseUrl) missing.push('VITE_API_BASE_URL')
  return missing
}

export const APP_LABELS: Record<number, string> = {
  1: '網頁',
  2: 'WebView',
  3: 'Angular',
  4: 'App·WebView',
  5: 'App',
  8: '系統',
}
