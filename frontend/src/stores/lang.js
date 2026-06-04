import { ref } from 'vue'
import { defineStore } from 'pinia'

const messages = {
  zh: {
    // nav
    navHome: '首页', navRecipe: '配方设定', navManual: '手动模式', navHistory: '历史数据',
    // home - top bar
    criticalBanner: '⛔ 应用程序发生严重错误，请重新启动后端程序',
    robotWarningBanner: '⚠️ 检测到机械臂连线中断，请确认是否正在手动操作机械臂',
    viewerBanner: '👁 观察模式 — 仅供查看，无法操作',
    inspectBanner: '⏳ 等待检测中，请呼叫 /robot/continue 继续',
    armIp: '机械臂 IP',
    disconnect: '断线', connect: '连线',
    viewerMode: '👁 观察模式', controlMode: '🎮 操控模式',
    recipe: '配方',
    connected: '已连线', disconnected: '未连线',
    // home - workspace
    workstation: '工作台俯视图',
    gripper: '夹爪', gripperOpen: '开启', gripperClosed: '闭合',
    arm: '机械臂', tray: '托盘',
    // home - camera & controls
    liveView: '实时影像', scanning: '取样中...',
    capture: '取样', start: '开始', resume: '继续', pause: '暂停', stop: '停止 / 重置',
    statusTitle: '错误 / 状态信息',
    // home - log messages
    alertIp: '请输入机械臂 IP',
    logConnected:    (ip) => `已连线到机械臂 ${ip}`,
    logDisconnected: '已断线',
    logConnFail:     (a, e) => `${a === 'connect' ? '连线' : '断线'}失败: ${e}`,
    logNeedConnect:  '请先连线机械臂',
    logStartScan:    '开始取样...',
    logTriggered:    '已触发，等待坐标...',
    logTrigFail:     (e) => '视觉触发失败: ' + e,
    logWaiting:      (s) => `等待中... ${s}s`,
    logTimeout:      (s) => `超时 ${s}s — 未收到坐标数据`,
    logDetected:     (n) => `检测到 ${n} 个物件`,
    logManual:       (n) => `手动模式: ${n} 个格位`,
    logVision:       (n) => `Vision 自动模式: ${n} 个物件`,
    logNeedScan:     '请先取样或选择格位',
    logRunning:      (n) => `开始执行 ${n} 个格位...`,
    logDone:         '执行完成 ✓',
    logRunFail:      (e) => '执行失败: ' + e,
    logResumed:      '继续执行',
    logResumeFail:   (e) => '继续失败: ' + e,
    logPaused:       '已暂停 — 按开始继续',
    logPauseFail:    (e) => '暂停失败: ' + e,
    logStopped:      '已停止并重置',
    robotStatus_idle: '待机', robotStatus_ready: '就绪', robotStatus_running: '执行中',
    robotStatus_waiting_inspection: '等待检测', robotStatus_paused: '已暂停',
    confirmDisconnect: '确定要断线吗？',
    confirmDisconnectRunning: '机械臂正在运行中，确定要断线吗？',
    toastConnected:  '连线成功',
    toastDisconnected: '连线中断',
    toastRecipeApplied: (n) => `已套用配方：${n}`,
    logRecipeApplied:  (n) => `配方已套用: ${n}`,
    logRecipeFail:     (e) => `套用配方失败: ${e}`,
    logVisionCalib:    (n) => `已换算 ${n} 个机械臂点位 (视觉自动)`,
    logVisionNoCalib:  '⚠️ 尚未校准4个角 — 使用手动格位',
    // recipe page
    recipeTitle: '配方设定',
    addRecipe: '+ 新增配方',
    colName: '名称', colActions: '操作',
    editBtn: '编辑', deleteBtn: '删除',
    editorTitle: '编辑配方', editingTag: '编辑中',
    fieldName: '配方名称', fieldSpeed: '机械臂速度',
    fieldGrip: '夹爪开关开度', fieldOpen: '夹爪预设开度',
    fieldInspectWait: '检测等待时间',
    saveBtn: '储存', cancelBtn: '取消', saveAsBtn: '另存新档',
    errDuplicate: '配方名称重复',
    confirmCancel: '确定取消吗？数据会全部消失',
    // history page
    historyTitle: '历史纪录', historyClear: '清除全部', historyEmpty: '暂无纪录',
    historyConfirmClear: '确定清除所有纪录吗？',
    historyAll: '全部', historyToday: '今天', history7d: '7天', history30d: '30天',
    historyLevelAll: '全部', historyLevelOk: '成功', historyLevelError: '错误', historyLevelInfo: '信息',
    confirmDelete: '确定删除这个配方吗？',
    alertSaved: '修改成功',
  },
  en: {
    // nav
    navHome: 'Home', navRecipe: 'Recipes', navManual: 'Manual', navHistory: 'History',
    // home - top bar
    criticalBanner: '⛔ Application error — please restart the backend',
    robotWarningBanner: '⚠️ Robot connection lost — are you running a program on the robot?',
    viewerBanner: '👁 Observer Mode — View only, no control',
    inspectBanner: '⏳ Waiting for inspection, call /robot/continue to resume',
    armIp: 'Arm IP',
    disconnect: 'Disconnect', connect: 'Connect',
    viewerMode: '👁 Observer', controlMode: '🎮 Control',
    recipe: 'Recipe',
    connected: 'Connected', disconnected: 'Disconnected',
    // home - workspace
    workstation: 'Workstation Top View',
    gripper: 'Gripper', gripperOpen: 'Open', gripperClosed: 'Closed',
    arm: 'Arm', tray: 'Tray',
    // home - camera & controls
    liveView: 'Live Feed', scanning: 'Scanning...',
    capture: 'Scan', start: 'Start', resume: 'Resume', pause: 'Pause', stop: 'Stop / Reset',
    statusTitle: 'Error / Status Log',
    // home - log messages
    alertIp: 'Please enter the arm IP address',
    logConnected:    (ip) => `Connected to arm ${ip}`,
    logDisconnected: 'Disconnected',
    logConnFail:     (a, e) => `${a === 'connect' ? 'Connect' : 'Disconnect'} failed: ${e}`,
    logNeedConnect:  'Please connect to the arm first',
    logStartScan:    'Starting scan...',
    logTriggered:    'Triggered, waiting for coordinates...',
    logTrigFail:     (e) => 'Vision trigger failed: ' + e,
    logWaiting:      (s) => `Waiting... ${s}s`,
    logTimeout:      (s) => `Timeout ${s}s — no coordinate data received`,
    logDetected:     (n) => `Detected ${n} object(s)`,
    logManual:       (n) => `Manual mode: ${n} cell(s)`,
    logVision:       (n) => `Vision auto mode: ${n} object(s)`,
    logNeedScan:     'Please scan first or select cells manually',
    logRunning:      (n) => `Starting ${n} cell(s)...`,
    logDone:         'Execution complete ✓',
    logRunFail:      (e) => 'Execution failed: ' + e,
    logResumed:      'Resumed',
    logResumeFail:   (e) => 'Resume failed: ' + e,
    logPaused:       'Paused — press Start to resume',
    logPauseFail:    (e) => 'Pause failed: ' + e,
    logStopped:      'Stopped and reset',
    robotStatus_idle: 'Idle', robotStatus_ready: 'Ready', robotStatus_running: 'Running',
    robotStatus_waiting_inspection: 'Waiting Inspect', robotStatus_paused: 'Paused',
    confirmDisconnectRunning: 'Robot is currently running. Disconnect anyway?',
    toastConnected:  'Connected successfully',
    toastDisconnected: 'Connection lost',
    toastRecipeApplied: (n) => `Recipe applied: ${n}`,
    logRecipeApplied:  (n) => `Recipe applied: ${n}`,
    logRecipeFail:     (e) => `Apply recipe failed: ${e}`,
    logVisionCalib:    (n) => `Converted ${n} robot point(s) (vision auto)`,
    logVisionNoCalib:  '⚠️ Robot corners not calibrated — using manual cells',
    // recipe page
    recipeTitle: 'Recipe Settings',
    addRecipe: '+ New Recipe',
    colName: 'Name', colActions: 'Actions',
    editBtn: 'Edit', deleteBtn: 'Delete',
    editorTitle: 'Edit Recipe', editingTag: 'Editing',
    fieldName: 'Recipe Name', fieldSpeed: 'Arm Speed',
    fieldGrip: 'Gripper Close Width', fieldOpen: 'Gripper Open Width',
    fieldInspectWait: 'Inspect Wait (s)',
    saveBtn: 'Save', cancelBtn: 'Cancel', saveAsBtn: 'Save as New',
    errDuplicate: 'Recipe name already exists',
    confirmCancel: 'Discard changes?',
    // history page
    historyTitle: 'History', historyClear: 'Clear All', historyEmpty: 'No records yet',
    historyConfirmClear: 'Clear all history?',
    historyAll: 'All', historyToday: 'Today', history7d: '7 Days', history30d: '30 Days',
    historyLevelAll: 'All', historyLevelOk: 'Success', historyLevelError: 'Error', historyLevelInfo: 'Info',
    confirmDelete: 'Delete this recipe?',
    alertSaved: 'Saved successfully',
  },
}

export const useLangStore = defineStore('lang', () => {
  const lang     = ref(localStorage.getItem('lang') || 'zh')
  const urlMode  = new URLSearchParams(window.location.search).get('mode')
  const isViewer = ref(urlMode === 'view' ? true : urlMode === 'control' ? false : localStorage.getItem('isViewer') === 'true')

  function setLang(l) {
    lang.value = l
    localStorage.setItem('lang', l)
  }

  function t(key) {
    return messages[lang.value][key] ?? messages['zh'][key] ?? key
  }

  return { lang, setLang, t, isViewer }
})
