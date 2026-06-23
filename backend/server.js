require("dotenv").config()

let criticalError = null
let robotWarning  = null

const CONNECTION_ERRS = ['ECONNRESET','EPIPE','ECONNREFUSED','ETIMEDOUT','socket','Socket','listen','Listen','disconnect','destroyed','setTimeout','aborted','timeout']

function classifyError(msg) {
  if (CONNECTION_ERRS.some(k => msg.includes(k))) {
    robotWarning = msg
    console.warn("[RobotWarning]", msg)
  } else {
    criticalError = msg
    console.error("[CRITICAL]", msg)
  }
}

process.on("uncaughtException",  e => classifyError(e.message || String(e)))
process.on("unhandledRejection", e => classifyError(e?.message || String(e)))

const express = require("express")
const sqlite3 = require("sqlite3").verbose()
const cors    = require("cors")
const net     = require("net")
const fs      = require("fs")
const { TMClient }     = require("./tm_client")
const { TMMonitor }    = require("./tm_monitor")
const { CameraClient } = require("./camera_client")
const { router: integrationRouter, init: initIntegration } = require("./integration_router")

const app = express()
app.use(cors())
app.use(express.json({ limit: "10mb" }))

const SERVER_START_TIME = Date.now()

const db = new sqlite3.Database("./database.db")
db.run("ALTER TABLE recipes ADD COLUMN inspect_wait REAL", () => {})
db.run(`CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL,
  key TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '[]'
)`)

const tmClient     = new TMClient()
const tmMonitor    = new TMMonitor()
const cameraClient = new CameraClient()
tmMonitor.currentLabel    = null
tmMonitor.processingLabel = null
tmMonitor.doneLabels      = []

const TAG_COUNTER_FILE = "./tagcounter"
function loadTagCounter() {
  try {
    const v = parseInt(fs.readFileSync(TAG_COUNTER_FILE, "utf8"))
    if (Number.isInteger(v) && v > 0) return v + 100  // skip past last run + buffer
  } catch (_) {}
  return 100
}
function saveTagCounter() {
  try { fs.writeFileSync(TAG_COUNTER_FILE, String(tagCounter)) } catch (_) {}
}
let tagCounter = loadTagCounter()
let gripperOpen        = true
let robotPaused        = false
let waitingReturn      = false
let currentPoints      = []
let currentPointIndex  = 0
let lastPickedPoint    = null
let currentRecipeId    = null
let lastCapturedImage  = null
let integrationRecipe  = null
let sessionId          = Date.now()

function resetSession() {
  gripperOpen       = true
  robotPaused       = false
  waitingReturn     = false
  currentPoints     = []
  currentPointIndex = 0
  lastPickedPoint   = null
  lastCapturedImage = null
  tagCounter        = 100
  saveTagCounter()
  tmClient.running          = false
  tmMonitor.currentLabel    = null
  tmMonitor.processingLabel = null
  tmMonitor.doneLabels      = []
  sessionId = Date.now()
  resetVisionFrame()
  console.log("[Session] Reset — new session", sessionId)
}

const ORI            = { rx: 180, ry: 0, rz: 84 }           // orientation cố định toàn bộ
const POS_SAFE       = { label: "safe",    x: 585, y: 100,  z: 250, ...ORI }
const POS_HOME       = { label: "home",    x: 500, y: 0, z: 400, ...ORI }
const POS_INSPECT    = { label: "inspect", x: 585, y: -300, z: 200, ...ORI }

const TRAY_PICK_Z    = 0     // ← z khi gripper chạm vật
const TRAY_HOVER_Z   = 80    // ← z hover khi di chuyển (đủ cao tránh va chạm)
const LOWER_MM       = TRAY_HOVER_Z - TRAY_PICK_Z   // tự tính = 100

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
          console.log("[Vision] unknown line:", JSON.stringify(s))
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
let _manualConnecting  = false   // manual /robot/connect call in progress

setInterval(() => {
  if (!tmClient.connected && waitingReturn) {
    console.log("[Safety] Socket lost while waiting return — clearing state")
    waitingReturn   = false
    lastPickedPoint = null
  }
}, 2000)

