/**
 * Sender behavior config (working hours, intervals, pauses, recontact protection).
 * Read from env so the Python sender can respect the same rules as the previous desktop app.
 */

export interface SenderConfig {
  working_start: string; // "HH:MM" e.g. "10:00"
  working_end: string;   // "HH:MM" e.g. "18:00"
  delay_min_sec: number;
  delay_max_sec: number;
  short_pause_every_n: number;
  short_pause_duration_min: number;
  long_pause_every_n: number;
  long_pause_duration_min: number;
  recontact_skip_days: number;
}

export function getSenderConfig(): SenderConfig {
  return {
    working_start: process.env.SENDER_WORKING_START ?? '10:00',
    working_end: process.env.SENDER_WORKING_END ?? '18:00',
    delay_min_sec: parseInt(process.env.SENDER_DELAY_MIN ?? '60', 10) || 60,
    delay_max_sec: parseInt(process.env.SENDER_DELAY_MAX ?? '210', 10) || 210,
    short_pause_every_n: parseInt(process.env.SENDER_SHORT_PAUSE_EVERY ?? '15', 10) || 15,
    short_pause_duration_min: parseInt(process.env.SENDER_SHORT_PAUSE_MIN ?? '15', 10) || 15,
    long_pause_every_n: parseInt(process.env.SENDER_LONG_PAUSE_EVERY ?? '50', 10) || 50,
    long_pause_duration_min: parseInt(process.env.SENDER_LONG_PAUSE_MIN ?? '30', 10) || 30,
    recontact_skip_days: parseInt(process.env.SENDER_RECONTACT_SKIP_DAYS ?? '3', 10) || 3,
  };
}
