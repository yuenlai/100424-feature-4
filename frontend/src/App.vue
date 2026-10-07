<template>
  <div class="app-shell">
    <aside class="app-side">
      <h1 class="app-title">船舶分段建造管理系统</h1>
      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="app-main">
      <header class="app-head">
        <span class="head-desc">面向船体分段下料加工、小组立装配、中组立焊接、大合拢搭载与涂装报验全流程的船舶分段建造管理平台。</span>
        <span class="head-user">
          当前值班：{{ store.operator }} · {{ store.shiftLabel }} ·
          <label class="crew-switch">
            班组
            <select :value="store.crew" @change="store.setCrew(($event.target as HTMLSelectElement).value)">
              <option v-for="crew in store.crewOptions" :key="crew" :value="crew">{{ crew }}</option>
            </select>
          </label>
        </span>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()

const navItems = [{ label: "运营概览", path: "/" }, { label: "分段台账", path: "/block" }, { label: "钢板下料", path: "/cutting" }, { label: "小组立装配", path: "/assembly_small" }, { label: "中组立焊接", path: "/assembly_medium" }, { label: "无损检测", path: "/ndt" }, { label: "大合拢搭载", path: "/erection" }, { label: "焊材追溯", path: "/welding_trace" }, { label: "涂装预处理", path: "/blasting" }, { label: "油漆涂装", path: "/painting" }, { label: "舾装作业", path: "/outfitting" }, { label: "精度测量", path: "/dimension" }, { label: "管路预制", path: "/pipe_prefab" }, { label: "电缆敷设", path: "/cable_pull" }, { label: "下水准备", path: "/launch_prep" }, { label: "质量报验", path: "/quality" }, { label: "建造计划", path: "/schedule" }, { label: "钢材管理", path: "/material" }, { label: "脚手架搭设", path: "/scaffold" }]
</script>
