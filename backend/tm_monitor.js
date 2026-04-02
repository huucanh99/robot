/**
 * TM Robot RTRS Monitor — port 5895 (TMRTS protocol)
 * Subscribes to TCP_Value and receives pushed Cartesian position at 10 Hz.
 */

const net = require("net")

const RTRS_PORT = 5895

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
    // Mode 9: subscribe to TCP_Value
    // Binary format: count(LE uint16) + name_len(LE uint16) + name bytes
    const name     = Buffer.from("TCP_Value", "utf8")
    const itemsBuf = Buffer.from([
      0x01, 0x00,            // count = 1
      name.length, 0x00,     // name_len LE uint16
    ])
    this._sendBin(9, Buffer.concat([itemsBuf, name]))

    // Mode 8: 100ms interval (10 Hz)
    this._sendText(8, "100")

    // Mode 7: start streaming
    this._sendText(7, "1")
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

    // Find "TCP_Value" in the packet buffer
    const nameBytes = Buffer.from("TCP_Value", "utf8")
    const nameIdx   = buf.indexOf(nameBytes)
    if (nameIdx < 0) return

    // After name: 2-byte LE value_len, then 24 bytes of float32 LE
    const floatStart = nameIdx + nameBytes.length + 2
    if (floatStart + 24 > buf.length) return

    this.pos = {
      x:  +buf.readFloatLE(floatStart).toFixed(2),
      y:  +buf.readFloatLE(floatStart + 4).toFixed(2),
      z:  +buf.readFloatLE(floatStart + 8).toFixed(2),
      rx: +buf.readFloatLE(floatStart + 12).toFixed(2),
      ry: +buf.readFloatLE(floatStart + 16).toFixed(2),
      rz: +buf.readFloatLE(floatStart + 20).toFixed(2),
    }
  }
}

module.exports = { TMMonitor }
