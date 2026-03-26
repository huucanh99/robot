import { createRouter, createWebHistory } from "vue-router"
import Home from "../views/Home.vue"
import Recipe from '../views/Recipe.vue'

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
 component:Home
}

]

const router = createRouter({
 history:createWebHistory(),
 routes
})

export default router