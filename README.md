# LK Outreach Sender

Minimal app that receives leads from your lead-generation tool, uses AI to create a short custom outreach message (what they do right, gaps, benefits, CTA for a 15–30 min call), and **sends it via WhatsApp** using a Python sender that mimics human behavior (your WhatsApp, your browser). Single outreach only; no payments, no tiers, no chatbot.

- **Lead gen tool** syncs leads here (e.g. webhook or cron). Each lead can include scraped/enriched data and analysis.
- **AI** (OpenAI) turns that into one short message: positive note → gaps → benefit tease → CTA call.
- **WhatsApp** is the main channel: messages are queued; a **Python app** (included in `python-sender/`) polls the queue and sends using your WhatsApp (browser/WhatsApp Web) with human-like delays. No email is sent unless you explicitly request it.

## Repo vs LK Reactor Pro

This repo contains **only**:

- Ingesting leads (from another tool)
- AI message generation from lead data
- Queuing WhatsApp sends (no built-in email auto-send)
- **Python sender** that mimics human behavior and sends via your WhatsApp
- Logging sends and optional replies

**Not included:** payment gateway, tiers, subscriptions, license verification, campaigns, or any UI beyond a simple API overview page.

## Setup

1. **Clone and install**

   ```bash
   cd lk-outreach-sender
   npm install
   ```

2. **Supabase**

   - Create a project and run the migrations in `supabase/migrations/` (001: `leads` and `sends`; 002: index for Lead Gen duplicate check).

3. **Environment**

   - Copy `.env.example` to `.env.local` and set:
     - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
     - `LEAD_GEN_INTEGRATION_TOKEN` or `LEAD_GEN_API_TOKEN` (webhook auth; use same value as Lead Gen Auto’s `MESSAGING_TOOL_API_KEY`)
     - `SENDER_SERVICE_TOKEN` (used by your WhatsApp sender to poll queue and report status)
     - `OPENAI_API_KEY`
     - `RESEND_API_KEY`, `OUTREACH_FROM_EMAIL`, `OUTREACH_REPLY_TO`, `OUTREACH_EMAIL_SUBJECT` (optional)
  - **Sender behavior** (optional; defaults match the previous desktop app):
    - `SENDER_WORKING_START`, `SENDER_WORKING_END` (e.g. `10:00`, `18:00`) — only send within this window
    - `SENDER_DELAY_MIN`, `SENDER_DELAY_MAX` (seconds) — random delay between messages (e.g. 60–210 = 1–3.5 min)
    - `SENDER_SHORT_PAUSE_EVERY`, `SENDER_SHORT_PAUSE_MIN` — short pause every N messages, for M minutes
    - `SENDER_LONG_PAUSE_EVERY`, `SENDER_LONG_PAUSE_MIN` — long pause every N messages
    - `SENDER_RECONTACT_SKIP_DAYS` — skip phone if already contacted in last N days

4. **Run**

   ```bash
   npm run dev
   ```

## API

All times in ISO 8601. Auth: `Authorization: Bearer <token>`.

### Lead Gen Auto webhook (use `LEAD_GEN_INTEGRATION_TOKEN` or `LEAD_GEN_API_TOKEN`)

- **`POST /api/integration/leads/receive`**  
  Webhook for Lead Gen Auto. Accepts single object or **array** of leads.  
  **Required fields:** `empresa` (non-empty), `phone` (E.164, e.g. `+5511999999999`), `nome` (or use `empresa`).  
  **Optional:** `email`, `niche`, `location`, `city`, `state`, `country`, `campaign_name`, `report_url`, `analysis_image_url`, `enrichment_data` (lead id, reports, analysis, etc.).  
  **Duplicate handling:** Skips if lead already exists by `enrichment_data.lead.id` or by `phone`.  
  **Response:** `{ success: true, message: "Lead(s) received", processed: N, created: M, errors: [] }` (or per-item `errors: [{ index, message }]`).

### Generic lead ingest (use `LEAD_GEN_API_TOKEN`)

