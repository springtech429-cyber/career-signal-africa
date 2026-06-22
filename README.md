# CareerSignal Africa — Production MVP

React/Vite MVP for Zambia-first career recommendations with PostgreSQL/Supabase authentication, analytics consent, user dashboards, verified admin tools, CSV workflows, and transparent career-market scoring.

## Stack

- React + Vite
- PostgreSQL via Supabase
- Supabase Auth for users and admins
- Row Level Security-ready schema in `schema.sql`
- Netlify deployment
- Local seed fallback in `src/data.js`

## New production MVP features

- Cookie/consent banner for necessary storage and optional analytics.
- Usage analytics event collection after consent.
- First recommendation works without account creation.
- On second visit, users are prompted to create a free account.
- Email/password authentication through Supabase Auth.
- User dashboard for profile context and saved/shortlisted careers.
- Admin dashboard is hidden unless authenticated profile role is `admin`.
- Admin analytics tab with Mixpanel-inspired charts, recent activity stream, counts, and structured CSV export.
- Admin manual data editor for career profile details and regional market data.
- Admin CSV import for market data.
- CSV export for market data.
- CSV export for usage reports.
- CSV export for newsletter emails.
- Newsletter capture form on landing page.
- Career-specific YouTube topics with in-site embed support plus direct YouTube links.
- Category-specific blog/reading resources.

## Project structure

```text
career-signal-africa/
  src/
    main.jsx              # React app, routes, auth UI, dashboards, scoring engine
    data.js               # Seed career/source data fallback
    styles.css            # Corporate UI system
    supabaseClient.js     # Supabase client setup
    analytics.js          # Consent-aware analytics helpers
  scripts/
    seed-supabase.mjs     # Seeds sources/careers/market_data into Supabase
  schema.sql              # Production PostgreSQL/Supabase schema + RLS policies
  .env.example
  netlify.toml
```

## Local development

```bash
cd career-signal-africa
npm install
cp .env.example .env.local
npm run dev
```

If you have not configured Supabase yet, the app still runs with local seed data, but sign-up/admin database features will show a configuration warning.

## Supabase setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run the full `schema.sql` file.
4. Enable/confirm email confirmation if you want sign-up confirmation emails: Supabase Dashboard → Authentication → Providers → Email → Confirm email.
5. Add your frontend keys to `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

5. Start the app:

```bash
npm run dev
```

## Full SQL seed file

I generated a complete SQL seed file:

```text
supabase-seed.sql
```

Run order in Supabase SQL Editor:

1. Run `schema.sql`
2. Run `supabase-seed.sql`

The seed file includes:

- 25 sources
- 25 careers
- 75 market-data rows, 3 regions per career
- 150 learning links, including YouTube topics and blogs

It is safe to re-run. Sources, careers and market data use upserts. Seeded learning links are refreshed before insert.

To regenerate it from `src/data.js`:

```bash
npm run generate:seed-sql
```

## Seed data into PostgreSQL

Add your service role key to `.env.local`:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Then run:

```bash
npm run seed
```

This upserts:

- `sources`
- `careers`
- `market_data`

Never expose the service role key in Netlify frontend environment variables.

## Create the first admin

1. Sign up normally in the app.
2. In Supabase SQL Editor, run:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

3. Sign out and sign in again.
4. The Admin link will appear in the navigation.

## Netlify deployment

Set these Netlify environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Do **not** put `SUPABASE_SERVICE_ROLE_KEY` in Netlify unless you are using secured serverless functions and never exposing it to the client.

Build settings:

```text
Build command: npm run build
Publish directory: dist
```

`netlify.toml` already includes SPA redirects.

## CSV market-data format

```csv
career_id,region,marketability_score,profitability_score,demand_score,median_salary_local,median_salary_usd,source_ids,last_updated
software_developer,Zambia,84,82,79,21000,780,jobweb|gojobs|linkedin|zda,2026-05-31
```

`source_ids` use pipe-separated IDs.

## Current MVP limitations

- Admin manual edits update the browser session immediately and can be persisted with “Save current career to DB”. CSV imports also upsert to PostgreSQL when Supabase is configured.
- The recommendation engine still uses local seed data as the primary app source for speed/reliability. Use `npm run seed` to load the same data into PostgreSQL; the next step is switching reads fully to Supabase.
- YouTube embeds use topic/search embeds. For highest reliability, later store specific approved YouTube video IDs in the `learning_links` table.
- Payments are intentionally excluded from this free launch version.

## Scoring methodology

Each career has regional records for Zambia, Africa and Global.

```text
Composite = (Marketability × market weight + Profitability × pay weight + Demand × need weight) / total selected weight
```

The ranking also includes a lighter personal-fit signal from education, skills, interests, work preferences and risk tolerance.

Scores are directional estimates, not guarantees of employment, salary, admission, or career success.

## Privacy and ethics

- First recommendation works without account creation.
- Account creation is requested from the second visit to support saved history and product analytics.
- Analytics only run after consent.
- Respect Terms of Service and robots.txt for all job boards.
- Prefer manual curation, official APIs, partnerships, RSS feeds, or licensed data feeds.
