<template>
  <div class="settings-page">
    <el-row :gutter="16">
      <!-- 通知配置 -->
      <el-col :span="12">
        <el-card shadow="never" header="通知配置">
          <el-form :model="form" label-width="140px" v-loading="loading">
            <el-form-item label="通知渠道">
              <el-radio-group v-model="form.notify_channel">
                <el-radio-button value="wecom-aibot">智能机器人</el-radio-button>
                <el-radio-button value="wecom">群机器人</el-radio-button>
                <el-radio-button value="feishu">飞书</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="form.notify_channel === 'wecom'" label="企业微信 Webhook">
              <el-input
                v-model="form.wecom_webhook_url"
                placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                clearable
              />
            </el-form-item>
            <template v-if="form.notify_channel === 'wecom-aibot'">
              <el-form-item label="智能机器人">
                <el-switch v-model="form.wecom_aibot_enabled" active-text="启用" inactive-text="停用" />
              </el-form-item>
              <el-form-item label="Bot ID">
                <el-input v-model="form.wecom_aibot_bot_id" placeholder="企业微信后台获取的 Bot ID" clearable />
              </el-form-item>
              <el-form-item label="Secret">
                <el-input v-model="form.wecom_aibot_secret" placeholder="企业微信后台获取的 Secret" show-password clearable />
              </el-form-item>
              <el-form-item label="默认会话 chatid">
                <el-input v-model="form.wecom_aibot_default_chat_id" placeholder="可选，用于主动推送日报/周报/告警" clearable />
              </el-form-item>
              <el-form-item label="默认店铺 ID">
                <el-input-number v-model="form.wecom_aibot_default_shop_id" :min="0" style="width:160px" />
                <span style="margin-left:8px;color:#8c8c8c;font-size:13px">0 表示自动取第一个活跃店铺</span>
              </el-form-item>
            </template>
            <el-form-item v-if="form.notify_channel === 'feishu'" label="飞书 Webhook">
              <el-input
                v-model="form.feishu_webhook_url"
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                clearable
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="save('notify')" :loading="saving.notify">保存</el-button>
              <el-button @click="testWebhook" :loading="testing" style="margin-left:8px">测试通知</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 库存预警 -->
      <el-col :span="12">
        <el-card shadow="never" header="库存预警配置">
          <el-form :model="form" label-width="140px" v-loading="loading">
            <el-form-item label="预警阈值（件）">
              <el-input-number
                v-model="form.stock_warning_threshold"
                :min="1" :max="9999"
                style="width:160px"
              />
              <span style="margin-left:8px;color:#8c8c8c;font-size:13px">库存低于此值时发送通知告警</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="save('stock')" :loading="saving.stock">保存</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 定时任务 -->
      <el-col :span="12" style="margin-top:16px">
        <el-card shadow="never" header="定时任务配置">
          <el-form :model="form" label-width="140px" v-loading="loading">
            <el-form-item label="订单同步">
              <el-switch v-model="form.job_order_enabled" />
              <el-input
                v-model="form.job_order_cron"
                placeholder="*/5 * * * *"
                style="width:150px;margin-left:12px"
                size="small"
              />
              <span class="job-desc">Cron 表达式，默认每 5 分钟</span>
            </el-form-item>
            <el-form-item label="库存检查">
              <el-switch v-model="form.job_stock_enabled" />
              <el-input
                v-model="form.job_stock_cron"
                placeholder="0 * * * *"
                style="width:150px;margin-left:12px"
                size="small"
              />
              <span class="job-desc">Cron 表达式，默认每 1 小时</span>
            </el-form-item>
            <el-form-item label="日报生成">
              <el-switch v-model="form.job_report_enabled" />
              <el-input
                v-model="form.job_report_cron"
                placeholder="0 0 * * *"
                style="width:150px;margin-left:12px"
                size="small"
              />
              <span class="job-desc">Cron 表达式，默认每天 00:00</span>
            </el-form-item>
            <el-form-item label="退款同步">
              <el-switch v-model="form.job_refund_enabled" />
              <el-input
                v-model="form.job_refund_cron"
                placeholder="*/10 * * * *"
                style="width:150px;margin-left:12px"
                size="small"
              />
              <span class="job-desc">Cron 表达式，默认每 10 分钟</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="save('job')" :loading="saving.job">保存</el-button>
              <el-button @click="testRefundSync" :loading="testingRefund" style="margin-left:8px">测试退款同步</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- AI 配置 -->
      <el-col :span="12" style="margin-top:16px">
        <el-card shadow="never" header="AI 配置 (Kimi / DeepSeek)">
          <el-form :model="form" label-width="140px" v-loading="loading">
            <el-form-item label="Base URL">
              <el-input
                v-model="form.ai_base_url"
                placeholder="https://api.moonshot.cn/v1"
                clearable
              />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input
                v-model="form.ai_api_key"
                placeholder="sk-..."
                clearable
                show-password
              />
            </el-form-item>
            <el-form-item label="对话模型">
              <el-select
                v-model="form.ai_chat_model"
                placeholder="kimi-latest"
                filterable
                allow-create
                clearable
                style="width:100%"
              >
                <el-option
                  v-for="m in aiModels"
                  :key="m.id"
                  :label="m.id"
                  :value="m.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="推理模型">
              <el-select
                v-model="form.ai_reasoner_model"
                placeholder="kimi-k2"
                filterable
                allow-create
                clearable
                style="width:100%"
              >
                <el-option
                  v-for="m in aiModels"
                  :key="m.id"
                  :label="m.id"
                  :value="m.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="User-Agent">
              <el-input
                v-model="form.ai_user_agent"
                placeholder="KimiCLI/1.3"
                clearable
              />
            </el-form-item>
            <el-form-item label="AI 自动回复">
              <el-switch v-model="form.ai_auto_reply" />
              <span style="margin-left:10px;color:#8c8c8c;font-size:13px">
                关闭后，未命中关键词/话术库的消息将转人工处理，不调用 AI
              </span>
            </el-form-item>
            <el-form-item label="客服默认 Prompt">
              <el-input
                v-model="form.ai_cs_system_prompt"
                type="textarea"
                :rows="6"
                placeholder="你是拼多多店铺专业客服，回复简洁友好，不超过 150 字。店铺规则：下单后 48 小时内发货，7 天无理由退换，物流使用圆通快递。"
                maxlength="2000"
                show-word-limit
              />
              <span style="margin-left:8px;color:#8c8c8c;font-size:13px">
                留空将使用默认 Prompt；保存后立即对新的客服消息生效
              </span>
            </el-form-item>
            <el-form-item label="每日调用上限">
              <el-input-number
                v-model="form.deepseek_daily_limit"
                :min="0" :max="99999"
                style="width:160px"
              />
              <span style="margin-left:8px;color:#8c8c8c;font-size:13px">次/天</span>
            </el-form-item>
            <el-form-item label="今日已调用">
              <el-progress
                :percentage="aiUsagePercent"
                :color="aiUsagePercent > 80 ? '#ff4d4f' : '#1890ff'"
                style="width:200px;display:inline-flex;align-items:center"
              />
              <span style="margin-left:8px;color:#595959;font-size:13px">
                {{ aiStats.todayCount || 0 }} / {{ form.deepseek_daily_limit }} 次
              </span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="save('ai')" :loading="saving.ai">保存</el-button>
              <el-button @click="syncAiModels" :loading="saving.aiModels" style="margin-left:8px">
                探索可用模型
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 操作日志 -->
      <el-col :span="24" style="margin-top:16px">
        <el-card shadow="never">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span>操作日志</span>
              <el-button size="small" :icon="Refresh" @click="fetchLogs(1)">刷新</el-button>
            </div>
          </template>
          <el-table :data="logs" v-loading="logsLoading" size="small" max-height="360">
            <el-table-column prop="created_at" label="时间" width="180" />
            <el-table-column prop="action" label="操作" width="180" show-overflow-tooltip />
            <el-table-column prop="detail" label="详情" min-width="300" show-overflow-tooltip />
            <el-table-column prop="status" label="结果" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
                  {{ row.status === 'success' ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!logs.length && !logsLoading" class="empty">暂无操作日志</div>
          <el-pagination
            v-if="logsTotal > 20"
            v-model:current-page="logsPage"
            :page-size="20"
            :total="logsTotal"
            layout="total, prev, pager, next"
            style="margin-top:12px;justify-content:flex-end"
            @current-change="fetchLogs"
          />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import request from '@/api/request'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

const loading = ref(false)
const saving = ref({ notify: false, stock: false, job: false, ai: false })
const testing = ref(false)
const testingRefund = ref(false)
const logsLoading = ref(false)
const logsPage = ref(1)
const logsTotal = ref(0)
const logs = ref([])
const aiStats = ref({})
const aiModels = ref([])

const form = ref({
  notify_channel: 'wecom',
  feishu_webhook_url: '',
  wecom_webhook_url: '',
  wecom_aibot_enabled: true,
  wecom_aibot_bot_id: '',
  wecom_aibot_secret: '',
  wecom_aibot_default_chat_id: '',
  wecom_aibot_default_shop_id: 0,
  stock_warning_threshold: 10,
  job_order_enabled: true,
  job_stock_enabled: true,
  job_report_enabled: true,
  job_refund_enabled: true,
  job_order_cron: '*/5 * * * *',
  job_stock_cron: '0 * * * *',
  job_report_cron: '0 0 * * *',
  job_refund_cron: '*/10 * * * *',
  deepseek_daily_limit: 1000,
  ai_base_url: '',
  ai_api_key: '',
  ai_chat_model: '',
  ai_reasoner_model: '',
  ai_user_agent: 'KimiCLI/1.3',
  ai_auto_reply: true,
  ai_cs_system_prompt: ''
})

const aiUsagePercent = computed(() => {
  const limit = form.value.deepseek_daily_limit
  if (!limit) return 0
  return Math.min(100, Math.round(((aiStats.value.todayCount || 0) / limit) * 100))
})

onMounted(async () => {
  await Promise.all([fetchConfig(), fetchLogs(1)])
})

async function fetchConfig() {
  loading.value = true
  try {
    const data = await request.get('/settings')
    Object.assign(form.value, {
      notify_channel: data.notify_channel || 'wecom',
      feishu_webhook_url: data.feishu_webhook_url || '',
      wecom_webhook_url: data.wecom_webhook_url || '',
      wecom_aibot_enabled: data.wecom_aibot_enabled !== 'false',
      wecom_aibot_bot_id: data.wecom_aibot_bot_id || '',
      wecom_aibot_secret: data.wecom_aibot_secret || '',
      wecom_aibot_default_chat_id: data.wecom_aibot_default_chat_id || '',
      wecom_aibot_default_shop_id: +(data.wecom_aibot_default_shop_id || 0),
      stock_warning_threshold: data.stock_warning_threshold ?? 10,
      job_order_enabled: data.job_order_enabled !== false,
      job_stock_enabled: data.job_stock_enabled !== false,
      job_report_enabled: data.job_report_enabled !== false,
      job_refund_enabled: data.job_refund_enabled !== false,
      job_order_cron: data.job_order_cron || '*/5 * * * *',
      job_stock_cron: data.job_stock_cron || '0 * * * *',
      job_report_cron: data.job_report_cron || '0 0 * * *',
      job_refund_cron: data.job_refund_cron || '*/10 * * * *',
      deepseek_daily_limit: data.deepseek_daily_limit ?? 1000,
      ai_base_url: data.ai_base_url || '',
      ai_api_key: data.ai_api_key || '',
      ai_chat_model: data.ai_chat_model || '',
      ai_reasoner_model: data.ai_reasoner_model || '',
      ai_user_agent: data.ai_user_agent || 'KimiCLI/1.3',
      ai_auto_reply: data.ai_auto_reply !== false,
      ai_cs_system_prompt: data.ai_cs_system_prompt || ''
    })
    aiStats.value = data.ai_stats || {}
    aiModels.value = data.ai_available_models || []
  } finally {
    loading.value = false
  }
}

const saveKeys = {
  notify: ['notify_channel', 'feishu_webhook_url', 'wecom_webhook_url', 'wecom_aibot_enabled', 'wecom_aibot_bot_id', 'wecom_aibot_secret', 'wecom_aibot_default_chat_id', 'wecom_aibot_default_shop_id'],
  stock: ['stock_warning_threshold'],
  job: ['job_order_enabled', 'job_stock_enabled', 'job_report_enabled', 'job_refund_enabled', 'job_order_cron', 'job_stock_cron', 'job_report_cron', 'job_refund_cron'],
  ai: ['deepseek_daily_limit', 'ai_base_url', 'ai_api_key', 'ai_chat_model', 'ai_reasoner_model', 'ai_user_agent', 'ai_auto_reply', 'ai_cs_system_prompt']
}

function isValidCron(expr) {
  if (!expr || typeof expr !== 'string') return false
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  return parts.every(p => /^[\d*,/\-?L#]+$/.test(p))
}

async function save(type) {
  saving.value[type] = true
  try {
    const payload = {}
    for (const key of saveKeys[type]) {
      payload[key] = form.value[key]
    }
    if (type === 'job') {
      for (const key of ['job_order_cron', 'job_stock_cron', 'job_report_cron', 'job_refund_cron']) {
        if (!isValidCron(payload[key])) {
          return ElMessage.warning(`Cron 表达式格式不正确: ${payload[key]}`)
        }
      }
    }
    await request.put('/settings', payload)
    ElMessage.success('保存成功')
  } finally {
    saving.value[type] = false
  }
}

async function syncAiModels() {
  saving.value.aiModels = true
  try {
    const list = await request.post('/settings/ai-models/sync')
    aiModels.value = list || []
    ElMessage.success(`已同步 ${list.length} 个可用模型`)
  } catch (err) {
    // error handled by interceptor
  } finally {
    saving.value.aiModels = false
  }
}

async function testWebhook() {
  if (form.value.notify_channel === 'wecom-aibot') {
    if (!form.value.wecom_aibot_bot_id || !form.value.wecom_aibot_secret) {
      return ElMessage.warning('请先填写 Bot ID 和 Secret 并保存')
    }
  } else {
    const url = form.value.notify_channel === 'wecom' ? form.value.wecom_webhook_url : form.value.feishu_webhook_url
    if (!url) {
      return ElMessage.warning(`请先填写 ${form.value.notify_channel === 'wecom' ? '企业微信' : '飞书'} Webhook 地址并保存`)
    }
  }
  testing.value = true
  try {
    await request.post('/settings/test-webhook')
    ElMessage.success('测试通知已发送')
  } finally {
    testing.value = false
  }
}

async function testRefundSync() {
  testingRefund.value = true
  try {
    const data = await request.post('/sync/refunds', { shopId: 2, hoursAgo: 24 })
    ElMessage.success(`退款同步完成，共 ${data.total || 0} 条`)
  } finally {
    testingRefund.value = false
  }
}

async function fetchLogs(page = 1) {
  logsLoading.value = true
  logsPage.value = page
  try {
    const data = await request.get('/settings/logs', { params: { page, pageSize: 20 } })
    logs.value = data.list
    logsTotal.value = data.total
  } finally {
    logsLoading.value = false
  }
}
</script>

<style scoped>
.job-desc { margin-left: 10px; font-size: 13px; color: #8c8c8c; }
.empty { text-align: center; color: #bfbfbf; padding: 32px 0; font-size: 14px; }
</style>
