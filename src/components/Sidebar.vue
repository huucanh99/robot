<template>

<div class="sidebar">
  <router-link to="/home" class="menu-item">
    首頁
  </router-link>

  <router-link to="/recipe" class="menu-item">
    配方設定
  </router-link>

  <router-link to="/manual" class="menu-item">
    手動模式
  </router-link>

  <router-link to="/history" class="menu-item">
    歷史資料
  </router-link>
</div>

</template>

<style scoped>

.sidebar{
 width:140px;
 height:120vh;
 background:#fff;
 display:flex;
 flex-direction:column;
 gap:20px;
 padding-top: 25px;
 padding-right: 8px;
 border-color: #333;
 padding-left: 8px;
 border-right: 1px solid #ccc;
}

.logo{
 font-weight:bold;
 margin-bottom:20px;
}

.menu-item{
 text-decoration:none;
 color:#333;
 background: rgb(246, 248, 250);
 padding:25px 0;
 text-align:center;
 border:2px solid #cfcfcf;
 font-size:18px;
}

/* hover */
.menu-item:hover{
 background:#dcdcdc;
}

/* active tab */
.router-link-active{
 background: rgb(221, 244, 255);
 border:3px solid rgb(9, 105, 218);
 color:rgb(9, 105, 218);
 border-left-width: 6px;
}

</style>