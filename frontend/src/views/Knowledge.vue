<template>
  <div class="knowledge-page">
    <el-tabs v-model="activeTab">
      <!-- 货盘管理 -->
      <el-tab-pane label="货盘管理" name="products">
        <div class="toolbar">
          <el-select v-model="prodFilters.categoryId" placeholder="全部分类" clearable style="width:160px" @change="fetchProducts">
            <el-option v-for="c in productCategories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-input v-model="prodFilters.keyword" placeholder="搜索商品名称/规格" clearable style="width:220px;margin-left:8px" @keyup.enter="fetchProducts" />
          <el-button type="primary" :icon="Plus" style="margin-left:8px" @click="openProductDialog()">新增商品</el-button>
          <el-button type="success" :icon="Refresh" style="margin-left:8px" @click="syncFromPdd" :loading="syncing">从拼多多同步</el-button>
        </div>
        <el-table :data="products" v-loading="prodLoading" style="margin-top:12px">
          <el-table-column prop="name" label="商品名称" min-width="200" show-overflow-tooltip />
          <el-table-column prop="price" label="价格" width="100">
            <template #default="{ row }">¥{{ row.price ?? '-' }}</template>
          </el-table-column>
          <el-table-column prop="stock" label="库存" width="80" />
          <el-table-column prop="selling_points" label="卖点" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="160">
            <template #default="{ row }">
              <el-button link type="primary" @click="openProductDialog(row)">编辑</el-button>
              <el-popconfirm title="确认删除?" @confirm="deleteProduct(row.id)">
                <template #reference><el-button link type="danger">删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="prodPage"
          :page-size="prodPageSize"
          :total="prodTotal"
          layout="total, prev, pager, next"
          style="margin-top:12px;justify-content:flex-end"
          @current-change="fetchProducts"
        />
      </el-tab-pane>

      <!-- 话术管理 -->
      <el-tab-pane label="话术管理" name="scripts">
        <div class="toolbar">
          <el-select v-model="scriptFilters.categoryId" placeholder="全部分类" clearable style="width:160px" @change="fetchScripts">
            <el-option v-for="c in scriptCategories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-input v-model="scriptFilters.keyword" placeholder="搜索话术标题/内容" clearable style="width:220px;margin-left:8px" @keyup.enter="fetchScripts" />
          <el-button type="primary" :icon="Plus" style="margin-left:8px" @click="openScriptDialog()">新增话术</el-button>
        </div>
        <el-table :data="scripts" v-loading="scriptLoading" style="margin-top:12px">
          <el-table-column prop="title" label="话术标题" min-width="180" show-overflow-tooltip />
          <el-table-column prop="content" label="话术内容" min-width="300" show-overflow-tooltip />
          <el-table-column prop="hit_count" label="命中次数" width="90" />
          <el-table-column label="操作" width="160">
            <template #default="{ row }">
              <el-button link type="primary" @click="openScriptDialog(row)">编辑</el-button>
              <el-popconfirm title="确认删除?" @confirm="deleteScript(row.id)">
                <template #reference><el-button link type="danger">删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="scriptPage"
          :page-size="scriptPageSize"
          :total="scriptTotal"
          layout="total, prev, pager, next"
          style="margin-top:12px;justify-content:flex-end"
          @current-change="fetchScripts"
        />
      </el-tab-pane>

      <!-- 分类设置 -->
      <el-tab-pane label="分类设置" name="categories">
        <el-row :gutter="24">
          <el-col :span="12">
            <div class="cat-header">
              <span class="cat-title">商品分类</span>
              <el-button type="primary" size="small" :icon="Plus" @click="openCategoryDialog('product')">新增</el-button>
            </div>
            <el-table :data="productCategories" size="small" style="margin-top:8px">
              <el-table-column prop="name" label="分类名称" />
              <el-table-column prop="sort_order" label="排序" width="80" />
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" @click="openCategoryDialog('product', row)">编辑</el-button>
                  <el-button link type="danger" size="small" @click="deleteCategory(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-col>
          <el-col :span="12">
            <div class="cat-header">
              <span class="cat-title">话术分类</span>
              <el-button type="primary" size="small" :icon="Plus" @click="openCategoryDialog('script')">新增</el-button>
            </div>
            <el-table :data="scriptCategories" size="small" style="margin-top:8px">
              <el-table-column prop="name" label="分类名称" />
              <el-table-column prop="sort_order" label="排序" width="80" />
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" @click="openCategoryDialog('script', row)">编辑</el-button>
                  <el-button link type="danger" size="small" @click="deleteCategory(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>

    <!-- 商品弹窗 -->
    <el-dialog v-model="prodVisible" :title="prodForm.id ? '编辑商品' : '新增商品'" width="560px">
      <el-form :model="prodForm" label-width="80px">
        <el-form-item label="商品名称" required>
          <el-input v-model="prodForm.name" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="prodForm.categoryId" placeholder="选择分类" clearable style="width:100%">
            <el-option v-for="c in productCategories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="价格">
          <el-input-number v-model="prodForm.price" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="库存">
          <el-input-number v-model="prodForm.stock" :min="0" :precision="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="卖点">
          <el-input v-model="prodForm.sellingPoints" type="textarea" :rows="3" placeholder="如：纯棉材质，亲肤透气..." />
        </el-form-item>
        <el-form-item label="规格">
          <div v-for="(val, key) in prodForm.specs" :key="key" style="display:flex;gap:8px;margin-bottom:8px">
            <el-input v-model="prodForm.specKeys[key]" placeholder="规格名" style="width:120px" />
            <el-input v-model="prodForm.specVals[key]" placeholder="规格值" style="width:180px" />
            <el-button link type="danger" @click="removeSpec(key)">删除</el-button>
          </div>
          <el-button link type="primary" @click="addSpec">+ 添加规格</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="prodVisible = false">取消</el-button>
        <el-button type="primary" @click="saveProduct" :loading="prodSaving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 话术弹窗 -->
    <el-dialog v-model="scriptVisible" :title="scriptForm.id ? '编辑话术' : '新增话术'" width="560px">
      <el-form :model="scriptForm" label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="scriptForm.title" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="scriptForm.categoryId" placeholder="选择分类" clearable style="width:100%">
            <el-option v-for="c in scriptCategories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="话术内容" required>
          <el-input v-model="scriptForm.content" type="textarea" :rows="6" placeholder="请输入完整回复话术..." />
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="scriptForm.tags" multiple allow-create filterable placeholder="输入标签后回车" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scriptVisible = false">取消</el-button>
        <el-button type="primary" @click="saveScript" :loading="scriptSaving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分类弹窗 -->
    <el-dialog v-model="catVisible" :title="catForm.id ? '编辑分类' : '新增分类'" width="400px">
      <el-form :model="catForm" label-width="80px">
        <el-form-item label="分类名称" required>
          <el-input v-model="catForm.name" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="catForm.sortOrder" :min="0" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="catVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCategory" :loading="catSaving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { knowledgeApi } from '@/api/knowledge'
