process.stdout.setEncoding("utf8")
process.stderr.setEncoding("utf8")

const express = require("express")
const sqlite3 = require("sqlite3").verbose()
const cors    = require("cors")
const net     = require("net")
const { TMClient }     = require("./tm_client")
const { TMMonitor }    = require("./tm_monitor")
const { CameraClient } = require("./camera_client")

const app = express()
app.use(cors())
app.use(express.json())

const db = new sqlite3.Database("./database.db")

const tmClient     = new TMClient()
const tmMonitor    = new TMMonitor()
const cameraClient = new CameraClient()
tmMonitor.currentLabel    = null
tmMonitor.processingLabel = null
tmMonitor.doneLabels      = []
let tagCounter = 0
let gripperOpen       = true
let inspectCountdown  = 0
let robotPaused       = false

const POS_INSPECT    = { label: "inspect", x: 325, y: 0,   z: 400, rx: 180, ry: 0, rz: 0 }
const POS_SAFE       = { label: "safe",    x: 0,   y: 300, z: 500, rx: 180, ry: 0, rz: 0 }
const INSPECT_WAIT_MS = 10000
const LOWER_MM        = 80

// ─── Vision TCP server (nhận SendString từ TMflow) ───────────────────────────
// Dữ liệu mong muốn từ robot:
// x:1188.9425, y:1022.4306, r:85.35795
//
// Hoặc từng dòng JSON:
// {"x":1188.9425,"y":1022.4306,"r":85.35795}

let latestVision = {
  objects: [],
  occupied: {},
  ts: null,
  done: false,
}

function resetVisionFrame() {
  latestVision = {
    objects: [],
    occupied: {},
    ts: Date.now(),
    done: false,
  }
}

function parseVisionTextLine(s) {
  // Parse dạng:
  // x:1188.94, y:1022.43, r:85.35
  // hoặc x:1188.94,y:1022.43,r:85.35
  const obj = {}

  const parts = s.split(",")
  for (const part of parts) {
    const item = part.trim()
    if (!item) continue

    const idx = item.indexOf(":")
    if (idx === -1) continue

    const key = item.slice(0, idx).trim().toLowerCase()
    const rawValue = item.slice(idx + 1).trim()
    const value = Number(rawValue)

    if (!Number.isNaN(value)) {
      obj[key] = value
    } else {
      obj[key] = rawValue
    }
  }

  return obj
}

const visionServer = net.createServer(socket => {
  console.log("[Vision] Client connected:", socket.remoteAddress)

  let buf = ""
  let doneTimer = null

  function scheduleDone() {
    if (doneTimer) clearTimeout(doneTimer)
    doneTimer = setTimeout(() => {
      latestVision.done = true
      console.log(`[Vision] done — ${latestVision.objects.length} object(s) total`)
    }, 500)
  }

  // mỗi lần robot connect mới, coi như frame mới
  resetVisionFrame()

  socket.on("data", chunk => {
    buf += chunk.toString()

    const lines = buf.split(/\r?\n/)
    buf = lines.pop()

    for (const line of lines) {
      const s = line.trim()
      if (!s) continue

      try {
        const data = JSON.parse(s)

        // Format từ vision_opencv.py: { found, objects: [{x,y,r,...}], occupied }
        if (Array.isArray(data.objects)) {
          if (data.found && data.objects.length > 0) {
            latestVision.objects = data.objects.map(o => ({
              x: Number(o.x), y: Number(o.y), r: Number(o.r || 0), ts: Date.now()
            }))
            latestVision.occupied = data.occupied || {}
            latestVision.ts = Date.now()
            latestVision.done = true  // set done ngay, không cần đợi timer
            console.log(`[Vision][Full] ${latestVision.objects.length} object(s)`, latestVision.occupied)
          }
          // found: false → không reset done, giữ nguyên kết quả cũ
          continue
        }

        // Format đơn lẻ từ robot SendString: { x, y, r }
        if (data.x !== undefined || data.y !== undefined) {
          const obj = { x: Number(data.x), y: Number(data.y), r: Number(data.r || 0), ts: Date.now() }
          latestVision.objects.push(obj)
          latestVision.ts = Date.now()
          console.log("[Vision][JSON]", obj)
          scheduleDone()
        }
      } catch (_) {
        // parse text kiểu x:..., y:..., r:...
        const parsed = parseVisionTextLine(s)
        if (Object.keys(parsed).length > 0) {
          const obj = {
            x: parsed.x ?? 0, y: parsed.y ?? 0, r: parsed.r ?? 0, ts: Date.now()
          }
          latestVision.objects.push(obj)
          latestVision.ts = Date.now()
          console.log("[Vision][TEXT]", obj)
          scheduleDone()
        } else {
          console.warn("[Vision] parse error:", s)
        }
      }
    }
  })

  socket.on("error", err => {
    console.warn("[Vision] socket error:", err.message)
  })

  socket.on("close", () => {
    console.log("[Vision] client disconnected")
    latestVision.done = true

    if (latestVision.objects.length > 0) {
      console.log("🔥 ALL DETECTED OBJECTS:")
      console.table(latestVision.objects)
    }
  })
})

