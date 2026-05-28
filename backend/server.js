process.stdout.setEncoding("utf8")
process.stderr.setEncoding("utf8")
require("dotenv").config()

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
app.use(express.json())

const db = new sqlite3.Database("./database.db")

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
let gripperOpen          = true
let inspectCountdown     = 0
let robotPaused          = false
let waitingInspection    = false
let currentPoints        = []
let lastCapturedImage    = null
let continueResolve      = null
let integrationRecipe    = null

const ORI            = { rx: 180, ry: 0, rz: 84 }           // orientation cố định toàn bộ
const POS_SAFE       = { label: "safe",    x: 585, y: 100,  z: 250, ...ORI }
const POS_INSPECT    = { label: "inspect", x: 585, y: -300, z: 200, ...ORI }

const TRAY_PICK_Z    = 0     // ← z khi gripper chạm vật
const TRAY_HOVER_Z   = 80    // ← z hover khi di chuyển (đủ cao tránh va chạm)
const LOWER_MM       = TRAY_HOVER_Z - TRAY_PICK_Z   // tự tính = 100

const INSPECT_TIMEOUT_MS = parseInt(process.env.INSPECT_TIMEOUT_MS) || 600000

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
    connected: tmClient.connected,
    robotIp: tmClient.connected ? tmClient.ip : null,
    currentLabel: tmMonitor.currentLabel,
    processingLabel: tmMonitor.processingLabel,
    doneLabels: tmMonitor.doneLabels,
    gripperOpen,
    countdown: inspectCountdown,
    running: tmClient.running,
    paused: robotPaused,
    waitingInspection,
    currentPoints,
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
async function sendWebhook(event, cell = null) {
  const url = process.env.WEBHOOK_URL
  if (!url) return true
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, currentCell: cell, timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000),
    })
    return true
  } catch (e) {
    console.warn(`[webhook] ${event} failed:`, e.message)
    return false
  }
}