const SHOP_ID = 1

const activeTab = ref('products')

// 分类
const productCategories = ref([])
const scriptCategories = ref([])

async function fetchCategories() {
  const shopId = SHOP_ID
  productCategories.value = await knowledgeApi.getCategories({ shopId, type: 'product' })
  scriptCategories.value = await knowledgeApi.getCategories({ shopId, type: 'script' })
}

// 货盘
const prodLoading = ref(false)
const products = ref([])
const prodPage = ref(1)
const prodPageSize = ref(20)
const prodTotal = ref(0)
const prodFilters = reactive({ categoryId: '', keyword: '' })

async function fetchProducts() {
  prodLoading.value = true
  try {
    const res = await knowledgeApi.getProducts({
      shopId: SHOP_ID,
      categoryId: prodFilters.categoryId || undefined,
      keyword: prodFilters.keyword || undefined,
      page: prodPage.value,
      pageSize: prodPageSize.value,
    })
    products.value = res.list
    prodTotal.value = res.total
  } finally { prodLoading.value = false }
}

const prodVisible = ref(false)
const prodSaving = ref(false)
const prodForm = reactive({ id: null, name: '', categoryId: null, price: null, stock: null, sellingPoints: '', specs: {}, specKeys: {}, specVals: {} })

function openProductDialog(row) {
  if (row) {
    Object.assign(prodForm, { ...row, categoryId: row.category_id, sellingPoints: row.selling_points })
    const keys = {}, vals = {}
    Object.entries(row.specs || {}).forEach(([k, v], i) => { keys[i] = k; vals[i] = v })
    prodForm.specKeys = keys
    prodForm.specVals = vals
  } else {
    Object.assign(prodForm, { id: null, name: '', categoryId: null, price: null, stock: null, sellingPoints: '', specs: {}, specKeys: {}, specVals: {} })
  }
  prodVisible.value = true
}

function addSpec() {
  const idx = Object.keys(prodForm.specKeys).length
  prodForm.specKeys[idx] = ''
  prodForm.specVals[idx] = ''
}

function removeSpec(key) {
  delete prodForm.specKeys[key]
  delete prodForm.specVals[key]
}

