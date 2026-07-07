import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dashboardApi } from '@/api/dashboard'
import { useShopStore } from '@/stores/shop'

export const useDashboardStore = defineStore('dashboard', () => {
  const summary = ref(null)
  const trend = ref([])
  const topGoods = ref([])
  const stockWarnings = ref([])
  const loading = ref(false)

  function getShopId() {
    const shopStore = useShopStore()
    return shopStore.currentId
  }

  async function fetchAll(days = 7) {
    const shopId = getShopId()
    if (!shopId) return
    loading.value = true
    try {
      const [s, t, g, w] = await Promise.all([
        dashboardApi.getSummary(shopId),
        dashboardApi.getTrend(shopId, days),
        dashboardApi.getTopGoods(shopId),
        dashboardApi.getStockWarnings(shopId)
      ])
      summary.value = s
      trend.value = t
      topGoods.value = g
      stockWarnings.value = w
    } finally {
      loading.value = false
    }
  }

  async function fetchTrend(days) {
    const shopId = getShopId()
    if (!shopId) return
    trend.value = await dashboardApi.getTrend(shopId, days)
  }

  return { summary, trend, topGoods, stockWarnings, loading, fetchAll, fetchTrend }
})
