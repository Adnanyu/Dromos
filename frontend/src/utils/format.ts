export type Units = 'metric' | 'imperial'

// ── Distance ──────────────────────────────────────────────────────────────────

export function formatDistance(meters: number, units: Units = 'metric'): string {
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

export function formatDistanceShort(meters: number, units: Units = 'metric'): string {
  if (units === 'imperial') {
    return `${(meters / 1609.344).toFixed(1)} mi`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

// ── Pace ─────────────────────────────────────────────────────────────────────

/** secondsPerKm → "5:30/km" or "8:51/mi" */
export function formatPace(secondsPerKm: number, units: Units = 'metric'): string {
  const s = units === 'imperial' ? secondsPerKm * 1.60934 : secondsPerKm
  const mins = Math.floor(s / 60)
  const secs = Math.round(s % 60)
  const suffix = units === 'imperial' ? '/mi' : '/km'
  return `${mins}:${secs.toString().padStart(2, '0')}${suffix}`
}

// ── Speed ─────────────────────────────────────────────────────────────────────

/** km/h → "28.4 km/h" or "17.6 mph" */
export function formatSpeed(kmh: number, units: Units = 'metric'): string {
  if (units === 'imperial') return `${(kmh * 0.621371).toFixed(1)} mph`
  return `${kmh.toFixed(1)} km/h`
}

// ── Duration ─────────────────────────────────────────────────────────────────

/** seconds → "1:02:34" or "42:07" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** seconds → "42 min" or "1h 2min" */
export function formatDurationWords(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m} min`
}

// ── Elevation ─────────────────────────────────────────────────────────────────

export function formatElevation(meters: number, units: Units = 'metric'): string {
  if (units === 'imperial') return `${Math.round(meters * 3.28084)} ft`
  return `${Math.round(meters)} m`
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
