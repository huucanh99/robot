<template>

<div class="home">

  <!-- CRITICAL ERROR BANNER -->
  <div v-if="criticalError" class="critical-banner">{{ t('criticalBanner') }}</div>

  <!-- ROBOT WARNING BANNER -->
  <div v-if="robotWarning && !criticalError" class="robot-warning-banner" @click="robotWarning = null">{{ t('robotWarningBanner') }} ✕</div>

  <!-- TOAST -->
  <transition name="toast">
    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </transition>

  <!-- VIEWER MODE BANNER -->
  <div v-if="isViewer" class="viewer-banner">{{ t('viewerBanner') }}</div>

  <!-- WAITING RETURN BANNER -->
  <div v-if="waitingReturn" class="inspect-banner">{{ t('waitingReturnBanner') }}</div>

  <!-- TOP BAR -->
  <div class="top-bar">

    <div class="left">

      <label>{{ t('armIp') }}</label>
      <input type="text" v-model="robotIP"/>

      <button class="connect-btn" @click="connectRobot" :disabled="isViewer || isConnecting"
        :title="isConnected ? t('tipDisconnect') : t('tipConnect')">{{ isConnecting ? '...' : isConnected ? t('disconnect') : t('connect') }}</button>

      <button class="viewer-toggle-btn" @click="toggleViewer" :class="{ active: isViewer }"
        :title="isViewer ? t('tipSwitchToControl') : t('tipSwitchToViewer')">
        {{ isViewer ? t('viewerMode') : t('controlMode') }}
      </button>

      <div class="divider"></div>

      <label>{{ t('recipe') }}</label>

      <div class="recipe-apply-row">
        <div class="recipe-dropdown" :class="{ open: recipeDropdownOpen }" v-click-outside="closeRecipeDropdown">
          <button
            type="button"
            class="recipe-dropdown-trigger"
            :disabled="isViewer"
            :title="t('tipRecipeDropdown')"
            @click="recipeDropdownOpen = !recipeDropdownOpen"
          >
            <span>{{ selectedRecipe ? selectedRecipe.name : '—' }}</span>
            <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
          </button>
          <div class="recipe-dropdown-menu" v-if="recipeDropdownOpen">
            <div
              class="recipe-dropdown-item"
              :class="{ selected: selectedRecipeId === null }"
              @click="selectRecipeItem(null)"
            >—</div>
            <div
              v-for="r in recipes"
              :key="r.id"
              class="recipe-dropdown-item"
              :class="{ selected: selectedRecipeId === r.id }"
              @mouseenter="hoveredRecipe = r"
              @mouseleave="hoveredRecipe = null"
              @click="selectRecipeItem(r.id)"
            >
              <span>{{ r.name }}</span>
              <span v-if="appliedRecipeId === r.id" class="recipe-item-dot"></span>
              <div class="recipe-tooltip" v-if="hoveredRecipe && hoveredRecipe.id === r.id">
                <div class="recipe-tooltip-row"><span>Speed</span><strong>{{ r.speed }}%</strong></div>
                <div class="recipe-tooltip-row"><span>Grip</span><strong>{{ r.grip ?? '—' }}</strong></div>
                <div class="recipe-tooltip-row"><span>Open</span><strong>{{ r.open ?? '—' }}</strong></div>
              </div>
            </div>
          </div>
        </div>
        <button
          class="apply-recipe-btn"
          :class="{ applied: appliedRecipeId && appliedRecipeId === selectedRecipeId }"
          :disabled="isViewer || !selectedRecipeId"
          :title="t('tipApplyRecipe')"
          @click="applyRecipe"
        >
          <span class="apply-dot"></span>
        </button>
      </div>

    </div>

    <div class="right-bar">
