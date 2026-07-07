import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ordersApi } from '@/api/orders'
import { useShopStore } from '@/stores/shop'

export const useOrdersStore = defineStore('orders', () => {
  const list = ref([])
  const total = ref(0)
  const loading = ref(false)
  const params = ref({ page: 1, pageSize: 20, status: '', startTime: '', endTime: '' })

  function getShopId() {
    const shopStore = useShopStore()
    return shopStore.currentId
  }

  async function fetchList() {
    const shopId = getShopId()
    if (!shopId) return
    loading.value = true
    try {
      const data = await ordersApi.getList(shopId, params.value)
      list.value = data.list
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  async function shipOrder(orderSn, trackingNumber) {
    const shopId = getShopId()
    await ordersApi.ship(shopId, orderSn, trackingNumber)
    const item = list.value.find(o => o.order_sn === orderSn)
    if (item) {
      item.status = 'shipped'
      item.tracking_number = trackingNumber
    }
  }

  async function batchShip(list) {
    const shopId = getShopId()
    await ordersApi.batchShip(shopId, list)
    await fetchList()
  }

  return { list, total, loading, params, fetchList, shipOrder, batchShip }
})
