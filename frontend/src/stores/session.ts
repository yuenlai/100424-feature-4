import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '船舶分段建造管理系统',
    // 当前登录的焊工班组：工艺参数卡的维护权限以它为准。
    crew: '焊工一班',
    crewOptions: ['焊工一班', '焊工二班', '焊工三班'],
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setCrew(label: string) {
      this.crew = label
    },
  },
})