<div class="lang-switcher">
        <button :class="{ active: lang === 'zh' }" @click="setLang('zh')">简体</button>
        <button :class="{ active: lang === 'en' }" @click="setLang('en')">EN</button>
      </div>
      <button class="reload-btn" @click="() => window.location.reload()" title="Reset dashboard">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </button>
      <div class="robot-status-badge" :class="robotStatus">
        <span class="robot-status-dot"></span>
        <span>{{ t('robotStatus_' + robotStatus) }}</span>
      </div>
      <div class="status-box" :class="{ connected: isConnected, disconnected: !isConnected }">
        <div class="status-dot" :class="{ connected: isConnected, disconnected: !isConnected }"></div>
        <span>{{ isConnected ? t('connected') : t('disconnected') }}</span>
      </div>

      <div class="help-btn-wrap" v-click-outside="() => showHelp = false">
        <button class="help-btn" @click="showHelp = !showHelp" :title="lang === 'zh' ? '使用说明' : 'How to use'">?</button>
        <div class="help-panel" v-if="showHelp">
          <div class="help-title">{{ lang === 'zh' ? '操作步骤' : 'How to use' }}</div>
          <div class="help-step" v-for="(step, i) in helpSteps" :key="i">
            <span class="help-num">{{ i + 1 }}</span>
            <span class="help-text" v-html="step"></span>
          </div>
        </div>
      </div>
    </div>

  </div>


  <div class="main">
    <div class="main-top">

      <!-- WORKSTATION -->
      <div class="workstation">

        <div class="title-worksation">
          <h4>{{ t('workstation') }}</h4>
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
              <label class="switch" :title="t('tipSelectMode')">
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
                <span class="gripper-label">{{ t('gripper') }}</span>
                <span class="gripper-state">{{ gripperOpen ? t('gripperOpen') : t('gripperClosed') }}</span>
                <span v-if="waitingReturn" class="gripper-countdown">{{ t('atStation') }}</span>
              </div>
            </div>

          </div>


          <!-- WORKSPACE -->
          <div class="workspace">

            <!-- LEFT -->
            <div class="left-area">

              <div class="robot-area">
                <div class="robot-arm">
                  <div class="robot-inner">{{ t('arm') }}</div>
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">{{ t('tray') }} 1</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray1-'+n"
                    class="tray-cell"
                    :class="cellClass('tray1', n)"
                    :title="cellTitle('tray1', n)"
                    @click="!isViewer && toggleCell('tray1',n)"
                  >
                    <span class="cell-num">{{ n }}</span>
                    <span v-if="orders.tray1[n]" class="order-number">{{ orders.tray1[n] }}</span>
                  </div>
                </div>
              </div>

            </div>


            <!-- MIDDLE -->
            <div class="middle-area">

              <div class="tray">
                <div class="tray-title">{{ t('tray') }} 4</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray4-'+n"
                    class="tray-cell"
                    :class="cellClass('tray4', n)"
                    :title="cellTitle('tray4', n)"
                    @click="!isViewer && toggleCell('tray4',n)"
                  >
                    <span class="cell-num">{{ n }}</span>
                    <span v-if="orders.tray4[n]" class="order-number">{{ orders.tray4[n] }}</span>
                  </div>
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">{{ t('tray') }} 2</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray2-'+n"
                    class="tray-cell"
                    :class="cellClass('tray2', n)"
                    :title="cellTitle('tray2', n)"
                    @click="!isViewer && toggleCell('tray2',n)"
                  >
                    <span class="cell-num">{{ n }}</span>
                    <span v-if="orders.tray2[n]" class="order-number">{{ orders.tray2[n] }}</span>
                  </div>
                </div>
              </div>

            </div>


            <!-- RIGHT -->
            <div class="right-area">

              <div class="tray">
                <div class="tray-title">{{ t('tray') }} 6</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray6-'+n"
                    class="tray-cell"
                    :class="cellClass('tray6', n)"
                    :title="cellTitle('tray6', n)"
                    @click="!isViewer && toggleCell('tray6',n)"
                  >
                    <span class="cell-num">{{ n }}</span>
                    <span v-if="orders.tray6[n]" class="order-number">{{ orders.tray6[n] }}</span>
                  </div>
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">{{ t('tray') }} 5</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray5-'+n"
                    class="tray-cell"
                    :class="cellClass('tray5', n)"
                    :title="cellTitle('tray5', n)"
                    @click="!isViewer && toggleCell('tray5',n)"
                  >
                    <span class="cell-num">{{ n }}</span>
                    <span v-if="orders.tray5[n]" class="order-number">{{ orders.tray5[n] }}</span>
                  </div>
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">{{ t('tray') }} 3</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray3-'+n"
                    class="tray-cell"
                    :class="cellClass('tray3', n)"
                    :title="cellTitle('tray3', n)"
                    @click="!isViewer && toggleCell('tray3',n)"
                  >
                    <span class="cell-num">{{ n }}</span>
                    <span v-if="orders.tray3[n]" class="order-number">{{ orders.tray3[n] }}</span>
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
            {{ t('liveView') }}
          </div>

          <div class="camera-view">

            <div v-if="capturing" class="scan-progress">
              {{ t('scanning') }} {{ capturedImages.filter(x => x).length }} / 6
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
        <div class="controls" v-if="!isViewer">

          <button class="btn sample" @click="captureImage" :disabled="capturing" :title="t('tipCapture')">{{ t('capture') }}</button>

          <button class="btn start" @click="startRun"
            :disabled="isRunning || waitingReturn"
            :title="isPaused ? t('tipResume') : t('tipStart')">
            {{ isPaused ? t('resume') : t('start') }}
          </button>

          <button class="btn return" @click="returnRun"
            :disabled="isRunning || !waitingReturn"
            :title="t('tipReturn')">
            {{ t('returnBtn') }}
          </button>

          <button class="btn pause" @click="pauseRun" :disabled="!isRunning || isPaused || waitingReturn" :title="t('tipPause')">{{ t('pause') }}</button>

          <button class="btn stop" @click="stopRun" :title="t('tipStop')">{{ t('stop') }}</button>

          <button class="btn go-home" @click="goHome" :disabled="isRunning" :title="t('tipHome')">{{ t('homeBtn') }}</button>

        </div>

      </div>
    </div>

    <div class="status-panel">
      <div class="status-title">
        {{ t('statusTitle') }}
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

