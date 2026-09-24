import { EventEmitter } from 'node:events'
import WebSocket from 'ws'

// Shared websocket lifecycle: connect, subscribe, parse, reconnect with
// exponential backoff. Subclasses implement url(), onOpen(ws) and
// handleMessage(msg).
export class ReconnectingFeed extends EventEmitter {
  constructor(name) {
    super()
    this.name = name
    this.ws = null
    this.connected = false
    this.lastMessageAt = null
    this.reconnectDelay = 1000
    this.stopped = false
  }

  start() {
    this.stopped = false
    this.connect()
  }

  connect() {
    if (this.stopped) return
    try {
      this.ws = new WebSocket(this.url())
    } catch (err) {
      this.emit('error', err)
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      this.connected = true
      this.reconnectDelay = 1000
      this.emit('status', { feed: this.name, connected: true })
      this.onOpen(this.ws)
    })

    this.ws.on('message', (raw) => {
      this.lastMessageAt = Date.now()
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      try {
        this.handleMessage(msg)
      } catch (err) {
        this.emit('error', err)
      }
    })

    const onDown = () => {
      if (this.connected) this.emit('status', { feed: this.name, connected: false })
      this.connected = false
      this.scheduleReconnect()
    }
    this.ws.on('close', onDown)
    this.ws.on('error', (err) => {
      this.emit('error', err)
      // 'close' follows 'error' on ws, which triggers the reconnect.
    })
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
  }

  stop() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }

  status() {
    return {
      feed: this.name,
      connected: this.connected,
      lastMessageAt: this.lastMessageAt,
    }
  }
}
