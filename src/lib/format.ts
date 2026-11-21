/** Display helpers. */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parts(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  return { d: d.getUTCDate(), m: MONTH[d.getUTCMonth()], w: WEEKDAY[d.getUTCDay()], y: d.getUTCFullYear() }
}

export function shortDate(iso: string): string {
  const p = parts(iso)
  return `${p.w} ${p.d} ${p.m}`
}

export function dateRange(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  if (start === end) return `${a.d} ${a.m} ${a.y}`
  if (a.m === b.m && a.y === b.y) return `${a.d}–${b.d} ${a.m} ${a.y}`
  if (a.y === b.y) return `${a.d} ${a.m} – ${b.d} ${b.m} ${a.y}`
  return `${a.d} ${a.m} ${a.y} – ${b.d} ${b.m} ${b.y}`
}

export function initials(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (!n) return '?'
  const bits = n.split(/\s+/)
  return ((bits[0]?.[0] ?? '') + (bits.length > 1 ? bits[bits.length - 1][0] : '')).toUpperCase()
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function mapsUrl(name: string, destination: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${destination}`)}`
}

export function weatherIconUrl(icon: string): string {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`
}
