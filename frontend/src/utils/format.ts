export type Units = 'metric' | 'imperial'

// The backend can legitimately send null/undefined for values that were
// never computed (an activity with no GPS data has no pace), and division
// by a zero distance produces NaN/Infinity. Every formatter normalizes its
// input first so the UI shows "--" style placeholders, never "NaN:NaN/km".
function finiteOrZero(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

// ── Distance ──────────────────────────────────────────────────────────────────

export function formatDistance(meters: number | null | undefined, units: Units = 'metric'): string {
  meters = finiteOrZero(meters)
  if (units === 'imperial') {
    const miles = meters / 1609.344
    return miles >= 0.1
      ? `${miles.toFixed(2)} mi`
      : `${Math.round(meters * 3.28084)} ft`
  }
  return meters >= 1000
    ? `${(meters / 1000).toFixed(2)} km`
    : `${Math.round(meters)} m`
}

export function formatDistanceShort(meters: number | null | undefined, units: Units = 'metric'): string {
  meters = finiteOrZero(meters)
  if (units === 'imperial') {
    return `${(meters / 1609.344).toFixed(1)} mi`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

// ── Pace ─────────────────────────────────────────────────────────────────────

/** secondsPerKm → "5:30/km" or "8:51/mi"; "--:--" when unknown/stopped. */
export function formatPace(secondsPerKm: number | null | undefined, units: Units = 'metric'): string {
  const suffix = units === 'imperial' ? '/mi' : '/km'
  const value = finiteOrZero(secondsPerKm)
  if (value <= 0) return `--:--${suffix}`
  const s = units === 'imperial' ? value * 1.60934 : value
  const mins = Math.floor(s / 60)
  const secs = Math.round(s % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}${suffix}`
}

// ── Speed ─────────────────────────────────────────────────────────────────────

/** km/h → "28.4 km/h" or "17.6 mph"; "--" when unknown. */
export function formatSpeed(kmh: number | null | undefined, units: Units = 'metric'): string {
  const value = finiteOrZero(kmh)
  const suffix = units === 'imperial' ? 'mph' : 'km/h'
  if (value <= 0) return `-- ${suffix}`
  if (units === 'imperial') return `${(value * 0.621371).toFixed(1)} mph`
  return `${value.toFixed(1)} km/h`
}

// ── Duration ─────────────────────────────────────────────────────────────────

/** seconds → "1:02:34" or "42:07" */
export function formatDuration(seconds: number | null | undefined): string {
  const value = Math.max(0, finiteOrZero(seconds))
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = Math.round(value % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** seconds → "42 min" or "1h 2min" */
export function formatDurationWords(seconds: number | null | undefined): string {
  const value = Math.max(0, finiteOrZero(seconds))
  const h = Math.floor(value / 3600)
  const m = Math.round((value % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m} min`
}

// ── Elevation ─────────────────────────────────────────────────────────────────

export function formatElevation(meters: number | null | undefined, units: Units = 'metric'): string {
  const value = finiteOrZero(meters)
  if (units === 'imperial') return `${Math.round(value * 3.28084)} ft`
  return `${Math.round(value)} m`
}

// ── Misc ──────────────────────────────────────────────────────────────────────

export function formatRelativeTime(isoOrUnix: string | number): string {
  const ts = typeof isoOrUnix === 'number' ? isoOrUnix * 1000 : new Date(isoOrUnix).getTime()
  const diff = (Date.now() - ts) / 1000

  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  if (diff < 604800)return `${Math.round(diff / 86400)}d ago`
  return new Date(ts).toLocaleDateString()
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
