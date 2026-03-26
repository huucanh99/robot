const express = require("express")
const sqlite3 = require("sqlite3").verbose()
const cors    = require("cors")
const { TMClient } = require("./tm_client")

const app = express()
app.use(cors())
app.use(express.json())

const db = new sqlite3.Database("./database.db")

const tmClient = new TMClient()
let tagCounter = 0


// ─── Robot endpoints ──────────────────────────────────────────────────────────

app.post("/robot/connect", async (req, res) => {
  const { ip = "127.0.0.1" } = req.body
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

app.post("/robot/disconnect", (req, res) => {
  tmClient.disconnect()
  res.json({ success: true })
})

app.post("/robot/run", async (req, res) => {
  const { points, speed = 30 } = req.body
  if (!tmClient.connected) return res.status(400).json({ error: "Robot not connected" })
  if (tmClient.running) return res.status(400).json({ error: "Already running" })
  if (!points || points.length === 0) return res.status(400).json({ error: "No points selected" })

  tmClient.running = true
  try {
    for (const pt of points) {
      if (!tmClient.running) break
      tagCounter++
      const tag = tagCounter
      const pos = `${pt.x},${pt.y},${pt.z},${pt.rx},${pt.ry},${pt.rz}`
      const ok = await tmClient.sendScript(`move${tag}`, [
        `PTP("CPP",{${pos}},${speed},0,0,false)`,
        `QueueTag(${tag},1)`,
      ])
      if (!ok) {
        tmClient.running = false
        return res.status(500).json({ error: `Point ${pt.label} failed` })
      }
      await tmClient.waitQueueTag(tag)
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
