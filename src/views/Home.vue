<template>

<div class="home">

  <!-- TOP BAR -->
  <div class="top-bar">

    <div class="left">

      <label>手臂 IP</label>
      <input type="text" value="192.168.5.1"/>

      <button class="connect-btn">連線</button>

      <div class="divider"></div>

      <label>配方</label>

      <select>
        <option>測試配方一</option>
        <option>高速配方</option>
        <option>精密配方</option>
      </select>

    </div>

    <div class="status-box">
      <div class="status-dot connected"></div>
      <span>已連線</span>
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
                <input type="checkbox">
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
                    :class="{active: tray1.includes(n)}"
                    @click="toggleCell('tray1',n)"
                  />
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
                    :class="{active: tray4.includes(n)}"
                    @click="toggleCell('tray4',n)"
                  />
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">載盤 2</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray2-'+n"
                    class="tray-cell"
                    :class="{active: tray2.includes(n)}"
                    @click="toggleCell('tray2',n)"
                  />
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
                    :class="{active: tray6.includes(n)}"
                    @click="toggleCell('tray6',n)"
                  />
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">載盤 5</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray5-'+n"
                    class="tray-cell"
                    :class="{active: tray5.includes(n)}"
                    @click="toggleCell('tray5',n)"
                  />
                </div>
              </div>

              <div class="tray">
                <div class="tray-title">載盤 3</div>
                <div class="tray-grid">
                  <div
                    v-for="n in 20"
                    :key="'tray3-'+n"
                    class="tray-cell"
                    :class="{active: tray3.includes(n)}"
                    @click="toggleCell('tray3',n)"
                  />
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

          <button class="btn start">開始</button>

          <button class="btn pause">暫停</button>

          <button class="btn stop">停止 / 重置</button>

        </div>

      </div>
    </div>
    <div class="status-panel">
      <div class="status-title">
        錯誤 / 狀態訊息
      </div>
      <div class="status-content">
      </div>

    </div>
  </div>

</div>

</template>


<script>
export default {

data(){
return{

tray1:[],
tray2:[],
tray3:[],
tray4:[],
tray5:[],
tray6:[]

}
},

methods:{
toggleCell(tray,n){

if(this[tray].includes(n)){
this[tray] = this[tray].filter(i => i !== n)
}else{
this[tray].push(n)
}

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
 border:2px solid rgb(26,127,55);
 padding:5px 12px;
 background:rgb(218,251,225);
 margin-right:15px;
}

.status-dot{
 width:12px;
 height:12px;
 border-radius:50%;
 border:2px solid black;
}

.connected{ background:#2ecc71; }

.status-box span{
 color:rgb(26,127,55);
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
}

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
}

.tray-cell.active{
 background:#4da3ff;
 border-color:#2c6cd6;
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

/* CAMERA CROSSHAIR */

.cross{
 position:absolute;
 background:transparent;
}

.cross-h{
 width:100%;
 top:50%;
 border-top:2px dashed #9aa3ad;
}

.cross-v{
 height:100%;
 left:50%;
 border-left:2px dashed #9aa3ad;
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