app.post("/robot/connect", async (req, res) => {
  const { ip = "127.0.0.1" } = req.body

  if (_manualConnecting) return res.status(400).json({ error: "Already connecting" })

  _manualConnecting = true
  tmClient.ip = ip

  // Reset sạch mọi trạng thái cũ — coi như task mới hoàn toàn
  tmClient.disconnect()
  resetSession()

  const deadline = Date.now() + 60000
  let lastErr = "Connect timeout"

  while (Date.now() < deadline) {
    try {
      await tmClient.connect()
      await tmClient.waitForListenNode(10000)
      resetSession()
      sendWebhook("arm_ready")
      _manualConnecting = false
      return res.json({ success: true })
    } catch (e) {
      lastErr = e.message
      tmClient.disconnect()
      console.log("[Connect] Retry:", e.message)
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  _manualConnecting = false
  res.status(500).json({ error: lastErr })
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
    connected: tmClient.connected,
    robotIp: tmClient.connected ? tmClient.ip : null,
    currentLabel: tmMonitor.currentLabel,
    processingLabel: tmMonitor.processingLabel,
    doneLabels: tmMonitor.doneLabels,
    gripperOpen,
    running: tmClient.running,
    paused: robotPaused,
    waitingReturn,
    currentPointIndex,
    totalPoints: currentPoints.length,
    currentPoints,
    serverStart: SERVER_START_TIME,
    currentRecipeId,
    sessionId,
    criticalError,
    robotWarning,
  })
})