async function waitForContinue() {
  waitingInspection = true
  inspectCountdown  = Math.ceil(INSPECT_TIMEOUT_MS / 1000)
  const timeoutId   = setTimeout(() => {
    if (continueResolve) {
      continueResolve(false)
      continueResolve = null
    }
  }, INSPECT_TIMEOUT_MS)

  const timerInterval = setInterval(() => {
    if (!robotPaused && inspectCountdown > 0) inspectCountdown--
  }, 1000)

  const signalled = await new Promise(resolve => {
    continueResolve = resolve
  })

  clearTimeout(timeoutId)
  clearInterval(timerInterval)
  waitingInspection = false
  continueResolve   = null
  inspectCountdown  = 0
  return signalled && tmClient.running
}
app.post("/robot/run", async (req, res) => {
  const { points, speed = 30 } = req.body

  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running) return res.status(400).json({ error: "Already running" })
  if (!points || points.length === 0) return res.status(400).json({ error: "No points selected" })

  saveTagCounter()  // persist before run so restart starts from fresh tags
  if (tagCounter > 30000) tagCounter = 100
  tmClient.running = true
  robotPaused = false
  tmMonitor.currentLabel    = null
  tmMonitor.processingLabel = null
  tmMonitor.doneLabels      = []
  gripperOpen = true
  currentPoints = points
  lastCapturedImage = null
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

  const ok = await runPointBatch(pt, speed, pt.label)
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
      await tmClient.sendScript(`safe${tSafe}`, tagWrap([
        `PTP("CPP",{${safePos}},${speed},0,0,false)`,
      ]))
      await waitTag(`safe${tSafe}`)
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
  if (continueResolve) { continueResolve(false); continueResolve = null }

  try {
    if (tmClient.connected) {
      await tmClient.sendScript("abort", ["StopAndClearBuffer(0)"])
    }
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post("/robot/continue", (req, res) => {
  if (!waitingInspection || !continueResolve) {
    return res.status(400).json({ error: "Not waiting for inspection" })
  }
  continueResolve(true)
  continueResolve = null
  res.json({ success: true })
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

let lastCapturedImageMeta = { origWidth: 0, origHeight: 0 }
app.post("/camera/thumbnail", express.json({ limit: "5mb" }), (req, res) => {
  const { image, origWidth, origHeight } = req.body
  if (image) { lastCapturedImage = image; lastCapturedImageMeta = { origWidth: origWidth || 0, origHeight: origHeight || 0 } }
  res.json({ ok: true })
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
// ─── Tray pixel mapping — perspective homography ─────────────────────────────
// 4 corner pixel positions đo thực tế từ ảnh camera (cell1, cell4, cell17, cell20)

const TRAY1_CAL_SRC = [
  [ 977.8729, 365.3779  ],  // cell 1  → col=0, row=0
  [2118.4133, 354.37622 ],  // cell 4  → col=3, row=0
  [1004.2274, 1408.9663 ],  // cell 17 → col=0, row=4
  [2136.332,  1373.8911 ],  // cell 20 → col=3, row=4
]
const TRAY1_CAL_DST = [[0,0],[3,0],[0,4],[3,4]]

// !! ĐIỀN VÀO: jog robot đến đúng 4 góc, đọc x,y tại mỗi góc (cùng thứ tự với TRAY1_CAL_SRC)
const TRAY1_ROBOT_CORNERS = [
  [565, 272],  // cell 1
  [561, 153],  // cell 4
  [457, 274],  // cell 17
  [447, 156],  // cell 20
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

  res.json({
    found: objects.length > 0,
    done: latestVision.done,
    objects,
    occupied,
    robotPoints,
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

initIntegration({
  tmClient, tmMonitor,
  get gripperOpen()      { return gripperOpen },
  get inspectCountdown() { return inspectCountdown },
  get robotPaused()      { return robotPaused },      set robotPaused(v)      { robotPaused = v },
  get waitingInspection(){ return waitingInspection },
  get continueResolve()  { return continueResolve },  set continueResolve(v)  { continueResolve = v },
  get integrationRecipe(){ return integrationRecipe }, set integrationRecipe(v){ integrationRecipe = v },
})
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

async function runPointBatch(rawPt, speed, currentCell = null) {
  const pt           = { ...rawPt, z: TRAY_HOVER_Z, ...ORI }
  const lowerPt      = { ...pt,    z: TRAY_PICK_Z }
  const lowerInspect = { ...POS_INSPECT, z: POS_INSPECT.z - LOWER_MM }

  function posStr(p) { return `${p.x},${p.y},${p.z},${p.rx},${p.ry},${p.rz}` }
  function ptp(p)    { return `PTP("CPP",{${posStr(p)}},${speed},0,0,false)` }
  console.log(`[run] pick target: x=${pt.x} y=${pt.y} z=${pt.z} rx=${pt.rx} ry=${pt.ry} rz=${pt.rz}`)

  // Mỗi script batch nhiều PTP liên tiếp (robot chạy thẳng không qua server)
  // QueueTag chỉ đặt cuối mỗi script — tránh CPERR từ TM robot.

  // Script 1: pick (approach → down → up) → gripper close
  console.log(`[S1] pick → x=${pt.x} y=${pt.y} z=${pt.z}`)
  const t1 = ++tagCounter
  let ok = await tmClient.sendScript(`s${t1}`, tagWrap([ptp(pt), ptp(lowerPt), ptp(pt)]))
  if (!ok) { console.log('[S1] FAILED sendScript'); return false }
  if (!await waitTag(`s${t1}`)) { console.log('[S1] FAILED waitTag'); return false }
  gripperOpen = false
  await waitIfPaused(); if (!tmClient.running) return false

  // Script 2: place to inspect (to inspect → down → up) → gripper open
  console.log(`[S2] inspect → x=${POS_INSPECT.x} y=${POS_INSPECT.y} z=${POS_INSPECT.z}`)
  const t2 = ++tagCounter
  ok = await tmClient.sendScript(`s${t2}`, tagWrap([ptp(POS_INSPECT), ptp(lowerInspect), ptp(POS_INSPECT)]))
  if (!ok) { console.log('[S2] FAILED sendScript'); return false }
  if (!await waitTag(`s${t2}`)) { console.log('[S2] FAILED waitTag'); return false }
  gripperOpen = true
  await waitIfPaused(); if (!tmClient.running) return false

  // Script 3: go to safe
  console.log(`[S3] safe → x=${POS_SAFE.x} y=${POS_SAFE.y} z=${POS_SAFE.z}`)
  const t3 = ++tagCounter
  ok = await tmClient.sendScript(`s${t3}`, tagWrap([ptp(POS_SAFE)]))
  if (!ok) { console.log('[S3] FAILED sendScript'); return false }
  if (!await waitTag(`s${t3}`)) { console.log('[S3] FAILED waitTag'); return false }

  const webhookOk = await sendWebhook("inspection_start", currentCell)
  if (!webhookOk) {
    console.warn("[webhook] failed — auto-continuing after 3s")
    await new Promise(r => setTimeout(r, 3000))
  } else {
    if (!await waitForContinue()) return false
  }
  await waitIfPaused(); if (!tmClient.running) return false

  // Script 4: pick lại từ inspect → gripper close
  const t4 = ++tagCounter
  ok = await tmClient.sendScript(`s${t4}`, tagWrap([ptp(POS_INSPECT), ptp(lowerInspect), ptp(POS_INSPECT)]))
  if (!ok) return false
  if (!await waitTag(`s${t4}`)) return false
  gripperOpen = false
  await waitIfPaused(); if (!tmClient.running) return false

  // Script 5: trả về pt (to pt → down → up) → gripper open
  const t5 = ++tagCounter
  ok = await tmClient.sendScript(`s${t5}`, tagWrap([ptp(pt), ptp(lowerPt), ptp(pt)]))
  if (!ok) return false
  if (!await waitTag(`s${t5}`)) return false
  gripperOpen = true

  return true
}