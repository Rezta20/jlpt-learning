const TZ = 'Asia/Taipei'

/** Today's date as YYYY-MM-DD in Taiwan time. */
export function todayStr(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Hour of day (0–23) in Taiwan time. */
export function localHour(d: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d))
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Start of a local date as a UTC Date (Taiwan is UTC+8, no DST). */
export function startOfLocalDay(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00+08:00')
}

export function endOfLocalDay(dateStr: string): Date {
  return new Date(dateStr + 'T23:59:59.999+08:00')
}

export function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000)
}

export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400_000)
}

/** postgres.js cannot bind Date objects in raw SQL; pass ISO strings instead. */
export function sqlTs(d: Date = new Date()): string {
  return d.toISOString()
}
