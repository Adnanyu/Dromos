import { BASE_URL } from './client'
import type { GpsPoint, LiveStatsMessage } from '../types/api'

// Convert http(s) → ws(s) for the WebSocket URL
const WS_BASE = BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws')

type StatsCallback      = (stats: LiveStatsMessage) => void
type ConnectedCallback  = () => void
type DisconnectedCallback = (code: number, reason: string) => void
type ErrorCallback      = (err: Event) => void

export class LiveActivitySocket {
  private ws:          WebSocket | null = null
  private batchBuffer: GpsPoint[]      = []
  private flushTimer:  ReturnType<typeof setInterval> | null = null

  // -- Lifecycle ---------------------------------------------------------------

  connect(
    activityId: string,
    token: string,
    callbacks: {
      onConnected?:    ConnectedCallback
      onStats?:        StatsCallback
      onDisconnected?: DisconnectedCallback
      onError?:        ErrorCallback
    } = {}
  ): void {
    if (this.ws) this.disconnect()

    const url = `${WS_BASE}/activities/live/${activityId}?token=${encodeURIComponent(token)}`
    this.ws = new WebSocket(url)

    // console.log("BASE_URL =", BASE_URL)
    // console.log("WS_BASE =", WS_BASE)
    console.log("URL =", url)

    this.ws.onopen = () => {
      callbacks.onConnected?.()
      // Start auto-flush: send batched GPS points every 10 s
      this.flushTimer = setInterval(() => this._flushBatch(), 10_000)
      console.log("WS OPEN")
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        // Backend sends { type: "stats", data: { ...LiveStatsMessage } }
        // We must unwrap msg.data, not pass msg itself.
        console.log("message is: ", msg)
        if (msg.type === 'stats' && msg.data) {
          callbacks.onStats?.(msg.data as LiveStatsMessage)
        }
      } catch {
        // ignore malformed frames
      }
    }

    this.ws.onclose = (event) => {
      this._stopFlush()
      
      callbacks.onDisconnected?.(event.code, event.reason)
    }

    this.ws.onerror = (event) => {
      console.log("WS ERROR", event)
      callbacks.onError?.(event)
    }
  }

  disconnect(): void {
    this._stopFlush()
    this.ws?.close(1000, 'Activity ended')
    this.ws = null
    this.batchBuffer = []
  }

  // -- GPS ingestion -----------------------------------------------------------

  /** Buffer a GPS point; the batch is flushed every 10 s automatically. */
  pushPoint(point: GpsPoint): void {
    this.batchBuffer.push(point)
  }

  /** Force-flush immediately (e.g. on pause/stop). */
  flushNow(): void {
    this._flushBatch()
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  // -- Private -----------------------------------------------------------------

  private _flushBatch(): void {
    if (!this.isConnected || this.batchBuffer.length === 0) return
    const payload = JSON.stringify({ type: 'gps_batch', points: this.batchBuffer })
    this.ws!.send(payload)
    this.batchBuffer = []
  }

  private _stopFlush(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }
}

// Singleton -- one active session at a time
export const liveSocket = new LiveActivitySocket()