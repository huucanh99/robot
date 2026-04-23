/**
 * TM Robot External Control Client (Listen Node)
 * Protocol: TCP Socket, Port 5890
 */

const net = require("net")

const ROBOT_PORT      = 5890
const CONNECT_TIMEOUT = 5000   // ms — connection attempt
const IDLE_TIMEOUT    = 600000 // ms — idle after connected (10 phút)

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
    this.ip           = ip
    this.port         = port
    this.socket       = null
    this.buffer       = ""
    this.connected    = false
    this.running      = false
    // Separate queues per packet type — prevents cross-contamination
    this.tmsctQueue   = []   // buffered TMSCT / CPERR packets
    this.tmstaQueue   = []   // buffered TMSTA packets
    this.tmsctWaiters = []
    this.tmstaWaiters = []
  }

  // ── connect / disconnect ────────────────────────────────────────────────

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket()

      const timer = setTimeout(() => {
        this.socket.destroy()
        reject(new Error(`無法連線到 ${this.ip}:${this.port}，請確認 IP 是否正確`))
      }, CONNECT_TIMEOUT)

      this.socket.on("data",  (d) => this._onData(d))
      this.socket.on("close", ()  => { this.connected = false; this.socket = null })
      this.socket.on("error", (e) => { clearTimeout(timer); reject(e) })
      this.socket.connect(this.port, this.ip, () => {
        clearTimeout(timer)
        this.connected = true
        this.socket.setTimeout(IDLE_TIMEOUT)
        this.socket.on("timeout", () => {
          console.warn("[Socket] idle timeout")
          this.disconnect()
        })
        resolve()
      })
    })
  }

  disconnect() {
    if (this.socket) { this.socket.destroy(); this.socket = null }
    this.connected    = false
    this.running      = false
    this.buffer       = ""
    this.tmsctQueue   = []
    this.tmstaQueue   = []
    this.tmsctWaiters = []
    this.tmstaWaiters = []
  }

  // ── routing ─────────────────────────────────────────────────────────────

  _onData(data) {
    this.buffer += data.toString("utf8")
    while (this.buffer.includes("\r\n")) {
      const idx  = this.buffer.indexOf("\r\n")
      const line = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 2)
      const pkt = parseLine(line)
      if (pkt) this._route(pkt)
    }
  }

  _route(pkt) {
    if (pkt.header === "TMSCT" || pkt.header === "CPERR") {
      if (this.tmsctWaiters.length > 0) {
        this.tmsctWaiters.shift()(pkt)
      } else {
        this.tmsctQueue.push(pkt)
      }
    } else if (pkt.header === "TMSTA") {
      if (this.tmstaWaiters.length > 0) {
        this.tmstaWaiters.shift()(pkt)
      } else {
        this.tmstaQueue.push(pkt)
      }
    }
  }

  _recvTyped(queue, waiters, timeout) {
    if (queue.length > 0) return Promise.resolve(queue.shift())
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex(f => f === handler)
        if (idx >= 0) waiters.splice(idx, 1)
        reject(new Error("Receive timeout"))
      }, timeout)
      const handler = (pkt) => { clearTimeout(timer); resolve(pkt) }
      waiters.push(handler)
    })
  }

  recvTMSCT(timeout = 30000) {
    return this._recvTyped(this.tmsctQueue, this.tmsctWaiters, timeout)
  }

  recvTMSTA(timeout = 60000) {
    return this._recvTyped(this.tmstaQueue, this.tmstaWaiters, timeout)
  }

  sendRaw(header, data) {
    this.socket.write(buildPacket(header, data))
  }

  // ── wait for Listen Node ────────────────────────────────────────────────

  async waitForListenNode() {
    if (await this.queryListenMode()) return

    // Robot reachable but not in Listen Node yet — wait max 10s
    console.log("[Wait] Robot not in Listen Node yet, waiting up to 10s...")
    const pkt = await this.recvTMSCT(10000).catch(() => null)
    if (pkt && pkt.header === "TMSCT") {
      console.log("[Listen Node] Entered")
      return
    }
    throw new Error("Robot not in Listen Node — enable Listen Node in TMFlow")
  }

  async queryListenMode() {
    this.sendRaw("TMSTA", "00")
    const resp = await this.recvTMSTA(5000).catch(() => null)
    if (resp) {
      const parts = resp.data.split(",")
      const inMode = parts[1] && parts[1].toLowerCase() === "true"
      console.log(`[Status] External control mode: ${inMode ? "yes" : "no"}`)
      return inMode
    }
    return false
  }

  // ── send TMscript ───────────────────────────────────────────────────────

  async sendScript(scriptId, scriptLines) {
    this.tmsctQueue = []  // drain stale packets từ Listen Node entry cũ
    const data = `${scriptId},` + scriptLines.join("\r\n")
    console.log(`[sendScript] sending ${scriptId}`)
    this.sendRaw("TMSCT", data)
    const resp = await this.recvTMSCT(30000)
    if (!resp) { console.log(`[TMSCT] timeout id=${scriptId}`); return false }
    if (resp.header === "CPERR") { console.log(`[CPERR] ${resp.data}`); return false }
    const ok = resp.data.includes(",OK")
    console.log(`[TMSCT] ${ok ? "OK" : "FAIL"} id=${scriptId} — resp: ${resp.data}`)
    return ok
  }

  // ── wait QueueTag ───────────────────────────────────────────────────────

  async waitQueueTag(tagId, pollInterval = 100, maxWait = 60000) {
    const deadline = Date.now() + maxWait
    console.log(`[Wait] QueueTag ${tagId}...`)
    while (true) {
      if (!this.running)
        throw new Error(`QueueTag ${tagId} aborted`)
      if (Date.now() > deadline)
        throw new Error(`QueueTag ${tagId} timeout — robot không phản hồi sau ${maxWait / 1000}s`)
      this.sendRaw("TMSTA", `01,${tagId}`)
      const resp = await this.recvTMSTA(10000)
      if (!resp) throw new Error(`QueueTag ${tagId} — không nhận được phản hồi TMSTA`)
      const parts = resp.data.split(",")
      if (parts.length >= 3 && parts[1] === String(tagId) && parts[2].toLowerCase() === "true") {
        console.log(`[QueueTag ${tagId}] Done`)
        return
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
