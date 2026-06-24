import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DB } from './data.js'
import { supabase, isSupabaseConfigured, getCurrentSession, getUserProfile } from './supabaseClient.js'
import { getConsent, setConsent, incrementVisitCount, trackEvent } from './analytics.js'
import Papa from 'papaparse'
import './styles.css'

const REGIONS = ['Zambia', 'Africa', 'Global']
const defaultProfile = {
  education: 'diploma',
  location: 'Zambia',
  skills: [],
  interests: [],
  preferences: [],
  risk: 'Medium',
  weights: { marketability: 35, profitability: 35, demand: 30 },
  region: 'Zambia',
}

const skills = 'excel,sql,programming,communication,project management,customer service,data collection,financial modelling,electrical,mechanics,teaching,patient care,sales,gis,research,security,cloud'.split(',')
const interests = 'technology,data,healthcare,agriculture,environment,engineering,business,finance,people,creative,societal impact,hands-on,management,research,education'.split(',')
const prefs = 'remote,hybrid,office,field,shift'.split(',')
const steps = ['Education & location', 'Skills', 'Interests & work style', 'Priorities']

function useHashRoute() {
  const [route, setRoute] = useState(() => location.hash.slice(1) || '/')
  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(1) || '/')
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  return route
}

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? initial } catch { return initial }
  })
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value])
  return [value, setValue]
}

function source(id) { return DB.sources.find(s => s.id === id) || { id, name: id, url: '#' } }
function market(career, region) { return career.market_data.find(m => m.region === region) || career.market_data[0] }
function zmw(n) { return `ZMW ${Number(n).toLocaleString('en-ZM')}/mo` }
function usd(n) { return `US$${Number(n).toLocaleString('en-US')}/mo` }
function titleCase(s) { return s.replace(/\b\w/g, m => m.toUpperCase()) }

function composite(career, profile) {
  const m = market(career, profile.region)
  const w = profile.weights
  const total = w.marketability + w.profitability + w.demand || 100
  return Math.round((m.marketability_score * w.marketability + m.profitability_score * w.profitability + m.demand_score * w.demand) / total)
}

function fitScore(career, profile) {
  const skillHits = profile.skills.filter(s => career.skills.some(x => x.includes(s) || s.includes(x))).length
  const interestHits = profile.interests.filter(i => career.interests.includes(i)).length
  const prefHits = profile.preferences.filter(p => career.work_preferences.includes(p)).length
  const eduBoost = { secondary: 0, certificate: 4, diploma: 7, degree: 10, postgraduate: 12 }[profile.education] || 6
  const riskBoost = profile.risk === 'Low'
    ? (/Healthcare|Education|Finance|Infrastructure/.test(career.category) ? 8 : 2)
    : profile.risk === 'High'
      ? (career.id.includes('entrepreneur') || career.category === 'Technology' ? 8 : 3)
      : 5
  return Math.min(100, skillHits * 8 + interestHits * 10 + prefHits * 5 + eduBoost + riskBoost)
}

function rankCareers(profile) {
  return DB.careers
    .map(career => ({ career, total: Math.round(composite(career, profile) * 0.72 + fitScore(career, profile) * 0.28) }))
    .sort((a, b) => b.total - a.total)
}

function whyMatched(career, profile) {
  const parts = []
  const i = profile.interests.filter(x => career.interests.includes(x))
  const s = profile.skills.filter(x => career.skills.some(y => y.includes(x) || x.includes(y)))
  const p = profile.preferences.filter(x => career.work_preferences.includes(x))
  if (i.length) parts.push(`aligns with ${i.slice(0, 2).join(' and ')} interests`)
  if (s.length) parts.push(`uses ${s.slice(0, 2).join(' and ')} skills`)
  if (p.length) parts.push(`fits ${p.slice(0, 2).join(' / ')} work preference`)
  return parts.length ? `Matched because it ${parts.join(', ')}.` : 'Matched by strong market, pay and societal need signals for the selected region.'
}

function App() {
  const route = useHashRoute()
  const [profile, setProfile] = useLocalStorage('cs_profile', defaultProfile)
  const [shortlist, setShortlist] = useLocalStorage('cs_short', [])
  const [toast, setToast] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('cs_theme') || 'light')
  const [user, setUser] = useState(null)
  const [accountProfile, setAccountProfile] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [visitCount, setVisitCount] = useState(() => Number(localStorage.getItem('cs_visit_count') || 0))
  const [consent, setConsentState] = useState(() => getConsent())

  useEffect(() => { window.scrollTo(0, 0); setMenuOpen(false) }, [route])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('cs_theme', theme) }, [theme])
  useEffect(() => {
    if (route.startsWith('/signin')) { setAuthMode('signin'); setAuthOpen(true) }
    if (route.startsWith('/signup')) { setAuthMode('signup'); setAuthOpen(true) }
  }, [route])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2300); return () => clearTimeout(t) }, [toast])
  useEffect(() => {
    setVisitCount(incrementVisitCount())
    if (!isSupabaseConfigured) return
    getCurrentSession().then(async ({ user }) => {
      setUser(user)
      if (user) setAccountProfile(await getUserProfile(user.id))
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      setAccountProfile(nextUser ? await getUserProfile(nextUser.id) : null)
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setAccountProfile(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => { trackEvent('page_view', { route }, user) }, [route, user])
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return
    getUserProfile(user.id).then(setAccountProfile)
  }, [route, user?.id])

  const notify = msg => setToast(msg)
  const openAuth = (mode = 'signin') => { setAuthMode(mode); setAuthOpen(true) }
  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut({ scope: 'local' })
    setUser(null)
    setAccountProfile(null)
    setAuthOpen(false)
    setAuthMode('signin')
    notify('Signed out successfully')
    location.hash = '#/'
  }
  const setRegion = region => setProfile(p => ({ ...p, region }))
  const toggleShortlist = id => setShortlist(list => {
    if (list.includes(id)) { notify('Removed from comparison'); return list.filter(x => x !== id) }
    if (list.length >= 3) { notify('Compare up to 3 careers. Remove one first.'); return list }
    notify('Added to comparison')
    return [...list, id]
  })

  const ctx = { profile, setProfile, shortlist, toggleShortlist, setRegion, user, accountProfile, setAuthOpen, openAuth, notify }
  let page
  if (route === '/') page = <Landing profile={profile} notify={notify} />
  else if (route.startsWith('/signin') || route.startsWith('/signup')) page = <Landing profile={profile} notify={notify} />
  else if (route.startsWith('/assessment')) page = <Assessment profile={profile} setProfile={setProfile} />
  else if (route.startsWith('/results')) page = <Results {...ctx} />
  else if (route.startsWith('/career/')) page = <CareerDetail id={route.split('/')[2]} {...ctx} />
  else if (route.startsWith('/compare')) page = <Compare {...ctx} />
  else if (route.startsWith('/dashboard')) page = <UserDashboard {...ctx} />
  else if (route.startsWith('/methodology')) page = <Methodology />
  else if (route.startsWith('/sources')) page = <Sources />
  else if (route.startsWith('/sitemap')) page = <SiteMap accountProfile={accountProfile} user={user} />
  else if (route.startsWith('/admin')) page = <Admin notify={notify} user={user} accountProfile={accountProfile} />
  else page = <Empty title="Page not found" />

  return <>
    <header className="top"><nav className="shell nav">
      <a className="brand" href="#/"><span>CS</span><b>CareerSignal<small>Africa</small></b></a>
      <button className="menu solid-menu" style={{ backgroundColor: '#0b4b78', color: '#fff', border: '2px solid #0e6ea8', opacity: 1 }} onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">☰</button>
      <div className={`links ${menuOpen ? 'open' : ''}`}>
        <a href="#/methodology">Methodology</a><a href="#/sources">Sources</a><a href="#/sitemap">Site map</a>{user && <a href="#/dashboard">Dashboard</a>}{accountProfile?.role === 'admin' && <a href="#/admin">Admin</a>}<button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle light and dark theme">{theme === 'dark' ? '☀️' : '🌙'}</button>{user ? <button className="btn secondary small" onClick={handleSignOut}>Sign out</button> : <button className="btn secondary small" onClick={() => openAuth('signin')}>Sign in</button>}<a className="btn primary small" href="#/assessment">Find your career</a>
      </div>
    </nav></header>
    <main>{page}</main>
    <footer><div className="shell foot footer-nav"><div><b>CareerSignal Africa</b><p>Directional career intelligence for Zambia, Africa and global opportunity context.</p><p className="micro-note"><b>Disclaimer:</b> recommendations are informational estimates, not professional career, financial, legal, or education advice.</p></div><div><h3>Explore</h3><a href="#/">Home</a><a href="#/assessment">Find your career</a><a href="#/results">Recommendations</a><a href="#/compare">Compare careers</a></div><div><h3>Trust & data</h3><a href="#/methodology">Methodology</a><a href="#/sources">Data sources</a><a href="#/sitemap">Full site map</a><p className="micro-note"><b>Data integrity:</b> source refreshes use official reports, partnerships, permitted APIs/RSS, or manual curation.</p></div><div><h3>Account</h3>{user ? <><a href="#/dashboard">Dashboard</a>{accountProfile?.role === 'admin' && <a href="#/admin">Admin dashboard</a>}<button className="footer-button" onClick={handleSignOut}>Sign out</button></> : <><button className="footer-button" onClick={() => openAuth('signin')}>Sign in</button><button className="footer-button" onClick={() => openAuth('signup')}>Create account</button></>}</div></div></footer>
    {!consent && <CookieConsent onDecide={next => { setConsent(next); setConsentState(next); trackEvent('cookie_consent_updated', next, user) }} />}
    {authOpen && <AuthModal initialMode={authMode} onClose={() => setAuthOpen(false)} notify={notify} />}
    {visitCount >= 2 && !user && !authOpen && !['/methodology','/sources'].some(x => route.startsWith(x)) && <AccountGate onSignIn={() => openAuth('signup')} />}
    <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
  </>
}


