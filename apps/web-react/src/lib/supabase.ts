import { createClient } from '@supabase/supabase-js'
import { config } from '../config'

// anon key only: RLS allows SELECT, all writes go through FastAPI.
export const supabase = createClient(config.supabaseUrl || 'http://invalid.local', config.supabaseAnonKey || 'missing', {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
})
