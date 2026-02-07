# WhatsApp Sender (Python)

Polls the outreach API queue and sends messages using **your** WhatsApp (via browser). Mimics human behavior: random delays between messages, paste then send.

## How it works

1. Polls `GET /api/sender/queue` for pending WhatsApp sends.
2. For each item: opens `wa.me/<phone>` in your default browser (opens the chat).
3. Waits a few seconds, then pastes the message and presses Enter.
4. Calls `POST /api/sender/mark-sent` or `mark-failed`.
5. Waits a random 30–90 seconds before the next message (configurable).

You need to be logged in to WhatsApp Web in that browser. The script does not log in for you.

## Setup

1. **Python 3.8+**

2. **Install dependencies**
   ```bash
   cd python-sender
   pip install -r requirements.txt
   ```

3. **Config**
   - Copy `config.example.env` to `.env` (or export in shell).
   - Set `API_BASE_URL` (e.g. `https://your-app.vercel.app`) and `SENDER_SERVICE_TOKEN`.

4. **Run**
   ```bash
   python send_whatsapp.py
   ```
   Keep the terminal open; the script runs in a loop. Use Ctrl+C to stop.

## Options (env)

| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | (required) | Base URL of the outreach API |
| `SENDER_SERVICE_TOKEN` | (required) | Token for sender API |
| `MIN_DELAY_BETWEEN_MESSAGES` | 30 | Min seconds between sends |
| `MAX_DELAY_BETWEEN_MESSAGES` | 90 | Max seconds between sends |
| `WAIT_AFTER_OPEN_CHAT` | 3 | Seconds to wait after opening wa.me before pasting |

## Tips

- **Single WhatsApp Web tab**: To avoid many tabs, use one tab with WhatsApp Web open. You can change the script to focus that window (e.g. by title), paste the message, then use a “next” shortcut if your workflow has one. The default flow uses one new tab per contact via `wa.me`.
- **Phone format**: The script normalizes numbers to digits and adds `55` for Brazilian numbers (10–11 digits). Other countries may need adjustment in `normalize_phone()`.
