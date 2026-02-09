# LK Outreach Sender

Standalone outreach app: upload CSV leads, manage message templates, and queue WhatsApp messages. **Admins** log in and assign sends to **SDRs**; each SDR uses their own sender token and WhatsApp. AI can generate personalized messages from your instructions. A Python sender (in `python-sender/`) polls the queue and sends via the SDR’s WhatsApp (browser) with human-like delays. **WhatsApp only;** no email, no webhooks.

- **Login** — Email/password (Supabase Auth). First user: create admin at `/setup`.
- **Admin** — Upload CSV, Templates, Queue send (with “Assign to SDR”), and **SDRs** page to add SDRs, reset password, regenerate sender token.
- **SDR** — Log in and open “My sender token” to copy the token for the Python sender. Only messages assigned to that SDR appear in their queue.
- **One sender token per SDR** — Stored in `sellers.sender_token`; Python sender uses `Authorization: Bearer <token>`.

## Setup

1. **Clone and install**

   ```bash
   cd lk-outreach-sender
   npm install
   ```

2. **Supabase**

   - Create a project and enable Email auth (no extra providers required).
   - Run migrations in order: `001_schema.sql`, `003_standalone.sql`, `004_sellers_and_assignment.sql`.

3. **Environment**

   - Copy `.env.example` to `.env.local` and set:
     - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     - `OPENAI_API_KEY` (for AI mode)
   - Optional sender behavior: `SENDER_WORKING_*`, `SENDER_DELAY_*`, `SENDER_*_PAUSE_*`, `SENDER_RECONTACT_SKIP_DAYS`.

4. **Run**

   ```bash
   npm run dev
   ```

   - Open **http://localhost:3000**. If no users exist, go to **/setup** to create the first admin. Then log in at **/login**.
   - Admin: Upload CSV, Templates, Queue send (choose “Assign to SDR”), SDRs (add/invite, reset password, regenerate token).
   - SDR: Log in and open “My sender token”; use that token in the Python sender’s `.env` as `SENDER_SERVICE_TOKEN`.

## Desktop app (Windows .exe)

Build a Windows installer so SDRs can install and run the app without a browser or `npm run dev`. **On Windows:** run `npm run electron:build`. The installer appears in `release/` (e.g. `LK Outreach Sender Setup 1.0.0.exe`). Share it; SDRs install and open "LK Outreach Sender" from the Start menu. The app uses the Supabase/OpenAI env from the machine where you built; the Python sender stays separate for WhatsApp sending.

## API (session or token)

- **Web (session)** — CSV, templates, leads, send/queue, sellers, me: require login; admin-only for most, SDR for `/api/me`.
- **Sender (Bearer token)** — Each SDR uses their own token from the app:
  - **`GET /api/sender/queue?limit=50`** — Returns `{ config, pending }` for sends assigned to that SDR.
  - **`POST /api/sender/mark-sent`** — Body: `{ send_id, sent_at? }`. Only for sends assigned to the token’s SDR.
  - **`POST /api/sender/mark-failed`**, **`POST /api/sender/reply`** — Same: scoped to that SDR.

## Data model

- **sellers** — `id`, `auth_user_id`, `email`, `name`, `role` (admin | sdr), `sender_token`, `created_at`, `updated_at`.
- **leads** — As before; **sends** — as before plus `assigned_to` (UUID → sellers.id).
- **templates** — As before.

## Python sender (per SDR)

Each SDR runs the Python sender on their PC with their own token:

1. Log in to the app and open “My sender token”.
2. In `python-sender/.env` set `API_BASE_URL` and `SENDER_SERVICE_TOKEN` to that token.
3. Run `python send_whatsapp.py`. Only messages assigned to that SDR are fetched and sent from their WhatsApp.

## Deploy

Build and run like any Next.js app. Set all env vars. Ensure Supabase Auth is configured (email provider).