function CookieConsent({ onDecide }) {
  return <div className="cookie-banner"><div><h3>Help us improve CareerSignal Africa</h3><p className="micro">We use privacy-conscious cookies/local storage to remember your choices and, with your consent, collect usage analytics for product decisions. You can use the first recommendation without an account.</p></div><div className="cookie-actions"><button className="btn secondary small" onClick={() => onDecide({ necessary: true, analytics: false, newsletter: false })}>Necessary only</button><button className="btn primary small" onClick={() => onDecide({ necessary: true, analytics: true, newsletter: true })}>Accept analytics</button></div></div>
}

function AccountGate({ onSignIn }) {
  return <div className="auth-gate"><div className="card gate-card"><span className="eyebrow">Account required on your second visit</span><h2>Create a free account to continue</h2><p className="muted">Your first recommendation is free without login. From your second visit, an account helps you save recommendations, improve future career-data decisions, and access your dashboard.</p><div className="actions"><button className="btn primary" onClick={onSignIn}>Create account / sign in</button><a className="btn ghost" href="#/methodology">View methodology</a></div><p className="micro">The MVP is free. Payments may be considered later, but not in this launch version.</p></div></div>
}

function AuthModal({ initialMode = 'signin', onClose, notify }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(() => location.hash.includes('confirmed=1') ? { type: 'success', text: 'Email confirmed. Please sign in with the email and password you used to create your account.' } : null)
  useEffect(() => {
    setMode(initialMode)
    if (location.hash.includes('confirmed=1')) setMessage({ type: 'success', text: 'Email confirmed. Please sign in with the email and password you used to create your account.' })
  }, [initialMode])
  const normalEmail = email.trim().toLowerCase()
  const submit = async e => {
    e.preventDefault()
    setMessage(null)
    if (!isSupabaseConfigured) { notify('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local first.'); return }
    setLoading(true)
    try {
      if (mode === 'signup') {
        const redirectTo = `${window.location.origin}${window.location.pathname}#/signin?confirmed=1`
        const res = await supabase.auth.signUp({
          email: normalEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: redirectTo,
          },
        })
        if (res.error) throw res.error
        await trackEvent('signup', { email_domain: normalEmail.split('@')[1] })
        if (res.data?.session) {
          setMessage({ type: 'success', text: 'Account created successfully. Redirecting to your dashboard…' })
          notify('Account created successfully')
          setTimeout(() => { onClose(); location.hash = '#/dashboard' }, 900)
        } else {
          setPassword('')
          setMessage({ type: 'success', text: 'Account created. We sent you a confirmation email. Click the email link, then sign in here.' })
          notify('Confirmation email sent. Please check your inbox.')
          setMode('signin')
        }
      } else {
        const res = await supabase.auth.signInWithPassword({ email: normalEmail, password })
        if (res.error) {
          const invalid = /invalid login credentials/i.test(res.error.message)
          throw new Error(invalid ? 'Invalid login credentials. Confirm your email first, then use the exact email and password you created. If needed, use Reset password below.' : res.error.message)
        }
        await trackEvent('login', { email_domain: normalEmail.split('@')[1] })
        setMessage({ type: 'success', text: 'Signed in successfully. Redirecting to your dashboard…' })
        notify('Signed in successfully')
        setTimeout(() => { onClose(); location.hash = '#/dashboard' }, 700)
      }
    } catch (err) {
      const text = err.message || 'Authentication failed'
      setMessage({ type: 'error', text })
      notify(text)
    } finally { setLoading(false) }
  }
  const resetPassword = async () => {
    if (!normalEmail) { setMessage({ type: 'error', text: 'Enter your email first, then click reset password.' }); return }
    if (!isSupabaseConfigured) { notify('Supabase is not configured yet.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(normalEmail, { redirectTo: `${window.location.origin}${window.location.pathname}#/signin` })
    if (error) setMessage({ type: 'error', text: error.message })
    else setMessage({ type: 'success', text: 'Password reset email sent. Check your inbox.' })
  }
  return <div className="modal-backdrop"><form className="card auth-modal" onSubmit={submit}><button type="button" className="modal-x" onClick={onClose}>×</button><span className="eyebrow">Free account</span><h2>{mode === 'signup' ? 'Create your CareerSignal account' : 'Welcome back'}</h2>{!isSupabaseConfigured && <div className="notice warn">Supabase is not configured yet. Add your keys in <span className="kbd">.env.local</span>.</div>}{message && <div className={`notice ${message.type === 'error' ? 'warn' : 'success'}`}>{message.text}</div>}{mode === 'signup' && <div className="field"><label>Full name</label><input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" required /></div>}<div className="field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div><div className="field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required /></div><button className="btn primary" disabled={loading}>{loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button><p className="micro">{mode === 'signup' ? 'Already have an account?' : 'New here?'} <button type="button" className="text-button" onClick={() => { setMessage(null); setMode(mode === 'signup' ? 'signin' : 'signup') }}>{mode === 'signup' ? 'Sign in' : 'Create account'}</button>{mode === 'signin' && <> · <button type="button" className="text-button" onClick={resetPassword}>Reset password</button></>}</p><p className="micro">Sign-up sends a confirmation email when email confirmation is enabled in Supabase Auth settings.</p></form></div>
}

function NewsletterForm({ notify }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async e => {
    e.preventDefault(); setLoading(true)
    try {
      if (isSupabaseConfigured) await supabase.from('newsletter_subscribers').upsert({ email, source: 'landing_page' }, { onConflict: 'email' })
      else localStorage.setItem('cs_newsletter_email', email)
      await trackEvent('newsletter_signup', { source: 'landing_page' })
      notify?.('Newsletter signup saved')
      setEmail('')
    } catch (err) { notify?.(err.message || 'Could not save email') }
    finally { setLoading(false) }
  }
  return <form className="newsletter" onSubmit={submit}><div><h3>Get career-market updates</h3><p className="micro">Join the newsletter for Zambia-first career insights and new data releases.</p></div><div className="newsletter-row"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /><button className="btn primary small" disabled={loading}>Subscribe</button></div></form>
}

function Landing({ profile, notify }) {
  const top = rankCareers({ ...profile, region: 'Zambia' }).slice(0, 3)
  return <>
    <section className="hero"><div className="shell hero-grid"><div>
      <span className="eyebrow">Zambia-first career intelligence • Africa & global benchmarks</span>
      <h1>Choose a career path with evidence, not guesswork.</h1>
      <p className="lead">CareerSignal Africa recommends career paths using transparent estimates for marketability, profitability and societal need, with visible source provenance.</p>
      <div className="actions"><a className="btn primary" href="#/assessment">Start the 4-minute assessment</a><a className="btn secondary" href="#/methodology">View methodology</a></div>
      <p className="micro">No account required. Your profile stays in this browser.</p>
      <div className="trust"><span className="pill">✓ Zambia default</span><span className="pill">✓ {DB.sources.length} source directory</span><span className="pill">✓ Score breakdowns</span><span className="pill">✓ Low-bandwidth UI</span></div>
    </div><aside className="panel">
      <div className="card flat"><h3>Example Zambia ranking</h3>{top.map((x, i) => <MiniBar key={x.career.id} label={`#${i + 1} ${x.career.title}`} value={x.total} />)}</div>
      <div className="card flat"><h3>Default weighting</h3><MiniBar label="Market" value={35} suffix="%" /><MiniBar label="Pay" value={35} suffix="%" /><MiniBar label="Need" value={30} suffix="%" /></div>
    </aside></div></section>
    <section className="section"><div className="shell"><NewsletterForm notify={notify} /></div></section>
    <section className="section"><div className="shell"><div className="head"><div><h2>Corporate-grade clarity for consequential choices</h2><p className="muted">Built for students, graduates, professionals, advisors and institutions.</p></div></div><div className="grid g3"><Feature title="Transparent scoring" text="Every career shows marketability, profitability and need scores with source names and dates." /><Feature title="Three market lenses" text="Default to Zambia, then compare Africa-wide and global context for the same role." /><Feature title="Actionable paths" text="See qualifications, gaps, certifications and resources for your target career." /></div></div></section>
    <section className="section"><div className="shell stats"><Stat value={DB.careers.length} label="Seed careers" /><Stat value={DB.sources.length} label="Data sources" /><Stat value="3" label="Regions" /><Stat value="0" label="Accounts required" /></div></section>
  </>
}
function MiniBar({ label, value, suffix = '' }) { return <div className="bar"><span>{label.slice(0, 22)}</span><span className="track"><i className="fill" style={{ display: 'block', width: `${value}%` }} /></span><b>{value}{suffix}</b></div> }
function Feature({ title, text }) { return <div className="card"><h3>{title}</h3><p className="muted">{text}</p></div> }
function Stat({ value, label }) { return <div className="stat"><b>{value}</b>{label}</div> }

function Assessment({ profile, setProfile }) {
  const [step, setStep] = useState(0)
  const update = patch => setProfile(p => ({ ...p, ...patch }))
  const toggle = (group, value) => setProfile(p => ({ ...p, [group]: p[group].includes(value) ? p[group].filter(x => x !== value) : [...p[group], value] }))
  const total = profile.weights.marketability + profile.weights.profitability + profile.weights.demand
  const next = () => step < steps.length - 1 ? setStep(step + 1) : location.hash = '#/results'
  return <section className="section"><div className="shell"><div className="title"><span className="eyebrow">Multi-step assessment</span><h1>Find careers that fit your goals.</h1></div><div className="wizard">
    <aside className="card steps">{steps.map((s, i) => <div key={s} className={`step ${i === step ? 'on' : ''}`}><i>{i + 1}</i>{s}</div>)}</aside>
    <section className="card">
      {step === 0 && <><h2>Set your context</h2><p className="muted">This determines education fit and default region.</p><Select label="Highest education level" value={profile.education} options={['secondary', 'certificate', 'diploma', 'degree', 'postgraduate']} onChange={education => update({ education })} /><div className="field"><label>Current location</label><input value={profile.location} onChange={e => update({ location: e.target.value })} /></div><Select label="Default market view" value={profile.region} options={REGIONS} onChange={region => update({ region })} /><Select label="Risk tolerance" value={profile.risk} options={['Low', 'Medium', 'High']} onChange={risk => update({ risk })} /></>}
      {step === 1 && <><h2>Select your current skills</h2><div className="chips">{skills.map(x => <Chip key={x} checked={profile.skills.includes(x)} onChange={() => toggle('skills', x)}>{titleCase(x)}</Chip>)}</div></>}
      {step === 2 && <><h2>What work energises you?</h2><div className="field"><legend>Interests</legend><div className="chips">{interests.map(x => <Chip key={x} checked={profile.interests.includes(x)} onChange={() => toggle('interests', x)}>{titleCase(x)}</Chip>)}</div></div><div className="field"><legend>Work preferences</legend><div className="chips">{prefs.map(x => <Chip key={x} checked={profile.preferences.includes(x)} onChange={() => toggle('preferences', x)}>{titleCase(x)}</Chip>)}</div></div></>}
      {step === 3 && <><h2>Set your priorities</h2><p className="muted">The composite score is a user-adjustable weighted average.</p><WeightSliders profile={profile} setProfile={setProfile} /><div className="notice">Current total: <b>{total}%</b>. {total === 100 ? 'Great — directly comparable.' : 'Ranking normalises the selected priorities.'}</div></>}
      <div className="wiz-actions"><button className="btn secondary" disabled={step === 0} onClick={() => setStep(Math.max(0, step - 1))}>Back</button><button className="btn primary" onClick={next}>{step === steps.length - 1 ? 'See recommendations' : 'Continue'}</button></div>
    </section>
  </div></div></section>
}
function Select({ label, value, options, onChange }) { return <div className="field"><label>{label}</label><select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></div> }
function Chip({ checked, onChange, children }) { return <label className={`chip ${checked ? 'on' : ''}`}><input type="checkbox" checked={checked} onChange={onChange} />{children}</label> }
function WeightSliders({ profile, setProfile }) { return <>{[['marketability', 'Marketability'], ['profitability', 'Profitability'], ['demand', 'Need / demand']].map(([key, label]) => <div className="slider" key={key}><label>{label}</label><input type="range" min="0" max="80" value={profile.weights[key]} onChange={e => setProfile(p => ({ ...p, weights: { ...p.weights, [key]: Number(e.target.value) } }))} /><b>{profile.weights[key]}%</b></div>)}</> }

function RegionSwitch({ region, onRegion }) { return <div className="seg">{REGIONS.map(r => <button key={r} className={r === region ? 'on' : ''} onClick={() => onRegion(r)}>{r}</button>)}</div> }
function Results({ profile, setProfile, shortlist, toggleShortlist, setRegion }) {
  const list = useMemo(() => rankCareers(profile).slice(0, 10), [profile])
  const total = profile.weights.marketability + profile.weights.profitability + profile.weights.demand
  return <section className="section"><div className="shell"><div className="head"><div><span className="eyebrow">Recommendations</span><h2>Top career matches for {profile.location || profile.region}</h2><p className="muted">Directional estimates using {profile.region} as active context.</p></div><RegionSwitch region={profile.region} onRegion={setRegion} /></div><div className="results"><aside className="card sticky"><h3>Your priorities</h3><WeightSliders profile={profile} setProfile={setProfile} /><div className="notice">Current total: <b>{total}%</b>. Ranking normalises selected priorities.</div><div className="actions"><a className="btn secondary" href="#/assessment">Edit assessment</a><a className="btn ghost" href="#/compare">Compare ({shortlist.length})</a></div></aside><div>{list.map((x, i) => <CareerCard key={x.career.id} career={x.career} rank={i + 1} total={x.total} profile={profile} shortlisted={shortlist.includes(x.career.id)} onShortlist={toggleShortlist} />)}</div></div></div></section>
}
function CareerCard({ career, rank, total, profile, shortlisted, onShortlist }) { const m = market(career, profile.region); return <article className="card career"><div><div className="ctitle"><span className="rank">{rank}</span><h3>{career.title}</h3><span className="tag blue">{career.category}</span></div><p className="muted">{career.description}</p><p><b>Why it matched:</b> {whyMatched(career, profile)}</p><div className="trust"><span className="tag green">{zmw(m.median_salary_local)} ({usd(m.median_salary_usd)})</span><span className="tag">Trend <b className={m.trend}>{m.trend}</b></span><span className="tag">Fit {fitScore(career, profile)}</span></div><Scores career={career} region={profile.region} /><div className="actions"><a className="btn primary small" href={`#/career/${career.id}`}>View detail</a><button className={`btn ${shortlisted ? 'danger' : 'secondary'} small`} onClick={() => onShortlist(career.id)}>{shortlisted ? 'Remove' : 'Shortlist'}</button></div></div><Ring value={total} /></article> }
function Ring({ value }) { return <div className="ring" style={{ '--s': value }}><span>{value}</span></div> }
function Scores({ career, region }) { const m = market(career, region); return <div className="scores"><Score label="Marketability" value={m.marketability_score} m={m} /><Score label="Profitability" value={m.profitability_score} m={m} /><Score label="Need / demand" value={<>{m.demand_score} <span className={m.trend}>{m.trend === 'up' ? '↗' : m.trend === 'down' ? '↘' : '→'}</span></>} m={m} /></div> }
function Score({ label, value, m }) { return <div className="score"><b><span>{label}</span><em>{value}</em></b><div className="src">Sources: {m.source_ids.slice(0, 3).map((id, i) => <React.Fragment key={id}>{i ? ', ' : ''}<a href={source(id).url} target="_blank">{source(id).name}</a></React.Fragment>)}<br />Last updated: {m.last_updated}</div></div> }

function CareerDetail({ id, profile, shortlist, toggleShortlist, setRegion }) {
  const career = DB.careers.find(c => c.id === id)
  if (!career) return <Empty title="Career not found" />
  const m = market(career, profile.region)
  const gaps = career.skills.filter(s => !profile.skills.some(p => s.includes(p) || p.includes(s)))
  return <><section className="section"><div className="shell detail"><div><a className="btn ghost small" href="#/results">← Back</a><h1>{career.title}</h1><p className="lead">{career.description}</p><p className="tag blue">{career.category}</p><p className="lead"><b>{zmw(m.median_salary_local)}</b> ({usd(m.median_salary_usd)})</p><p className="micro">Salary is a directional median estimate, not a guarantee.</p></div><aside className="card"><h3>Composite score</h3><Ring value={composite(career, profile)} /><p>{whyMatched(career, profile)}</p><button className={`btn ${shortlist.includes(career.id) ? 'danger' : 'secondary'}`} onClick={() => toggleShortlist(career.id)}>{shortlist.includes(career.id) ? 'Remove from compare' : 'Shortlist for compare'}</button></aside></div></section><section className="section"><div className="shell grid g2"><div className="card"><div className="head"><div><h2>Score breakdown</h2><p className="muted">With provenance and update dates.</p></div><RegionSwitch region={profile.region} onRegion={setRegion} /></div><Scores career={career} region={profile.region} /><h3>Regional breakdown</h3><RegionalTable career={career} /></div><div className="card"><h2>What would it take?</h2><p><b>Education:</b> {career.education_requirements}</p><h3>Entry paths</h3><div className="trust">{career.entry_paths.map(x => <span className="tag blue" key={x}>{x}</span>)}</div><h3>Skill gaps</h3>{gaps.length ? gaps.map(x => <div className="gap" key={x}><span>{x}</span><span className="tag">Learn</span></div>) : <div className="notice">Your selected skills already overlap strongly with this career.</div>}<h3>Learning resources</h3><ul>{[...new Set(career.resources)].slice(0, 8).map(x => <li key={x}>{x}</li>)}</ul></div></div></section><section className="section"><div className="shell"><LearningHub career={career} /></div></section></>
}

function makeYouTubeTopic(query) {
  const q = encodeURIComponent(query)
  return {
    title: query,
    url: `https://www.youtube.com/results?search_query=${q}`,
    embedUrl: `https://www.youtube.com/embed?listType=search&list=${q}`,
  }
}

function learningContent(career) {
  const primarySkill = career.skills[0] || career.title
  const categoryBlogs = {
    Technology: [
      ['freeCodeCamp News', 'Practical programming, data, cloud and product tutorials.', 'https://www.freecodecamp.org/news/'],
      ['Roadmap.sh', 'Role-based developer roadmaps and skill checklists.', 'https://roadmap.sh/'],
      ['Google Developers Blog', 'Product, web, Android, cloud and AI engineering articles.', 'https://developers.googleblog.com/'],
    ],
    Healthcare: [
      ['WHO Academy', 'Public health and clinical learning resources.', 'https://www.who.int/about/who-academy'],
      ['BMJ Careers', 'Healthcare career development and professional guidance.', 'https://www.bmj.com/careers'],
      ['ReliefWeb Training', 'Humanitarian and health-sector training opportunities.', 'https://reliefweb.int/training'],
    ],
    Finance: [
      ['Investopedia', 'Finance, accounting, markets and analysis explainers.', 'https://www.investopedia.com/'],
      ['ACCA Insights', 'Accounting and finance profession articles.', 'https://www.accaglobal.com/gb/en/member/discover.html'],
      ['Corporate Finance Institute', 'Financial modelling and finance career resources.', 'https://corporatefinanceinstitute.com/resources/'],
    ],
    Agriculture: [
      ['FAO e-learning Academy', 'Agriculture, food systems and climate learning.', 'https://elearning.fao.org/'],
      ['CGIAR', 'Agriculture research and innovation insights.', 'https://www.cgiar.org/news-events/news/'],
      ['World Bank Agriculture', 'Agriculture development research and reports.', 'https://www.worldbank.org/en/topic/agriculture'],
    ],
    Energy: [
      ['IRENA Knowledge', 'Renewable energy reports, jobs and transition insights.', 'https://www.irena.org/Knowledge'],
      ['EnergySage Solar News', 'Solar technology and market explainers.', 'https://news.energysage.com/'],
      ['World Bank Energy', 'Energy access and infrastructure resources.', 'https://www.worldbank.org/en/topic/energy'],
    ],
    Mining: [
      ['Mining Technology', 'Mining industry trends, technology and project news.', 'https://www.mining-technology.com/'],
      ['Mining.com', 'Mining sector news and commodity trends.', 'https://www.mining.com/'],
      ['ICMM Insights', 'Responsible mining guidance and sustainability resources.', 'https://www.icmm.com/en-gb/our-work'],
    ],
    Education: [
      ['Edutopia', 'Teaching practice, pedagogy and classroom innovation.', 'https://www.edutopia.org/'],
      ['Khan Academy Blog', 'Learning, maths and education resources.', 'https://blog.khanacademy.org/'],
      ['UNESCO Education', 'Education policy, skills and development articles.', 'https://www.unesco.org/en/education'],
    ],
    'Business Operations': [
      ['PMI Thought Leadership', 'Project-management methods and career insights.', 'https://www.pmi.org/learning/thought-leadership'],
      ['Harvard Business Review', 'Management, strategy and operations articles.', 'https://hbr.org/'],
      ['McKinsey Insights', 'Business, operations and sector trend reports.', 'https://www.mckinsey.com/featured-insights'],
    ],
    Logistics: [
      ['CIPS Knowledge', 'Procurement and supply-chain guidance.', 'https://www.cips.org/intelligence-hub'],
      ['Supply Chain Dive', 'Supply-chain and logistics industry articles.', 'https://www.supplychaindive.com/'],
      ['Logistics Management', 'Logistics operations and transport insights.', 'https://www.logisticsmgmt.com/'],
    ],
    Infrastructure: [
      ['Engineering.com', 'Engineering projects, skills and technology articles.', 'https://www.engineering.com/'],
      ['World Bank Infrastructure', 'Infrastructure development research and reports.', 'https://www.worldbank.org/en/topic/infrastructure'],
      ['ASCE Source', 'Civil engineering news and professional development.', 'https://source.asce.org/'],
    ],
    Environment: [
      ['UNEP Stories', 'Environmental sustainability and climate articles.', 'https://www.unep.org/news-and-stories'],
      ['World Resources Institute', 'Climate, water, land and sustainability insights.', 'https://www.wri.org/insights'],
      ['Carbon Brief', 'Climate science and policy explainers.', 'https://www.carbonbrief.org/'],
    ],
    Development: [
      ['BetterEvaluation', 'Monitoring, evaluation and learning guidance.', 'https://www.betterevaluation.org/'],
      ['ReliefWeb Updates', 'Humanitarian and development sector updates.', 'https://reliefweb.int/updates'],
      ['World Bank Data Blog', 'Development data and analytics articles.', 'https://blogs.worldbank.org/opendata'],
    ],
    Marketing: [
      ['HubSpot Marketing Blog', 'SEO, content, CRM and digital marketing guides.', 'https://blog.hubspot.com/marketing'],
      ['Google Search Central Blog', 'SEO and search guidance.', 'https://developers.google.com/search/blog'],
      ['Buffer Blog', 'Social media strategy and content marketing articles.', 'https://buffer.com/resources/'],
    ],
    'Product Design': [
      ['Nielsen Norman Group', 'UX research and usability articles.', 'https://www.nngroup.com/articles/'],
      ['Figma Blog', 'Design systems, product design and Figma workflows.', 'https://www.figma.com/blog/'],
      ['UX Collective', 'Product design essays and case studies.', 'https://uxdesign.cc/'],
    ],
    Trades: [
      ['iFixit Guides', 'Repair mindset and technical teardown guides.', 'https://www.ifixit.com/Guide'],
      ['Machine Design', 'Mechanical systems and engineering explainers.', 'https://www.machinedesign.com/'],
      ['SafetyCulture Topics', 'Workplace safety, maintenance and compliance guides.', 'https://safetyculture.com/topics/'],
    ],
    Hospitality: [
      ['Hospitality Net', 'Hospitality and tourism industry insights.', 'https://www.hospitalitynet.org/'],
      ['UN Tourism', 'Tourism market and development insights.', 'https://www.unwto.org/news'],
      ['EHL Insights', 'Hospitality management and career articles.', 'https://hospitalityinsights.ehl.edu/'],
    ],
    Business: [
      ['SBA Learning Center', 'Small-business planning and operations resources.', 'https://www.sba.gov/sba-learning-platform'],
      ['Y Combinator Library', 'Startup and entrepreneurship guidance.', 'https://www.ycombinator.com/library'],
      ['Strategyzer Library', 'Business model and value proposition design.', 'https://www.strategyzer.com/library'],
    ],
  }
  const fallback = [
    ['LinkedIn Learning Blog', 'Career development articles and role exploration.', 'https://www.linkedin.com/business/learning/blog'],
    ['Coursera Career Academy', 'Role-based online learning pathways.', 'https://www.coursera.org/career-academy/'],
    ['edX Blog', 'Professional learning articles and programme guidance.', 'https://www.edx.org/blog'],
  ]
  return {
    videos: [
      makeYouTubeTopic(`${career.title} career roadmap for beginners`),
      makeYouTubeTopic(`${career.title} day in the life Africa`),
      makeYouTubeTopic(`${primarySkill} tutorial for ${career.title}`),
    ],
    blogs: (categoryBlogs[career.category] || fallback).map(([title, description, url]) => ({ title, description, url })),
  }
}

function LearningHub({ career }) {
  const content = learningContent(career)
  const [selected, setSelected] = useState(content.videos[0])
  return <div className="card learning"><div className="head"><div><h2>Videos, blogs & learning links</h2><p className="muted">Curated starting points for this role. YouTube topics can be played here when embeds are available, or opened directly on YouTube.</p></div></div><div className="media-grid"><div className="video-frame">{selected?.embedUrl ? <iframe title={selected.title} src={selected.embedUrl} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : <div className="video-placeholder"><div><h3>Select a YouTube topic</h3><p>Open a search or play an embeddable video here.</p></div></div>}</div><div><h3>YouTube topics</h3><div className="resource-list">{content.videos.map(video => <div className="resource-card" key={video.title}><div><h4>{video.title}</h4><p className="micro">Use this as a starting search phrase; validate creator quality before relying on advice.</p></div><div className="resource-actions"><button className="link-btn" onClick={() => setSelected(video)}>Play here</button><a className="link-btn" href={video.url} target="_blank" rel="noreferrer">Open YouTube</a></div></div>)}</div></div></div><h3>Blogs & reading</h3><div className="blog-grid">{content.blogs.map(blog => <article className="blog-card" key={blog.title}><h4>{blog.title}</h4><p className="micro">{blog.description}</p><a href={blog.url} target="_blank" rel="noreferrer">Visit resource →</a></article>)}</div></div>
}

function RegionalTable({ career }) { return <div className="table"><table><thead><tr><th>Region</th><th>Market</th><th>Pay</th><th>Need</th><th>Salary</th><th>Trend</th><th>Sources</th></tr></thead><tbody>{career.market_data.map(m => <tr key={m.region}><td><b>{m.region}</b></td><td>{m.marketability_score}</td><td>{m.profitability_score}</td><td>{m.demand_score}</td><td>{zmw(m.median_salary_local)}<br /><span className="micro">{usd(m.median_salary_usd)}</span></td><td><span className={m.trend}>{m.trend}</span></td><td>{m.source_ids.map(id => <React.Fragment key={id}><a className="src" href={source(id).url} target="_blank">{source(id).name}</a><br /></React.Fragment>)}<span className="micro">Updated {m.last_updated}</span></td></tr>)}</tbody></table></div> }

function Compare({ profile, shortlist, toggleShortlist }) {
  const careers = shortlist.map(id => DB.careers.find(c => c.id === id)).filter(Boolean)
  return <section className="section"><div className="shell"><div className="head"><div><span className="eyebrow">Compare</span><h2>Side-by-side shortlist</h2><p className="muted">Compare 2–3 careers by score, salary and entry path.</p></div><a className="btn secondary" href="#/results">Back to results</a></div>{careers.length ? <div className="compare">{careers.map(c => { const m = market(c, profile.region); return <article className="card" key={c.id}><h2>{c.title}</h2><p className="muted">{c.description}</p><p><b>{zmw(m.median_salary_local)}</b><br />{usd(m.median_salary_usd)}</p><Scores career={c} region={profile.region} /><h3>Entry paths</h3><ul>{c.entry_paths.map(x => <li key={x}>{x}</li>)}</ul><button className="btn danger small" onClick={() => toggleShortlist(c.id)}>Remove</button></article> })}</div> : <EmptyBox title="No careers shortlisted yet" text="Add careers from the recommendations page." />}</div></section>
}

function Methodology() { return <section className="section"><div className="shell"><div className="title"><span className="eyebrow">Transparent methodology</span><h1>How scoring works</h1><p className="lead">Scores are directional estimates for planning, not guarantees.</p></div><div className="grid g3"><Feature title="Marketability" text="0–100 from reviewed job-posting volume and growth trend across region-relevant boards." /><Feature title="Profitability" text="0–100 from salary signals normalised to local context, shown in ZMW plus USD benchmark." /><Feature title="Need / demand" text="0–100 from labour-market projections, priority-sector lists and scarcity signals." /></div><div className="card" style={{ marginTop: 18 }}><h2>Composite formula</h2><p><span className="kbd">Composite = Marketability × weight + Profitability × weight + Need × weight</span></p><p>Default split is 35/35/30. Ranking also includes a lighter personal-fit signal from education, skills, interests, preferences and risk tolerance.</p><h3>Refresh cadence</h3><ul><li>Job-board-derived scores: roughly monthly.</li><li>Labour statistics and future-of-work reports: quarterly or annually.</li><li>Manual/CSV curation is primary until APIs, licensed feeds or partnerships are available.</li></ul><h3>Privacy and ethics</h3><ul><li>No account required for first recommendation.</li><li>Treat profile fields as personal data; add deletion controls if accounts are introduced.</li><li>Respect Terms of Service and robots.txt for all job boards.</li></ul></div></div></section> }

function SiteMap({ user, accountProfile }) {
  const groups = [
    ['Start here', [['Home', '#/'], ['Find your career', '#/assessment'], ['Recommendations', '#/results'], ['Compare shortlist', '#/compare']]],
    ['Trust & data', [['Methodology', '#/methodology'], ['Data sources', '#/sources'], ['Career data transparency', '#/methodology']]],
    ['Account', user ? [['Dashboard', '#/dashboard'], ['Update assessment', '#/assessment']] : [['Create account / sign in', '#/signin'], ['First recommendation', '#/assessment']]],
    ['Admin', accountProfile?.role === 'admin' ? [['Admin dashboard', '#/admin'], ['Analytics', '#/admin'], ['Data management', '#/admin']] : [['Admin access', '#/signin']]],
  ]
  return <section className="section"><div className="shell"><div className="title"><span className="eyebrow">Site map</span><h1>Navigate CareerSignal Africa</h1><p className="lead">A quick command centre for the assessment flow, transparent data, account tools and admin workspace.</p></div><div className="sitemap-grid">{groups.map(([title, links]) => <article className="card sitemap-card" key={title}><h2>{title}</h2>{links.map(([label, href]) => <a className="sitemap-link" href={href} key={label}><span>{label}</span><b>→</b></a>)}</article>)}</div></div></section>
}

function Sources() { return <section className="section"><div className="shell"><div className="title"><span className="eyebrow">Data provenance</span><h1>Seeded source directory</h1><p className="lead">Every score stores source IDs and last-updated dates.</p></div><div className="sources">{DB.sources.map(s => <article className="source" key={s.id}><h3>{s.name}</h3><p className="micro"><b>Type:</b> {s.type}<br /><b>Region:</b> {s.region}</p><a className="src" href={s.url} target="_blank">{s.url}</a></article>)}</div></div></section> }


function UserDashboard({ profile, shortlist, user, accountProfile, openAuth }) {
  const careers = shortlist.map(id => DB.careers.find(c => c.id === id)).filter(Boolean)
  if (!user) return <section className="section"><div className="shell"><div className="card"><span className="eyebrow">User dashboard</span><h1>Create a free account</h1><p className="muted">Sign in to save recommendations, manage your profile and return to your career shortlist.</p><button className="btn primary" onClick={() => openAuth('signup')}>Create account / sign in</button></div></div></section>
  return <section className="section"><div className="shell"><div className="title"><span className="eyebrow">Account dashboard</span><h1>Welcome{accountProfile?.full_name ? `, ${accountProfile.full_name}` : ''}</h1><p className="lead">Manage your saved careers, profile context and future recommendations.</p></div>{!accountProfile && <div className="notice warn" style={{ marginBottom: 18 }}>Your account profile is still loading or blocked by database policies. Run <span className="kbd">admin-auth-fix.sql</span> in Supabase if this does not resolve.</div>}<div className="grid g3"><Stat value={careers.length} label="Shortlisted careers" /><Stat value={profile.region} label="Default region" /><Stat value={accountProfile?.role || 'loading'} label="Account role" /><Stat value="Free" label="Current plan" /></div>{accountProfile?.role === 'admin' && <div className="notice success" style={{ marginTop: 18 }}><b>Admin verified.</b> Your profile role is admin. <a className="source-link" href="#/admin">Open the admin dashboard →</a></div>}<div className="grid g2" style={{ marginTop: 18 }}><div className="card"><h2>Your profile context</h2><p><b>Education:</b> {profile.education}</p><p><b>Location:</b> {profile.location}</p><p><b>Risk tolerance:</b> {profile.risk}</p><p><b>Skills:</b> {profile.skills.join(', ') || 'None selected yet'}</p><a className="btn secondary" href="#/assessment">Update assessment</a></div><div className="card"><h2>Saved careers</h2>{careers.length ? careers.map(c => <div className="gap" key={c.id}><span>{c.title}</span><a className="link-btn" href={`#/career/${c.id}`}>View</a></div>) : <p className="muted">No saved careers yet. Shortlist careers from your results.</p>}<a className="btn primary" href="#/results">View recommendations</a></div></div></div></section>
}

function Admin({ notify, user, accountProfile }) {
  const [selected, setSelected] = useState(DB.careers[0].id)
  const [selectedSource, setSelectedSource] = useState(DB.sources[0]?.id || '')
  const [version, setVersion] = useState(0)
  const [tab, setTab] = useState('analytics')
  const [analytics, setAnalytics] = useState({ events: 0, users: 0, newsletter: 0, rows: [] })
  const [csvText, setCsvText] = useState('')
  const career = DB.careers.find(c => c.id === selected) || DB.careers[0]
  const sourceItem = DB.sources.find(s => s.id === selectedSource) || DB.sources[0]

  useEffect(() => {
    if (accountProfile?.role !== 'admin') return
    async function loadAnalytics() {
      if (isSupabaseConfigured) {
        const [events, users, newsletter, rows] = await Promise.all([
          supabase.from('analytics_events').select('id', { count: 'exact', head: true }),
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }),
          supabase.from('analytics_events').select('event_name,path,visitor_id,user_id,created_at').order('created_at', { ascending: false }).limit(500),
        ])
        setAnalytics({ events: events.count || 0, users: users.count || 0, newsletter: newsletter.count || 0, rows: rows.data || [] })
      } else {
        const rows = JSON.parse(localStorage.getItem('cs_local_events') || '[]')
        setAnalytics({ events: rows.length, users: user ? 1 : 0, newsletter: localStorage.cs_newsletter_email ? 1 : 0, rows })
      }
    }
    loadAnalytics()
  }, [accountProfile?.role, user, version])

  if (!user) return <Empty title="Sign in required" text="Admin tools are only available after verified admin authentication." />
  if (accountProfile?.role !== 'admin') return <Empty title="Admin access required" text="This route is hidden and locked unless your authenticated profile role is admin." />

  const editCareer = (key, value) => {
    career[key] = ['skills','interests','work_preferences','entry_paths','resources'].includes(key) ? value.split(',').map(x => x.trim()).filter(Boolean) : value
    setVersion(version + 1)
  }
  const edit = (region, key, value) => {
    const m = career.market_data.find(x => x.region === region)
    m[key] = key === 'source_ids' ? value.split(',').map(x => x.trim()) : isNaN(value) ? value : Number(value)
    setVersion(version + 1)
    notify('Record updated in session. Click Save current career to DB to persist.')
  }
  const editSource = (key, value) => {
    sourceItem[key] = key === 'id' ? slugify(value) : value
    if (key === 'id') setSelectedSource(sourceItem[key])
    setVersion(version + 1)
  }
  const newSource = () => {
    const id = `source_${Date.now()}`
    DB.sources.unshift({ id, name: 'New permitted source', url: 'https://example.com', type: 'manual_review', region: 'Zambia' })
    setSelectedSource(id); setVersion(version + 1); setTab('sources')
  }
  const saveSourceToDatabase = async () => {
    if (!sourceItem) return
    if (!isSupabaseConfigured) { notify('Supabase is not configured yet.'); return }
    const { error } = await supabase.from('sources').upsert(sourceItem, { onConflict: 'id' })
    if (error) notify(error.message)
    else notify('Source saved to PostgreSQL')
  }
  const exportSourcesCsv = () => download('career-signal-sources.csv', Papa.unparse(DB.sources), 'text/csv')
  const exportMarketCsv = () => {
    const rows = ['career_id,title,category,region,marketability_score,profitability_score,demand_score,median_salary_local,median_salary_usd,source_ids,last_updated']
    DB.careers.forEach(c => c.market_data.forEach(m => rows.push([c.id, csv(c.title), csv(c.category), m.region, m.marketability_score, m.profitability_score, m.demand_score, m.median_salary_local, m.median_salary_usd, csv(m.source_ids.join('|')), m.last_updated].join(','))))
    download('career-signal-market-data.csv', rows.join('\n'), 'text/csv')
  }
  const exportUsageCsv = async () => {
    const rows = analytics.rows.map(r => ({ event_name: r.event_name, path: r.path, visitor_id: r.visitor_id, user_id: r.user_id, created_at: r.created_at }))
    download('career-signal-usage-report.csv', Papa.unparse(rows), 'text/csv')
  }
  const exportNewsletterCsv = async () => {
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('newsletter_subscribers').select('email,source,created_at').order('created_at', { ascending: false })
      download('career-signal-newsletter-emails.csv', Papa.unparse(data || []), 'text/csv')
    } else download('career-signal-newsletter-emails.csv', 'email\n' + (localStorage.cs_newsletter_email || ''), 'text/csv')
  }
  const saveCareerToDatabase = async () => {
    if (!isSupabaseConfigured) { notify('Supabase is not configured yet.'); return }
    const careerRow = { id: career.id, title: career.title, category: career.category, description: career.description, education_requirements: career.education_requirements, skills: career.skills, interests: career.interests, work_preferences: career.work_preferences, entry_paths: career.entry_paths, resources: career.resources, active: true }
    const marketRows = career.market_data.map(m => ({ ...m, career_id: career.id }))
    const cRes = await supabase.from('careers').upsert(careerRow, { onConflict: 'id' })
    const mRes = await supabase.from('market_data').upsert(marketRows, { onConflict: 'career_id,region' })
    if (cRes.error || mRes.error) notify(cRes.error?.message || mRes.error?.message)
    else notify('Saved current career and market data to PostgreSQL')
  }
  const importCsv = async () => {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
    if (parsed.errors.length) { notify('CSV parsing error. Check headers and commas.'); return }
    const dbRows = []
    parsed.data.forEach(row => {
      const c = DB.careers.find(x => x.id === row.career_id)
      const m = c?.market_data.find(x => x.region === row.region)
      const clean = { career_id: row.career_id, region: row.region, marketability_score: Number(row.marketability_score), profitability_score: Number(row.profitability_score), demand_score: Number(row.demand_score), median_salary_local: Number(row.median_salary_local), median_salary_usd: Number(row.median_salary_usd), source_ids: String(row.source_ids || '').split('|'), last_updated: row.last_updated }
      dbRows.push(clean)
      if (m) Object.assign(m, clean)
    })
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('market_data').upsert(dbRows, { onConflict: 'career_id,region' })
      if (error) { notify(error.message); return }
    }
    setVersion(version + 1)
    notify(`Imported ${parsed.data.length} rows${isSupabaseConfigured ? ' and saved to PostgreSQL' : ' into the admin session'}`)
  }

  return <section className="section"><div className="shell"><div className="head"><div><span className="eyebrow">Verified admin command centre</span><h2>Analytics, validation and data management</h2><p className="muted">Mixpanel-inspired metrics, CSV exports and validated source/career management for verified admins.</p></div><div className="actions"><button className="btn secondary" onClick={exportMarketCsv}>Market CSV</button><button className="btn secondary" onClick={exportSourcesCsv}>Sources CSV</button><button className="btn secondary" onClick={exportUsageCsv}>Usage CSV</button><button className="btn secondary" onClick={exportNewsletterCsv}>Newsletter CSV</button></div></div><div className="admin-tabs"><button className={tab === 'analytics' ? 'on' : ''} onClick={() => setTab('analytics')}>Analytics</button><button className={tab === 'careers' ? 'on' : ''} onClick={() => setTab('careers')}>Career editor</button><button className={tab === 'sources' ? 'on' : ''} onClick={() => setTab('sources')}>Sources editor</button><button className={tab === 'csv' ? 'on' : ''} onClick={() => setTab('csv')}>CSV import</button></div>{tab === 'analytics' && <AdminAnalytics analytics={analytics} />}{tab === 'careers' && <div className="admin" style={{ marginTop: 18 }}><aside className="card admin-careers"><h3>Careers</h3>{DB.careers.map(c => <button key={c.id} className={`chip ${c.id === career.id ? 'on' : ''}`} style={{ width: '100%', marginBottom: 8 }} onClick={() => setSelected(c.id)}>{c.title}</button>)}</aside><section className="card"><h2>Edit career: {career.title}</h2><div className="grid g2"><div className="field"><label>Title</label><input value={career.title} onChange={e => editCareer('title', e.target.value)} /></div><div className="field"><label>Category</label><input value={career.category} onChange={e => editCareer('category', e.target.value)} /></div></div><div className="field"><label>Description</label><textarea rows="4" value={career.description} onChange={e => editCareer('description', e.target.value)} /></div><div className="field"><label>Education requirements</label><textarea rows="3" value={career.education_requirements} onChange={e => editCareer('education_requirements', e.target.value)} /></div><div className="grid g2"><div className="field"><label>Skills, comma separated</label><textarea rows="3" value={career.skills.join(', ')} onChange={e => editCareer('skills', e.target.value)} /></div><div className="field"><label>Entry paths, comma separated</label><textarea rows="3" value={career.entry_paths.join(', ')} onChange={e => editCareer('entry_paths', e.target.value)} /></div></div>{career.market_data.map(m => <div className="card flat" key={m.region}><h3>{m.region} market data</h3><div className="grid g3">{['marketability_score', 'profitability_score', 'demand_score', 'median_salary_local', 'median_salary_usd', 'last_updated'].map(k => <div className="field" key={k}><label>{k}</label><input value={m[k]} onChange={e => edit(m.region, k, e.target.value)} /></div>)}</div><div className="field"><label>source_ids</label><input value={m.source_ids.join(',')} onChange={e => edit(m.region, 'source_ids', e.target.value)} /></div></div>)}<button className="btn primary" onClick={saveCareerToDatabase}>Save current career to DB</button></section></div>}{tab === 'sources' && <div className="admin" style={{ marginTop: 18 }}><aside className="card admin-careers"><div className="head"><h3>Sources</h3><button className="btn primary small" onClick={newSource}>Add</button></div>{DB.sources.map(s => <button key={s.id} className={`chip ${s.id === sourceItem?.id ? 'on' : ''}`} style={{ width: '100%', marginBottom: 8 }} onClick={() => setSelectedSource(s.id)}>{s.name}</button>)}</aside><section className="card"><h2>Sources editor</h2><p className="muted">Add permitted sources for manual review, official APIs, RSS, partnerships, or compliant collection. Always check Terms of Service and robots.txt before automated collection.</p>{sourceItem && <><div className="grid g2"><div className="field"><label>Source ID</label><input value={sourceItem.id} onChange={e => editSource('id', e.target.value)} /></div><div className="field"><label>Name</label><input value={sourceItem.name} onChange={e => editSource('name', e.target.value)} /></div></div><div className="field"><label>URL</label><input value={sourceItem.url} onChange={e => editSource('url', e.target.value)} /></div><div className="grid g2"><div className="field"><label>Type</label><input value={sourceItem.type} onChange={e => editSource('type', e.target.value)} placeholder="job_board, labor_statistics, rss, api, manual_review" /></div><div className="field"><label>Region</label><input value={sourceItem.region} onChange={e => editSource('region', e.target.value)} /></div></div><div className="notice warn"><b>Source governance:</b> save sources for manual review, official reports, permitted APIs/RSS feeds, or partnership-based data access. Only enable automated collection when the source explicitly allows it.</div><div className="actions"><button className="btn primary" onClick={saveSourceToDatabase}>Save source to DB</button><button className="btn secondary" onClick={exportSourcesCsv}>Export sources CSV</button></div></>}</section></div>}{tab === 'csv' && <div className="card" style={{ marginTop: 18 }}><h2>Import market-data CSV</h2><p className="muted">Use this after validating updated data through Google, official reports or approved source reviews.</p><div className="field"><label>CSV</label><textarea rows="8" value={csvText} onChange={e => setCsvText(e.target.value)} placeholder="career_id,region,marketability_score,profitability_score,demand_score,median_salary_local,median_salary_usd,source_ids,last_updated" /></div><button className="btn primary" onClick={importCsv}>Import CSV</button></div>}</div></section>
}

