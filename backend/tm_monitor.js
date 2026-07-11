/**
 * TM Robot RTRS Monitor — port 5895 (TMRTS protocol)
 * Subscribes to TCP_Value and receives pushed Cartesian position at 10 Hz.
 */

const net = require("net")

const RTRS_PORT = 5895

const VISION_VARS = [
  "detectbuttonOnBoard_Shape_Pattern_1_DetectObjectX_TM",
  "detectbuttonOnBoard_Shape_Pattern_1_DetectObjectY_TM",
  "detectbuttonOnBoard_Shape_Pattern_1_DetectObjectR_TM",
]

function checksum(raw) {
  // raw is a Buffer; XOR bytes between '$' and '*'
  const start = raw.indexOf(0x24) + 1  // after '$'
  const end   = raw.lastIndexOf(0x2A)  // before '*'
  let cs = 0
  for (let i = start; i < end; i++) cs ^= raw[i]
  return cs.toString(16).padStart(2, "0").toUpperCase()
}

function buildPacket(header, dataBuf) {
  const prefix = Buffer.from(`$${header},${dataBuf.length},`, "utf8")
  const suffix = Buffer.from(",*", "utf8")
  const raw    = Buffer.concat([prefix, dataBuf, suffix])
  return Buffer.concat([raw, Buffer.from(checksum(raw) + "\r\n", "utf8")])
}

class TMMonitor {
  constructor() {
    this.socket    = null
    this.buffer    = Buffer.alloc(0)
    this.connected = false
    this.pos       = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
    this.vision    = { x: 0, y: 0, r: 0 }
    this._id       = 0
  }

  connect(ip) {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket()
      this.socket.setTimeout(5000)
      this.socket.on("data",    d  => this._onData(d))
      this.socket.on("close",   () => { this.connected = false })
      this.socket.on("error",   e  => reject(e))
      this.socket.on("timeout", () => reject(new Error("RTRS timeout")))
      this.socket.connect(RTRS_PORT, ip, () => {
        this.connected = true
        this.socket.setTimeout(30000)  // longer idle timeout after connected
        this._configure()
        resolve()
      })
    })
  }

  disconnect() {
    if (this.connected && this.socket) {
      try { this._sendText(7, "0") } catch (_) {}
    }
    if (this.socket) { this.socket.destroy(); this.socket = null }
    this.connected = false
    this.pos = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
  }

  // ── send helpers ────────────────────────────────────────────────────────────

  _sendText(mode, data) {
    this._id++
    const payload = Buffer.from(`${this._id},${mode},${data}`, "utf8")
    this.socket.write(buildPacket("TMRTS", payload))
  }

  _sendBin(mode, dataBuf) {
    this._id++
    const prefix = Buffer.from(`${this._id},${mode},`, "utf8")
    this.socket.write(buildPacket("TMRTS", Buffer.concat([prefix, dataBuf])))
  }

  // ── configure streaming ─────────────────────────────────────────────────────

  _configure() {
    // Mode 9: subscribe TCP_Value (system var — luôn hoạt động)
    const name     = Buffer.from("TCP_Value", "utf8")
    const itemsBuf = Buffer.from([0x01, 0x00, name.length, 0x00])
    this._sendBin(9, Buffer.concat([itemsBuf, name]))

    // Sau khi stream start, subscribe thêm vision vars từng cái một
    setTimeout(() => this._subscribeVision(), 500)

    // Mode 8: 100ms interval
    this._sendText(8, "100")

    // Mode 7: start streaming
    this._sendText(7, "1")
  }

  _subscribeVision() {
    if (!this.connected) return
    for (const varName of VISION_VARS) {
      const nb  = Buffer.from(varName, "utf8")
      const buf = Buffer.from([0x01, 0x00, nb.length & 0xff, (nb.length >> 8) & 0xff])
      this._sendBin(9, Buffer.concat([buf, nb]))
    }
  }

  // ── data parsing ────────────────────────────────────────────────────────────

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    let crlf
    while ((crlf = this.buffer.indexOf("\r\n")) >= 0) {
      const packet = this.buffer.slice(0, crlf)
      this.buffer  = this.buffer.slice(crlf + 2)
      this._parsePacket(packet)
    }
  }

  _parsePacket(buf) {
    if (buf.indexOf("$TMRTS") !== 0) return

    // ── TCP_Value (position) ─────────────────────────────────────────────────
    const tcpName  = Buffer.from("TCP_Value", "utf8")
    const tcpIdx   = buf.indexOf(tcpName)
    if (tcpIdx >= 0) {
      const fs = tcpIdx + tcpName.length + 2   // skip 2-byte value_len
      if (fs + 24 <= buf.length) {
        this.pos = {
          x:  +buf.readFloatLE(fs).toFixed(2),
          y:  +buf.readFloatLE(fs + 4).toFixed(2),
          z:  +buf.readFloatLE(fs + 8).toFixed(2),
          rx: +buf.readFloatLE(fs + 12).toFixed(2),
          ry: +buf.readFloatLE(fs + 16).toFixed(2),
          rz: +buf.readFloatLE(fs + 20).toFixed(2),
        }
      }
    }

    // ── Vision variables (X, Y, R) ───────────────────────────────────────────
    const vals = []
    for (const varName of VISION_VARS) {
      const nb  = Buffer.from(varName, "utf8")
      const idx = buf.indexOf(nb)
      if (idx < 0) { vals.push(null); continue }
      const vs = idx + nb.length + 2   // skip 2-byte value_len
      if (vs + 4 > buf.length) { vals.push(null); continue }
      vals.push(buf.readFloatLE(vs))
    }
    if (vals[0] !== null) {
      this.vision = {
        x: Math.round(vals[0]),
        y: Math.round(vals[1]),
        r: vals[2] !== null ? +vals[2].toFixed(1) : 0,
      }
    }
  }
}

module.exports = { TMMonitor }
