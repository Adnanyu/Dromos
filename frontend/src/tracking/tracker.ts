import type { LatLng } from '../types/api'

// ── GPS quality gates ────────────────────────────────────────────────────────
// Raw fixes are never trusted unconditionally: degraded accuracy, multipath
// jumps, and jitter are filtered before a fix affects distance or heading.
const MIN_ACCURACY_M         = 25   // reject fixes reporting worse than this (metres, 1σ)
const MAX_PLAUSIBLE_SPEED_MS = 12   // ~43 km/h — generous ceiling to catch GPS jumps
const MIN_DELTA_M            = 1    // ignore sub-metre jitter for distance

// ── Pace window ──────────────────────────────────────────────────────────────
// Pace is computed over a sliding window of accepted fixes rather than from
// the chip's instantaneous speed: a 20s window absorbs per-fix GPS noise
// while still reflecting a genuine pace change within a few seconds. It is
// recomputed on a timer — not only when fixes arrive — so the value decays
// to "stopped" when the runner stands still.
const PACE_WINDOW_S     = 20
const PACE_STALE_FIX_S  = 5
const PACE_MIN_SPEED_MS = 0.4
const PACE_EMA_ALPHA    = 0.3

export interface RawFix {
  latitude:  number
  longitude: number
  accuracy:  number | null
  speed:     number | null   // m/s
  heading:   number | null   // degrees, -1/null when invalid
  altitude:  number | null
  timestamp: number          // epoch ms
}

export interface AcceptedFix {
  position: LatLng
  /** GPS course in degrees, present only when moving fast enough to trust it. */
  heading?: number
  speedMs:  number
}

function haversineM(a: LatLng, b: LatLng): number {
  const R  = 6_371_000
  const p1 = (a.lat * Math.PI) / 180
  const p2 = (b.lat * Math.PI) / 180
  const dp = ((b.lat - a.lat) * Math.PI) / 180
  const dl = ((b.lng - a.lng) * Math.PI) / 180
  const s  = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

/**
 * Module-level singleton holding the live workout's accumulation state.
 *
 * It lives outside React because two independent feeds write into it: the
 * foreground `watchPositionAsync` callback and the background-location task
 * (which runs with no component mounted). Both call `ingest()`; the screen
 * reads `distanceM` / `windowPace()` on its 1 Hz tick.
 */
class WorkoutTracker {
  private lastPos:    LatLng | null = null
  private lastFixAt:  number | null = null
  private lastFixTs:  number | null = null
  private paceWindow: { t: number; cumDist: number }[] = []
  private paceEma     = 0
  private totalDistM  = 0

  paused    = false
  /** True while GPS course is trusted for heading (compass yields). */
  gpsMoving = false

  get distanceM(): number { return this.totalDistM }

  reset(): void {
    this.lastPos    = null
    this.lastFixAt  = null
    this.lastFixTs  = null
    this.paceWindow = []
    this.paceEma    = 0
    this.totalDistM = 0
    this.paused     = false
    this.gpsMoving  = false
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) {
      // Break continuity so movement during the pause never counts as
      // distance — the first post-resume fix re-seeds lastPos.
      this.lastPos    = null
      this.lastFixAt  = null
      this.paceWindow = []
      this.paceEma    = 0
    }
  }

  /**
   * Process one raw fix. Returns the accepted position (plus GPS heading
   * when trustworthy), or null when the fix was rejected or tracking is
   * paused. Safe against double-delivery: the foreground watcher and the
   * background task can both be subscribed — an identical timestamp is
   * dropped as a duplicate.
   */
  ingest(fix: RawFix): AcceptedFix | null {
    if (this.paused) return null
    if (this.lastFixTs != null && fix.timestamp <= this.lastFixTs) return null

    const pos: LatLng = { lat: fix.latitude, lng: fix.longitude }

    // Reject degraded fixes (always accept the very first — need a start).
    if (fix.accuracy != null && fix.accuracy > MIN_ACCURACY_M && this.lastPos) {
      return null
    }

    // Reject fixes implying impossible speed (multipath, reacquisition).
    if (this.lastPos && this.lastFixAt) {
      const dtS = (fix.timestamp - this.lastFixAt) / 1_000
      if (dtS > 0 && haversineM(this.lastPos, pos) / dtS > MAX_PLAUSIBLE_SPEED_MS) {
        return null
      }
    }
    this.lastFixAt = fix.timestamp
    this.lastFixTs = fix.timestamp

    if (this.lastPos) {
      const delta = haversineM(this.lastPos, pos)
      if (delta > MIN_DELTA_M) this.totalDistM += delta
    }
    this.lastPos = pos

    this.paceWindow.push({ t: fix.timestamp, cumDist: this.totalDistM })

    const speedMs = fix.speed ?? 0
    // GPS course is only trustworthy above ~0.5 m/s, and -1 marks an
    // invalid course even at speed.
    if (fix.heading != null && fix.heading >= 0 && speedMs > 0.5) {
      this.gpsMoving = true
      return { position: pos, heading: fix.heading, speedMs }
    }
    this.gpsMoving = false
    return { position: pos, speedMs }
  }

  /**
   * Smoothed pace in s/km over the sliding window, EMA-filtered for display.
   * Returns 0 when stopped (no recent fix, or window speed below walking
   * threshold) so callers can show "--:--" instead of a frozen value.
   * Call at ~1 Hz — the `now` denominator is what makes pace decay during
   * GPS gaps.
   */
  windowPace(now = Date.now()): number {
    const w = this.paceWindow
    while (w.length > 0 && now - w[0].t > PACE_WINDOW_S * 1_000) w.shift()

    const newest = w[w.length - 1]
    const oldest = w[0]

    if (!newest || now - newest.t > PACE_STALE_FIX_S * 1_000) {
      this.paceEma = 0
      return 0
    }
    if (!oldest || newest === oldest) return this.paceEma

    const dtS   = (now - oldest.t) / 1_000
    const distM = newest.cumDist - oldest.cumDist
    if (dtS <= 0) return this.paceEma

    const speedMs = distM / dtS
    if (speedMs < PACE_MIN_SPEED_MS) {
      this.paceEma = 0
      return 0
    }

    const paceRaw = 1_000 / speedMs
    this.paceEma = this.paceEma > 0
      ? this.paceEma * (1 - PACE_EMA_ALPHA) + paceRaw * PACE_EMA_ALPHA
      : paceRaw
    return this.paceEma
  }
}

export const workoutTracker = new WorkoutTracker()