visionServer.listen(8765, () => console.log("[Vision] TCP server listening on port 8765"))


// ─── Robot endpoints ──────────────────────────────────────────────────────────
setInterval(() => {
  if (!tmMonitor.connected && !tmClient.running && tmClient.ip) {
    console.warn("[Monitor] Detected disconnected → reconnecting...")
    autoConnectMonitor(tmClient.ip)
  }
}, 5000)
app.post("/robot/connect", async (req, res) => {
  const { ip = "127.0.0.1" } = req.body

  // Luôn connect TMRTS monitor trước, độc lập với Listen Node
  if (!tmMonitor.connected && !tmClient.running) {
    autoConnectMonitor(ip)
  }

  if (tmClient.connected) return res.json({ success: true })

  try {
    tmClient.ip = ip
    await tmClient.connect()
    await tmClient.waitForListenNode()
    res.json({ success: true })
  } catch (e) {
    tmClient.disconnect()
    res.status(500).json({ error: e.message })
  }
})

// Kết nối chỉ TMRTS monitor (không cần Listen Node)
app.post("/monitor/connect", async (req, res) => {
  const { ip } = req.body
  if (!ip) return res.status(400).json({ error: "IP required" })

  try {
    if (tmMonitor.connected) tmMonitor.disconnect()
    await tmMonitor.connect(ip)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post("/robot/disconnect", (req, res) => {
  tmClient.disconnect()
  tmMonitor.disconnect()
  res.json({ success: true })
})

app.get("/robot/position", (req, res) => {
  res.json({
    ...tmMonitor.pos,
    _monitorConnected: tmMonitor.connected,
    currentLabel: tmMonitor.currentLabel,
    processingLabel: tmMonitor.processingLabel,
    doneLabels: tmMonitor.doneLabels,
    gripperOpen,
    countdown: inspectCountdown,
    running: tmClient.running,
    paused: robotPaused,
  })
})

async function movePt(pt, speed) {
  tagCounter++
  const tag = tagCounter

  const pos = `${pt.x},${pt.y},${pt.z},${pt.rx},${pt.ry},${pt.rz}`
  tmMonitor.currentLabel = pt.label

  const ok = await tmClient.sendScript(`move${tag}`, [
    `PTP("CPP",{${pos}},${speed},0,0,false)`,
    `QueueTag(${tag},1)`
  ])

  if (!ok) return null

  // Chờ robot chạy xong động tác trước khi gửi lệnh tiếp theo
  await waitTagSafe(tag, 30000)

  return tag
}
async function waitTagSafe(tag, timeout = 5000) {
  try {
    await waitQueueTagWithTimeout(tag, timeout)
  } catch (e) {
    console.warn("⚠️ miss tag nhưng vẫn tiếp tục:", tag)
  }
}
async function waitIfPaused() {
  while (robotPaused && tmClient.running) {
    await new Promise(r => setTimeout(r, 200))
  }
}
async function waitWithCountdown(ms) {
  let remaining = Math.ceil(ms / 1000)
  inspectCountdown = remaining
  while (remaining > 0 && tmClient.running) {
    await new Promise(r => setTimeout(r, 1000))
    if (!robotPaused) {
      remaining--
      inspectCountdown = remaining
    }
  }
}
async function waitQueueTagWithTimeout(tag, ms = 8000) {
  return Promise.race([
    tmClient.waitQueueTag(tag),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`QueueTag ${tag} timeout`)), ms)
    )
  ])
}
app.post("/robot/run", async (req, res) => {
  const { points, speed = 30 } = req.body

  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running) return res.status(400).json({ error: "Already running" })
  if (!points || points.length === 0) return res.status(400).json({ error: "No points selected" })

  tagCounter = 0
  tmClient.running = true
  robotPaused = false
  tmMonitor.currentLabel    = null
  tmMonitor.processingLabel = null
  tmMonitor.doneLabels      = []
  gripperOpen = true
  inspectCountdown = 0

  const lower = pt => ({ ...pt, z: pt.z - LOWER_MM, label: pt.label + '-down' })

  async function pickFrom(pt) {
    if (!await movePt(pt, speed))         return false  // đến trên vật
    if (!await movePt(lower(pt), speed))  return false  // hạ xuống
    gripperOpen = false                                  // gắp
    if (!await movePt(pt, speed))         return false  // nâng lên
    return true
  }

  async function placeTo(pt) {
    if (!await movePt(pt, speed))         return false  // đến trên điểm đặt
    if (!await movePt(lower(pt), speed))  return false  // hạ xuống
    gripperOpen = true                                   // thả
    if (!await movePt(pt, speed))         return false  // nâng lên
    return true
  }

  try {
for (const pt of points) {
  if (!tmClient.running) break
  await waitIfPaused()
  if (!tmClient.running) break

  tmMonitor.processingLabel = pt.label

  const ok = await runPointBatch(pt, speed)
  if (!ok) {
    tmClient.running = false
    return res.status(500).json({ error: `Point ${pt.label} failed` })
  }

  tmMonitor.doneLabels.push(pt.label)
  tmMonitor.processingLabel = null

  await new Promise(r => setTimeout(r, 50))
}

    gripperOpen = true
    inspectCountdown = 0

    // Trả về vị trí an toàn sau khi xong tất cả point
    if (tmClient.running) {
      const tSafe = ++tagCounter
      const safePos = `${POS_SAFE.x},${POS_SAFE.y},${POS_SAFE.z},${POS_SAFE.rx},${POS_SAFE.ry},${POS_SAFE.rz}`
      await tmClient.sendScript(`safe${tSafe}`, [
        `PTP("CPP",{${safePos}},${speed},0,0,false)`,
        `QueueTag(${tSafe},1)`,
      ])
      await waitTagSafe(tSafe, 15000)
    }

    tmClient.running = false
    res.json({ success: true })
  } catch (e) {
    tmClient.running = false
    try {
      if (tmClient.connected) await tmClient.sendScript("abort", ["StopAndClearBuffer(0)"])
    } catch (_) {}
    res.status(500).json({ error: e.message })
  }
})

