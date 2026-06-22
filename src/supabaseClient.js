import { createClient } from '@supabase/supabase-js'

function normalizeSupabaseUrl(value = '') {
  return String(value)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '')
    .replace(/\/auth\/v1$/i, '')
}

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const url = normalizeSupabaseUrl(rawUrl)
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('your-project-ref') && !anonKey.includes('your-anon-public-key'))

if (rawUrl && rawUrl !== url) {
  console.warn(`CareerSignal normalized VITE_SUPABASE_URL from "${rawUrl}" to "${url}". In .env.local, use only the base Supabase URL.`)
}

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export async function getCurrentSession() {
  if (!supabase) return { session: null, user: null }
  const { data } = await supabase.auth.getSession()
  return { session: data.session, user: data.session?.user ?? null }
}

export async function getUserProfile(userId) {
  if (!supabase || !userId) return null

  // Preferred production path: RPC is SECURITY DEFINER and avoids broken/stale RLS
  // policies from locking the app out of the current user's own profile row.
  const rpc = await supabase.rpc('get_my_profile')
  if (!rpc.error && rpc.data) return Array.isArray(rpc.data) ? rpc.data[0] : rpc.data

  // Fallback for projects that have not run admin-auth-fix.sql yet.
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.warn('Could not load CareerSignal profile:', error.message)
    return null
  }
  return data
}
