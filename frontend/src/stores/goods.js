import { defineStore } from 'pinia'
import { ref } from 'vue'
import { goodsApi } from '@/api/goods'
import { useShopStore } from '@/stores/shop'

export const useGoodsStore = defineStore('goods', () => {
  const list = ref([])
  const total = ref(0)
  const loading = ref(false)
  const params = ref({ page: 1, pageSize: 20, status: '', keyword: '' })

  function getShopId() {
    const shopStore = useShopStore()
    return shopStore.currentId
  }

  async function fetchList() {
    const shopId = getShopId()
    if (!shopId) return
    loading.value = true
    try {
      const data = await goodsApi.getList(shopId, params.value)
      list.value = data.list
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  async function updateGoods(goodsId, payload) {
    const shopId = getShopId()
    await goodsApi.update(shopId, goodsId, payload)
    await fetchList()
  }

  async function updateStock(goodsId, stock) {
    const shopId = getShopId()
    await goodsApi.update(shopId, goodsId, { stock })
    const item = list.value.find(g => g.goods_id === goodsId)
    if (item) item.stock = stock
  }

  async function batchUpdateStatus(goodsIds, onSale) {
    const shopId = getShopId()
    await goodsApi.batchUpdateStatus(shopId, goodsIds, onSale)
    await fetchList()
  }

  return { list, total, loading, params, fetchList, updateGoods, updateStock, batchUpdateStatus }
})
