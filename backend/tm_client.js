/**
 * TM Robot External Control Client (Listen Node)
 * Protocol: TCP Socket, Port 5890
 * Ported from tm_listen_client.py
 */

const net = require("net")

const ROBOT_PORT = 5890
const TIMEOUT    = 60000  // ms

// ── Checksum ───────────────────────────────────────────────────────────────

function calcChecksum(raw) {
  const inner = raw.slice(1, raw.lastIndexOf("*"))
  let cs = 0
  for (const b of Buffer.from(inner, "utf8")) cs ^= b
  return cs.toString(16).padStart(2, "0").toUpperCase()
}

function buildPacket(header, data) {
  const len = Buffer.byteLength(data, "utf8")
  const raw = `$${header},${len},${data},*`
  return raw + calcChecksum(raw) + "\r\n"
}

function parseLine(line) {
  line = line.trim()
  if (!line.startsWith("$")) return null
  const m = line.match(/^\$([^,]+),(\d+),(.+),\*([0-9A-Fa-f]{2})$/)
  if (!m) return null
  return { header: m[1], length: parseInt(m[2]), data: m[3], cs: m[4] }
}

// ── TMClient ───────────────────────────────────────────────────────────────

class TMClient {
  constructor(ip = "127.0.0.1", port = ROBOT_PORT) {
    this.ip          = ip
    this.port        = port
    this.socket      = null
    this.buffer      = ""
    this.lineWaiters = []
    this.connected   = false
    this.running     = false
  }

  // ── connect / disconnect ────────────────────────────────────────────────

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket()
      this.socket.setTimeout(TIMEOUT)
      this.socket.on("data",    (d) => this._onData(d))
      this.socket.on("close",   ()  => { this.connected = false; this.socket = null })
      this.socket.on("timeout", ()  => reject(new Error("Connection timeout")))
      this.socket.on("error",   (e) => reject(e))
      this.socket.connect(this.port, this.ip, () => {
        this.connected = true
        resolve()
      })
    })
  }

  disconnect() {
    if (this.socket) { this.socket.destroy(); this.socket = null }
    this.connected   = false
    this.running     = false
    this.lineWaiters = []
    this.buffer      = ""
  }

  // ── low-level recv ──────────────────────────────────────────────────────

  _onData(data) {
    this.buffer += data.toString("utf8")
    while (this.buffer.includes("\r\n")) {
      const idx  = this.buffer.indexOf("\r\n")
      const line = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 2)
      if (this.lineWaiters.length > 0) {
        this.lineWaiters.shift()(line)
      }
    }
  }

  recvPacket(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.lineWaiters.findIndex(f => f === handler)
        if (idx >= 0) this.lineWaiters.splice(idx, 1)
        reject(new Error("Receive timeout"))
      }, timeout)
      const handler = (line) => {
        clearTimeout(timer)
        resolve(parseLine(line))
      }
      this.lineWaiters.push(handler)
    })
  }

  sendRaw(header, data) {
    this.socket.write(buildPacket(header, data))
  }

  // ── wait for Listen Node ────────────────────────────────────────────────

  async waitForListenNode() {
    // Ask if already in Listen Node
    if (await this.queryListenMode()) return

    // Not yet — wait for TMSCT notification
    console.log("[Wait] Robot not in Listen Node yet, waiting...")
    while (true) {
      const pkt = await this.recvPacket(TIMEOUT)
      if (pkt && pkt.header === "TMSCT") {
        console.log("[Listen Node] Entered")
        return
      }
    }
  }

  async queryListenMode() {
    this.sendRaw("TMSTA", "00")
    const resp = await this.recvPacket(10000)
    if (resp && resp.header === "TMSTA") {
      const parts = resp.data.split(",")
      const inMode = parts[1] && parts[1].toLowerCase() === "true"
      console.log(`[Status] External control mode: ${inMode ? "yes" : "no"}`)
      return inMode
    }
    return false
  }

  // ── send TMscript ───────────────────────────────────────────────────────

  async sendScript(scriptId, scriptLines) {
    const data = `${scriptId},` + scriptLines.join("\r\n")
    this.sendRaw("TMSCT", data)

    while (true) {
      const resp = await this.recvPacket()
      if (!resp) return false
      if (resp.header === "TMSTA") continue   // skip push notifications
      if (resp.header === "TMSCT") {
        const ok = resp.data.includes(",OK")
        console.log(`[TMSCT] ${ok ? "OK" : "FAIL"} id=${scriptId}`)
        return ok
      }
      if (resp.header === "CPERR") {
        console.log(`[CPERR] ${resp.data}`)
        return false
      }
    }
  }

  // ── wait QueueTag ───────────────────────────────────────────────────────

  async waitQueueTag(tagId, pollInterval = 300) {
    console.log(`[Wait] QueueTag ${tagId}...`)
    while (true) {
      this.sendRaw("TMSTA", `01,${tagId}`)
      const resp = await this.recvPacket()
      if (resp && resp.header === "TMSTA") {
        const parts = resp.data.split(",")
        if (parts.length >= 3 && parts[2].toLowerCase() === "true") {
          console.log(`[QueueTag ${tagId}] Done`)
          return
        }
      }
      await new Promise(r => setTimeout(r, pollInterval))
    }
  }

  // ── exit Listen Node ────────────────────────────────────────────────────

  async exitListen(passExit = true) {
    const cmd = passExit ? "ScriptExit(1)" : "ScriptExit(0)"
    await this.sendScript("exit", [cmd])
  }
}

module.exports = { TMClient }
