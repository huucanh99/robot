const express  = require("express")
const apiKey   = require("./api_key_middleware")
const router   = express.Router()

router.use(apiKey)

// ─── inject shared state từ server.js ────────────────────────────────────────
let _state = null
let _db    = null
function init(state, db) { _state = state; _db = db }

const BASE = "http://localhost:3000"
async function proxy(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(BASE + path, opts)
  return r.json()
}

// ─── GET /integration/status ─────────────────────────────────────────────────
router.get("/status", (req, res) => {
  const { tmClient, tmMonitor, gripperOpen, robotPaused, waitingReturn, integrationRecipe } = _state
  res.json({
    status: deriveStatus(_state),
    robot_connected: tmClient.connected,
    running: tmClient.running,
    paused: robotPaused,
    waiting_return: waitingReturn,
    gripper_open: gripperOpen,
    recipe: integrationRecipe || null,
    robot_position: tmMonitor.pos || {},
    updated_at: new Date().toISOString(),
  })
})

// ─── POST /integration/connect ───────────────────────────────────────────────
router.post("/connect", async (req, res) => {
  const { ip } = req.body
  if (!ip) return res.status(400).json({ error: "ip required" })
  try {
    const data = await proxy("POST", "/robot/connect", { ip })
    if (!data.success) return res.status(500).json(data)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /integration/disconnect ────────────────────────────────────────────
router.post("/disconnect", async (req, res) => {
  try {
    const data = await proxy("POST", "/robot/disconnect")
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── GET /integration/recipes ─────────────────────────────────────────────────
router.get("/recipes", (req, res) => {
  _db.all("SELECT * FROM recipes", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(rows)
  })
})

// ─── POST /integration/recipe/apply ──────────────────────────────────────────
// Apply a saved recipe by ID — sets it as the active recipe for /run
router.post("/recipe/apply", (req, res) => {
  const { recipeId } = req.body
  if (!recipeId) return res.status(400).json({ error: "recipeId required" })
  _db.get("SELECT * FROM recipes WHERE id = ?", [recipeId], (err, row) => {
    if (err)  return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: "Recipe not found" })
    _state.integrationRecipe = { speed: row.speed, grip: row.grip, open: row.open, inspect_wait: row.inspect_wait }
    _state.currentRecipeId   = row.id
    res.json({ success: true, recipe: row })
  })
})

// ─── POST /integration/recipe ────────────────────────────────────────────────
// Set recipe params inline (without saving to DB)
router.post("/recipe", (req, res) => {
  const { speed, grip, open, inspect_wait } = req.body
  if (!speed) return res.status(400).json({ error: "speed required" })
  _state.integrationRecipe = { speed, grip, open, inspect_wait }
  _state.currentRecipeId   = null
  res.json({ success: true, recipe: _state.integrationRecipe })
})

// ─── POST /integration/capture ───────────────────────────────────────────────
// Full scan: reset → trigger vision → wait for detection → capture image
router.post("/capture", async (req, res) => {
  if (!_state.tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  try {
    // 1. Reset vision data cũ
    await proxy("POST", "/vision/reset")

    // 2. Trigger robot chạy vision node
    const trig = await proxy("POST", "/vision/trigger")
    if (!trig.success) return res.status(500).json({ error: trig.error || "Vision trigger failed" })

    // 3. Poll tối đa 30s cho đến khi có kết quả
    let result = null
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500))
      const vd = await proxy("GET", "/vision/latest")
      if (vd && vd.done) { result = vd; break }
    }
    if (!result) return res.status(408).json({ error: "Detection timeout (30s)" })

    // 4. Lấy ảnh hiển thị
    const cam = await proxy("GET", "/camera/capture")

    res.json({
      success:       true,
      image_captured: !!cam.image,
      found:         result.found,
      objects:       result.objects,
      occupied:      result.occupied,
      robot_points:  result.robotPoints,
      cells:         result.cells || [],
      calibrated:    result.calibrated,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /integration/detect ────────────────────────────────────────────────
router.post("/detect", async (req, res) => {
  if (!_state.tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  try {
    const d = await proxy("POST", "/vision/trigger")
    if (!d.success) return res.status(500).json({ error: d.error || "trigger failed" })

    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500))
      const vd = await proxy("GET", "/vision/latest")
      if (vd && vd.done) {
        return res.json({
          detected_at: new Date().toISOString(),
          found: vd.found,
          objects: vd.objects,
          occupied: vd.occupied,
          robot_points: vd.robotPoints,
          calibrated: vd.calibrated,
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
  const { cells, points } = req.body
  if (!_state.tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (_state.tmClient.running)    return res.status(400).json({ error: "Already running" })

  const recipe = _state.integrationRecipe || {}

  // Accept raw points[], cells[] with x,y, or cells[] with only tray_id+cell (auto-resolve coords)
  let payload
  if (points) {
    payload = points
  } else if (cells && cells.length) {
    let resolved = cells
    if (cells.some(c => c.x == null || c.y == null)) {
      const r = await proxy("POST", "/cells/resolve", { cells })
      if (!r.calibrated) return res.status(400).json({ error: "Robot not calibrated — cannot resolve cell coords" })
      resolved = r.cells || []
    }
    payload = resolved.map(({ tray_id, cell, x, y }) => ({ x, y, label: `tray${tray_id}-${cell}` }))
  } else {
    payload = []
  }

  if (!payload.length) return res.status(400).json({ error: "No points provided" })

  try {
    const data = await proxy("POST", "/robot/run", {
      points: payload,
      speed: recipe.speed,
    })
    if (!data.success) return res.status(500).json(data)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /integration/return ─────────────────────────────────────────────────
router.post("/return", async (req, res) => {
  try {
    const recipe = _state.integrationRecipe
    const data = await proxy("POST", "/robot/return", { speed: recipe?.speed || 30 })
    if (!data.success) return res.status(500).json(data)
    res.json({ success: true, allDone: data.allDone })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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

// ─── POST /integration/home ──────────────────────────────────────────────────
router.post("/home", async (req, res) => {
  try {
    const data = await proxy("POST", "/robot/home", req.body || {})
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /integration/stop ──────────────────────────────────────────────────
router.post("/stop", async (req, res) => {
  try {
    const data = await proxy("POST", "/robot/stop")
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── GET /integration/camera/latest ──────────────────────────────────────────
router.get("/camera/latest", async (req, res) => {
  try {
    const data = await proxy("GET", "/camera/latest")
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── GET /integration/logs ────────────────────────────────────────────────────
router.get("/logs", (req, res) => {
  const limit = parseInt(req.query.limit) || 100
  _db.all("SELECT * FROM logs ORDER BY ts DESC LIMIT ?", [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(rows)
  })
})

// ─── helpers ─────────────────────────────────────────────────────────────────
function deriveStatus({ tmClient, robotPaused, waitingReturn }) {
  if (!tmClient.connected) return "idle"
  if (waitingReturn)       return "waiting_return"
  if (robotPaused)         return "paused"
  if (tmClient.running)    return "running"
  return "ready"
}

module.exports = { router, init }
