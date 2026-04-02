process.stdout.setEncoding("utf8")
process.stderr.setEncoding("utf8")

const express = require("express")
const sqlite3 = require("sqlite3").verbose()
const cors    = require("cors")
const { TMClient }  = require("./tm_client")
const { TMMonitor }    = require("./tm_monitor")
const { CameraClient } = require("./camera_client")

const app = express()
app.use(cors())
app.use(express.json())

const db = new sqlite3.Database("./database.db")

const tmClient     = new TMClient()
const tmMonitor    = new TMMonitor()
const cameraClient = new CameraClient()
tmMonitor.currentLabel = null
tmMonitor.doneLabels   = []
let tagCounter = 0


// ─── Robot endpoints ──────────────────────────────────────────────────────────

app.post("/robot/connect", async (req, res) => {
  const { ip = "127.0.0.1" } = req.body
  if (tmClient.connected) return res.json({ success: true })
  try {
    tmClient.ip = ip
    await tmClient.connect()
    await tmClient.waitForListenNode()
    tmMonitor.connect(ip).catch(e => console.warn("[Monitor] SVRD connect failed:", e.message))
    res.json({ success: true })
  } catch (e) {
    tmClient.disconnect()
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
    doneLabels:   tmMonitor.doneLabels,
  })
})

app.post("/robot/run", async (req, res) => {
  const { points, speed = 30 } = req.body
  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running) return res.status(400).json({ error: "Already running" })
  if (!points || points.length === 0) return res.status(400).json({ error: "No points selected" })

  tmClient.running = true
  tmMonitor.currentLabel = null
  tmMonitor.doneLabels   = []
  try {
    for (const pt of points) {
      if (!tmClient.running) break
      tagCounter++
      const tag = tagCounter
      const pos = `${pt.x},${pt.y},${pt.z},${pt.rx},${pt.ry},${pt.rz}`
      tmMonitor.currentLabel = pt.label
      const ok = await tmClient.sendScript(`move${tag}`, [
        `PTP("CPP",{${pos}},${speed},0,0,false)`,
        `QueueTag(${tag},1)`,
      ])
      if (!ok) {
        tmMonitor.currentLabel = null
        tmClient.running = false
        return res.status(500).json({ error: `Point ${pt.label} failed` })
      }
      await tmClient.waitQueueTag(tag)
      tmMonitor.pos = { x: pt.x, y: pt.y, z: pt.z, rx: pt.rx, ry: pt.ry, rz: pt.rz }
      tmMonitor.doneLabels.push(pt.label)
      tmMonitor.currentLabel = null
    }
    tmClient.running = false
    res.json({ success: true })
  } catch (e) {
    tmClient.running = false
    res.status(500).json({ error: e.message })
  }
})

app.post("/robot/stop", async (req, res) => {
  tmClient.running = false
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
    res.json({ isCameraConnected: r.isCameraConnected, connection_message: r.connection_message, serverReachable: true })
  } catch (e) {
    // code 12 = server reachable but camera not initialized
    const serverReachable = e.code === 12 || (e.message && e.message.includes("12"))
    res.json({ isCameraConnected: false, serverReachable, connection_message: e.message })
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

app.post("/robot/move-one", async (req, res) => {
  const { point, speed = 30 } = req.body
  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running)    return res.status(400).json({ error: "Already running" })

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
    tmMonitor.pos = { x: point.x, y: point.y, z: point.z, rx: point.rx, ry: point.ry, rz: point.rz }
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
  if (tmClient.running)    return res.status(400).json({ error: "Already running" })

  tmClient.running = true
  try {
    tagCounter++
    const tag = tagCounter
    const pt  = position
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
    tmMonitor.pos = { x: pt.x, y: pt.y, z: pt.z, rx: pt.rx, ry: pt.ry, rz: pt.rz }
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
