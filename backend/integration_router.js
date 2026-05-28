const express  = require("express")
const apiKey   = require("./api_key_middleware")
const router   = express.Router()

router.use(apiKey)

// ─── inject shared state từ server.js ────────────────────────────────────────
let _state = null
function init(state) { _state = state }

// ─── GET /integration/status ─────────────────────────────────────────────────
router.get("/status", (req, res) => {
  const { tmClient, tmMonitor, gripperOpen, inspectCountdown, robotPaused, waitingInspection, integrationRecipe } = _state
  res.json({
    mode: "integration",
    status: deriveStatus(_state),
    recipe: integrationRecipe || null,
    robot_position: tmMonitor.pos || {},
    robot_connected: tmClient.connected,
    waiting_inspection: waitingInspection,
    inspect_countdown_s: inspectCountdown,
    gripper_open: gripperOpen,
    paused: robotPaused,
    updated_at: new Date().toISOString(),
  })
})

// ─── POST /integration/connect ───────────────────────────────────────────────
router.post("/connect", async (req, res) => {
  const { ip } = req.body
  if (!ip) return res.status(400).json({ error: "ip required" })
  try {
    const r = await fetch(`http://localhost:3000/robot/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
    })
    const data = await r.json()
    if (!data.success) return res.status(500).json(data)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /integration/recipe ────────────────────────────────────────────────
router.post("/recipe", (req, res) => {
  const { speed, grip, open } = req.body
  if (!speed) return res.status(400).json({ error: "speed required" })
  _state.integrationRecipe = { speed, grip, open }
  res.json({ success: true, recipe: _state.integrationRecipe })
})

// ─── POST /integration/detect ────────────────────────────────────────────────
router.post("/detect", async (req, res) => {
  if (!_state.tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  try {
    const r = await fetch("http://localhost:3000/vision/trigger", { method: "POST" })
    const d = await r.json()
    if (!d.success) return res.status(500).json({ error: d.error || "trigger failed" })

    // Poll vision/latest tối đa 30s
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500))
      const vr = await fetch("http://localhost:3000/vision/latest")
      const vd = await vr.json()
      if (vd && vd.done) {
        return res.json({
          detected_at: new Date().toISOString(),
          trays: buildTraysMatrix(vd),
        })
      }
    }
    res.status(408).json({ error: "Detection timeout (30s)" })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /integration/run ───────────────────────────────────────────────────
router.post("/run", async (req, res) => {
  const { cells } = req.body
  if (!_state.tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (_state.tmClient.running)    return res.status(400).json({ error: "Already running" })
  if (!cells || cells.length === 0) return res.status(400).json({ error: "No cells provided" })
  if (!_state.integrationRecipe)  return res.status(400).json({ error: "No recipe loaded" })

  const { speed } = _state.integrationRecipe

  // cells phải có x,y từ client hoặc dùng detect trước
  // Nếu client chỉ gửi tray_id+cell thì cần server tính tọa độ — hiện tại cần x,y trong mỗi cell
  const points = cells.map(({ tray_id, cell, x, y }) => ({
    x, y, label: `tray${tray_id}-cell${cell}`
  }))

  try {
    const r = await fetch("http://localhost:3000/robot/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points, speed }),
    })
    const data = await r.json()
    if (!data.success) return res.status(500).json(data)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /integration/continue ──────────────────────────────────────────────
router.post("/continue", (req, res) => {
  if (!_state.waitingInspection || !_state.continueResolve) {
    return res.status(400).json({ error: "Not waiting for inspection" })
  }
  _state.continueResolve(true)
  _state.continueResolve = null
  res.json({ success: true })
})

// ─── POST /integration/pause ─────────────────────────────────────────────────
router.post("/pause", (req, res) => {
  if (!_state.tmClient.running) return res.status(400).json({ error: "Not running" })
  _state.robotPaused = true
  res.json({ success: true })
})

// ─── POST /integration/resume ────────────────────────────────────────────────
router.post("/resume", (req, res) => {
  _state.robotPaused = false
  res.json({ success: true })
})

// ─── POST /integration/stop ──────────────────────────────────────────────────
router.post("/stop", async (req, res) => {
  try {
    const r = await fetch("http://localhost:3000/robot/stop", { method: "POST" })
    const data = await r.json()
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── helpers ─────────────────────────────────────────────────────────────────
function deriveStatus({ tmClient, robotPaused, waitingInspection }) {
  if (!tmClient.connected) return "idle"
  if (waitingInspection)   return "waiting_inspection"
  if (robotPaused)         return "paused"
  if (tmClient.running)    return "running"
  return "ready"
}

function buildTraysMatrix(vd) {
  return [1,2,3,4,5,6].map(id => ({
    tray_id: id,
    total_cells: 20,
    occupied_cells: id === 1 ? (vd.occupied?.tray1 || []) : [],
  }))
}

module.exports = { router, init }