// 4 góc tray 1 — tọa độ robot đo thực tế (camera TCP, cùng approach height)
const TRAY1_CORNERS = {
  tl: { x: 565, y: 272 },  // cell 1  (col=0, row=0)
  tr: { x: 561, y: 153 },  // cell 4  (col=3, row=0)
  bl: { x: 457, y: 274 },  // cell 17 (col=0, row=4)
  br: { x: 447, y: 156 },  // cell 20 (col=3, row=4)
}

function getCellCoords(tray, cell) {
  const cellNum = parseInt(cell)
  const col = (cellNum - 1) % 4
  const row = Math.floor((cellNum - 1) / 4)

  if (tray === 'tray1') {
    const s = col / 3
    const t = row / 4
    const { tl, tr, bl, br } = TRAY1_CORNERS
    const x = (1-s)*(1-t)*tl.x + s*(1-t)*tr.x + (1-s)*t*bl.x + s*t*br.x
    const y = (1-s)*(1-t)*tl.y + s*(1-t)*tr.y + (1-s)*t*bl.y + s*t*br.y
    return { x: +x.toFixed(2), y: +y.toFixed(2), z: 80, rx: 180, ry: 0, rz: 90 }
  }

  // Trays chưa calibrate — placeholder
  const TRAY_BASE = {
    tray2: { x: 200, y: 280 }, tray3: { x: 200, y: 410 },
    tray4: { x: 350, y: 150 }, tray5: { x: 350, y: 280 }, tray6: { x: 350, y: 410 },
  }
  const base = TRAY_BASE[tray] || { x: 300, y: 300 }
  return { x: base.x - row * 50, y: base.y - col * 50 }
}

import { useLangStore } from '../stores/lang'
import { mapState } from 'pinia'

export default {

computed: {
  ...mapState(useLangStore, ['lang', 'isViewer']),
  apiBase() { return `http://${window.location.hostname}:3000` },
  selectedRecipe() { return this.recipes.find(r => r.id === this.selectedRecipeId) || null },
  robotStatus() {
    if (!this.isConnected)    return 'idle'
    if (this.waitingReturn)   return 'waiting_return'
    if (this.isPaused)        return 'paused'
    if (this.isRunning)       return 'running'
    return 'ready'
  },
  helpSteps() {
    return this.lang === 'zh' ? [
      '输入机械臂 <b>IP 地址</b>，点击 <b>连线</b>',
      '在配方列表选一个配方，点击 <b>●</b> 套用',
      '点击 <b>取样</b> 触发视觉扫描<br><small>或开启切换开关手动点选格位</small>',
      '点击 <b>开始</b> 执行任务',
      '执行中可点 <b>暂停</b> 或 <b>停止</b>',
      '到达检测站时系统自动等待，<br><small>到时自动继续，或由外部呼叫 /continue</small>',
    ] : [
      'Enter the arm <b>IP address</b>, click <b>Connect</b>',
      'Choose a recipe from the list, click <b>●</b> to apply',
      'Click <b>Scan</b> to run vision detection<br><small>or toggle the switch to select cells manually</small>',
      'Click <b>Start</b> to run the task',
      'During run: use <b>Pause</b> or <b>Stop</b> as needed',
      'At the inspection station the robot waits automatically,<br><small>auto-continues after timeout, or call /continue from outside</small>',
    ]
  },
},

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
    camTimer: null,
    selectedRecipeId: null,
    appliedRecipeId: null,
    _lastPolledRecipeId: undefined,
    recipeDropdownOpen: false,
    hoveredRecipe: null,
    isConnecting: false,
    criticalError: null,
    robotWarning: null,
    toast: { visible: false, message: '', type: 'ok' },
    runningLabel: null,
    processingLabel: null,
    doneLabels: [],
    capturedImages: [null],
    capturing: false,
    gripperOpen: true,
    isRunning: false,
    isPaused: false,
    waitingReturn: false,
    currentPointIndex: 0,
    totalPoints: 0,

    occupiedCells: {
      tray1:[], tray2:[], tray3:[],
      tray4:[], tray5:[], tray6:[]
    },
    visionObjects: [],
    visionRobotPoints: [],
    visionCalibrated: false,
    showHelp: false,
  }
},

activated(){
  this.$nextTick(() => this.drawCanvas())
},

beforeUnmount(){
  clearInterval(this.posTimer)
  clearInterval(this.camTimer)
},

