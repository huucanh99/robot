<template>

<div class="home">

  <!-- TOP BAR -->
  <div class="top-bar">

    <div class="left">

      <label>手臂 IP</label>
      <input type="text" v-model="robotIP"/>

      <button class="connect-btn" @click="connectRobot">{{ isConnected ? "斷線" : "連線" }}</button>

      <div class="divider"></div>

      <label>配方</label>

      <select>
        <option
          v-for="recipe in recipes"
          :key="recipe.id"
          :value="recipe.id"
        >
          {{recipe.name}}
        </option>
      </select>

    </div>

    <div class="status-box" :class="{ connected: isConnected, disconnected: !isConnected }">
      <div class="status-dot" :class="{ connected: isConnected, disconnected: !isConnected }"></div>
      <span>{{ isConnected ? "已連線" : "未連線" }}</span>
    </div>

  </div>


  <div class="main">
    <div class="main-top">

      <!-- WORKSTATION -->
      <div class="workstation">

        <div class="title-worksation">
          <h4>工作台俯視圖</h4>
        </div>

        <div class="robot-map">

          <!-- COORDINATES -->
          <div class="coordinates-panel">

            <div class="coordinates">

              <div class="coord"><label>X:</label><input :value="pos.x" readonly></div>
              <div class="coord"><label>Y:</label><input :value="pos.y" readonly></div>
              <div class="coord"><label>Z:</label><input :value="pos.z" readonly></div>

              <div class="coord"><label>Rx:</label><input :value="pos.rx" readonly></div>
              <div class="coord"><label>Ry:</label><input :value="pos.ry" readonly></div>
              <div class="coord"><label>Rz:</label><input :value="pos.rz" readonly></div>

            </div>

            <!-- TOGGLE -->
            <div class="toggle">
              <label class="switch">
                <input type="checkbox" v-model="selectMode">
                <span class="slider"></span>
              </label>
            </div>

            <!-- GRIPPER INDICATOR -->
            <div class="gripper-indicator" :class="gripperOpen ? 'g-open' : 'g-closed'">
              <div class="gripper-vis">
                <div class="g-jaw g-left" :class="{ open: gripperOpen }"></div>
                <div class="g-jaw g-right" :class="{ open: gripperOpen }"></div>
              </div>
              <div class="gripper-info">
                <span class="gripper-label">夾爪</span>
                <span class="gripper-state">{{ gripperOpen ? '開啟' : '閉合' }}</span>
                <span v-if="countdown > 0" class="gripper-countdown">{{ countdown }}s</span>
              </div>
            </div>

          </div>


          <!-- WORKSPACE -->
          <div class="workspace">

            <!-- LEFT -->
            <div class="left-area">

              <div class="robot-area">
                <div class="robot-arm">
                  <div class="robot-inner">手臂</div>
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">載盤 1</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray1-'+n"
                    class="tray-cell"
                    :class="cellClass('tray1', n)"
                    @click="toggleCell('tray1',n)"
                  >
                    <span v-if="orders.tray1[n]" class="order-number">
                      {{ orders.tray1[n] }}
                    </span>
                  </div>
                </div>
              </div>

            </div>


            <!-- MIDDLE -->
            <div class="middle-area">

              <div class="tray">
                <div class="tray-title">載盤 4</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray4-'+n"
                    class="tray-cell"
                    :class="cellClass('tray4', n)"
                    @click="toggleCell('tray4',n)"
                  >
                    <span v-if="orders.tray4[n]" class="order-number">
                      {{ orders.tray4[n] }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">載盤 2</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray2-'+n"
                    class="tray-cell"
                    :class="cellClass('tray2', n)"
                    @click="toggleCell('tray2',n)"
                  >
                    <span v-if="orders.tray2[n]" class="order-number">
                      {{ orders.tray2[n] }}
                    </span>
                  </div>
                </div>
              </div>

            </div>


            <!-- RIGHT -->
            <div class="right-area">

              <div class="tray">
                <div class="tray-title">載盤 6</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray6-'+n"
                    class="tray-cell"
                    :class="cellClass('tray6', n)"
                    @click="toggleCell('tray6',n)"
                  >
                    <span v-if="orders.tray6[n]" class="order-number">
                      {{ orders.tray6[n] }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">載盤 5</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray5-'+n"
                    class="tray-cell"
                    :class="cellClass('tray5', n)"
                    @click="toggleCell('tray5',n)"
                  >
                    <span v-if="orders.tray5[n]" class="order-number">
                      {{ orders.tray5[n] }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">載盤 3</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray3-'+n"
                    class="tray-cell"
                    :class="cellClass('tray3', n)"
                    @click="toggleCell('tray3',n)"
                  >
                    <span v-if="orders.tray3[n]" class="order-number">
                      {{ orders.tray3[n] }}
                    </span>
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

      <!-- RIGHT PANEL -->
      <div class="right-panel">

        <!-- CAMERA PANEL -->
        <div class="camera-panel">

          <div class="camera-title">
            即時影像
          </div>

          <div class="camera-view">

            <div v-if="capturing" class="scan-progress">
              取樣中... {{ capturedImages.filter(x => x).length }} / 6
            </div>

            <div class="image-grid">
              <div class="image-slot" style="position:relative">

                <canvas ref="camCanvas" v-show="capturedImages[0]" style="width:100%;height:100%;object-fit:contain;display:block"></canvas>

                <div v-if="!capturedImages[0]" class="slot-empty">
                  <span>1</span>
                </div>

              </div>
            </div>

          </div>

        </div>


        <!-- CONTROL BUTTONS -->
        <div class="controls">

          <button class="btn sample" @click="captureImage" :disabled="capturing">取樣</button>

          <button class="btn start" @click="startRun" :disabled="isRunning && !isPaused">
            {{ isPaused ? '繼續' : '開始' }}
          </button>

          <button class="btn pause" @click="pauseRun" :disabled="!isRunning || isPaused">暫停</button>

          <button class="btn stop" @click="stopRun">停止 / 重置</button>

        </div>

      </div>
    </div>

    <div class="status-panel">
      <div class="status-title">
        錯誤 / 狀態訊息
      </div>
      <div class="status-content">
        <div
          v-for="(msg, i) in statusLog"
          :key="i"
          class="status-line"
          :class="msg.type"
        >{{ msg.text }}</div>
      </div>
    </div>
  </div>

</div>

</template>


<script>

// ======= GIỮ NGUYÊN TOÀN BỘ PHẦN TRÊN =======
const TRAY_BASE = {
  tray1: { x: 500, y: 250 },
  tray2: { x: 200, y: 280 },
  tray3: { x: 200, y: 410 },
  tray4: { x: 350, y: 150 },
  tray5: { x: 350, y: 280 },
  tray6: { x: 350, y: 410 },
}
const CELL_SPACING_X = 50
const CELL_SPACING_Y = 50
const FIXED_Z  = 200
const FIXED_RX = 180
const FIXED_RY = 0
const FIXED_RZ = 0

const POS_INSPECT = { label: "inspect", x: 275, y:   0, z: 400, rx: 180, ry: 0, rz: 0 }
const POS_STANDBY = { label: "standby", x:   0, y: 300, z: 500, rx: 180, ry: 0, rz: 0 }
const LOWER_MM    = 80

function lower(pt) { return { ...pt, z: pt.z - LOWER_MM, label: pt.label + '-down' } }
function lift(pt)  { return { ...pt, label: pt.label + '-up' } }

const POS_SCAN_1 = { label: "scan-1", x: 200, y: 150, z: 300, rx: 180, ry: 0, rz: 0 }

// 👉 CHỈ 1 TRAY
const SCAN_POSITIONS = [ POS_SCAN_1 ]

function getCellCoords(tray, cell) {
  const base = TRAY_BASE[tray]
  const n   = parseInt(cell) - 1
  const col = n % 4               // 0→3, trái→phải
  const row = Math.floor(n / 4)   // 0→4, trên→dưới
  return {
    x: base.x - row * CELL_SPACING_X,   // rows đi theo -X (xa robot hơn)
    y: base.y - col * CELL_SPACING_Y,   // columns đi theo -Y (phải = giảm Y)
    z: FIXED_Z,
    rx: FIXED_RX,
    ry: FIXED_RY,
    rz: FIXED_RZ,
  }
}

export default {

data(){
  return {
    recipes: [],
    robotIP: "",
    isConnected: false,
    selectMode: false,
    currentOrder: 1,
    statusLog: [],
    orders: {
      tray1:{}, tray2:{}, tray3:{},
      tray4:{}, tray5:{}, tray6:{}
    },
    pos: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    posTimer: null,
    runningLabel: null,
    processingLabel: null,
    doneLabels: [],
    capturedImages: [null],
    capturing: false,
    gripperOpen: true,
    countdown: 0,
    isRunning: false,
    isPaused: false,

    // 🔥 THÊM AI
    occupiedCells: {
      tray1:[], tray2:[], tray3:[],
      tray4:[], tray5:[], tray6:[]
    },
    visionObjects: []
  }
},

mounted(){
  fetch("http://localhost:3000/recipes")
    .then(res => res.json())
    .then(data => { this.recipes = data })
},

methods:{

  log(text, type = "info"){
    this.statusLog.unshift({ text, type })
    if(this.statusLog.length > 50) this.statusLog.pop()
  },

  async connectRobot(){
    if(!this.robotIP){ alert("請輸入機器手臂 IP"); return }
    const action = this.isConnected ? "disconnect" : "connect"

    const res = await fetch(`http://localhost:3000/robot/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: this.robotIP })
    })

    const data = await res.json()

    if(data.success){
      this.isConnected = !this.isConnected

      if(this.isConnected){
        this.log(`已連線到手臂 ${this.robotIP}`, "ok")
        this.posTimer = setInterval(async ()=>{
          const r = await fetch("http://localhost:3000/robot/position")
          const data = await r.json()
          this.pos = data
          if(data.currentLabel    !== undefined) this.runningLabel    = data.currentLabel
          if(data.processingLabel !== undefined) this.processingLabel = data.processingLabel
          if(Array.isArray(data.doneLabels)) this.doneLabels = data.doneLabels
          if(data.gripperOpen !== undefined) this.gripperOpen = data.gripperOpen
          if(data.countdown   !== undefined) this.countdown   = data.countdown
          if(data.running     !== undefined) this.isRunning   = data.running
          if(data.paused      !== undefined) this.isPaused    = data.paused
        },300)
      }else{
        clearInterval(this.posTimer)
        this.log("已斷線", "error")
      }
    } else {
      this.log(`${action === "connect" ? "連線" : "斷線"}失敗: ${data.error || "未知錯誤"}`, "error")
    }
  },

  async captureImage(){

    if(this.capturing) return
    if(!this.isConnected){
      this.log("請先連線機器手臂", "error")
      return
    }

    this.capturing      = true
    this.visionObjects  = []
    this.capturedImages = [null]
    this.log("開始取樣...", "info")

    // 1. Reset data cũ + trigger robot chạy vision node
    await fetch("http://localhost:3000/vision/reset", { method: "POST" })

    const trigRes  = await fetch("http://localhost:3000/vision/trigger", { method: "POST" })
    const trigData = await trigRes.json()
    if(!trigData.success){
      this.log("視覺觸發失敗: " + (trigData.error || ""), "error")
      this.capturing = false
      return
    }
    this.log("已觸發，等待座標...", "info")

    // 2. Poll tọa độ robot gửi về qua TCP port 8765 (tối đa 30s)
    let result = null
    const MAX_WAIT = 30
    for(let i = 0; i < MAX_WAIT * 2; i++){
      await new Promise(r => setTimeout(r, 500))
      const elapsed = Math.floor(i / 2) + 1
      if(elapsed % 5 === 0) this.log(`等待中... ${elapsed}s`, "info")

      const vr = await fetch("http://localhost:3000/vision/latest")
      const d  = await vr.json()
      if(d && d.done){
        result = d
        break
      }
    }

    if(!result){
      this.log(`超時 ${MAX_WAIT}s — 未收到座標資料`, "error")
      this.capturing = false
      return
    }

    this.log(`偵測到 ${result.objects.length} 個物件`, "ok")
    this.visionObjects       = result.objects
    this.occupiedCells.tray1 = result.occupied.tray1 || []

    // 3. Chụp ảnh để hiển thị + vẽ dot
    try {
      const camRes  = await fetch("http://localhost:3000/camera/capture")
      const camData = await camRes.json()
      if(camData.image){
        this.capturedImages[0] = camData.image
        await this.$nextTick()
        this.drawCanvas()
      }
    } catch(_) {}

    this.capturing = false
  },

  drawCanvas(){
    const canvas = this.$refs.camCanvas
    if(!canvas || !this.capturedImages[0]) return

    const img = new Image()
    img.onload = () => {
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight

      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      for(const obj of this.visionObjects){
        const radius = obj.r > 0 ? obj.r : 20
        ctx.beginPath()
        ctx.arc(obj.x, obj.y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = '#ff2200'
        ctx.lineWidth   = 4
        ctx.stroke()
        ctx.fillStyle = 'rgba(255, 34, 0, 0.25)'
        ctx.fill()
      }
    }
    img.src = this.capturedImages[0]
  },

  async startRun(){
    if(!this.isConnected){
      this.log("請先連線機器手臂", "error")
      return
    }

    // Resume nếu đang tạm dừng
    if(this.isPaused){
      const res = await fetch("http://localhost:3000/robot/resume", { method: "POST" })
      const data = await res.json()
      if(data.success) this.log("繼續執行", "ok")
      else this.log("繼續失敗: " + (data.error || ""), "error")
      return
    }

    // Build point list từ orders, sort theo thứ tự đã chọn
    const points = []
    for(const [tray, cells] of Object.entries(this.orders)){
      for(const [n, orderNum] of Object.entries(cells)){
        const coords = getCellCoords(tray, n)
        points.push({ ...coords, label: `${tray}-${n}`, _order: orderNum })
      }
    }

    if(points.length === 0){
      this.log("請先選擇格位", "error")
      return
    }

    points.sort((a, b) => a._order - b._order)
    const payload = points.map(({ _order, ...p }) => p)

    this.log(`開始執行 ${payload.length} 個格位...`, "info")
    this.doneLabels  = []
    this.runningLabel = null

    const res = await fetch("http://localhost:3000/robot/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: payload, speed: 30 })
    })

    const data = await res.json()
    if(data.success){
      this.log("執行完成 ✓", "ok")
    } else {
      this.log("執行失敗: " + (data.error || ""), "error")
    }
  },

  async pauseRun(){
    const res = await fetch("http://localhost:3000/robot/pause", { method: "POST" })
    const data = await res.json()
    if(data.success) this.log("已暫停 — 按開始繼續", "info")
    else this.log("暫停失敗: " + (data.error || ""), "error")
  },

  async stopRun(){
    await fetch("http://localhost:3000/robot/stop", { method: "POST" })
    this.isPaused    = false
    this.isRunning   = false
    this.doneLabels  = []
    this.runningLabel    = null
    this.processingLabel = null
    this.log("已停止並重置", "error")
  },

  toggleCell(tray, n){
    if(!this.selectMode) return
    if(this.orders[tray][n]){
      delete this.orders[tray][n]
      this._renumberOrders()
    } else {
      if(!(this.occupiedCells[tray] || []).includes(n)) return
      this.orders[tray][n] = this.currentOrder++
    }
  },

  _renumberOrders(){
    const all = []
    for(const [tray, cells] of Object.entries(this.orders)){
      for(const [n, order] of Object.entries(cells)){
        all.push({ tray, n, order })
      }
    }
    all.sort((a, b) => a.order - b.order)
    all.forEach((item, idx) => {
      this.orders[item.tray][item.n] = idx + 1
    })
    this.currentOrder = all.length + 1
  },

  // 🔥 FIX highlight
  cellClass(tray, n){
    const label = `${tray}-${n}`

    if(this.doneLabels.includes(label))   return { active: true, done: true }
    if(this.processingLabel === label)    return { active: true, running: true }
    if(this.runningLabel === label)       return { active: true, running: true }
    if(this.orders[tray][n])             return { active: true }

    if((this.occupiedCells[tray] || []).includes(n))
      return { occupied: true }

    return {}
  }

}

}
</script>



<style scoped>

/* TOP BAR */

.top-bar{
 display:flex;
 justify-content:space-between;
 align-items:center;
 border-bottom:1px solid #dcdcdc;
 font-size:14px;
 padding:10px 0;
}

.left{
 display:flex;
 align-items:center;
 gap:6px;
 padding-left:25px;
}

.top-bar input{
 padding:9px 10px;
 border:1px solid #ccc;
}

.connect-btn{
 background:#1e6bd6;
 color:white;
 border:none;
 padding:9px 25px;
 cursor:pointer;
}

.divider{
 width:1px;
 height:35px;
 background:#ccc;
 margin:0 10px;
}

.top-bar select{
 padding:9px 15px;
 margin-left:10px;
}


/* STATUS */

.status-box{
 display:flex;
 align-items:center;
 gap:8px;
 padding:5px 12px;
 margin-right:15px;
 border:2px solid #999;
 background:#eeeeee;
}

.status-box span{
 color:#777;
}

.status-box.connected{
 border:2px solid rgb(26,127,55);
 background:rgb(218,251,225);
}

.status-box.connected span{
 color:rgb(26,127,55);
}

.status-dot{
 width:12px;
 height:12px;
 border-radius:50%;
 border:2px solid black;
 background:#bfbfbf;
}

.status-dot.connected{
 background:#2ecc71;
}


/* MAIN */

.main{
 display:flex;
 flex-direction:column;
 gap:15px;
 padding-top:20px;
 margin-left:10px;
}

.main-top{
 display:flex;
 gap:20px;
}

.status-panel{
 border:1px solid #bfc7cf;
 background:#eef1f4;
}

.status-title{
 padding:10px;
 text-align:center;
 border-bottom:1px solid #bfc7cf;
 background:#dfe3e8;
 color:#6b7785;
}

.status-content{
 height:160px;
 background:#f7f9fb;
 overflow-y:auto;
 padding:6px 10px;
 display:flex;
 flex-direction:column;
 gap:3px;
}

.status-line{
 font-size:12px;
 font-family:monospace;
 color:#444;
}

.status-line.ok{ color:#2a9d2a; }
.status-line.error{ color:#d61e2c; }

/* WORKSTATION */

.workstation{
 border:1px solid #ccc;
 width: 37%;
}

.title-worksation h4{
 padding:5px 20px;
 margin:0;
 border-bottom:1px solid #ccc;
 background:#f2f4f7;
 font-weight:500;
}

.robot-map{
 margin:8px 15px 10px 15px;
 padding:10px;
 border:1px solid #ccc;
 background:#e9edf2;
}


/* COORDINATES */

.coordinates-panel{
 position:relative;
 padding-top:10px;
 padding-left: 15px;
}

.coordinates{
 display:grid;
 grid-template-columns:repeat(3,1fr);
 gap:5px;
 padding-bottom:7px;
 width: 100px;
}

.coord{
 display:grid;
 grid-template-columns:30px 1fr;
 align-items:center;
}

.coordinates input{
 width:90px;
 padding: 2px 3px;
 border-radius:5px;
}

.toggle{
 position:absolute;
 top:0;
 right:0;
}


/* GRIPPER INDICATOR */

.gripper-indicator{
 display:flex;
 align-items:center;
 gap:10px;
 margin-top:10px;
 padding:6px 10px;
 border:1px solid #ccc;
 background:#f5f5f5;
 width:fit-content;
 border-radius:4px;
}

.gripper-indicator.g-open{
 border-color:#2a9d2a;
 background:#eafaea;
}

.gripper-indicator.g-closed{
 border-color:#c28b00;
 background:#fff8e1;
}

.gripper-vis{
 display:flex;
 align-items:center;
 gap:3px;
 height:22px;
}

.g-jaw{
 width:7px;
 height:22px;
 background:#666;
 border-radius:2px;
 transition:transform 0.3s;
}

.g-left{ transform:translateX(4px); }
.g-right{ transform:translateX(-4px); }
.g-left.open{ transform:translateX(-3px); }
.g-right.open{ transform:translateX(3px); }

.gripper-info{
 display:flex;
 flex-direction:column;
 line-height:1.3;
}

.gripper-label{
 font-size:10px;
 color:#888;
}

.gripper-state{
 font-size:12px;
 font-weight:700;
 color:#333;
}

.gripper-countdown{
 font-size:11px;
 color:#1e6bd6;
 font-weight:600;
}


/* TOGGLE SWITCH */

.switch{
 position:relative;
 display:inline-block;
 width:40px;
 height:20px;
}

.switch input{
 opacity:0;
 width:0;
 height:0;
}

.slider{
 position:absolute;
 cursor:pointer;
 top:0;
 left:0;
 right:0;
 bottom:0;
 background:#ccc;
 border-radius:20px;
 transition:0.3s;
}

.slider:before{
 position:absolute;
 content:"";
 height:16px;
 width:16px;
 left:2px;
 bottom:2px;
 background:white;
 border-radius:50%;
 transition:0.3s;
}

input:checked + .slider{
 background:#2ecc71;
}

input:checked + .slider:before{
 transform:translateX(20px);
}


/* WORKSPACE */

.workspace{
 display:flex;
 gap:20px;
 padding-left: 18px;
 padding-top: 10px;
}

.left-area{
 display:flex;
 flex-direction:column;
 justify-content:space-between;
}

.middle-area{
 display:flex;
 flex-direction:column;
 gap:8px;
 justify-content:flex-end;
}

.right-area{
 display:flex;
 flex-direction:column;
 gap:8px;
}


/* ROBOT */

.robot-area{
 display:flex;
}

.robot-arm{
 width:130px;
 height:130px;
 border-radius:50%;
 border:6px solid #9aa3ad;
 display:flex;
 align-items:center;
 justify-content:center;
}

.robot-inner{
 width:70px;
 height:70px;
 border-radius:50%;
 border:3px solid #9aa3ad;
 background:white;
 display:flex;
 align-items:center;
 justify-content:center;
}


/* TRAY */

.tray{
  width: 160px;
  border: 2.5px solid #b8c1cc;
  background: white;
  padding: 4px 1px;
}

.tray-title{
 color:#1e6bd6;
 font-weight:600;
 margin-bottom:5px;
 padding-left: 10px;
}

.tray-grid{
 display:grid;
 grid-template-columns:repeat(4,1fr);
 gap:3px;
 justify-items:center;
}

.tray-cell{
 width:16px;
 height:16px;
 border-radius:50%;
 border:2px solid #8a94a1;
 cursor:pointer;
 position:relative;
 background:white;
}

.tray-cell.active{
 background:#ffd84d;
 border-color:#d4a300;
}

.tray-cell.running{
 background:#2ecc71;
 border-color:#27ae60;
}

.tray-cell.done{
 background:#3498db;
 border-color:#2980b9;
}

.order-number{
 position:absolute;
 top:50%;
 left:50%;
 transform:translate(-50%, -50%);
 font-size:8px;
 font-weight:bold;
 color:#333;
 line-height:1;
}


/* RIGHT PANEL */

.right-panel{
 width:60%;
}


/* CAMERA PANEL */

.camera-panel{
 border:1px solid #bfc7cf;
 background:#eef1f4;
}

.camera-title{
 padding:5px 15px;
 border-bottom:1px solid #bfc7cf;
 font-weight:600;
 background:#dfe3e8;
}

.camera-view{
 position:relative;
 background:#d5d9de;
 border:4px solid #fff;
 padding:6px;
}

.scan-progress{
 text-align:center;
 padding:6px;
 font-size:13px;
 color:#1e6bd6;
 font-weight:600;
}

.image-grid{
 display:grid;
 grid-template-columns:repeat(3,1fr);
 gap:6px;
}

.image-slot{
 aspect-ratio:4/3;
 background:#b8c1cc;
 border:2px solid #9aa3ad;
 overflow:hidden;
 display:flex;
 align-items:center;
 justify-content:center;
}

.slot-img{
 width:100%;
 height:100%;
 object-fit:cover;
}

.slot-empty{
 font-size:28px;
 font-weight:700;
 color:#7a8591;
}


/* CONTROL BUTTONS */

.controls{
 display:flex;
 gap:15px;
 margin-top:15px;
}

.btn{
 flex:1;
 padding:18px;
 font-size:18px;
 font-weight:500;
 border:none;
 color:white;
 cursor:pointer;
}

.sample{
 background:#4c74b9;
}

.start{
 background:#2fa14f;
}

.pause{
 background:#c28b00;
}

.stop{
 background:#d61e2c;
}
.tray-cell.occupied{
  background:#555;
  border-color:#333;
}
</style>