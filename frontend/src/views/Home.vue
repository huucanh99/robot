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

              <div class="coord"><label>X:</label><input value="0.000"></div>
              <div class="coord"><label>Y:</label><input value="0.000"></div>
              <div class="coord"><label>Z:</label><input value="0.000"></div>

              <div class="coord"><label>J1:</label><input value="0.000"></div>
              <div class="coord"><label>J2:</label><input value="0.000"></div>
              <div class="coord"><label>J3:</label><input value="0.000"></div>

            </div>

            <!-- TOGGLE -->
            <div class="toggle">
              <label class="switch">
                <input type="checkbox" v-model="selectMode">
                <span class="slider"></span>
              </label>
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
                    :class="{active: orders.tray1[n]}"
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
                    :class="{active: orders.tray4[n]}"
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
                    :class="{active: orders.tray2[n]}"
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
                    :class="{active: orders.tray6[n]}"
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
                    :class="{active: orders.tray5[n]}"
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
                    :class="{active: orders.tray3[n]}"
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

            <!-- vertical -->
            <div class="line v1"></div>

            <!-- horizontal -->
            <div class="line h1"></div>
            <div class="line h2"></div>

          </div>

        </div>


        <!-- CONTROL BUTTONS -->
        <div class="controls">

          <button class="btn sample">取樣</button>

          <button class="btn start" @click="startRun">開始</button>

          <button class="btn pause" @click="pauseRun">暫停</button>

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
// Tọa độ gốc mỗi tray (dummy — điều chỉnh sau)
const TRAY_BASE = {
  tray1: { x: 200, y:   0 },
  tray2: { x: 200, y: 200 },
  tray3: { x: 200, y: 400 },
  tray4: { x: 400, y: 100 },
  tray5: { x: 400, y: 300 },
  tray6: { x: 400, y: 500 },
}
const CELL_SPACING = 25   // mm
const FIXED_Z      = 300
const FIXED_RX     = 180
const FIXED_RY     = 0
const FIXED_RZ     = 90

function getCellCoords(tray, cell) {
  const base = TRAY_BASE[tray]
  const n    = parseInt(cell) - 1
  return {
    x:  base.x + (n % 4) * CELL_SPACING,
    y:  base.y + Math.floor(n / 4) * CELL_SPACING,
    z:  FIXED_Z,
    rx: FIXED_RX,
    ry: FIXED_RY,
    rz: FIXED_RZ,
  }
}

export default {

data(){
  return {
    recipes: [],
    robotIP: "192.168.5.1",
    isConnected: false,
    selectMode: false,
    currentOrder: 1,
    statusLog: [],
    orders: {
      tray1:{}, tray2:{}, tray3:{},
      tray4:{}, tray5:{}, tray6:{}
    }
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
    try {
      const res = await fetch(`http://localhost:3000/robot/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: this.robotIP })
      })
      const data = await res.json()
      if(data.success){
        this.isConnected = !this.isConnected
        this.log(this.isConnected ? `已連線 ${this.robotIP}` : "已斷線", this.isConnected ? "ok" : "info")
      } else {
        this.log(`連線失敗：${data.error}`, "error")
      }
    } catch(e) {
      this.log(`連線失敗：${e.message}`, "error")
    }
  },

  async startRun(){
    // 收集所有已選格，依 order 排序
    let allSelected = []
    for(const trayName in this.orders){
      for(const cellIndex in this.orders[trayName]){
        allSelected.push({
          tray: trayName,
          cell: cellIndex,
          order: this.orders[trayName][cellIndex]
        })
      }
    }
    if(allSelected.length === 0){
      this.log("請先開啟 Toggle 並選取格子", "error")
      return
    }
    allSelected.sort((a, b) => a.order - b.order)

    // 對應座標
    const points = allSelected.map(item => ({
      label: `${item.tray}-${item.cell}`,
      ...getCellCoords(item.tray, item.cell)
    }))

    this.log(`開始執行 ${points.length} 個點位...`, "info")
    try {
      const res = await fetch("http://localhost:3000/robot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, speed: 30 })
      })
      const data = await res.json()
      if(data.success){
        this.log("✓ 執行完畢", "ok")
      } else {
        this.log(`執行失敗：${data.error}`, "error")
      }
    } catch(e) {
      this.log(`執行失敗：${e.message}`, "error")
    }
  },

  pauseRun(){
    this.log("暫停（尚未實作）", "info")
  },

  async stopRun(){
    try {
      await fetch("http://localhost:3000/robot/stop", { method: "POST" })
      this.log("已停止", "info")
    } catch(e) {
      this.log(`停止失敗：${e.message}`, "error")
    }
  },

  toggleCell(tray, n){
    if(!this.selectMode) return
    if(this.orders[tray][n]){
      delete this.orders[tray][n]
      this.recalculateOrders()
    } else {
      this.orders[tray][n] = this.currentOrder
      this.currentOrder++
    }
  },

  recalculateOrders(){
    let allSelected = []
    for(const trayName in this.orders){
      for(const cellIndex in this.orders[trayName]){
        allSelected.push({ tray: trayName, cell: cellIndex, order: this.orders[trayName][cellIndex] })
      }
    }
    allSelected.sort((a, b) => a.order - b.order)
    this.currentOrder = 1
    for(const trayName in this.orders){ this.orders[trayName] = {} }
    allSelected.forEach(item => {
      this.orders[item.tray][item.cell] = this.currentOrder
      this.currentOrder++
    })
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
 width: 40%;
}

.title-worksation h4{
 padding:5px 20px;
 margin:0;
 border-bottom:1px solid #ccc;
 background:#f2f4f7;
 font-weight:500;
}

.robot-map{
 margin:5px 10px 8px 10px;
 padding:10px;
 border:1px solid #ccc;
 background:#e9edf2;
}


/* COORDINATES */

.coordinates-panel{
 position:relative;
 padding-top:10px;
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
 width:60px;
 padding: 2px 3px;
 border-radius:5px;
}

.toggle{
 position:absolute;
 top:0;
 right:0;
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
 gap:13px;
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
  width: 150px;
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
 height:482px;
 background:#d5d9de;
 border:4px solid #fff;
}


/* vertical center line */

.v1{
 position:absolute;
 left:50%;
 height:100%;
 border-left:2px dashed #9aa3ad;
}


/* horizontal lines */

.h1{
 position:absolute;
 top:33.33%;
 width:100%;
 border-top:2px dashed #9aa3ad;
}

.h2{
 position:absolute;
 top:66.66%;
 width:100%;
 border-top:2px dashed #9aa3ad;
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

</style>