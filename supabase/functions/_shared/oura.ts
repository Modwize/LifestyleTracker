// Oura Cloud API v2 client using a Personal Access Token.
// Docs: https://cloud.ouraring.com/v2/docs
// PAT lives in env var OURA_PAT (never stored in the DB).

const BASE = 'https://api.ouraring.com/v2';

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const pat = Deno.env.get('OURA_PAT');
  if (!pat) throw new Error('OURA_PAT not set');
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
  if (!r.ok) throw new Error(`Oura ${path} ${r.status}: ${await r.text()}`);
  return await r.json() as T;
}

export interface OuraSleepSession {
  id: string;
  day: string;                    // the day the sleep session belongs to
  bedtime_start: string;
  bedtime_end: string;
  total_sleep_duration: number;   // seconds
  efficiency?: number;
  type: string;                   // 'long_sleep', 'late_nap', etc.
}

export interface OuraDailyReadiness {
  id: string;
  day: string;
  score: number | null;
  contributors: Record<string, number>;
  temperature_deviation?: number;
  temperature_trend_deviation?: number;
}

export interface OuraDailyActivity {
  id: string;
  day: string;
  steps: number;
  active_calories: number;
  average_met_minutes: number;
}

export interface OuraHeartRateSummary {
  day: string;
  resting_heart_rate_avg?: number;
}

export async function fetchSleepSessions(start: string, end: string): Promise<OuraSleepSession[]> {
  const r = await get<{ data: OuraSleepSession[] }>('/usercollection/sleep', {
    start_date: start, end_date: end,
  });
  return r.data ?? [];
}

export async function fetchReadiness(start: string, end: string): Promise<OuraDailyReadiness[]> {
  const r = await get<{ data: OuraDailyReadiness[] }>('/usercollection/daily_readiness', {
    start_date: start, end_date: end,
  });
  return r.data ?? [];
}

export async function fetchDailyActivity(start: string, end: string): Promise<OuraDailyActivity[]> {
  const r = await get<{ data: OuraDailyActivity[] }>('/usercollection/daily_activity', {
    start_date: start, end_date: end,
  });
  return r.data ?? [];
}

// Reduce multiple sleep sessions into one "primary sleep" per day, picking the
// long_sleep session if present, else the longest.
export function primarySleepByDay(sessions: OuraSleepSession[]): Map<string, OuraSleepSession> {
  const byDay = new Map<string, OuraSleepSession[]>();
  for (const s of sessions) {
    const arr = byDay.get(s.day) ?? [];
    arr.push(s);
    byDay.set(s.day, arr);
  }
  const result = new Map<string, OuraSleepSession>();
  for (const [day, list] of byDay) {
    const longSleep = list.find((s) => s.type === 'long_sleep');
    const pick = longSleep ?? list.reduce((a, b) =>
      (a.total_sleep_duration ?? 0) >= (b.total_sleep_duration ?? 0) ? a : b,
    );
    result.set(day, pick);
  }
  return result;
}
