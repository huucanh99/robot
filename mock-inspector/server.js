const express = require("express")
const app = express()
app.use(express.json())

const ROBOT_URL     = process.env.ROBOT_URL     || "http://localhost:3000"
const SCAN_DELAY_MS = parseInt(process.env.SCAN_DELAY_MS) || 10000
const PORT          = parseInt(process.env.PORT) || 8080

app.post("/notify", async (req, res) => {
  const { event, currentCell, timestamp } = req.body
  const receiveTime = new Date()
  console.log(`[${receiveTime.toLocaleTimeString()}] NHẬN LỆNH — event: ${event}`, currentCell || "")
  res.json({ ok: true })

  if (event === "inspection_start") {
    console.log(`  → đang scan... (${SCAN_DELAY_MS / 1000}s)`)
    await new Promise(r => setTimeout(r, SCAN_DELAY_MS))

    const sendTime = new Date()
    const elapsed = ((sendTime - receiveTime) / 1000).toFixed(1)
    console.log(`  → [${sendTime.toLocaleTimeString()}] GỬI /robot/continue (sau ${elapsed}s)`)
    try {
      const resp = await fetch(`${ROBOT_URL}/robot/continue`, { method: "POST" })
      const body = await resp.json()
      console.log(`  → kết quả:`, body)
    } catch (e) {
      console.error(`  → lỗi gọi /robot/continue:`, e.message)
    }
  }
})

app.get("/health", (_, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`Mock Inspector chạy tại http://localhost:${PORT}`)
  console.log(`  ROBOT_URL     = ${ROBOT_URL}`)
  console.log(`  SCAN_DELAY_MS = ${SCAN_DELAY_MS}ms`)
})
