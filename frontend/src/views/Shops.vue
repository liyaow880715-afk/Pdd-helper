<template>
  <div class="shops-page">
    <el-card shadow="never">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>店铺管理</span>
          <div>
            <el-button type="primary" :icon="Plus" @click="addDialogVisible = true">新增店铺</el-button>
            <el-button type="primary" :icon="Refresh" :loading="loading" @click="fetchShops">刷新</el-button>
          </div>
        </div>
      </template>

      <el-table :data="shops" v-loading="loading" size="small" border>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="店铺名称" min-width="180">
          <template #default="{ row }">
            <div v-if="editingId === row.id" style="display:flex;gap:8px">
              <el-input v-model="editingName" size="small" style="width:200px" />
              <el-button type="primary" size="small" :icon="Check" @click="saveName(row)" />
              <el-button size="small" :icon="Close" @click="cancelEdit" />
            </div>
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="client_id" label="client_id" min-width="180" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '正常' : '已禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="340" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="startEdit(row)">修改名称</el-button>
            <el-button link type="success" :loading="row.verifying" @click="verifyShop(row)">验证</el-button>
            <el-button link type="warning" @click="openReauth(row)">重新授权</el-button>
            <el-button link type="info" @click="openEditCreds(row)">编辑凭证</el-button>
            <el-button v-if="row.status === 'disabled'" link type="primary" @click="handleEnable(row)">启用</el-button>
            <el-button v-else link type="danger" :icon="Delete" @click="handleDisable(row)">禁用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>

  <!-- 重新授权弹窗 -->
  <el-dialog v-model="reauthDialogVisible" title="重新授权" width="480px">
    <p style="margin:0 0 12px;color:#666">店铺：{{ reauthRow?.name }}</p>
    <el-form :model="reauthForm" label-width="110px">
      <el-form-item v-if="!defaultApp.hasSecret" label="client_secret" required>
        <el-input v-model="reauthForm.clientSecret" type="password" show-password placeholder="重新输入 client_secret 以生成授权链接" />
      </el-form-item>
      <el-form-item label="redirect_uri">
        <el-input v-model="reauthForm.redirectUri" placeholder="可选，默认使用系统配置" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="reauthDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitReauth" :loading="reauthing">生成授权链接</el-button>
    </template>
  </el-dialog>

  <!-- 编辑凭证弹窗 -->
  <el-dialog v-model="editCredsDialogVisible" title="编辑凭证" width="520px">
    <p style="margin:0 0 12px;color:#666">店铺：{{ editCredsRow?.name }}</p>
    <p style="margin:0 0 12px;color:#999;font-size:12px">留空的字段将保持原值不变</p>
    <el-form :model="editCredsForm" label-width="110px">
      <el-form-item label="client_id">
        <el-input v-model="editCredsForm.clientId" placeholder="不修改请留空" />
      </el-form-item>
      <el-form-item label="client_secret">
        <el-input v-model="editCredsForm.clientSecret" type="password" show-password placeholder="不修改请留空" />
      </el-form-item>
      <el-form-item label="access_token">
        <el-input v-model="editCredsForm.accessToken" type="password" show-password placeholder="不修改请留空" />
      </el-form-item>
      <el-form-item label="refresh_token">
        <el-input v-model="editCredsForm.refreshToken" type="password" show-password placeholder="不修改请留空" />
      </el-form-item>
      <el-form-item label="redirect_uri">
        <el-input v-model="editCredsForm.redirectUri" placeholder="不修改请留空" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="editCredsDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitEditCreds" :loading="editCredsLoading">保存</el-button>
    </template>
  </el-dialog>

  <!-- 新增店铺弹窗 -->
  <el-dialog v-model="addDialogVisible" title="新增店铺" width="520px">
    <el-form :model="addForm" label-width="110px">
      <el-form-item label="店铺名称" required>
        <el-input v-model="addForm.name" placeholder="如：测试店铺1" />
      </el-form-item>
      <el-form-item label="client_id">
        <el-input v-model="addForm.clientId" :placeholder="defaultApp.clientId ? '已默认填充，可修改' : 'POP 分配的 client_id'" />
      </el-form-item>
      <el-form-item label="client_secret">
        <el-input v-model="addForm.clientSecret" type="password" show-password :placeholder="defaultApp.hasSecret ? '已配置默认应用，可留空' : 'POP 分配的 client_secret'" />
      </el-form-item>
      <el-form-item label="access_token">
        <el-input v-model="addForm.accessToken" type="password" show-password placeholder="可选，未填写可后续通过授权或编辑凭证补充" />
      </el-form-item>
      <el-form-item label="refresh_token">
        <el-input v-model="addForm.refreshToken" type="password" show-password placeholder="可选，用于自动刷新 token" />
      </el-form-item>
      <el-form-item label="redirect_uri">
        <el-input v-model="addForm.redirectUri" placeholder="可选，OAuth 回调地址" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="addDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitAdd" :loading="adding">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Edit, Delete, Check, Close, Plus } from '@element-plus/icons-vue'
import {
  getShops,
  addShop,
  updateShop,
  verifyShop as verifyShopApi,
  disableShop as disableShopApi,
  enableShop as enableShopApi,
  getAuthUrl,
  getDefaultPddApp
} from '@/api/shop'
import { useShopStore } from '@/stores/shop'

const shopStore = useShopStore()
const shops = ref([])
const loading = ref(false)
const editingId = ref(null)
const editingName = ref('')
const addDialogVisible = ref(false)
const addForm = ref({
  name: '',
  clientId: '',
  clientSecret: '',
  accessToken: '',
  refreshToken: '',
  redirectUri: ''
})
const defaultApp = ref({ clientId: '', hasSecret: false })

