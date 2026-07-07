<template>
  <div class="refunds-page">
    <el-card shadow="never">
      <div class="toolbar">
        <div class="filters">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width:260px"
          />
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </div>
        <div class="actions">
          <el-button :icon="Refresh" @click="handleSync" :loading="syncing">同步退款</el-button>
        </div>
      </div>

      <el-table :data="list" v-loading="loading" style="margin-top:16px" row-key="refund_id">
        <el-table-column prop="refund_id" label="售后单号" width="160" show-overflow-tooltip />
        <el-table-column prop="order_sn" label="订单号" width="190" show-overflow-tooltip />
        <el-table-column prop="goods_amount" label="订单金额" width="100">
          <template #default="{ row }">¥{{ row.goods_amount?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="refund_amount" label="退款金额" width="100">
          <template #default="{ row }">
            <span style="color:#f5222d">¥{{ row.refund_amount?.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="after_sales_type" label="售后类型" width="100">
          <template #default="{ row }">{{ typeLabel(row.after_sales_type) }}</template>
        </el-table-column>
        <el-table-column prop="after_sales_status" label="售后状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.after_sales_status)">{{ statusLabel(row.after_sales_status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updated_at" label="更新时间" width="170" />
      </el-table>

      <el-pagination
        v-model:current-page="params.page"
        v-model:page-size="params.pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        style="margin-top:16px;justify-content:flex-end"
        @change="fetchList"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useShopStore } from '@/stores/shop'
import { refundsApi } from '@/api/refunds'
import { ElMessage } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'

const shopStore = useShopStore()

const list = ref([])
const total = ref(0)
const loading = ref(false)
const syncing = ref(false)
const dateRange = ref([])
const params = ref({ page: 1, pageSize: 20 })

watch(() => shopStore.currentId, () => {
  params.value.page = 1
  fetchList()
}, { immediate: false })

onMounted(() => fetchList())

async function fetchList() {
  if (!shopStore.currentId) return
  loading.value = true
  try {
    const query = { ...params.value }
    if (dateRange.value?.length === 2) {
      query.startTime = dateRange.value[0]
      query.endTime = dateRange.value[1]
    }
    const data = await refundsApi.getList(shopStore.currentId, query)
    list.value = data.list || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  params.value.page = 1
  fetchList()
}

function handleReset() {
  dateRange.value = []
  params.value.page = 1
  fetchList()
}

async function handleSync() {
  if (!shopStore.currentId) return
  syncing.value = true
  try {
    const data = await refundsApi.sync(shopStore.currentId, 48)
    ElMessage.success(`同步完成，${data.total} 条退款记录`)
    fetchList()
  } finally {
    syncing.value = false
  }
}

function statusLabel(s) {
  const map = {
    10: '退款成功', 2: '买家申请退款', 3: '退货退款', 4: '商家同意退款',
    5: '平台同意退款', 6: '驳回退款', 7: '同意退货退款', 8: '平台处理中',
    9: '退款关闭', 11: '买家撤销', 12: '退款失败'
  }
  return map[s] || s
}
function statusType(s) {
  return s === 10 ? 'success' : s >= 9 ? 'info' : 'warning'
}
function typeLabel(t) {
  return { 1: '全部', 2: '仅退款', 3: '退货退款', 4: '换货', 5: '缺货补寄', 6: '维修' }[t] || t
}
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.actions {
  display: flex;
  gap: 8px;
}
</style>
