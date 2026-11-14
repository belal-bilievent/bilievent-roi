# Bilievent ROI — platform

The working system behind roi.bilievent.com: stand capture, AI lead qualification, routing and follow-up, ROI attribution, the improvement engine and printable reports.

## What it does

| Area | What works |
|---|---|
| Accounts | Company workspaces, admin / manager / sales / staff roles, invitations with temporary passwords, password change, 30-day sessions |
| Exhibitions | Shows with venue, dates, stand, goals (qualified leads, pipeline, cost per qualified lead), full cost lines |
| Stand capture | Mobile form, QR / vCard badge scanning (camera), business-card photo reading (needs AI key), Arabic and English dictation, offline queue that syncs on reconnect |
| AI qualification | Explainable score 0–100 from role, budget, timeline, company size, engagement, target sector and contact data; Arabic and English note extraction; hot / warm / cold tiers |
| Routing | Hot leads to the sales person with the fewest open hot leads, due in 24 h; warm leads to nurture in 3 days |
| Follow-up | WhatsApp, email and call shortcuts with templates; activity log; stage pipeline (new → contacted → meeting → proposal → won / lost) with deal value |
| CRM | CSV export, CSV import of CRM outcomes (matches by email or company), outbound https webhook on every new or updated lead |
| ROI | Cost, captured, qualified, opportunities, pipeline, won, ROI, cost per visitor / qualified lead / won deal, Day 30 and Day 90 windows, show-by-show comparison |
| Improvement engine | Rules on follow-up speed, peak hours, day-1 share, product interest, cold share, capture method and cost goal; status workflow proposed → approved → in delivery → delivered |
| Learning | Admin can retrain the score weights from won and lost leads (needs 20+ closed); all leads are re-scored |
| Reports | Printable ROI report per show (print or save as PDF) |

## Run locally

```bash
npm install
npm run seed      # demo workspace: demo@bilievent.com / BilieventDemo2026 (set DEMO_PASSWORD to change)
npm start         # http://localhost:8080
npm test          # API tests: auth, tenancy, roles, scoring, routing, ROI, import, CSV safety, learning
```

Requires Node 22.5+ (uses the built-in SQLite driver; no native modules).

## Deploy (VPS, same pattern as the CRM)

```bash
git clone https://github.com/belal-bilievent/bilievent-roi && cd bilievent-roi/platform
docker compose up -d --build
docker compose exec roi node --no-warnings src/seed.js   # optional demo workspace
```

Put a reverse proxy (Caddy or Nginx) in front of `127.0.0.1:8080` with HTTPS for `app.roi.bilievent.com`, then add an `A` record `app.roi` → the server IP at Network Solutions. The database lives in the `roi-data` volume (`/data/roi.db`); back it up daily.

Environment variables:

| Variable | Purpose |
|---|---|
| `PORT` | Default 8080 |
| `DB_FILE` | SQLite file path (default `data/roi.db`, `/data/roi.db` in Docker) |
| `COOKIE_SECURE=1` | Send session cookies over HTTPS only (set in Docker) |
| `ALLOW_SIGNUP=1` | Allow self-service company sign-up (off by default; accounts are by invitation) |
| `ANTHROPIC_API_KEY` | Enables business-card photo reading |
| `ANTHROPIC_MODEL` | Model for card reading (default `claude-sonnet-5-5`) |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | Demo workspace login created by `npm run seed` |

## Security

scrypt password hashing, HttpOnly SameSite session cookies, JSON-only writes (CSRF guard), login rate limiting, strict Content-Security-Policy, every query scoped to the signed-in company, CSV export protected against formula injection, https-only webhooks.

## Not yet included (next phase)

Native CRM connectors (Salesforce, HubSpot, Zoho), organizer white-label workspaces, organizer badge APIs, Arabic interface, email sending from the platform, enrichment providers.