onMounted(async () => {
  await fetchShops()
  try {
    defaultApp.value = await getDefaultPddApp()
    if (defaultApp.value.clientId && !addForm.value.clientId) {
      addForm.value.clientId = defaultApp.value.clientId
    }
  } catch {
    defaultApp.value = { clientId: '', hasSecret: false }
  }
})

async function fetchShops() {
  loading.value = true
  try {
    shops.value = await getShops()
  } finally {
    loading.value = false
  }
}

function startEdit(row) {
  editingId.value = row.id
  editingName.value = row.name
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

async function saveName(row) {
  if (!editingName.value.trim()) return ElMessage.warning('店铺名称不能为空')
  try {
    await updateShop(row.id, { name: editingName.value.trim() })
    row.name = editingName.value.trim()
    editingId.value = null
    ElMessage.success('修改成功')
    await shopStore.loadShops()
  } catch (err) {
    ElMessage.error(err.message || '修改失败')
  }
}

async function verifyShop(row) {
  row.verifying = true
  try {
    const res = await verifyShopApi(row.id)
    if (res.valid) {
      ElMessage.success('店铺凭证有效')
    } else {
      ElMessage.error(res.error || '凭证验证失败')
    }
  } finally {
    row.verifying = false
  }
}

const adding = ref(false)
const reauthDialogVisible = ref(false)
const reauthRow = ref(null)
const reauthForm = ref({ clientSecret: '', redirectUri: '' })
const reauthing = ref(false)
const editCredsDialogVisible = ref(false)
const editCredsRow = ref(null)
const editCredsForm = ref({ clientId: '', clientSecret: '', accessToken: '', refreshToken: '', redirectUri: '' })
const editCredsLoading = ref(false)

async function submitAdd() {
  if (!addForm.value.name) {
    return ElMessage.warning('店铺名称为必填')
  }
  if (!addForm.value.clientId && !defaultApp.value.clientId) {
    return ElMessage.warning('未配置默认应用，请填写 client_id')
  }
  if (!addForm.value.clientSecret && !defaultApp.value.hasSecret) {
    return ElMessage.warning('未配置默认应用，请填写 client_secret')
  }
  adding.value = true
  try {
    await addShop(addForm.value)
    ElMessage.success('新增成功')
    addDialogVisible.value = false
    addForm.value = { name: '', clientId: '', clientSecret: '', accessToken: '', refreshToken: '', redirectUri: '' }
    await fetchShops()
    await shopStore.loadShops()
  } catch (err) {
    ElMessage.error(err.message || '新增失败')
  } finally {
    adding.value = false
  }
}

async function handleEnable(row) {
  try {
    await ElMessageBox.confirm(`确认启用店铺「${row.name}」？`, '提示', { type: 'info' })
    await enableShopApi(row.id)
    ElMessage.success('已启用')
    await fetchShops()
    await shopStore.loadShops()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.message || '启用失败')
  }
}

function openReauth(row) {
  reauthRow.value = row
  reauthForm.value = { clientSecret: '', redirectUri: '' }
  reauthDialogVisible.value = true
}

async function submitReauth() {
  if (!defaultApp.value.hasSecret && !reauthForm.value.clientSecret) {
    return ElMessage.warning('请输入 client_secret')
  }
  reauthing.value = true
  try {
    const { authUrl } = await getAuthUrl({
      clientId: reauthRow.value.client_id,
      clientSecret: defaultApp.value.hasSecret ? undefined : reauthForm.value.clientSecret,
      name: reauthRow.value.name,
      redirectUri: reauthForm.value.redirectUri || undefined
    })
    window.open(authUrl, '_blank')
    reauthDialogVisible.value = false
    ElMessage.success('已打开拼多多授权页面，授权完成后店铺会自动更新')
  } catch (err) {
    ElMessage.error(err.message || '生成授权链接失败')
  } finally {
    reauthing.value = false
  }
}

function openEditCreds(row) {
  editCredsRow.value = row
  editCredsForm.value = { clientId: '', clientSecret: '', accessToken: '', refreshToken: '', redirectUri: '' }
  editCredsDialogVisible.value = true
}

async function submitEditCreds() {
  const payload = {}
  const f = editCredsForm.value
  if (f.clientId) payload.clientId = f.clientId
  if (f.clientSecret) payload.clientSecret = f.clientSecret
  if (f.accessToken) payload.accessToken = f.accessToken
  if (f.refreshToken) payload.refreshToken = f.refreshToken
  if (f.redirectUri) payload.redirectUri = f.redirectUri
  if (!Object.keys(payload).length) {
    editCredsDialogVisible.value = false
    return
  }
  editCredsLoading.value = true
  try {
    await updateShop(editCredsRow.value.id, payload)
    ElMessage.success('凭证已更新')
    editCredsDialogVisible.value = false
    await fetchShops()
    await shopStore.loadShops()
  } catch (err) {
    ElMessage.error(err.message || '更新失败')
  } finally {
    editCredsLoading.value = false
  }
}

async function handleDisable(row) {
  try {
    await ElMessageBox.confirm(`确认禁用店铺「${row.name}」？禁用后仍可恢复。`, '提示', { type: 'warning' })
    await disableShopApi(row.id)
    ElMessage.success('已禁用')
    await fetchShops()
    await shopStore.loadShops()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.message || '禁用失败')
  }
}
</script>

<style scoped>
.shops-page { padding: 0; }
</style>
