import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { DB } from '../src/data.js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const sources = DB.sources
const careers = DB.careers.map(c => ({
  id: c.id,
  title: c.title,
  category: c.category,
  description: c.description,
  education_requirements: c.education_requirements,
  skills: c.skills,
  interests: c.interests,
  work_preferences: c.work_preferences,
  entry_paths: c.entry_paths,
  resources: c.resources,
  active: true,
}))
const market = DB.careers.flatMap(c => c.market_data.map(m => ({ ...m, career_id: c.id })))

async function upsert(table, rows, onConflict) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`${table}: ${error.message}`)
  console.log(`Seeded ${rows.length} rows into ${table}`)
}

await upsert('sources', sources, 'id')
await upsert('careers', careers, 'id')
await upsert('market_data', market, 'career_id,region')
console.log('Done.')
