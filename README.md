# Personal Dashboard

A set of small, self-contained HTML apps that share a top bar.

## Deploy your own copy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRowanThistlebrooke%2FYTdashh1)

One click → Vercel signs you in, copies the repo to your GitHub, and deploys it. ~30 seconds to a live URL.

## How to use

Open any `.html` file directly in your browser — no build step, no install.

| File | What it is |
|---|---|
| [index.html](index.html) | Goals tracker (Day Ring, Goal Ticker, To Do list) — the home page |
| [health.html](health.html) | Supplement / daily stack tracker, with the water tracker embedded below it |
| [po-water.html](po-water.html) | Water intake tracker (embedded in health.html, also usable standalone) |
| [finance.html](finance.html) | Finances |
| [gym.html](gym.html) | Progressive overload gym tracker |
| [daily.html](daily.html) | Steps / heart rate / sleep / workouts, synced from Fitbit — see [FITBIT_SETUP.md](FITBIT_SETUP.md) |
| [topbar.js](topbar.js) | Shared top bar + bottom tab bar — auto-injected into pages that `<script src="topbar.js">` |

Most pages store their own state in browser `localStorage`, optionally synced
to Supabase (`sync.js`) so it follows you across devices. `daily.html` is the
exception — its data lives in Supabase from the start, pulled server-side
from Fitbit by the functions in `api/fitbit/`. See
[FITBIT_SETUP.md](FITBIT_SETUP.md) to connect it; the tab works fine without
it, it just shows a "Connect Fitbit" prompt instead of data.

## Building from scratch

[BUILD_DASHBOARD.md](BUILD_DASHBOARD.md) is the prompt I gave Claude to generate `index.html` — paste it into Claude if you want to rebuild that page yourself.