function AdminAnalytics({ analytics }) {
  const rows = analytics.rows || []
  const topPaths = countBy(rows, 'path').slice(0, 6)
  const events = countBy(rows, 'event_name').slice(0, 6)
  const recent = rows.slice(0, 8)
  return <div className="analytics-panel"><div className="grid g3"><Stat value={analytics.events} label="Tracked events" /><Stat value={analytics.users} label="Registered users" /><Stat value={analytics.newsletter} label="Newsletter emails" /></div><div className="grid g2" style={{ marginTop: 18 }}><ChartCard title="Top pages" items={topPaths} /><ChartCard title="Event mix" items={events} /></div><div className="card" style={{ marginTop: 18 }}><h2>Recent activity stream</h2><div className="event-stream">{recent.length ? recent.map((r, i) => <div className="event-row" key={i}><b>{r.event_name}</b><span>{r.path || '#/'}</span><em>{r.created_at ? new Date(r.created_at).toLocaleString() : 'local session'}</em></div>) : <p className="muted">No analytics events yet. Accept analytics cookies and navigate the app to populate this view.</p>}</div></div></div>
}
function ChartCard({ title, items }) {
  const max = Math.max(1, ...items.map(x => x.count))
  return <div className="card chart-card"><h2>{title}</h2>{items.length ? items.map(x => <div className="chart-row" key={x.label}><span>{x.label || '(blank)'}</span><div className="chart-track"><i style={{ width: `${(x.count / max) * 100}%` }} /></div><b>{x.count}</b></div>) : <p className="muted">No data yet.</p>}</div>
}
function countBy(rows, key) {
  const map = new Map()
  rows.forEach(r => map.set(r[key] || 'unknown', (map.get(r[key] || 'unknown') || 0) + 1))
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a,b) => b.count - a.count)
}
function slugify(v) { return String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `source_${Date.now()}` }
function csv(v) { return `"${String(v ?? '').replaceAll('"', '""')}"` }

function download(filename, content, type) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = filename
  a.click()
}
function EmptyBox({ title, text }) { return <div className="empty"><h2>{title}</h2><p>{text}</p><a className="btn primary" href="#/results">Go to recommendations</a></div> }
function Empty({ title, text = '' }) { return <section className="section"><div className="shell"><EmptyBox title={title} text={text} /></div></section> }

createRoot(document.getElementById('root')).render(<App />)
