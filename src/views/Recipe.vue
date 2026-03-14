<template>

<div class="recipe-page">

<!-- HEADER -->

<div class="page-header">

<p>配方設定</p>

<button class="add-btn" @click="createRecipe">
+ 新增配方
</button>

</div>


<div class="recipe-layout">

<!-- LEFT LIST -->

<div class="recipe-list">

<div class="list-header">
<span>名稱</span>
<span>操作</span>
</div>


<div
v-for="recipe in recipes"
:key="recipe.id"
class="recipe-item"
:class="{active:editingId===recipe.id}"
>

<div class="recipe-name">
{{recipe.name}}
</div>

<div class="actions">

<button
class="edit-btn"
@click="editRecipe(recipe)"
>
編輯
</button>

<button
class="delete-btn"
@click="deleteRecipe(recipe.id)"
>
刪除
</button>

</div>

</div>

</div>


<!-- RIGHT PANEL -->

<div class="recipe-editor">

<div class="editor-header">

<span>編輯配方</span>

<div class="edit-tag" v-if="editingId">
編輯中
</div>

</div>


<div class="editor-body">

<!-- NAME -->

<div class="form-row">

<label>配方名稱</label>

<input
class="full-input"
v-model="form.name"
/>

<div class="error" v-if="nameError">
{{nameError}}
</div>

</div>


<!-- SPEED -->

<div class="form-row">

<label>手臂速度</label>

<div class="input-box">

<input v-model="form.speed"/>

<span class="unit">mm/s</span>

</div>

</div>


<!-- GRIP -->

<div class="form-row">

<label>夾爪開關開度</label>

<div class="input-box">

<input v-model="form.grip"/>

<span class="unit">mm</span>

</div>

</div>


<!-- OPEN -->

<div class="form-row">

<label>夾爪預設開度</label>

<div class="input-box">

<input v-model="form.open"/>

<span class="unit">mm</span>

</div>

</div>


<!-- WAIT -->

<div class="form-row">

<label>等待秒數</label>

<div class="input-box">

<input v-model="form.wait"/>

<span class="unit">sec</span>

</div>

</div>


</div>


<!-- BUTTON BAR -->

<div class="button-bar">

<button class="save-btn" @click="saveEdit">
儲存
</button>

<button class="cancel-btn" @click="cancelEdit">
取消
</button>

<button class="new-btn" @click="saveAsNew">
另存新檔
</button>

</div>


</div>

</div>

</div>

</template>



<script>

export default{

data(){

return{

recipes:[

{
id:1,
name:"測試配方一",
speed:100,
grip:30,
open:80,
wait:2.5
},

{
id:2,
name:"測試配方_1",
speed:120,
grip:40,
open:90,
wait:3
},

{
id:3,
name:"高速配方 A",
speed:200,
grip:25,
open:70,
wait:1.5
},

{
id:4,
name:"精密配方 B",
speed:60,
grip:20,
open:50,
wait:3.5
}

],

editingId:null,

nameError:"",

form:{
name:"",
speed:"",
grip:"",
open:"",
wait:""
}

}

},


methods:{


createRecipe(){

this.editingId=null
this.nameError=""

this.form={
name:"",
speed:"",
grip:"",
open:"",
wait:""
}

},


editRecipe(recipe){

this.editingId=recipe.id
this.nameError=""

this.form=JSON.parse(JSON.stringify(recipe))

},


saveEdit(){

if(!this.editingId) return

this.nameError=""

const duplicated=this.recipes.find(
r=>r.name===this.form.name && r.id!==this.editingId
)

if(duplicated){

this.nameError="配方名稱重複"
return

}

const index=this.recipes.findIndex(r=>r.id===this.editingId)

this.recipes[index]={

...this.form,
id:this.editingId

}

alert("修改成功")

},


cancelEdit(){

const hasData=
this.form.name ||
this.form.speed ||
this.form.grip ||
this.form.open ||
this.form.wait

if(hasData){

const ok=confirm("確定取消嗎？資料會全部消失")

if(!ok) return

}

this.editingId=null
this.nameError=""

this.form={
name:"",
speed:"",
grip:"",
open:"",
wait:""
}

},


saveAsNew(){

this.nameError=""

const duplicated=this.recipes.find(
r=>r.name===this.form.name
)

if(duplicated){

this.nameError="配方名稱重複"
return

}

const newRecipe={

...this.form,
id:Date.now()

}

this.recipes.push(newRecipe)

this.cancelEdit()

},


deleteRecipe(id){

this.recipes=this.recipes.filter(r=>r.id!==id)

if(this.editingId===id){
this.cancelEdit()
}

}

}

}

</script>



<style scoped>

.page-header{
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 8px;
padding-left: 15px;
border-bottom: 1px solid #ccc;
}

.add-btn{
background:#1e6bd6;
color:white;
border:none;
padding:10px 18px;
cursor:pointer;
}


/* LAYOUT */

.recipe-layout{
display:flex;
gap:20px;
padding-left: 8px;
}


/* LEFT LIST */

.recipe-list{
width:40%;
border:1px solid #ccc;
background:white;
}

.list-header{
display:flex;
justify-content:space-between;
padding:12px;
background:#f1f3f6;
border-bottom:1px solid #ccc;
font-weight:600;
}

.recipe-item{
display:flex;
justify-content:space-between;
align-items:center;
padding:16px;
border-bottom:1px solid #eee;
}

.recipe-item.active{
background:#d9e9f7;
border-left:5px solid #1e6bd6;
}

.actions{
display:flex;
gap:10px;
}

.edit-btn{
background:#f3f4f6;
border:1px solid #ccc;
padding:6px 12px;
cursor:pointer;
}

.delete-btn{
border:2px solid red;
color:red;
background:white;
padding:6px 12px;
cursor:pointer;
}


/* RIGHT PANEL */

.recipe-editor{
width:60%;
border:1px solid #ccc;
background:white;
display:flex;
flex-direction:column;
}

.editor-header{
display:flex;
justify-content:space-between;
align-items:center;
padding:12px;
background:#f1f3f6;
border-bottom:1px solid #ccc;
}

.edit-tag{
border:1px solid #1e6bd6;
color:#1e6bd6;
padding:3px 10px;
margin: -4px 0px;
}

.editor-body{
padding:20px;
flex:1;
}


/* FORM */

.form-row{
margin-bottom:25px;
}

.form-row label{
display:block;
margin-bottom:8px;
}

.full-input{
width:96%;
padding:12px;
border:1px solid #cfd6df;
background:#f4f6f9;
}


/* INPUT UNIT */

.input-box{
position:relative;
}

.input-box input{
width:90%;
padding:12px 60px 12px 12px;
border:1px solid #cfd6df;
background:#f4f6f9;
}

.unit{
position:absolute;
right:15px;
top:50%;
transform:translateY(-50%);
color:#666;
font-size:14px;
pointer-events:none;
}


/* ERROR */

.error{
color:#e53935;
font-size:12px;
margin-top:5px;
}


/* BUTTON BAR */

.button-bar{
display:flex;
gap:15px;
padding:15px;
border-top:1px solid #ddd;
}

.save-btn{
flex:1;
background:#2fa14f;
color:white;
border:none;
padding:14px;
cursor:pointer;
}

.cancel-btn{
flex:1;
background:#e5e5e5;
border:none;
padding:14px;
cursor:pointer;
}

.new-btn{
flex:1;
border:2px solid #1e6bd6;
background:white;
color:#1e6bd6;
padding:14px;
cursor:pointer;
}

</style>