app.post("/recipe/current", (req, res) => {
  const { recipeId } = req.body
  currentRecipeId = recipeId ?? null
  res.json({ ok: true })
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
// Wrap script lines with QueueTag(1,0) at start (clear stale) and QueueTag(1,1) at end (signal done)
function tagWrap(lines) {
  return ["QueueTag(1,0)", ...lines, "QueueTag(1,1)"]
}

// Wait 150ms (for QueueTag clear to execute), then poll until QueueTag(1) is true
async function waitTag(scriptId, maxWait = 60000) {
  await new Promise(r => setTimeout(r, 150))
  try {
    await tmClient.waitQueueTag(1, 100, maxWait)
    return true
  } catch (e) {
    console.warn(`[${scriptId}] waitTag: ${e.message}`)
    return false
  }
}
async function waitIfPaused() {
  while (robotPaused && tmClient.running) {
    await new Promise(r => setTimeout(r, 200))
  }
}
async function sendWebhook(event, cell = null, message = null) {
  const url = process.env.WEBHOOK_URL
  if (!url) return true
  try {
    const body = { event, timestamp: new Date().toISOString() }
    if (cell)    body.currentCell = cell
    if (message) body.message     = message
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    return true
  } catch (e) {
    console.warn(`[webhook] ${event} failed:`, e.message)
    return false
  }
}

app.post("/robot/run", async (req, res) => {
  const { points, speed = 30 } = req.body

  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running)    return res.status(400).json({ error: "Already running" })
  if (waitingReturn)       return res.status(400).json({ error: "Item at station — press Return first" })

  // Nếu có points mới → reset queue
  if (points && points.length > 0) {
    currentPoints     = points
    currentPointIndex = 0
    tmMonitor.doneLabels = []
    gripperOpen = true
  }

  if (currentPointIndex >= currentPoints.length)
    return res.status(400).json({ error: "No more points to process" })

  const pt = currentPoints[currentPointIndex]

  saveTagCounter()
  if (tagCounter > 30000) tagCounter = 100
  tmClient.running          = true
  tmMonitor.processingLabel = pt.label

  try {
    const ok = await runPickAndDeliver(pt, speed)
    if (!ok) {
      tmClient.running = false
      return res.status(500).json({ error: `Pick failed at ${pt.label}` })
    }

    lastPickedPoint   = pt
    waitingReturn     = true
    currentPointIndex++
    tmClient.running          = false
    tmMonitor.processingLabel = pt.label   // giữ highlight xanh khi chờ return
    sendWebhook("inspection_start", pt.label).catch(() => {})
    res.json({ success: true, remaining: currentPoints.length - currentPointIndex })
  } catch (e) {
    tmClient.running = false
    tmMonitor.processingLabel = null
    sendWebhook("error", null, e.message)
    try { if (tmClient.connected) await tmClient.sendScript("abort", ["StopAndClearBuffer(0)"]) } catch (_) {}
    res.status(500).json({ error: e.message })
  }
})

app.post("/robot/return", async (req, res) => {
  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running)    return res.status(400).json({ error: "Already running" })
  if (!waitingReturn || !lastPickedPoint) return res.status(400).json({ error: "Nothing to return" })

  const { speed = 30 } = req.body || {}
  const pt = lastPickedPoint

  tmClient.running          = true
  tmMonitor.processingLabel = pt.label

  try {
    const ok = await runReturnToTray(pt, speed)
    if (!ok) {
      tmClient.running = false
      return res.status(500).json({ error: `Return failed for ${pt.label}` })
    }

    tmMonitor.doneLabels.push(pt.label)
    waitingReturn   = false
    lastPickedPoint = null

    // Còn cell tiếp theo → tự chạy luôn
    if (currentPointIndex < currentPoints.length) {
      const next = currentPoints[currentPointIndex]
      tmMonitor.processingLabel = next.label
      const ok2 = await runPickAndDeliver(next, speed)
      if (!ok2) {
        tmClient.running = false
        tmMonitor.processingLabel = null
        return res.status(500).json({ error: `Pick failed at ${next.label}` })
      }
      lastPickedPoint   = next
      waitingReturn     = true
      currentPointIndex++
      tmClient.running          = false
      tmMonitor.processingLabel = next.label   // giữ highlight xanh
      sendWebhook("inspection_start", next.label).catch(() => {})
      return res.json({ success: true, allDone: false })
    }

    tmClient.running          = false
    tmMonitor.processingLabel = null
    sendWebhook("sequence_complete")
    res.json({ success: true, allDone: true })
  } catch (e) {
    tmClient.running = false
    tmMonitor.processingLabel = null
    sendWebhook("error", null, e.message)
    try { if (tmClient.connected) await tmClient.sendScript("abort", ["StopAndClearBuffer(0)"]) } catch (_) {}
    res.status(500).json({ error: e.message })
  }
})

