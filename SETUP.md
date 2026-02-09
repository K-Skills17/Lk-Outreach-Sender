# LK Outreach Sender — Step-by-step setup

Standalone outreach with admin and SDR roles: CSV upload, templates, queue send (assign to SDR). Each SDR uses their own sender token and WhatsApp. No webhooks or external lead-gen.

---

## Step 1 — Clone the repo

```bash
git clone <your-repo-url> lk-outreach-sender
cd lk-outreach-sender
```

---

## Step 2 — Install Node dependencies

```bash
npm install
```

You need **Node.js 18+** (LTS recommended). Check with `node -v`.

---

## Step 3 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → choose org, name (e.g. `outreach-sender`), database password, region.
3. Wait for the project to be ready.
4. In the dashboard: **Project Settings** → **API**:
   - Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`.
   - Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Copy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`.  
   ⚠️ Keep the service role key secret.
5. **Authentication** → Providers: ensure **Email** is enabled (default).

---

## Step 4 — Run database migrations

1. In Supabase dashboard, open **SQL Editor**.
2. Run, in order:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/003_standalone.sql`
   - `supabase/migrations/004_sellers_and_assignment.sql`

You should have tables: `leads`, `sends`, `templates`, `sellers`. Column `sends.assigned_to` links to `sellers`.

---

## Step 5 — Configure environment variables

1. Copy the example env file:

   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and set:

### Required

| Variable | Where to get it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API keys (for AI mode) |

### Optional (sender behavior)

| Variable | Purpose | Default |
|----------|---------|--------|
| `SENDER_WORKING_START` / `SENDER_WORKING_END` | Sending window (HH:MM) | `10:00` / `18:00` |
| `SENDER_DELAY_MIN` / `SENDER_DELAY_MAX` | Delay between messages (seconds) | `60` / `210` |
| `SENDER_SHORT_PAUSE_EVERY` / `SENDER_SHORT_PAUSE_MIN` | Short pause every N messages, duration (min) | `15` / `15` |
| `SENDER_LONG_PAUSE_EVERY` / `SENDER_LONG_PAUSE_MIN` | Long pause every N messages, duration (min) | `50` / `30` |
| `SENDER_RECONTACT_SKIP_DAYS` | Don’t send again to same phone within N days | `3` |

**Note:** There is no single `SENDER_SERVICE_TOKEN`. Each SDR gets a token from the app (My sender token page) and uses it in their Python sender `.env`.

---

## Step 6 — Run the app and create the first admin

```bash
npm run dev
```

1. Open **http://localhost:3000**. You will be redirected to **/login**.
2. If no users exist yet, open **http://localhost:3000/setup** and create the first account (email + password). This becomes the **admin**.
3. Log in at **/login** with that email and password.
4. As admin you’ll see: Upload CSV, Templates, Queue send, **SDRs**. On Queue send you must **Assign to SDR**; add SDRs on the SDRs page first (email, name, password). Each new SDR gets a **sender token** (show it once so they can put it in their Python app).

---

## Step 7 — SDRs: run the Python sender

Each SDR uses their own WhatsApp and token:

1. SDR logs in at **http://localhost:3000**, opens **My sender token**, and copies the token.
2. On their PC: install Python 3.8+, then in `python-sender/`:
   - `pip install -r requirements.txt`
   - Copy `config.example.env` to `.env`
   - Set `API_BASE_URL` to your app URL (e.g. `http://localhost:3000` or production URL).
   - Set `SENDER_SERVICE_TOKEN` to **that SDR’s token** (from the app).
3. Run `python send_whatsapp.py`. Only messages **assigned to that SDR** will appear in the queue and be sent from their browser/WhatsApp.

---

## Step 8 — Deploy to production (e.g. Vercel)

1. Push code and import the repo in Vercel.
2. In **Settings** → **Environment Variables**, add the same variables as `.env.local` (including `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Deploy. In Supabase, add your production URL to **Authentication** → **URL Configuration** (Site URL / Redirect URLs) if needed.
4. SDRs set `API_BASE_URL` in their Python sender to your production URL and use their token from the app.

---

## Checklist

- [ ] Repo cloned, `npm install` done
- [ ] Supabase project created; migrations 001, 003, 004 run
- [ ] `.env.local` has: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`
- [ ] `npm run dev` runs; first admin created at `/setup`; can log in and see Upload, Templates, Queue send, SDRs
- [ ] SDRs added on SDRs page; each has a sender token; Queue send assigns messages to an SDR
- [ ] Each SDR runs Python sender with their own token; only their assigned messages are sent

---

## Troubleshooting

- **401 on sender queue:** The Python sender must use the **SDR’s token** from the app (My sender token), not a global token.
- **Health returns db: "error":** Check Supabase URL and keys; confirm all migrations ran.
- **Setup page says "Setup already completed":** At least one seller exists; log in at `/login` instead.
- **AI error when queueing:** Check `OPENAI_API_KEY` and quota.
