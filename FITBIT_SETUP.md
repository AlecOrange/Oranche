# Fitbit setup for the Daily tab

`daily.html` shows steps, active minutes, calories, resting heart rate,
sleep, and today's workouts, pulled from the Fitbit Web API. Fitbit
authenticates with OAuth 2.0 (a user consent screen), not a static API
key, so the integration is a few small Vercel serverless functions under
`/api/fitbit/` plus one new Supabase table.

## 1. Register a Fitbit app

Go to [dev.fitbit.com/apps/new](https://dev.fitbit.com/apps/new) and register an app:

- **OAuth 2.0 Application Type:** `Server`
- **Redirect URL:** `https://<your-vercel-domain>/api/fitbit/callback`
  (use your real deployed domain — Fitbit requires an exact match)
- **Default Access Type:** `Read Only`

After saving, copy the **Client ID** and **Client Secret** from the app's
management page.

## 2. Create the Supabase table for tokens

Run this once in the Supabase SQL editor. It's a separate table from
`app_state` on purpose — `app_state` already has RLS policies that let the
browser's public/anon key read and write it, and Fitbit's access +
refresh tokens must never be reachable with that key.

```sql
create table if not exists public.fitbit_tokens (
  id text primary key default 'default',
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.fitbit_tokens enable row level security;
-- No policies are added on purpose. With RLS on and zero policies,
-- every request through the anon/publishable key is denied. Only the
-- service_role key (used server-side in /api/fitbit/*) bypasses RLS
-- and can read or write this table.
```

`app_state` doesn't need any schema change — the sync function just
upserts a new row with `key = 'daily'` holding the processed summary,
same pattern the rest of the dashboard already uses for goals/health/water.

## 3. Get your Supabase service role key

In the Supabase dashboard: **Project Settings → API → service_role
secret**. This is different from the publishable/anon key already used
in `topbar.js`/`sync.js` — it bypasses RLS, so it must only ever be set
as a server-side environment variable, never committed to the repo or
put in client-side code.

## 4. Set environment variables in Vercel

Project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `FITBIT_CLIENT_ID` | from step 1 |
| `FITBIT_CLIENT_SECRET` | from step 1 |
| `SUPABASE_URL` | `https://aydhdrclipttbbxdzayc.supabase.co` (same project as the rest of the dashboard) |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 3 |

`FITBIT_REDIRECT_URI` is optional — if unset, the functions derive it
from the incoming request's host, which is correct for a single Vercel
deployment. Set it explicitly only if you're proxying through another
domain.

Redeploy after adding the variables so the functions pick them up.

## 5. Connect

Open `/daily.html` and click **Connect Fitbit**. You'll be sent to
Fitbit's consent screen, then bounced back and synced automatically.
Data is cached in `app_state` (`key = 'daily'`) so the page always loads
instantly from Supabase; opening the tab also triggers a background
refresh (throttled to once per ~4 minutes client-side), and there's a
manual **Sync** button too.

`vercel.json` also schedules a daily cron hit to `/api/fitbit/sync` at
06:00 UTC as a backup, so data doesn't go stale if the tab isn't opened
for a while. Vercel's Hobby plan only allows day-granularity cron
schedules — on a Pro plan you can tighten `vercel.json`'s schedule to
sync more often automatically.

## How the pieces fit together

- `api/fitbit/authorize.js` — redirects to Fitbit's OAuth consent screen.
- `api/fitbit/callback.js` — exchanges the returned code for tokens, stores them in `fitbit_tokens`.
- `api/fitbit/sync.js` — refreshes the token if it's near expiry, pulls today's activity/heart/sleep data from Fitbit, writes a processed summary into `app_state`.
- `api/fitbit/status.js` — tells `daily.html` whether Fitbit is connected, without ever exposing the tokens to the browser.
- `daily.html` — reads the cached summary from `app_state` for an instant paint, triggers a background sync, and subscribes to Supabase realtime so it updates live.
