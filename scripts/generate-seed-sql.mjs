import { writeFileSync } from 'node:fs'
import { DB } from '../src/data.js'

const q = (v) => {
  if (v === null || v === undefined) return 'null'
  return `'${String(v).replaceAll("'", "''")}'`
}
const arr = (xs = []) => `ARRAY[${xs.map(q).join(', ')}]::text[]`
const num = (v) => Number.isFinite(Number(v)) ? String(Number(v)) : 'null'
const bool = (v) => v ? 'true' : 'false'
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const yt = (query) => {
  const encoded = encodeURIComponent(query)
  return {
    title: query,
    description: 'Curated YouTube learning topic. Review creator quality before relying on advice.',
    url: `https://www.youtube.com/results?search_query=${encoded}`,
    embed_url: `https://www.youtube.com/embed?listType=search&list=${encoded}`,
    link_type: 'youtube',
    provider: 'YouTube',
  }
}

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
    ['CGIAR News', 'Agriculture research and innovation insights.', 'https://www.cgiar.org/news-events/news/'],
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
const fallbackBlogs = [
  ['LinkedIn Learning Blog', 'Career development articles and role exploration.', 'https://www.linkedin.com/business/learning/blog'],
  ['Coursera Career Academy', 'Role-based online learning pathways.', 'https://www.coursera.org/career-academy/'],
  ['edX Blog', 'Professional learning articles and programme guidance.', 'https://www.edx.org/blog'],
]
const blogsFor = (category) => (categoryBlogs[category] || fallbackBlogs).map(([title, description, url]) => ({ title, description, url, link_type: 'blog', provider: new URL(url).hostname.replace(/^www\./, '') }))

const lines = []
lines.push('-- CareerSignal Africa seed data')
lines.push('-- Run schema.sql first, then run this file in Supabase SQL Editor.')
lines.push('-- Generated from src/data.js. Safe to re-run: source/career/market rows upsert; learning links are refreshed.')
lines.push('')
lines.push('begin;')
lines.push('')

lines.push('-- 1) Sources')
lines.push('insert into public.sources (id, name, url, type, region) values')
lines.push(DB.sources.map(s => `  (${q(s.id)}, ${q(s.name)}, ${q(s.url)}, ${q(s.type)}, ${q(s.region)})`).join(',\n') + '\non conflict (id) do update set\n  name = excluded.name,\n  url = excluded.url,\n  type = excluded.type,\n  region = excluded.region,\n  updated_at = now();')
lines.push('')

lines.push('-- 2) Careers')
lines.push('insert into public.careers (id, title, category, description, education_requirements, skills, interests, work_preferences, entry_paths, resources, related_careers, active) values')
lines.push(DB.careers.map(c => `  (${q(c.id)}, ${q(c.title)}, ${q(c.category)}, ${q(c.description)}, ${q(c.education_requirements)}, ${arr(c.skills)}, ${arr(c.interests)}, ${arr(c.work_preferences)}, ${arr(c.entry_paths)}, ${arr([...new Set(c.resources || [])])}, ${arr(c.related_careers || [])}, true)`).join(',\n') + '\non conflict (id) do update set\n  title = excluded.title,\n  category = excluded.category,\n  description = excluded.description,\n  education_requirements = excluded.education_requirements,\n  skills = excluded.skills,\n  interests = excluded.interests,\n  work_preferences = excluded.work_preferences,\n  entry_paths = excluded.entry_paths,\n  resources = excluded.resources,\n  related_careers = excluded.related_careers,\n  active = excluded.active,\n  updated_at = now();')
lines.push('')

lines.push('-- 3) Market data')
const marketRows = DB.careers.flatMap(c => c.market_data.map(m => `  (${q(c.id)}, ${q(m.region)}::public.region_level, ${num(m.marketability_score)}, ${num(m.profitability_score)}, ${num(m.demand_score)}, ${num(m.median_salary_local)}, ${num(m.median_salary_usd)}, 'ZMW', ${q(m.trend)}::public.trend_direction, ${arr(m.source_ids)}, ${q(m.last_updated)}::date)`))
lines.push('insert into public.market_data (career_id, region, marketability_score, profitability_score, demand_score, median_salary_local, median_salary_usd, currency_code, trend, source_ids, last_updated) values')
lines.push(marketRows.join(',\n') + '\non conflict (career_id, region) do update set\n  marketability_score = excluded.marketability_score,\n  profitability_score = excluded.profitability_score,\n  demand_score = excluded.demand_score,\n  median_salary_local = excluded.median_salary_local,\n  median_salary_usd = excluded.median_salary_usd,\n  currency_code = excluded.currency_code,\n  trend = excluded.trend,\n  source_ids = excluded.source_ids,\n  last_updated = excluded.last_updated,\n  updated_at = now();')
lines.push('')

lines.push('-- 4) Learning links: refresh seeded video/blog links')
lines.push(`delete from public.learning_links where career_id in (${DB.careers.map(c => q(c.id)).join(', ')});`)
const learningRows = []
for (const c of DB.careers) {
  const primarySkill = c.skills[0] || c.title
  const links = [
    yt(`${c.title} career roadmap for beginners`),
    yt(`${c.title} day in the life Africa`),
    yt(`${primarySkill} tutorial for ${c.title}`),
    ...blogsFor(c.category),
  ]
  for (const link of links) {
    learningRows.push(`  (${q(c.id)}, ${q(c.category)}, ${q(link.title)}, ${q(link.description)}, ${q(link.url)}, ${q(link.link_type)}, ${q(link.embed_url || null)}, ${q(link.provider)}, true)`)
  }
}
lines.push('insert into public.learning_links (career_id, category, title, description, url, link_type, embed_url, provider, active) values')
lines.push(learningRows.join(',\n') + ';')
lines.push('')

lines.push('-- 5) Optional sanity checks')
lines.push("do $$")
lines.push('declare')
lines.push('  career_count integer;')
lines.push('  source_count integer;')
lines.push('  market_count integer;')
lines.push('begin')
lines.push('  select count(*) into career_count from public.careers;')
lines.push('  select count(*) into source_count from public.sources;')
lines.push('  select count(*) into market_count from public.market_data;')
lines.push("  raise notice 'Seed complete. Careers: %, Sources: %, Market rows: %', career_count, source_count, market_count;")
lines.push('end $$;')
lines.push('')
lines.push('commit;')
lines.push('')
lines.push('-- After your first admin signs up, promote them with:')
lines.push("-- update public.profiles set role = 'admin' where email = 'your-email@example.com';")

writeFileSync('supabase-seed.sql', lines.join('\n'))
console.log(`Wrote supabase-seed.sql with ${DB.sources.length} sources, ${DB.careers.length} careers, ${marketRows.length} market rows, ${learningRows.length} learning links.`)
