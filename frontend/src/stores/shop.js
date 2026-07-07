import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getShops } from '@/api/auth'

export const useShopStore = defineStore('shop', () => {
  const list = ref([])
  const currentId = ref(Number(localStorage.getItem('shopId') || 0))
  const loading = ref(false)

  const current = computed(() => list.value.find(s => s.id === currentId.value) || null)

  async function loadShops() {
    loading.value = true
    try {
      const data = await getShops()
      list.value = Array.isArray(data) ? data : (data || [])
      // 如果本地没有保存过店铺，或保存的店铺已不存在，默认选中第一个
      const exists = list.value.some(s => s.id === currentId.value)
      if ((!currentId.value || !exists) && list.value.length) {
        setShop(list.value[0].id)
      }
    } finally {
      loading.value = false
    }
  }

  function setShop(id) {
    currentId.value = id
    localStorage.setItem('shopId', String(id))
  }

  return { list, currentId, current, loading, loadShops, setShop }
})
