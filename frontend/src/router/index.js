import { createRouter, createWebHistory } from "vue-router"
import Home from "../views/Home.vue"
import Recipe from '../views/Recipe.vue'
import History from '../views/History.vue'

const routes = [

{
 path:"/",
 redirect:"/home"
},

{
 path:"/home",
 component:Home
},

{
 path:"/recipe",
 component:Recipe
},

{
 path:"/manual",
 component:Home
},

{
 path:"/history",
 component:History
}

]

const router = createRouter({
 history:createWebHistory(),
 routes
})

export default router