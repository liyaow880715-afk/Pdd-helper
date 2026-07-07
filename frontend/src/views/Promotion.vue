<template>
  <div class="promotion">
    <!-- 店铺选择 + 操作栏 -->
    <el-row justify="space-between" align="middle" style="margin-bottom: 16px">
      <el-select v-model="shopId" placeholder="选择店铺" @change="onShopChange">
        <el-option v-for="s in shopList" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <div>
        <el-button type="primary" :icon="Refresh" @click="syncData" :loading="syncLoading">同步数据</el-button>
        <el-button type="success" :icon="MagicStick" @click="getAiAdvice" :loading="aiLoading">AI 策略建议</el-button>
      </div>
    </el-row>

    <!-- 数据概览 -->
    <el-row :gutter="16">
      <el-col :span="6" v-for="card in statCards" :key="card.key">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">{{ card.label }}</div>
          <div class="stat-value" :style="{ color: card.color }">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- AI 策略建议弹窗 -->
    <el-dialog v-model="aiDialogVisible" title="AI 推广策略建议" width="600px">
      <div v-if="aiStrategy" class="ai-content" v-html="renderMarkdown(aiStrategy)"></div>
      <div v-else class="empty">点击上方按钮生成策略建议</div>
    </el-dialog>

    <!-- 渠道效果 + 渠道管理 -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>渠道效果对比</template>
          <el-table :data="channelStats" size="small" empty-text="暂无数据">
            <el-table-column prop="channel_name" label="渠道" min-width="120" />
            <el-table-column prop="clicks" label="点击" width="80" />
            <el-table-column prop="orders" label="订单" width="80" />
            <el-table-column prop="gmv" label="GMV" width="120">
              <template #default="{ row }">¥{{ (row.gmv / 100).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column label="ROI" width="100">
              <template #default="{ row }">
                <el-tag :type="row.cost > 0 && row.gmv / row.cost >= 2 ? 'success' : 'warning'">
                  {{ row.cost > 0 ? (row.gmv / row.cost).toFixed(2) : '-' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>渠道管理</span>
              <el-button type="primary" size="small" :icon="Plus" @click="channelDialogVisible = true">新增</el-button>
            </div>
          </template>
          <el-table :data="channels" size="small" empty-text="暂无渠道">
            <el-table-column prop="channel_name" label="渠道名称" />
            <el-table-column prop="channel_type" label="类型" width="90" />
            <el-table-column label="操作" width="70">
              <template #default="{ row }">
                <el-button type="danger" size="small" text @click="delChannel(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 追踪链接 -->
    <el-card shadow="never" style="margin-top: 16px">
      <template #header>
        <div class="card-header">
          <span>追踪链接</span>
          <el-button type="primary" size="small" :icon="Link" @click="linkDialogVisible = true">生成链接</el-button>
        </div>
      </template>
      <el-table :data="links" size="small" empty-text="暂无追踪链接">
        <el-table-column prop="short_code" label="短码" width="100" />
        <el-table-column prop="goods_id" label="商品ID" width="140" />
        <el-table-column prop="channel_name" label="渠道" width="120" />
        <el-table-column prop="plan_name" label="推广计划" width="120" />
        <el-table-column prop="click_count" label="点击" width="80" />
        <el-table-column prop="order_count" label="订单" width="80" />
        <el-table-column prop="total_gmv" label="GMV" width="120">
          <template #default="{ row }">¥{{ (row.total_gmv / 100).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="short_url" label="短链" min-width="180">
          <template #default="{ row }">
            <el-link type="primary" :href="row.short_url" target="_blank">{{ row.short_url }}</el-link>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 推广计划 -->
    <el-card shadow="never" style="margin-top: 16px">
      <template #header>推广计划（本地缓存）</template>
      <el-table :data="plans" size="small" empty-text="暂无计划，请点击同步">
        <el-table-column prop="plan_name" label="计划名称" min-width="180" />
        <el-table-column prop="plan_type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.plan_type === 'ddk' ? 'success' : row.plan_type === 'search' ? 'primary' : 'warning'">
              {{ typeMap[row.plan_type] || row.plan_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="bid" label="出价" width="100">
          <template #default="{ row }">¥{{ (row.bid / 100).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="budget" label="日限额" width="100">
          <template #default="{ row }">¥{{ (row.budget / 100).toFixed(2) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- CPS 单品推广管理 -->
    <el-card shadow="never" style="margin-top: 16px">
      <template #header>CPS 单品推广管理</template>
      <el-form :model="cpsForm" label-width="90px" style="max-width: 520px">
        <el-form-item label="商品ID">
          <el-input v-model="cpsForm.goodsId" placeholder="拼多多商品ID" />
        </el-form-item>
        <el-form-item label="佣金比例">
          <el-input-number v-model="cpsForm.rate" :min="0" :max="1000" placeholder="千分比，如 50=5%" style="width:180px" />
          <span style="margin-left:8px;color:#8c8c8c;font-size:13px">千分比（50 = 5%）</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="cpsLoading" @click="queryCps">查询</el-button>
          <el-button type="success" :loading="cpsLoading" @click="saveCps('create')">创建/更新</el-button>
          <el-button type="danger" :loading="cpsLoading" @click="deleteCps">删除</el-button>
        </el-form-item>
      </el-form>
      <el-descriptions v-if="cpsResult" :column="2" border size="small" style="margin-top:12px">
        <el-descriptions-item label="商品ID">{{ cpsResult.goods_id }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ cpsResult.status }}</el-descriptions-item>
        <el-descriptions-item label="佣金比例">{{ cpsResult.rate ? cpsResult.rate / 10 + '%' : '-' }}</el-descriptions-item>
        <el-descriptions-item label="unit_id">{{ cpsResult.unit_id || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-alert v-if="cpsError" :title="cpsError" type="error" :closable="false" style="margin-top:12px" />
    </el-card>

    <!-- 新增渠道弹窗 -->
    <el-dialog v-model="channelDialogVisible" title="新增渠道" width="400px">
      <el-form :model="channelForm" label-width="80px">
        <el-form-item label="渠道名称">
          <el-input v-model="channelForm.channelName" placeholder="如：微信群A" />
        </el-form-item>
        <el-form-item label="渠道类型">
          <el-select v-model="channelForm.channelType" placeholder="选择类型">
            <el-option label="微信" value="wechat" />
            <el-option label="小红书" value="xiaohongshu" />
            <el-option label="抖音" value="douyin" />
            <el-option label="快手" value="kuaishou" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="channelForm.channelDesc" type="textarea" rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="channelDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitChannel">确定</el-button>
      </template>
    </el-dialog>

    <!-- 生成追踪链接弹窗 -->
    <el-dialog v-model="linkDialogVisible" title="生成追踪链接" width="400px">
      <el-form :model="linkForm" label-width="80px">
        <el-form-item label="商品ID">
          <el-input v-model="linkForm.goodsId" placeholder="拼多多商品ID" />
        </el-form-item>
        <el-form-item label="推广计划">
          <el-select v-model="linkForm.planId" placeholder="选择计划（可选）">
            <el-option v-for="p in plans" :key="p.id" :label="p.plan_name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="投放渠道">
          <el-select v-model="linkForm.channelId" placeholder="选择渠道（可选）">
            <el-option v-for="c in channels" :key="c.id" :label="c.channel_name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标链接">
          <el-input v-model="linkForm.targetUrl" placeholder="https://..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="linkDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitLink">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, MagicStick, Plus, Link } from '@element-plus/icons-vue'
import * as api from '@/api/promotion'
import * as shopApi from '@/api/auth'

const shopId = ref(null)
const shopList = ref([])

const summary = ref({ ddk: {}, tracking: {}, roi: '0.00' })
const channelStats = ref([])
const channels = ref([])
const links = ref([])
const plans = ref([])

const syncLoading = ref(false)
const aiLoading = ref(false)
const aiDialogVisible = ref(false)
const aiStrategy = ref('')
const channelDialogVisible = ref(false)
const linkDialogVisible = ref(false)

const channelForm = ref({ channelName: '', channelType: '', channelDesc: '' })
const linkForm = ref({ goodsId: '', planId: null, channelId: null, targetUrl: '' })

const cpsForm = ref({ goodsId: '', rate: 50 })
const cpsLoading = ref(false)
const cpsResult = ref(null)
const cpsError = ref('')

const typeMap = { ddk: '多多进宝', search: '搜索推广', scene: '场景推广', cps_mall: '全店CPS' }

const statCards = computed(() => {
  const d = summary.value
  return [
    { key: 'ddkOrders', label: '进宝订单（7天）', value: d.ddk?.orderCount || 0, color: '#e02020' },
    { key: 'ddkGmv',    label: '进宝 GMV（7天）', value: `¥${((d.ddk?.totalGmv || 0) / 100).toFixed(2)}`, color: '#1890ff' },
    { key: 'clicks',    label: '追踪点击',        value: d.tracking?.totalClicks || 0, color: '#52c41a' },
    { key: 'roi',       label: '综合 ROI',        value: d.roi || '0.00', color: '#faad14' },
  ]
})

onMounted(async () => {
  const res = await shopApi.getShops()
  shopList.value = res || []
  if (shopList.value.length) {
    shopId.value = shopList.value[0].id
    await loadAll()
  }
})

async function onShopChange() {
  await loadAll()
}

async function loadAll() {
  if (!shopId.value) return
  const [s, cs, ch, ls, pl] = await Promise.all([
    api.getSummary(shopId.value),
    api.getChannelStats(shopId.value),
    api.getChannels(),
    api.getLinks(shopId.value),
    api.getPlans(shopId.value),
  ])
  summary.value = s || summary.value
  channelStats.value = cs || []
  channels.value = ch || []
  links.value = ls || []
  plans.value = pl || []
}

async function syncData() {
  syncLoading.value = true
  try {
    await api.syncPlans({ shopId: shopId.value, type: 'ddk' })
    await api.syncPlans({ shopId: shopId.value, type: 'cps' })
    await loadAll()
    ElMessage.success('同步完成')
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '同步失败')
  } finally {
    syncLoading.value = false
  }
}

async function getAiAdvice() {
  aiLoading.value = true
  try {
    const res = await api.getAiStrategy({ shopId: shopId.value })
    aiStrategy.value = res
    aiDialogVisible.value = true
  } catch (e) {
    ElMessage.error(e.response?.data?.message || 'AI 分析失败')
  } finally {
    aiLoading.value = false
  }
}

async function submitChannel() {
  if (!channelForm.value.channelName) return ElMessage.warning('请输入渠道名称')
  await api.addChannel(channelForm.value)
  channelDialogVisible.value = false
  channelForm.value = { channelName: '', channelType: '', channelDesc: '' }
  await loadAll()
  ElMessage.success('渠道添加成功')
}

async function delChannel(id) {
  await ElMessageBox.confirm('确认删除该渠道？', '提示', { type: 'warning' })
  await api.deleteChannel(id)
  await loadAll()
  ElMessage.success('已删除')
}

async function submitLink() {
  if (!linkForm.value.targetUrl) return ElMessage.warning('请输入目标链接')
  await api.createLink({ shopId: shopId.value, ...linkForm.value })
  linkDialogVisible.value = false
  linkForm.value = { goodsId: '', planId: null, channelId: null, targetUrl: '' }
  await loadAll()
  ElMessage.success('链接生成成功')
}

async function queryCps() {
  if (!cpsForm.value.goodsId) return ElMessage.warning('请输入商品ID')
  cpsLoading.value = true
  cpsError.value = ''
  try {
    cpsResult.value = await api.getCpsUnit(shopId.value, cpsForm.value.goodsId)
  } catch (e) {
    cpsResult.value = null
    cpsError.value = e.response?.data?.message || e.message || '查询失败'
  } finally {
    cpsLoading.value = false
  }
}

async function saveCps() {
  if (!cpsForm.value.goodsId || !cpsForm.value.rate) return ElMessage.warning('请输入商品ID和佣金比例')
  cpsLoading.value = true
  cpsError.value = ''
  try {
    const unit = {
      goods_id: +cpsForm.value.goodsId,
      rate: +cpsForm.value.rate,
    }
    const res = await api.createCpsUnit({ shopId: shopId.value, units: [unit] })
    cpsResult.value = res
    const failed = res?.failed_vos || []
    if (failed.length) {
      cpsError.value = failed.map(f => `商品 ${f.goods_id}: ${f.reason}`).join('; ')
    } else {
      ElMessage.success('设置成功')
    }
  } catch (e) {
    cpsError.value = e.response?.data?.message || e.message || '设置失败'
  } finally {
    cpsLoading.value = false
  }
}

async function deleteCps() {
  if (!cpsForm.value.goodsId) return ElMessage.warning('请输入商品ID')
  try {
    await ElMessageBox.confirm('确认删除该商品的 CPS 推广计划？', '提示', { type: 'warning' })
    cpsLoading.value = true
    cpsError.value = ''
    await api.deleteCpsUnit({ shopId: shopId.value, goodsId: cpsForm.value.goodsId })
    ElMessage.success('删除成功')
    cpsResult.value = null
  } catch (e) {
    if (e !== 'cancel') {
      cpsError.value = e.response?.data?.message || e.message || '删除失败'
    }
  } finally {
    cpsLoading.value = false
  }
}

function renderMarkdown(text) {
  // 简易 markdown → html
  return text
    .replace(/```[\s\S]*?```/g, m => `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow:auto">${m.slice(3, -3)}</pre>`)
    .replace(/###? (.*)/g, '<h4 style="margin:12px 0 6px">$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/- (.*)/g, '<li style="margin:4px 0">$1</li>')
    .replace(/\n/g, '<br>')
}
</script>

<style scoped>
.stat-card { border-radius: 8px; text-align: center; padding: 8px 0; }
.stat-label { font-size: 13px; color: #8c8c8c; margin-bottom: 8px; }
.stat-value { font-size: 26px; font-weight: bold; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.ai-content { line-height: 1.8; font-size: 14px; color: #333; }
.empty { text-align: center; color: #bfbfbf; padding: 32px 0; }
</style>
