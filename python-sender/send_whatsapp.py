#!/usr/bin/env python3
"""
WhatsApp sender: polls the outreach API queue and sends messages via WhatsApp Web
with human-like behavior. Respects:
- Working hours (only sends within start–end window)
- Random delay between messages (configurable range)
- Short pause every N messages (e.g. 15 min after every 15 messages)
- Long pause every M messages (e.g. 30 min after every 50 messages)
- Recontact protection (API filters; skips if contacted in last X days)
"""
import os
import random
import re
import time
from datetime import datetime, timedelta, time as dtime

import pyautogui
import pyperclip
import requests

# Load config from env (fallbacks; API returns config in queue response too)
API_BASE = os.environ.get("API_BASE_URL", "").rstrip("/")
TOKEN = os.environ.get("SENDER_SERVICE_TOKEN", "")
WAIT_AFTER_OPEN = float(os.environ.get("WAIT_AFTER_OPEN_CHAT", "3"))

if not API_BASE or not TOKEN:
    print("Set API_BASE_URL and SENDER_SERVICE_TOKEN (see config.example.env)")
    exit(1)

HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def parse_time(s: str):
    """Parse 'HH:MM' to (hour, minute)."""
    parts = re.match(r"^(\d{1,2}):(\d{2})$", s.strip())
    if not parts:
        return 10, 0
    return int(parts.group(1)), int(parts.group(2))


def is_inside_working_hours(now: datetime, start_str: str, end_str: str) -> bool:
    start_h, start_m = parse_time(start_str)
    end_h, end_m = parse_time(end_str)
    t = now.time()
    start = dtime(start_h, start_m)
    end = dtime(end_h, end_m)
    if start <= end:
        return start <= t <= end
    return t >= start or t <= end


def seconds_until_working_start(now: datetime, start_str: str) -> float:
    start_h, start_m = parse_time(start_str)
    start = dtime(start_h, start_m)
    today_start = datetime.combine(now.date(), start)
    if now.time() < start:
        return (today_start - now).total_seconds()
    tomorrow_start = today_start + timedelta(days=1)
    return (tomorrow_start - now).total_seconds()


def normalize_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 10 or len(digits) == 11:
        digits = "55" + digits
    return digits


def fetch_queue(limit: int = 10):
    r = requests.get(f"{API_BASE}/api/sender/queue", params={"limit": limit}, headers=HEADERS, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data.get("config", {}), data.get("pending", [])


def mark_sent(send_id: str):
    r = requests.post(
        f"{API_BASE}/api/sender/mark-sent",
        json={"send_id": send_id, "sent_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
        headers={**HEADERS, "Content-Type": "application/json"},
        timeout=15,
    )
    r.raise_for_status()


def mark_failed(send_id: str, error_message: str = ""):
    r = requests.post(
        f"{API_BASE}/api/sender/mark-failed",
        json={"send_id": send_id, "error_message": error_message},
        headers={**HEADERS, "Content-Type": "application/json"},
        timeout=15,
    )
    r.raise_for_status()


def human_delay(min_sec: float = 0.3, max_sec: float = 0.8):
    time.sleep(random.uniform(min_sec, max_sec))


def send_via_whatsapp_web(phone: str, message: str) -> bool:
    digits = normalize_phone(phone)
    if len(digits) < 10:
        return False
    url = f"https://wa.me/{digits}"
    import webbrowser
    webbrowser.open(url)
    time.sleep(WAIT_AFTER_OPEN + random.uniform(0.5, 1.5))
    pyperclip.copy(message)
    human_delay(0.2, 0.5)
    pyautogui.hotkey("ctrl", "v")
    human_delay(0.5, 1.2)
    pyautogui.press("enter")
    return True


def run_once():
    config, pending = fetch_queue(limit=10)
    working_start = config.get("working_start", "10:00")
    working_end = config.get("working_end", "18:00")
    delay_min = int(config.get("delay_min_sec", 60))
    delay_max = int(config.get("delay_max_sec", 210))
    short_pause_every = int(config.get("short_pause_every_n", 15))
    short_pause_min = int(config.get("short_pause_duration_min", 15))
    long_pause_every = int(config.get("long_pause_every_n", 50))
    long_pause_min = int(config.get("long_pause_duration_min", 30))

    if not pending:
        return 0

    now = datetime.now()
    if not is_inside_working_hours(now, working_start, working_end):
        sec = seconds_until_working_start(now, working_start)
        print(f"Outside working hours ({working_start}-{working_end}). Sleeping {sec/60:.0f} min until start.")
        time.sleep(min(sec, 60 * 60))
        return 0

    sent_count = 0
    for i, item in enumerate(pending):
        send_id = item["send_id"]
        phone = item.get("phone")
        message = item.get("message_text", "")
        if not phone or not message:
            mark_failed(send_id, "missing phone or message")
            continue
        try:
            ok = send_via_whatsapp_web(phone, message)
            if ok:
                mark_sent(send_id)
                sent_count += 1
                print(f"Sent to {phone} (send_id={send_id})")
            else:
                mark_failed(send_id, "invalid phone")
        except Exception as e:
            print(f"Error sending to {phone}: {e}")
            mark_failed(send_id, str(e))

        if i < len(pending) - 1:
            delay = random.uniform(delay_min, delay_max)
            print(f"Waiting {delay:.0f}s before next (human mode)...")
            time.sleep(delay)

        n = sent_count
        if short_pause_every and n > 0 and n % short_pause_every == 0:
            pause_sec = short_pause_min * 60
            print(f"Short pause: {short_pause_min} min after every {short_pause_every} messages.")
            time.sleep(pause_sec)
        if long_pause_every and n > 0 and n % long_pause_every == 0:
            pause_sec = long_pause_min * 60
            print(f"Long pause: {long_pause_min} min after every {long_pause_every} messages.")
            time.sleep(pause_sec)

    return len(pending)


def main():
    print("WhatsApp sender started. Working hours, intervals and pauses from API config. Ctrl+C to stop.")
    while True:
        try:
            n = run_once()
            if n == 0:
                time.sleep(15)
        except KeyboardInterrupt:
            print("Stopped.")
            break
        except Exception as e:
            print(f"Poll error: {e}")
            time.sleep(30)


if __name__ == "__main__":
    main()
