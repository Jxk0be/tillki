/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
export function localDateTimeValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A datetime-local value (local time) as an ISO timestamp, or now if empty/invalid. */
export function isoFromLocal(value: string): string {
  const d = value ? new Date(value) : new Date()
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