app.post("/robot/pause", (req, res) => {
  if (!tmClient.running) return res.status(400).json({ error: "Not running" })
  robotPaused = true
  res.json({ success: true })
})

app.post("/robot/resume", (req, res) => {
  robotPaused = false
  res.json({ success: true })
})

app.post("/robot/stop", async (req, res) => {
  tmClient.running = false
  robotPaused = false

  try {
    if (tmClient.connected) {
      await tmClient.sendScript("abort", ["StopAndClearBuffer(0)"])
    }
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// ─── Camera endpoints ─────────────────────────────────────────────────────────

app.post("/camera/connect", (req, res) => {
  const { ip } = req.body
  if (ip) cameraClient.ip = ip
  cameraClient.connect()
  res.json({ success: true })
})

app.get("/camera/status", async (req, res) => {
  try {
    const r = await cameraClient.isConnected()
    res.json({
      isCameraConnected: r.isCameraConnected,
      connection_message: r.connection_message,
      serverReachable: true,
    })
  } catch (e) {
    // code 12 = server reachable but camera not initialized
    const serverReachable = e.code === 12 || (e.message && e.message.includes("12"))
    res.json({
      isCameraConnected: false,
      serverReachable,
      connection_message: e.message,
    })
  }
})

app.get("/camera/capture", async (req, res) => {
  try {
    const dataUrl = await cameraClient.capture()
    res.json({ image: dataUrl })
  } catch (e) {
    res.json({ error: e.message })
  }
})

// ─── Vision endpoints ─────────────────────────────────────────────────────────

app.post("/vision/reset", (req, res) => {
  resetVisionFrame()
  res.json({ success: true })
})

app.post("/vision/trigger", async (req, res) => {
  console.log(`[Trigger] connected=${tmClient.connected}, ip=${tmClient.ip}`)

  // Auto-reconnect nếu socket bị đóng
  if (!tmClient.connected && tmClient.ip) {
    console.log(`[Trigger] Reconnecting to ${tmClient.ip}...`)
    try {
      await tmClient.connect()
      await tmClient.waitForListenNode()
      console.log("[Trigger] Reconnected OK")
    } catch (e) {
      console.warn("[Trigger] Reconnect failed:", e.message)
      return res.status(400).json({ error: "Robot not connected: " + e.message })
    }
  }

  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })

  try {
    resetVisionFrame()
    await tmClient.sendScript("vt", ["ScriptExit(1)"])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
// ─── Tray pixel mapping ──────────────────────────────────────────────────────
// Tọa độ robot gửi về là pixel của ảnh camera.
// Điều chỉnh TRAY1_ORIGIN_X/Y và CELL_W/H theo camera thực tế.
//
// Cách xác định:
//   1. Chạy vision → đọc GET /vision/debug → xem raw objects
//   2. Đặt vật ở ô (1,1) (góc trên-trái tray1) → ghi lại x, y → đó là TRAY1_ORIGIN
//   3. Đặt vật ở ô hàng kế (4 cols × 5 rows = 20 cells)
//      → CELL_W = khoảng cách X giữa 2 ô liền nhau
//      → CELL_H = khoảng cách Y giữa 2 ô liền nhau

const TRAY1_ORIGIN_X = 441   // calibrated: cell1.x - CELL_W/2
const TRAY1_ORIGIN_Y = 327   // calibrated: cell1.y - CELL_H/2
const CELL_W = 291           // (cell20.x - cell1.x) / 3
const CELL_H = 140           // (cell20.y - cell1.y) / 4

function mapToTray(objects) {
  const result = {
    tray1: [], tray2: [], tray3: [],
    tray4: [], tray5: [], tray6: []
  }

  objects.forEach(obj => {
    const col = Math.floor((obj.x - TRAY1_ORIGIN_X) / CELL_W)
    const row = Math.floor((obj.y - TRAY1_ORIGIN_Y) / CELL_H)

    if (col >= 0 && col < 4 && row >= 0 && row < 5) {
      const cell = row * 4 + col + 1
      if (!result.tray1.includes(cell)) result.tray1.push(cell)
    }
  })

  return result
}
app.get("/vision/debug", (req, res) => {
  res.json({
    raw: tmMonitor.vision,
    latestVision,
    monitorConnected: tmMonitor.connected,
  })
})

app.get("/vision/latest", (req, res) => {
  const objects = latestVision.objects || []
  const occupied = Object.keys(latestVision.occupied || {}).length > 0
    ? latestVision.occupied
    : mapToTray(objects)

  res.json({
    found: objects.length > 0,
    done: latestVision.done,
    objects,
    occupied,
  })
})

app.post("/robot/move-one", async (req, res) => {
  const { point, speed = 30 } = req.body

  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running) return res.status(400).json({ error: "Already running" })

  tmClient.running = true

  try {
    tagCounter++
    const tag = tagCounter
    const pos = `${point.x},${point.y},${point.z},${point.rx},${point.ry},${point.rz}`
    tmMonitor.currentLabel = point.label

    const ok = await tmClient.sendScript(`move${tag}`, [
      `PTP("CPP",{${pos}},${speed},0,0,false)`,
      `QueueTag(${tag},1)`,
    ])

    if (!ok) {
      tmClient.running = false
      return res.status(500).json({ error: `Move to ${point.label} failed` })
    }

    await tmClient.waitQueueTag(tag)
    tmMonitor.pos = {
      x: point.x,
      y: point.y,
      z: point.z,
      rx: point.rx,
      ry: point.ry,
      rz: point.rz,
    }
    tmMonitor.doneLabels.push(point.label)
    tmMonitor.currentLabel = null
    tmClient.running = false

    res.json({ success: true })
  } catch (e) {
    tmClient.running = false
    res.status(500).json({ error: e.message })
  }
})

app.post("/camera/move-and-capture", async (req, res) => {
  const { position, speed = 20 } = req.body

  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running) return res.status(400).json({ error: "Already running" })

  tmClient.running = true

  try {
    tagCounter++
    const tag = tagCounter
    const pt = position
    const pos = `${pt.x},${pt.y},${pt.z},${pt.rx},${pt.ry},${pt.rz}`
    tmMonitor.currentLabel = pt.label

    const ok = await tmClient.sendScript(`scan${tag}`, [
      `PTP("CPP",{${pos}},${speed},0,0,false)`,
      `QueueTag(${tag},1)`,
    ])

    if (!ok) {
      tmClient.running = false
      return res.status(500).json({ error: `Move to ${pt.label} failed` })
    }

    await tmClient.waitQueueTag(tag)
    tmMonitor.pos = {
      x: pt.x,
      y: pt.y,
      z: pt.z,
      rx: pt.rx,
      ry: pt.ry,
      rz: pt.rz,
    }
    tmMonitor.doneLabels.push(pt.label)
    tmMonitor.currentLabel = null
    tmClient.running = false

    const image = await cameraClient.capture()
    res.json({ success: true, image })
  } catch (e) {
    tmClient.running = false
    res.status(500).json({ error: e.message })
  }
})


// ─── Recipe endpoints ─────────────────────────────────────────────────────────

app.get("/recipes", (req, res) => {
  db.all("SELECT * FROM recipes", (err, rows) => {
    if (err) res.status(500).json(err)
    else res.json(rows)
  })
})

app.post("/recipes", (req, res) => {
  const { name, speed, grip, open, wait } = req.body
  db.run(
    "INSERT INTO recipes (name,speed,grip,open,wait) VALUES (?,?,?,?,?)",
    [name, speed, grip, open, wait],
    function(err) {
      if (err) res.status(500).json(err)
      else res.json({ id: this.lastID })
    }
  )
})

app.put("/recipes/:id", (req, res) => {
  const { name, speed, grip, open, wait } = req.body
  db.run(
    "UPDATE recipes SET name=?,speed=?,grip=?,open=?,wait=? WHERE id=?",
    [name, speed, grip, open, wait, req.params.id],
    err => {
      if (err) res.status(500).json(err)
      else res.json({ success: true })
    }
  )
})

app.delete("/recipes/:id", (req, res) => {
  db.run(
    "DELETE FROM recipes WHERE id=?",
    [req.params.id],
    err => {
      if (err) res.status(500).json(err)
      else res.json({ success: true })
    }
  )
})

app.listen(3000, () => {
  console.log("server running")
})

function autoConnectMonitor(ip) {
  if (!ip) return
  if (tmMonitor.connected) return

  console.log(`[Monitor] Connecting to ${ip}:5895...`)

  tmMonitor.connect(ip)
    .then(() => console.log("[Monitor] Connected"))
    .catch(e => {
      console.warn("[Monitor] Failed:", e.message)
      // ❌ KHÔNG retry ở đây nữa
    })
}

async function runPointBatch(pt, speed) {
  const lowerPt      = { ...pt,          z: pt.z          - LOWER_MM }
  const lowerInspect = { ...POS_INSPECT, z: POS_INSPECT.z - LOWER_MM }

  function posStr(p) { return `${p.x},${p.y},${p.z},${p.rx},${p.ry},${p.rz}` }
  function ptp(p)    { return `PTP("CPP",{${posStr(p)}},${speed},0,0,false)` }

  // Mỗi script batch nhiều PTP liên tiếp (robot chạy thẳng không qua server)
  // QueueTag chỉ đặt cuối mỗi script — tránh CPERR từ TM robot.

  // Script 1: pick (approach → down → up) → gripper close
  const t1 = ++tagCounter
  let ok = await tmClient.sendScript(`s${t1}`, [
    ptp(pt), ptp(lowerPt), ptp(pt), `QueueTag(${t1},1)`,
  ])
  if (!ok) return false
  await waitTagSafe(t1, 30000)
  gripperOpen = false
  await waitIfPaused(); if (!tmClient.running) return false

  // Script 2: place to inspect (to inspect → down → up) → gripper open
  const t2 = ++tagCounter
  ok = await tmClient.sendScript(`s${t2}`, [
    ptp(POS_INSPECT), ptp(lowerInspect), ptp(POS_INSPECT), `QueueTag(${t2},1)`,
  ])
  if (!ok) return false
  await waitTagSafe(t2, 30000)
  gripperOpen = true
  await waitIfPaused(); if (!tmClient.running) return false

  // Script 3: go to safe
  const t3 = ++tagCounter
  ok = await tmClient.sendScript(`s${t3}`, [
    ptp(POS_SAFE), `QueueTag(${t3},1)`,
  ])
  if (!ok) return false
  await waitTagSafe(t3, 30000)

  await waitWithCountdown(INSPECT_WAIT_MS)
  if (!tmClient.running) return false
  await waitIfPaused(); if (!tmClient.running) return false

  // Script 4: pick lại từ inspect → gripper close
  const t4 = ++tagCounter
  ok = await tmClient.sendScript(`s${t4}`, [
    ptp(POS_INSPECT), ptp(lowerInspect), ptp(POS_INSPECT), `QueueTag(${t4},1)`,
  ])
  if (!ok) return false
  await waitTagSafe(t4, 30000)
  gripperOpen = false
  await waitIfPaused(); if (!tmClient.running) return false

  // Script 5: trả về pt (to pt → down → up) → gripper open
  const t5 = ++tagCounter
  ok = await tmClient.sendScript(`s${t5}`, [
    ptp(pt), ptp(lowerPt), ptp(pt), `QueueTag(${t5},1)`,
  ])
  if (!ok) return false
  await waitTagSafe(t5, 30000)
  gripperOpen = true

  return true
}