mounted(){
  fetch(`${this.apiBase}/recipes`)
    .then(res => res.json())
    .then(data => { this.recipes = data })


  this.posTimer = setInterval(async () => {
    try {
      const r = await fetch(`${this.apiBase}/robot/position`)
      const data = await r.json()
      if(data.serverStart){
        if(!this._serverStart) this._serverStart = data.serverStart
        else if(this._serverStart !== data.serverStart) { window.location.reload(); return }
      }
      this.pos = data
      const wasConnected = this.isConnected
      this.isConnected = !!data.connected
      if(wasConnected && !this.isConnected) this.showToast(this.t('toastDisconnected'), 'error')
      if(data.robotIp && !this.robotIP) this.robotIP = data.robotIp
      if(data.currentLabel      !== undefined) this.runningLabel      = data.currentLabel
      if(data.processingLabel   !== undefined) this.processingLabel   = data.processingLabel
      if(Array.isArray(data.doneLabels))       this.doneLabels        = data.doneLabels
      if(data.gripperOpen       !== undefined) this.gripperOpen       = data.gripperOpen
      if(data.running           !== undefined) this.isRunning         = data.running
      if(data.paused            !== undefined) this.isPaused          = data.paused
      if(data.waitingReturn     !== undefined) this.waitingReturn     = data.waitingReturn
      if(data.currentPointIndex !== undefined) this.currentPointIndex = data.currentPointIndex
      if(data.totalPoints       !== undefined) this.totalPoints       = data.totalPoints
      if(data.criticalError !== undefined) this.criticalError = data.criticalError
      if(data.robotWarning  !== undefined) this.robotWarning  = data.robotWarning
      if(data.currentRecipeId !== undefined) {
        if(data.currentRecipeId !== this._lastPolledRecipeId) {
          this.selectedRecipeId    = data.currentRecipeId
          this._lastPolledRecipeId = data.currentRecipeId
        }
        this.appliedRecipeId = data.currentRecipeId
      }
      if(data.running && Array.isArray(data.currentPoints)){
        const orders = { tray1:{}, tray2:{}, tray3:{}, tray4:{}, tray5:{}, tray6:{} }
        data.currentPoints.forEach((pt, i) => {
          const m = pt.label && pt.label.match(/^(tray\d+)-(\d+)$/)
          if(m) orders[m[1]][m[2]] = i + 1
        })
        this.orders = orders
      }

      const vr = await fetch(`${this.apiBase}/vision/latest`)
      const vd = await vr.json()
      if(vd){
        this.visionObjects = vd.objects || []
        if(vd.occupied) this.occupiedCells.tray1 = vd.occupied.tray1 || []
        this.visionRobotPoints = vd.robotPoints || []
        this.visionCalibrated  = vd.calibrated  || false
        this.drawCanvas()
      }

      if(data.sessionId){
        if(!this._sessionId) this._sessionId = data.sessionId
        else if(this._sessionId !== data.sessionId) {
          this._sessionId = data.sessionId
          await this.clearDashboard()
        }
      }
    } catch(e) {}
  }, 300)

  this.camTimer = setInterval(async () => {
    try {
      const camRes = await fetch(`${this.apiBase}/camera/latest`)
      const camData = await camRes.json()
      if(camData.image && camData.image !== this.capturedImages[0]){
        this.capturedImages[0] = camData.image
        this._origWidth  = camData.origWidth  || 0
        this._origHeight = camData.origHeight || 0
        this._cachedImg  = null
        await this.$nextTick()
        this.drawCanvas()
      } else if(!camData.image && this.capturedImages[0]){
        this.capturedImages[0] = null
        this._cachedImg = null
        const canvas = this.$refs.camCanvas
        if(canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
      }
    } catch(e) {}
  }, 2000)
},

methods:{

  t(key) { return useLangStore().t(key) },

  setLang(l) { useLangStore().setLang(l) },
  selectRecipeItem(id) {
    this.selectedRecipeId  = id
    this.appliedRecipeId   = null
    this.recipeDropdownOpen = false
    this.hoveredRecipe     = null
  },
  closeRecipeDropdown() { this.recipeDropdownOpen = false; this.hoveredRecipe = null },
  async applyRecipe() {
    if (!this.selectedRecipeId) return
    try {
      const res = await fetch(`${this.apiBase}/recipe/current`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: this.selectedRecipeId })
      })
      if (res.ok) {
        this.appliedRecipeId = this.selectedRecipeId
        this.logKey('logRecipeApplied', [this.selectedRecipe?.name], 'ok')
        this.showToast(this.t('toastRecipeApplied')(this.selectedRecipe?.name), 'ok')
      } else {
        this.logKey('logRecipeFail', [res.status], 'error')
      }
    } catch(e) {
      this.logKey('logRecipeFail', [e.message], 'error')
    }
  },

  toggleViewer() {
    const store = useLangStore()
    store.isViewer = !store.isViewer
    localStorage.setItem('isViewer', store.isViewer)
  },

  log(text, type = "info"){
    this.statusLog.unshift({ text, type })
    if(this.statusLog.length > 50) this.statusLog.pop()
  },

  showToast(message, type = 'ok') {
    this.toast = { visible: true, message, type }
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => { this.toast.visible = false }, 3000)
  },

  logKey(key, params = [], type = "info") {
    const val = this.t(key)
    const text = typeof val === 'function' ? val(...params) : val
    this.log(text, type)
    fetch(`${this.apiBase}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, params, level: type })
    }).catch(() => {})
  },

  async connectRobot(){
    if(!this.robotIP){ alert(this.t('alertIp')); return }
    if(this.isConnecting) return
    const action = this.isConnected ? "disconnect" : "connect"
    if(action === 'disconnect') {
      const msg = this.isRunning ? this.t('confirmDisconnectRunning') : this.t('confirmDisconnect')
      if(!confirm(msg)) return
    }
    this.isConnecting = true

    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 70000)
    let data
    try {
      const res = await fetch(`${this.apiBase}/robot/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: this.robotIP }),
        signal: abort.signal,
      })
      data = await res.json()
    } catch(e) {
      data = { success: false, error: e.name === 'AbortError' ? 'Timeout' : e.message }
    } finally {
      clearTimeout(timer)
      this.isConnecting = false
    }

    if(data.success){
      if(action === 'connect'){
        this.logKey('logConnected', [this.robotIP], "ok")
        this.showToast(this.t('toastConnected'), 'ok')
      }else{
        this.logKey('logDisconnected', [], "error")
        this.showToast(this.t('toastDisconnected'), 'error')
      }
    } else {
      this.logKey('logConnFail', [action, data.error || ""], "error")
    }
  },

  async captureImage(){

    if(this.capturing) return
    if(!this.isConnected){
      this.logKey('logNeedConnect', [], "error")
      return
    }

    await this.clearDashboard()

    this.capturing      = true
    this.visionObjects  = []
    this.capturedImages = [null]
    this.logKey('logStartScan', [], "info")

    // 1. Reset data cũ + trigger robot chạy vision node
    await fetch(`${this.apiBase}/vision/reset`, { method: "POST" })

    const trigRes  = await fetch(`${this.apiBase}/vision/trigger`, { method: "POST" })
    const trigData = await trigRes.json()
    if(!trigData.success){
      this.logKey('logTrigFail', [trigData.error || ""], "error")
      this.capturing = false
      return
    }
    this.logKey('logTriggered', [], "info")

    // 2. Poll tọa độ robot gửi về qua TCP port 8765 (tối đa 30s)
    let result = null
    const MAX_WAIT = 30
    for(let i = 0; i < MAX_WAIT * 2; i++){
      await new Promise(r => setTimeout(r, 500))
      const elapsed = Math.floor(i / 2) + 1
      if(elapsed % 5 === 0) this.log(this.t('logWaiting')(elapsed), "info")

      const vr = await fetch(`${this.apiBase}/vision/latest`)
      const d  = await vr.json()
      if(d && d.done){
        result = d
        break
      }
    }

    if(!result){
      this.logKey('logTimeout', [MAX_WAIT], "error")
      this.capturing = false
      return
    }

    this.logKey('logDetected', [result.objects.length], "ok")
    this.visionObjects        = result.objects
    this.occupiedCells.tray1  = result.occupied.tray1 || []
    this.visionRobotPoints    = result.robotPoints || []
    this.visionCalibrated     = result.calibrated || false

    if(this.visionCalibrated && this.visionRobotPoints.length > 0){
      this.logKey('logVisionCalib', [this.visionRobotPoints.length], "ok")
    } else if(!this.visionCalibrated){
      this.logKey('logVisionNoCalib', [], "info")
    }

    // 3. Chụp ảnh để hiển thị + vẽ dot
    try {
      const camRes  = await fetch(`${this.apiBase}/camera/capture`)
      const camData = await camRes.json()
      if(camData.image){
        this.capturedImages[0] = camData.image
        await this.$nextTick()
        this.drawCanvas()
        // resize và gửi thumbnail nhỏ lên server cho máy quan sát
        const { thumb, origWidth, origHeight } = await this.resizeImage(camData.image, 800)
        fetch(`${this.apiBase}/camera/thumbnail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: thumb, origWidth, origHeight })
        }).catch(() => {})
      }
    } catch(_) {}

    this.capturing = false
  },

  resizeImage(dataUrl, maxWidth){
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const origWidth = img.naturalWidth
        const origHeight = img.naturalHeight
        const scale = Math.min(1, maxWidth / origWidth)
        const w = Math.round(origWidth  * scale)
        const h = Math.round(origHeight * scale)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve({ thumb: c.toDataURL('image/jpeg', 0.75), origWidth, origHeight })
      }
      img.onerror = () => resolve({ thumb: dataUrl, origWidth: 0, origHeight: 0 })
      img.src = dataUrl
    })
  },

  _drawOnCanvas(){
    const canvas = this.$refs.camCanvas
    if(!canvas || !this._cachedImg) return
    const img = this._cachedImg
    canvas.width  = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const sx = (this._origWidth  > 0) ? img.naturalWidth  / this._origWidth  : 1
    const sy = (this._origHeight > 0) ? img.naturalHeight / this._origHeight : 1
    for(const obj of this.visionObjects){
      const radius = (Math.abs(obj.r) > 10 ? Math.abs(obj.r) : 30) * sx
      ctx.beginPath()
      ctx.arc(obj.x * sx, obj.y * sy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = '#ff2200'
      ctx.lineWidth   = 4
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 34, 0, 0.25)'
      ctx.fill()
    }
  },

  drawCanvas(){
    const src = this.capturedImages[0]
    if(!src) return
    if(this._cachedImg && this._cachedImg.src === src){
      this._drawOnCanvas()
      return
    }
    const img = new Image()
    img.onload = () => { this._cachedImg = img; this._drawOnCanvas() }
    img.src = src
  },

  async startRun(){
    if(!this.isConnected){
      this.logKey('logNeedConnect', [], "error")
      return
    }

    // Resume nếu đang tạm dừng
    if(this.isPaused){
      const res = await fetch(`${this.apiBase}/robot/resume`, { method: "POST" })
      const data = await res.json()
      if(data.success) this.logKey('logResumed', [], "ok")
      else this.logKey('logResumeFail', [data.error || ""], "error")
      return
    }

    const isNewTask = this.totalPoints === 0 || this.currentPointIndex >= this.totalPoints
    const speed = this.selectedRecipe?.speed || 40
    let body = { speed }

    if (isNewTask) {
      // Lần đầu: build và gửi points
      const hasManualOrders = Object.values(this.orders).some(cells => Object.keys(cells).length > 0)
      if(!hasManualOrders){ this.logKey('logNeedScan', [], "error"); return }

      const points = []
      for(const [tray, cells] of Object.entries(this.orders)){
        for(const [n, orderNum] of Object.entries(cells)){
          const coords = getCellCoords(tray, n)
          points.push({ ...coords, label: `${tray}-${n}`, _order: orderNum })
        }
      }
      points.sort((a, b) => a._order - b._order)
      const payload = points.map(({ _order, ...p }) => p)
      this.logKey('logRunning', [payload.length], "info")
      body.points = payload
    }

    const res = await fetch(`${this.apiBase}/robot/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })

    const data = await res.json()
    if(!data.success) this.logKey('logRunFail', [data.error || ""], "error")
  },

  async goHome(){
    if(!this.isConnected) return
    await fetch(`${this.apiBase}/robot/home`, { method: 'POST' })
  },

  async returnRun(){
    if(!this.isConnected) return
    const res = await fetch(`${this.apiBase}/robot/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed: this.selectedRecipe?.speed || 40 })
    })
    const data = await res.json()
    if(data.success){
      if(data.allDone) this.logKey('logDone', [], "ok")
    } else {
      this.logKey('logRunFail', [data.error || ""], "error")
    }
  },

  async pauseRun(){
    const res = await fetch(`${this.apiBase}/robot/pause`, { method: "POST" })
    const data = await res.json()
    if(data.success) this.logKey('logPaused', [], "info")
    else this.logKey('logPauseFail', [data.error || ""], "error")
  },

  async clearDashboard(){
    this.orders          = { tray1:{}, tray2:{}, tray3:{}, tray4:{}, tray5:{}, tray6:{} }
    this.currentOrder    = 1
    this.doneLabels      = []
    this.runningLabel    = null
    this.processingLabel = null
    this.visionObjects   = []
    this.occupiedCells   = { tray1:[], tray2:[], tray3:[], tray4:[], tray5:[], tray6:[] }
    this.capturedImages  = [null]
    this._cachedImg      = null
    this.visionRobotPoints = []
    this.visionCalibrated  = false
    const canvas = this.$refs.camCanvas
    if(canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    await Promise.all([
      fetch(`${this.apiBase}/camera/clear`,    { method: 'POST' }),
      fetch(`${this.apiBase}/vision/reset`,    { method: 'POST' }),
      fetch(`${this.apiBase}/robot/clear-run`, { method: 'POST' }),
    ]).catch(() => {})
  },

  async stopRun(){
    await fetch(`${this.apiBase}/robot/stop`, { method: "POST" })
    this.isPaused          = false
    this.isRunning         = false
    this.doneLabels        = []
    this.runningLabel      = null
    this.processingLabel   = null
    this.visionRobotPoints = []
    this.visionCalibrated  = false
    this.logKey('logStopped', [], "error")
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
  },

  cellTitle(tray, n){
    const label = `${tray}-${n}`
    if(this.doneLabels.includes(label))                       return this.t('tipCellDone')
    if(this.processingLabel === label || this.runningLabel === label) return this.t('tipCellRunning')
    if(this.orders[tray][n])                                  return this.t('tipCellSelected')
    if((this.occupiedCells[tray] || []).includes(n))          return this.t('tipCellOccupied')
    return this.t('tipCellEmpty')
  }

}

}
</script>



<style scoped>
* { box-sizing: border-box; }

.recipe-apply-row { display: flex; align-items: center; gap: 6px; }

.recipe-dropdown { position: relative; flex: 1; min-width: 120px; }
.recipe-dropdown-trigger {
  width: 100%; height: 28px; padding: 0 8px;
  border: 1px solid #d1d5db; border-radius: 4px;
  background: #fff; font-size: 0.85rem; color: #111;
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  cursor: pointer; transition: border-color 0.15s; white-space: nowrap;
}
.recipe-dropdown-trigger span { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.recipe-dropdown-trigger:hover:not(:disabled) { border-color: #6b7280; }
.recipe-dropdown-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
.recipe-dropdown.open .recipe-dropdown-trigger { border-color: #3b82f6; }

.recipe-dropdown-menu {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 200;
  background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12); overflow: visible;
}
.recipe-dropdown-item {
  position: relative; padding: 6px 10px; font-size: 0.85rem;
  cursor: pointer; display: flex; align-items: center; justify-content: space-between;
  transition: background 0.1s;
}
.recipe-dropdown-item:hover { background: #f3f4f6; }
.recipe-dropdown-item.selected { background: #eff6ff; color: #1d4ed8; font-weight: 600; }
.recipe-item-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #16a34a; flex-shrink: 0;
}

.recipe-tooltip {
  position: absolute; left: calc(100% + 8px); top: 0;
  min-width: 160px; background: #1e293b; color: #f1f5f9;
  border-radius: 8px; padding: 8px 12px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.25);
  pointer-events: none; z-index: 300;
  font-size: 0.78rem;
}
.recipe-tooltip-row {
  display: flex; justify-content: space-between; gap: 16px;
  padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.07);
}
.recipe-tooltip-row:last-child { border-bottom: none; }
.recipe-tooltip-row span { color: #94a3b8; }
.recipe-tooltip-row strong { color: #f1f5f9; font-weight: 600; }
.apply-recipe-btn {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid #aaa; background: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: border-color 0.2s, background 0.2s;
  flex-shrink: 0;
}
.apply-recipe-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.apply-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #ccc; transition: background 0.2s;
}
.apply-recipe-btn.applied { border-color: #16a34a; }
.apply-recipe-btn.applied .apply-dot { background: #16a34a; }

.viewer-toggle-btn {
  width: 120px; height: 36px; line-height: 32px;
  font-size: 0.85rem; font-weight: 600; white-space: nowrap;
  text-align: center; overflow: hidden;
  border: 2px solid #6b7280; background: transparent; color: #374151; cursor: pointer;
  transition: background 0.2s, color 0.2s, transform 0.1s;
}
.viewer-toggle-btn:active { transform: scale(0.92); }
.viewer-toggle-btn.active {
  border-color: #1e40af; background: #1e40af; color: #fff;
}
.toast {
  position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
  padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 0.95rem;
  color: #fff; z-index: 9999; box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  pointer-events: none;
}
.toast.ok    { background: #16a34a; }
.toast.error { background: #dc2626; }
.toast.info  { background: #2563eb; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
.toast-leave-to   { opacity: 0; transform: translateX(-50%) translateY(-12px); }

.critical-banner {
  background: #dc2626; color: #fff;
  text-align: center; padding: 10px; font-weight: 700; font-size: 0.95rem;
  letter-spacing: 0.02em;
}
.robot-warning-banner {
  background: #f59e0b; color: #1a1a1a;
  text-align: center; padding: 8px; font-weight: 600; font-size: 0.9rem;
  cursor: pointer;
}
.robot-warning-banner:hover { background: #d97706; }
.viewer-banner {
  background: #1e40af; color: #fff;
  text-align: center; padding: 8px; font-weight: 600; font-size: 0.9rem;
}
.inspect-banner {
  background: #f59e0b; color: #1a1a1a;
  text-align: center; padding: 8px; font-weight: 600; font-size: 0.9rem;
  animation: pulse 1.5s infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }

.right-bar {
  display: flex; align-items: center; gap: 10px; padding-right: 20px;
}

.reload-btn {
  width: 30px; height: 30px; border-radius: 6px;
  border: 1px solid #ddd; background: #f5f5f5;
  color: #555; cursor: pointer; padding: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.reload-btn:hover { background: #e5e7eb; color: #111; }

.help-btn-wrap {
  position: relative;
}
.help-btn {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid #9ca3af; background: #f9fafb;
  color: #4b5563; font-size: 15px; font-weight: 700;
  cursor: pointer; line-height: 1; padding: 0;
  transition: background 0.15s, border-color 0.15s;
}
.help-btn:hover { background: #e5e7eb; border-color: #6b7280; }

.help-panel {
  position: absolute; top: calc(100% + 8px); right: 0;
  width: 270px; background: #fff;
  border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.13);
  padding: 14px 16px; z-index: 999;
}
.help-title {
  font-size: 13px; font-weight: 700; color: #1e3a5f;
  margin-bottom: 10px; letter-spacing: 0.3px;
}
.help-step {
  display: flex; align-items: flex-start; gap: 10px;
  margin-bottom: 9px;
}
.help-step:last-child { margin-bottom: 0; }
.help-num {
  flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
  background: #1e40af; color: #fff;
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  margin-top: 1px;
}
.help-text {
  font-size: 12.5px; color: #374151; line-height: 1.55;
}
.help-text b { color: #1e3a5f; }
.help-text small { color: #6b7280; font-size: 11px; }
.lang-switcher {
  display: flex; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;
}
.lang-switcher button {
  padding: 0 12px; height: 32px; line-height: 32px;
  border: none; background: #f5f5f5; color: #555;
  font-size: 0.82rem; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: background 0.2s, color 0.2s, transform 0.1s;
}
.lang-switcher button:active {
  transform: scale(0.92);
}
.lang-switcher button.active {
  background: #1e40af; color: #fff;
}


/* TOP BAR */

.top-bar{
 display:flex;
 justify-content:space-between;
 align-items:center;
 border-bottom:1px solid #dcdcdc;
 font-size:14px;
 line-height:1;
 height:56px;
 min-height:56px;
 max-height:56px;
 padding:0;
 box-sizing:border-box;
 overflow:visible;
}

.left{
 display:flex;
 align-items:center;
 gap:6px;
 padding-left:25px;
}

.left > label {
 white-space:nowrap;
 min-width:60px;
}

.top-bar input{
 padding:0 10px;
 height:36px;
 border:1px solid #ccc;
 box-sizing:border-box;
}

.connect-btn{
 background:#1e6bd6;
 color:white;
 border:none;
 padding:0;
 width:110px;
 height:36px;
 line-height:36px;
 text-align:center;
 cursor:pointer;
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.divider{
 width:1px;
 height:35px;
 background:#ccc;
 margin:0 10px;
}

.top-bar select{
 padding:0 8px;
 height:36px;
 width:160px;
 margin-left:10px;
 box-sizing:border-box;
}


/* ROBOT STATUS BADGE */

.robot-status-badge {
  display: flex; align-items: center; gap: 6px;
  padding: 0 12px; height: 36px; border-radius: 6px;
  font-size: 0.8rem; font-weight: 600; margin-right: 8px;
  background: #f3f4f6; color: #6b7280; border: 1.5px solid #d1d5db;
}
.robot-status-badge.ready              { background: #dcfce7; color: #15803d; border-color: #86efac; }
.robot-status-badge.running            { background: #dbeafe; color: #1d4ed8; border-color: #93c5fd; }
.robot-status-badge.waiting_inspection { background: #fef3c7; color: #b45309; border-color: #fcd34d; }
.robot-status-badge.paused             { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }

.robot-status-dot {
  width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0;
}
.robot-status-badge.running .robot-status-dot {
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
}

/* STATUS */

.status-box{
 display:flex;
 align-items:center;
 justify-content:center;
 gap:8px;
 padding:0;
 width:130px;
 height:36px;
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
 width: %;
}

.title-worksation h4{
 height:32px;
 line-height:32px;
 padding:0 20px;
 margin:0;
 border-bottom:1px solid #ccc;
 background:#f2f4f7;
 font-weight:500;
 overflow:hidden;
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
  width: 130px;
  border: 2.5px solid #b8c1cc;
  background: white;
  padding: 4px 1px;
}

.tray-title{
 color:#1e6bd6;
 font-weight:600;
 height:24px;
 line-height:24px;
 margin-bottom:5px;
 padding-left:10px;
 overflow:hidden;
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

.cell-num {
  position: absolute;
  top: 2px;
  left: 3px;
  font-size: 8px;
  color: rgba(0,0,0,0.35);
  line-height: 1;
  pointer-events: none;
  user-select: none;
}
.tray-cell.active .cell-num,
.tray-cell.done .cell-num { display: none; }
.tray-cell.occupied .cell-num { color: rgba(255,255,255,0.6); }

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
 height:32px;
 line-height:32px;
 padding:0 15px;
 border-bottom:1px solid #bfc7cf;
 font-weight:600;
 background:#dfe3e8;
 overflow:hidden;
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
 height:58px;
 padding:0 18px;
 font-size:18px;
 font-weight:500;
 border:none;
 color:white;
 cursor:pointer;
 white-space:nowrap;
}

.sample{
 background:#4c74b9;
}

.start{
 background:#2fa14f;
}

.return {
 background:#1e6bd6;
}

.pause{
 background:#c28b00;
}

.stop{
 background:#d61e2c;
}

.go-home{
 background:#6b7280;
}

.tray-cell.occupied{
  background:#555;
  border-color:#333;
}
</style>