import { supabase, isSupabaseConfigured } from './supabaseClient.js'

const CONSENT_KEY = 'cs_cookie_consent'
const VISITOR_KEY = 'cs_visitor_id'

export function getConsent() {
  try { return JSON.parse(localStorage.getItem(CONSENT_KEY)) } catch { return null }
}

export function setConsent(value) {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ ...value, decidedAt: new Date().toISOString() }))
}

export function getVisitorId() {
  let id = localStorage.getItem(VISITOR_KEY)
  if (!id) {
    id = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}

export function incrementVisitCount() {
  const count = Number(localStorage.getItem('cs_visit_count') || 0) + 1
  localStorage.setItem('cs_visit_count', String(count))
  return count
}

export async function trackEvent(eventName, payload = {}, user = null) {
  const consent = getConsent()
  if (!consent?.analytics) return
  const event = {
    event_name: eventName,
    path: location.hash || '#/',
    visitor_id: getVisitorId(),
    user_id: user?.id ?? null,
    payload,
    user_agent: navigator.userAgent,
  }
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('analytics_events').insert(event)
    if (error) {
      console.warn('CareerSignal analytics event was not stored:', error.message)
      storeLocalEvent(event)
    }
  } else {
    storeLocalEvent(event)
  }
}

function storeLocalEvent(event) {
  const local = JSON.parse(localStorage.getItem('cs_local_events') || '[]')
  local.push({ ...event, created_at: new Date().toISOString() })
  localStorage.setItem('cs_local_events', JSON.stringify(local.slice(-500)))
}