app.post("/robot/clear-run", (req, res) => {
  tmMonitor.currentLabel    = null
  tmMonitor.processingLabel = null
  tmMonitor.doneLabels      = []
  currentPoints             = []
  res.json({ ok: true })
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
  tmClient.running  = false
  robotPaused       = false
  waitingReturn     = false
  lastPickedPoint   = null
  currentPointIndex = 0
  currentPoints     = []

  try {
    if (tmClient.connected) {
      await tmClient.sendScript("abort", ["StopAndClearBuffer(0)"])
    }
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


app.post("/robot/home", async (req, res) => {
  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running)    return res.status(400).json({ error: "Already running" })

  const { speed = 100 } = req.body || {}
  tmClient.running = true
  try {
    const t = ++tagCounter
    const homePos = `${POS_HOME.x},${POS_HOME.y},${POS_HOME.z},${POS_HOME.rx},${POS_HOME.ry},${POS_HOME.rz}`
    const ok = await tmClient.sendScript(`home${t}`, tagWrap([
      `PTP("CPP",{${homePos}},${speed},0,0,false)`
    ]))
    if (!ok || !await waitTag(`home${t}`)) {
      tmClient.running = false
      return res.status(500).json({ error: "Home move failed" })
    }
    tmClient.running = false
    res.json({ success: true })
  } catch (e) {
    tmClient.running = false
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
    lastCapturedImage = dataUrl
    res.json({ image: dataUrl })
  } catch (e) {
    res.json({ error: e.message })
  }
})

app.get("/camera/latest", (req, res) => {
  res.json({ image: lastCapturedImage, ...lastCapturedImageMeta })
})

app.post("/camera/clear", (req, res) => {
  lastCapturedImage    = null
  lastCapturedImageMeta = { origWidth: 0, origHeight: 0 }
  res.json({ ok: true })
})

let lastCapturedImageMeta = { origWidth: 0, origHeight: 0 }
app.post("/camera/thumbnail", express.json({ limit: "5mb" }), (req, res) => {
  const { image, origWidth, origHeight } = req.body
  if (image) { lastCapturedImage = image; lastCapturedImageMeta = { origWidth: origWidth || 0, origHeight: origHeight || 0 } }
  res.json({ ok: true })
})

// ─── Vision endpoints ─────────────────────────────────────────────────────────

app.post("/cells/resolve", (req, res) => {
  const { cells } = req.body
  if (!cells || !cells.length) return res.status(400).json({ error: "cells required" })
  const resolved = cells.map(({ tray_id, cell }) => {
    const coords = cellToRobot(tray_id, cell)
    if (!coords) return null
    return { tray_id, cell, x: coords.x, y: coords.y }
  }).filter(Boolean)
  res.json({ cells: resolved, calibrated: TRAY1_ROBOT_CALIBRATED })
})

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
// ─── Tray pixel mapping — perspective homography ─────────────────────────────
// 4 corner pixel positions đo thực tế từ ảnh camera (cell1, cell4, cell17, cell20)

const TRAY1_CAL_SRC = [
  [ 646.3738, 451.65985 ],  // cell 1  → col=0, row=0
  [1738.88,   457.14157 ],  // cell 4  → col=3, row=0
  [ 634.3767, 1426.3755 ],  // cell 17 → col=0, row=4
  [1737.1605, 1434.6619 ],  // cell 20 → col=3, row=4
]
const TRAY1_CAL_DST = [[0,0],[3,0],[0,4],[3,4]]

// !! ĐIỀN VÀO: jog robot đến đúng 4 góc, đọc x,y tại mỗi góc (cùng thứ tự với TRAY1_CAL_SRC)
const TRAY1_ROBOT_CORNERS = [
  [637, 273],  // cell 1
  [637, 152],  // cell 4
  [528, 275],  // cell 17
  [521, 158],  // cell 20
]

const TRAY1_ROBOT_CALIBRATED = TRAY1_ROBOT_CORNERS.some(([x, y]) => x !== 0 || y !== 0)

const H_PIX_TO_ROBOT = TRAY1_ROBOT_CALIBRATED
  ? computeHomography(TRAY1_CAL_SRC, TRAY1_ROBOT_CORNERS)
  : null

function pixelToRobot(px, py) {
  if (!H_PIX_TO_ROBOT) return null
  const res = applyHomography(H_PIX_TO_ROBOT, px, py)
  return { x: +res.col.toFixed(2), y: +res.row.toFixed(2) }
}

// Cùng công thức & corner values với frontend getCellCoords — đảm bảo tọa độ y chang
const TRAY1_CELL_CORNERS = {
  tl: { x: 565, y: 272 },  // cell 1  (col=0, row=0)
  tr: { x: 561, y: 153 },  // cell 4  (col=3, row=0)
  bl: { x: 457, y: 274 },  // cell 17 (col=0, row=4)
  br: { x: 447, y: 156 },  // cell 20 (col=3, row=4)
}

function cellToRobot(tray_id, cell) {
  if (tray_id !== 1) return null
  const col = (cell - 1) % 4
  const row = Math.floor((cell - 1) / 4)
  const s = col / 3
  const t = row / 4
  const { tl, tr, bl, br } = TRAY1_CELL_CORNERS
  return {
    x: +((1-s)*(1-t)*tl.x + s*(1-t)*tr.x + (1-s)*t*bl.x + s*t*br.x).toFixed(2),
    y: +((1-s)*(1-t)*tl.y + s*(1-t)*tr.y + (1-s)*t*bl.y + s*t*br.y).toFixed(2),
  }
}

function gaussSolve(A, b) {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const f = M[row][col] / M[col][col]
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

function computeHomography(srcPts, dstPts) {
  const A = [], b = []
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = srcPts[i], [dx, dy] = dstPts[i]
    A.push([sx,sy,1,0,0,0,-sx*dx,-sy*dx]); b.push(dx)
    A.push([0,0,0,sx,sy,1,-sx*dy,-sy*dy]); b.push(dy)
  }
  const h = gaussSolve(A, b)
  return [[h[0],h[1],h[2]],[h[3],h[4],h[5]],[h[6],h[7],1]]
}

function applyHomography(H, px, py) {
  const w = H[2][0]*px + H[2][1]*py + H[2][2]
  return { col: (H[0][0]*px + H[0][1]*py + H[0][2])/w,
           row: (H[1][0]*px + H[1][1]*py + H[1][2])/w }
}

const H_TRAY1 = computeHomography(TRAY1_CAL_SRC, TRAY1_CAL_DST)

function mapToTray(objects) {
  const result = { tray1: [], tray2: [], tray3: [], tray4: [], tray5: [], tray6: [] }
  objects.forEach(obj => {
    const { col, row } = applyHomography(H_TRAY1, obj.x, obj.y)
    const c = Math.round(col), r = Math.round(row)
    if (c >= 0 && c <= 3 && r >= 0 && r <= 4) {
      const cell = r * 4 + c + 1
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

  const robotPoints = H_PIX_TO_ROBOT
    ? objects.map((obj, i) => ({
        label: `vision-${i + 1}`,
        ...pixelToRobot(obj.x, obj.y),
      }))
    : []

  // Per-object: tray+cell+robot coords — dùng cho /integration/capture → /integration/run
  const cells = H_PIX_TO_ROBOT ? objects.map(obj => {
    const { col, row } = applyHomography(H_TRAY1, obj.x, obj.y)
    const c = Math.round(col), r = Math.round(row)
    if (c < 0 || c > 3 || r < 0 || r > 4) return null
    const robot = pixelToRobot(obj.x, obj.y)
    return { tray_id: 1, cell: r * 4 + c + 1, x: robot.x, y: robot.y }
  }).filter(Boolean) : []

  res.json({
    found: objects.length > 0,
    done: latestVision.done,
    objects,
    occupied,
    robotPoints,
    cells,
    calibrated: TRAY1_ROBOT_CALIBRATED,
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

app.post("/logs", (req, res) => {
  const { key, params = [], level = "info" } = req.body
  db.run(
    "INSERT INTO logs (ts, level, key, params) VALUES (?,?,?,?)",
    [Date.now(), level, key, JSON.stringify(params)],
    err => err ? res.status(500).json(err) : res.json({ ok: true })
  )
})

app.get("/logs", (req, res) => {
  const limit = parseInt(req.query.limit) || 500
  db.all(
    "SELECT * FROM logs ORDER BY ts DESC LIMIT ?",
    [limit],
    (err, rows) => err ? res.status(500).json(err) : res.json(rows)
  )
})

app.delete("/logs", (req, res) => {
  db.run("DELETE FROM logs", err => err ? res.status(500).json(err) : res.json({ ok: true }))
})

app.get("/recipes", (req, res) => {
  db.all("SELECT * FROM recipes", (err, rows) => {
    if (err) res.status(500).json(err)
    else res.json(rows)
  })
})

app.post("/recipes", (req, res) => {
  const { name, speed, grip, open, inspect_wait } = req.body
  db.run(
    "INSERT INTO recipes (name,speed,grip,open,inspect_wait) VALUES (?,?,?,?,?)",
    [name, speed, grip, open, inspect_wait ?? null],
    function(err) {
      if (err) res.status(500).json(err)
      else res.json({ id: this.lastID })
    }
  )
})

app.put("/recipes/:id", (req, res) => {
  const { name, speed, grip, open, inspect_wait } = req.body
  db.run(
    "UPDATE recipes SET name=?,speed=?,grip=?,open=?,inspect_wait=? WHERE id=?",
    [name, speed, grip, open, inspect_wait ?? null, req.params.id],
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

initIntegration({
  tmClient, tmMonitor,
  get gripperOpen()      { return gripperOpen },
  get robotPaused()      { return robotPaused },      set robotPaused(v)      { robotPaused = v },
  get waitingReturn()    { return waitingReturn },
  get integrationRecipe(){ return integrationRecipe }, set integrationRecipe(v){ integrationRecipe = v },
  get currentRecipeId()  { return currentRecipeId },  set currentRecipeId(v)  { currentRecipeId = v },
}, db)
app.use("/integration", integrationRouter)


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

function makeScriptHelpers(rawPt, speed) {
  const pt           = { ...rawPt, z: TRAY_HOVER_Z, ...ORI }
  const lowerPt      = { ...pt,    z: TRAY_PICK_Z }
  const lowerInspect = { ...POS_INSPECT, z: POS_INSPECT.z - LOWER_MM }
  function posStr(p) { return `${p.x},${p.y},${p.z},${p.rx},${p.ry},${p.rz}` }
  function ptp(p)    { return `PTP("CPP",{${posStr(p)}},${speed},0,0,false)` }
  return { pt, lowerPt, lowerInspect, ptp }
}

// Pick từ tray → đặt ở trạm kiểm tra → về safe
async function runPickAndDeliver(rawPt, speed) {
  const { pt, lowerPt, lowerInspect, ptp } = makeScriptHelpers(rawPt, speed)
  console.log(`[Deliver] pick: x=${pt.x} y=${pt.y} | inspect: x=${POS_INSPECT.x} y=${POS_INSPECT.y}`)

  // S1: pick (approach → down → up) → gripper close
  const t1 = ++tagCounter
  let ok = await tmClient.sendScript(`s${t1}`, tagWrap([ptp(pt), ptp(lowerPt), ptp(pt)]))
  if (!ok || !await waitTag(`s${t1}`)) { console.log('[S1] FAILED'); return false }
  gripperOpen = false
  await waitIfPaused(); if (!tmClient.running) return false

  // S2: carry to inspect → lower → place → up → gripper open
  const t2 = ++tagCounter
  ok = await tmClient.sendScript(`s${t2}`, tagWrap([ptp(POS_INSPECT), ptp(lowerInspect), ptp(POS_INSPECT)]))
  if (!ok || !await waitTag(`s${t2}`)) { console.log('[S2] FAILED'); return false }
  gripperOpen = true
  await waitIfPaused(); if (!tmClient.running) return false

  // S3: go to safe position
  const t3 = ++tagCounter
  ok = await tmClient.sendScript(`s${t3}`, tagWrap([ptp(POS_SAFE)]))
  if (!ok || !await waitTag(`s${t3}`)) { console.log('[S3] FAILED'); return false }

  return true
}

// Pick từ trạm kiểm tra → trả về đúng ô tray
async function runReturnToTray(rawPt, speed) {
  const { pt, lowerPt, lowerInspect, ptp } = makeScriptHelpers(rawPt, speed)
  console.log(`[Return] inspect: x=${POS_INSPECT.x} y=${POS_INSPECT.y} → tray: x=${pt.x} y=${pt.y}`)

  // S4: pick from inspect → gripper close
  const t4 = ++tagCounter
  let ok = await tmClient.sendScript(`s${t4}`, tagWrap([ptp(POS_INSPECT), ptp(lowerInspect), ptp(POS_INSPECT)]))
  if (!ok || !await waitTag(`s${t4}`)) { console.log('[S4] FAILED'); return false }
  gripperOpen = false
  await waitIfPaused(); if (!tmClient.running) return false

  // S5: return to tray → lower → place → up → gripper open
  const t5 = ++tagCounter
  ok = await tmClient.sendScript(`s${t5}`, tagWrap([ptp(pt), ptp(lowerPt), ptp(pt)]))
  if (!ok || !await waitTag(`s${t5}`)) { console.log('[S5] FAILED'); return false }
  gripperOpen = true

  return true
}