async function saveProduct() {
  if (!prodForm.name) return ElMessage.warning('商品名称必填')
  prodSaving.value = true
  try {
    const specs = {}
    Object.keys(prodForm.specKeys).forEach(i => {
      const k = prodForm.specKeys[i]?.trim()
      const v = prodForm.specVals[i]?.trim()
      if (k) specs[k] = v
    })
    const payload = {
      shopId: SHOP_ID,
      name: prodForm.name,
      categoryId: prodForm.categoryId,
      price: prodForm.price,
      stock: prodForm.stock,
      sellingPoints: prodForm.sellingPoints,
      specs,
    }
    if (prodForm.id) {
      await knowledgeApi.updateProduct(prodForm.id, payload)
    } else {
      await knowledgeApi.createProduct(payload)
    }
    ElMessage.success('保存成功')
    prodVisible.value = false
    fetchProducts()
  } finally { prodSaving.value = false }
}

async function deleteProduct(id) {
  await knowledgeApi.deleteProduct(id)
  ElMessage.success('删除成功')
  fetchProducts()
}

const syncing = ref(false)
async function syncFromPdd() {
  syncing.value = true
  try {
    const res = await knowledgeApi.syncProducts({ shopId: SHOP_ID })
    ElMessage.success(res.message)
    fetchProducts()
  } finally { syncing.value = false }
}

// 话术
const scriptLoading = ref(false)
const scripts = ref([])
const scriptPage = ref(1)
const scriptPageSize = ref(20)
const scriptTotal = ref(0)
const scriptFilters = reactive({ categoryId: '', keyword: '' })

async function fetchScripts() {
  scriptLoading.value = true
  try {
    const res = await knowledgeApi.getScripts({
      shopId: SHOP_ID,
      categoryId: scriptFilters.categoryId || undefined,
      keyword: scriptFilters.keyword || undefined,
      page: scriptPage.value,
      pageSize: scriptPageSize.value,
    })
    scripts.value = res.list
    scriptTotal.value = res.total
  } finally { scriptLoading.value = false }
}

const scriptVisible = ref(false)
const scriptSaving = ref(false)
const scriptForm = reactive({ id: null, title: '', categoryId: null, content: '', tags: [] })

function openScriptDialog(row) {
  if (row) {
    Object.assign(scriptForm, { ...row, categoryId: row.category_id })
  } else {
    Object.assign(scriptForm, { id: null, title: '', categoryId: null, content: '', tags: [] })
  }
  scriptVisible.value = true
}

async function saveScript() {
  if (!scriptForm.title || !scriptForm.content) return ElMessage.warning('标题和话术内容必填')
  scriptSaving.value = true
  try {
    const payload = {
      shopId: SHOP_ID,
      title: scriptForm.title,
      categoryId: scriptForm.categoryId,
      content: scriptForm.content,
      tags: scriptForm.tags,
    }
    if (scriptForm.id) {
      await knowledgeApi.updateScript(scriptForm.id, payload)
    } else {
      await knowledgeApi.createScript(payload)
    }
    ElMessage.success('保存成功')
    scriptVisible.value = false
    fetchScripts()
  } finally { scriptSaving.value = false }
}

async function deleteScript(id) {
  await knowledgeApi.deleteScript(id)
  ElMessage.success('删除成功')
  fetchScripts()
}

// 分类弹窗
const catVisible = ref(false)
const catSaving = ref(false)
const catForm = reactive({ id: null, name: '', type: 'product', sortOrder: 0 })

function openCategoryDialog(type, row) {
  catForm.type = type
  if (row) {
    Object.assign(catForm, { id: row.id, name: row.name, sortOrder: row.sort_order })
  } else {
    Object.assign(catForm, { id: null, name: '', sortOrder: 0 })
  }
  catVisible.value = true
}

async function saveCategory() {
  if (!catForm.name) return ElMessage.warning('分类名称必填')
  catSaving.value = true
  try {
    const payload = { shopId: SHOP_ID, name: catForm.name, type: catForm.type, sortOrder: catForm.sortOrder }
    if (catForm.id) {
      await knowledgeApi.updateCategory(catForm.id, payload)
    } else {
      await knowledgeApi.createCategory(payload)
    }
    ElMessage.success('保存成功')
    catVisible.value = false
    fetchCategories()
  } finally { catSaving.value = false }
}

async function deleteCategory(id) {
  await knowledgeApi.deleteCategory(id)
  ElMessage.success('删除成功')
  fetchCategories()
}

onMounted(() => {
  fetchCategories()
  fetchProducts()
  fetchScripts()
})
</script>

<style scoped>
.knowledge-page {
  padding: 0 4px;
}
.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.cat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.cat-title {
  font-weight: bold;
  font-size: 15px;
}
</style>