- **`POST /api/leads`**  
  Ingest a lead. Body (JSON):
  - `contact_phone` (recommended for WhatsApp), `contact_email` (optional)
  - `external_id`, `contact_name`, `business_name`, `industry`, `summary`, `raw_payload` (optional)
  - `auto_send` (optional, default `true`): if `true`, generates message and queues WhatsApp; if `false`, only creates lead and generates message.
  - `send_email` (optional, default `false`): if `true`, also sends the message by email when `auto_send` is true.
  - Response: `lead_id`, `generated_message`, `whatsapp: "queued"`, and optionally `email`.

- **`POST /api/leads/[id]/generate`**  
  Regenerate the AI message for lead `id` and save it. Does not send.

- **`POST /api/leads/[id]/send`**  
  Queue WhatsApp for lead `id` (and optionally send email if body `send_email: true`). Uses existing `generated_message`; if missing, respond with 400 and call generate first.

### Health (no auth)

- **`GET /api/health`**  
  Returns `200` with `{ ok: true, db: "ok"|"error", ts }` if the app and Supabase are reachable. Use for uptime checks and load balancers. Returns `503` if DB is unreachable.

### Sender service (use `SENDER_SERVICE_TOKEN`)

- **`GET /api/sender/queue?limit=50`**  
  Returns `{ config, pending }`. **config** includes working hours, delays, pauses, and recontact rule (so the Python sender can mimic your previous desktop app). **pending** is filtered by recontact protection (skips phones contacted in the last N days). Each item: `send_id`, `lead_id`, `phone`, `contact_name`, `business_name`, `message_text`, `created_at`. Call **mark-sent** or **mark-failed** after each send.

- **`POST /api/sender/mark-sent`**  
  Body: `{ "send_id": "uuid", "sent_at": "ISO8601" }`. Marks send as sent.

- **`POST /api/sender/mark-failed`**  
  Body: `{ "send_id": "uuid", "error_message": "optional" }`. Marks send as failed.

- **`POST /api/sender/reply`**  
  Body: `{ "send_id": "uuid", "reply_text": "...", "reply_at": "ISO8601" }`. Records a reply and sets status to `replied`.

## Data model

- **leads**  
  `id`, `external_id`, `contact_name`, `contact_email`, `contact_phone`, `business_name`, `industry`, `raw_payload` (JSONB), `summary`, `generated_message`, `created_at`, `updated_at`.

- **sends**  
  `id`, `lead_id`, `channel` (`whatsapp` | `email`), `message_text`, `status` (`pending` | `sent` | `failed` | `replied`), `sent_at`, `reply_at`, `reply_text`, `error_message`, `created_at`, `updated_at`.

## Connecting your lead gen tool

From your lead generation app, when a lead is ready:

1. **POST** to `https://your-outreach-app.com/api/leads` with `Authorization: Bearer <LEAD_GEN_API_TOKEN>` and a JSON body with at least `contact_email` and any of: `contact_name`, `contact_phone`, `business_name`, `industry`, `summary`, `raw_payload` (object), `external_id`. Set `auto_send: true` to generate and send in one go, or `false` to only create and generate (then call `POST /api/leads/[id]/send` when you want to send).

2. Optionally **POST** to `/api/leads/[id]/generate` to regenerate the message, or **POST** to `/api/leads/[id]/send` to send later.

## WhatsApp sending

This app does not send WhatsApp itself. Your existing sender (e.g. Python script or desktop app) should:

1. **GET** `/api/sender/queue` with `Authorization: Bearer <SENDER_SERVICE_TOKEN>`.
2. For each item, send the message to `phone` (E.164), then:
   - **POST** `/api/sender/mark-sent` with `{ "send_id": "...", "sent_at": "..." }`, or
   - **POST** `/api/sender/mark-failed` with `{ "send_id": "...", "error_message": "..." }`.
3. When the contact replies, **POST** `/api/sender/reply` with `{ "send_id": "...", "reply_text": "..." }`.

## Deploy

Build and run like any Next.js app (e.g. Vercel):

```bash
npm run build
npm run start
```

Ensure all env vars are set in your deployment environment.
