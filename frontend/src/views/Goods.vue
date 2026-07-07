<template>
  <div class="goods-page">
    <el-card shadow="never">
      <!-- 搜索栏 -->
      <div class="toolbar">
        <div class="filters">
          <el-input
            v-model="goodsStore.params.keyword"
            placeholder="搜索商品名称"
            clearable
            style="width:220px"
            @keyup.enter="handleSearch"
          />
          <el-select v-model="goodsStore.params.status" placeholder="全部状态" clearable style="width:140px">
            <el-option label="上架中" value="on" />
            <el-option label="已下架" value="off" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </div>
        <div class="actions">
          <el-button :icon="Refresh" @click="handleSync" :loading="syncing">同步商品</el-button>
          <el-button type="primary" :icon="Plus" @click="openPublishDialog">发布商品</el-button>
          <el-button type="success" @click="batchOnShelf" :disabled="!selectedIds.length">批量上架</el-button>
          <el-button type="warning" @click="batchOffShelf" :disabled="!selectedIds.length">批量下架</el-button>
        </div>
      </div>

      <!-- 表格 -->
      <el-table
        :data="goodsStore.list"
        v-loading="goodsStore.loading"
        @selection-change="handleSelectionChange"
        style="margin-top:16px"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column type="expand" width="50">
          <template #default="{ row }">
            <el-table :data="formatSkus(row.skus)" size="small" border style="margin:8px 0 8px 24px;max-width:720px">
              <el-table-column prop="specInfo" label="规格" min-width="160" />
              <el-table-column prop="price" label="单买价" width="100">
                <template #default="{ row: r }">¥{{ r.price?.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="multiPrice" label="拼单价" width="100">
                <template #default="{ row: r }">¥{{ r.multiPrice?.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="quantity" label="库存" width="80" />
            </el-table>
          </template>
        </el-table-column>

        <!-- 商品图片 -->
        <el-table-column label="图片" width="80">
          <template #default="{ row }">
            <el-image
              v-if="row.image_url"
              :src="row.image_url"
              :preview-src-list="[row.image_url]"
              :preview-teleported="true"
              fit="cover"
              style="width:48px;height:48px;border-radius:4px;cursor:pointer"
            />
            <div v-else class="no-img">
              <el-icon color="#d9d9d9" :size="24"><Picture /></el-icon>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="goods_id" label="商品ID" width="130" />
        <el-table-column prop="goods_name" label="商品名称" min-width="200" show-overflow-tooltip />

        <el-table-column prop="price" label="价格" width="100">
          <template #default="{ row }">¥{{ row.price?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="规格数" width="80">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ formatSkus(row.skus).length }}</el-tag>
          </template>
        </el-table-column>

        <!-- 库存行内编辑 -->
        <el-table-column prop="stock" label="库存" width="140">
          <template #default="{ row }">
            <div class="stock-cell" v-if="editingStockId !== row.goods_id" @click="startEditStock(row)">
              <el-tag :type="row.stock < 10 ? 'danger' : 'success'" style="cursor:pointer">
                {{ row.stock }}
              </el-tag>
              <el-icon class="edit-icon" :size="12"><Edit /></el-icon>
            </div>
            <div v-else class="stock-edit">
              <el-input-number
                v-model="editingStockVal"
                :min="0"
                size="small"
                style="width:90px"
                @keyup.enter="saveStock(row)"
                @keyup.esc="cancelEditStock"
                ref="stockInputRef"
              />
              <el-button type="primary" link :icon="Check" @click="saveStock(row)" />
              <el-button type="info" link :icon="Close" @click="cancelEditStock" />
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'on' ? 'success' : 'info'">
              {{ row.status === 'on' ? '上架中' : '已下架' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button
              link
              :type="row.status === 'on' ? 'warning' : 'success'"
              @click="toggleStatus(row)"
            >
              {{ row.status === 'on' ? '下架' : '上架' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="goodsStore.params.page"
        v-model:page-size="goodsStore.params.pageSize"
        :total="goodsStore.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        style="margin-top:16px;justify-content:flex-end"
        @change="goodsStore.fetchList"
      />
    </el-card>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" title="编辑线上商品" width="720px" :close-on-click-modal="false">
      <el-form v-loading="editLoading" :model="editForm" label-width="100px">
        <el-form-item label="商品标题">
          <div style="display:flex;gap:8px;width:100%">
            <el-input v-model="editForm.goodsName" maxlength="60" show-word-limit style="flex:1" />
            <el-button :loading="optimizingTitle" @click="handleOptimizeTitle(editForm.value, '')">AI 优化标题</el-button>
          </div>
        </el-form-item>
        <el-form-item label="商品描述">
          <el-input v-model="editForm.goodsDesc" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="轮播图">
          <div v-for="(url, idx) in editForm.carouselGallery" :key="idx" style="display:flex;gap:8px;margin-bottom:8px">
            <el-input v-model="editForm.carouselGallery[idx]" placeholder="图片 URL" />
            <el-button :icon="Delete" @click="editForm.carouselGallery.splice(idx, 1)" />
          </div>
          <el-button type="primary" link :icon="Plus" @click="editForm.carouselGallery.push('')">添加轮播图</el-button>
        </el-form-item>
        <el-form-item label="详情图">
          <div v-for="(url, idx) in editForm.detailGallery" :key="idx" style="display:flex;gap:8px;margin-bottom:8px">
            <el-input v-model="editForm.detailGallery[idx]" placeholder="图片 URL" />
            <el-button :icon="Delete" @click="editForm.detailGallery.splice(idx, 1)" />
          </div>
          <el-button type="primary" link :icon="Plus" @click="editForm.detailGallery.push('')">添加详情图</el-button>
        </el-form-item>
        <el-form-item label="参考价(元)">
          <el-input-number v-model="editForm.marketPrice" :precision="2" :min="0" style="width:160px" />
        </el-form-item>
        <el-form-item label="SKU 价格">
          <el-table :data="editForm.skus" size="small" border>
            <el-table-column prop="specInfo" label="规格" min-width="140" />
            <el-table-column prop="price" label="单买价(元)" width="130">
              <template #default="{ row }">
                <el-input-number v-model="row.price" :precision="2" :min="0" size="small" style="width:110px" />
              </template>
            </el-table-column>
            <el-table-column prop="multiPrice" label="拼单价(元)" width="130">
              <template #default="{ row }">
                <el-input-number v-model="row.multiPrice" :precision="2" :min="0" size="small" style="width:110px" />
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="当前库存" width="90">
              <template #default="{ row }">{{ row.quantity }}</template>
            </el-table-column>
          </el-table>
        </el-form-item>
        <el-form-item label="服务承诺">
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <el-checkbox v-model="editForm.isRefundable">7天无理由退货</el-checkbox>
            <el-checkbox v-model="editForm.isFolt">假一罚十</el-checkbox>
            <el-checkbox v-model="editForm.secondHand">二手商品</el-checkbox>
          </div>
        </el-form-item>
        <el-form-item label="发货时间">
          <el-select v-model="editForm.shipmentLimitSecond" style="width:160px">
            <el-option label="24小时" :value="86400" />
            <el-option label="48小时" :value="172800" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 发布商品弹窗 -->
    <el-dialog v-model="publishVisible" title="发布商品" width="720px" :close-on-click-modal="false">
      <el-form :model="publishForm" label-width="100px">
        <el-form-item label="商品类目" required>
          <el-cascader
            v-model="publishForm.catPath"
            :props="cascaderProps"
            placeholder="请选择叶子类目"
            style="width:100%"
            clearable
            @change="onCategoryChange"
          />
        </el-form-item>

        <el-form-item label="SPU/标品">
          <el-select
            v-model="selectedSpuId"
            filterable
            remote
            :remote-method="searchSpu"
            :loading="spuLoading"
            placeholder="输入关键词搜索标品"
            style="width:100%"
            clearable
            @change="onSpuChange"
          >
            <el-option v-for="s in spuList" :key="s.spuId" :label="s.spuName" :value="s.spuId" />
          </el-select>
        </el-form-item>

        <el-form-item label="商品标题" required>
          <div style="display:flex;gap:8px;width:100%">
            <el-input v-model="publishForm.goodsName" placeholder="最多 30 个汉字" maxlength="60" show-word-limit style="flex:1" />
            <el-button :loading="optimizingTitle" @click="handleOptimizeTitle(publishForm.value, '')">
              AI 优化标题
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="商品描述">
          <el-input v-model="publishForm.goodsDesc" type="textarea" :rows="2" placeholder="商品描述/卖点" />
        </el-form-item>

        <!-- 类目属性（必填 + 重要 + 联动） -->
        <template v-if="visibleProperties.length">
          <el-form-item
            v-for="p in visibleProperties"
            :key="p.ref_pid"
            :label="p.name"
            :required="p.required"
          >
            <!-- 多选 -->
            <el-select
              v-if="p.choose_max_num > 1"
              v-model="propertyValues[p.ref_pid]"
              multiple
              value-key="vid"
              :placeholder="`请选择${p.name}`"
              style="width:100%"
            >
              <el-option v-for="v in propertyOptions(p)" :key="v.vid" :label="v.value" :value="v" />
            </el-select>
            <!-- 单选，可搜索 -->
            <el-select
              v-else-if="propertyOptions(p).length > 0 || p.remoteSearch"
              v-model="propertyValues[p.ref_pid]"
              value-key="vid"
              filterable
              :remote="p.remoteSearch"
              :remote-method="(q) => searchPropertyValueOptions(p, q)"
              :loading="propLoading[p.ref_pid]"
              :placeholder="p.remoteSearch ? '输入关键词搜索' : `请选择${p.name}`"
              style="width:100%"
            >
              <el-option v-for="v in propertyOptions(p)" :key="v.vid" :label="v.value" :value="v" />
            </el-select>
            <!-- 自由文本 -->
            <el-input v-else v-model="propertyValues[p.ref_pid]" :placeholder="`请输入${p.name}`" />
          </el-form-item>
        </template>

        <el-form-item label="轮播图" required>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <div v-for="(url, idx) in publishForm.carouselGallery" :key="idx" style="position:relative">
              <el-image :src="url" fit="cover" style="width:80px;height:80px;border-radius:4px;border:1px solid #e4e7ed" />
              <el-icon class="img-close" @click="removeCarouselUrl(idx)"><Close /></el-icon>
            </div>
          </div>
          <el-upload
            action="#"
            :auto-upload="true"
            :http-request="(opts) => handleImageUpload(opts, 'carouselGallery')"
            :show-file-list="false"
            accept="image/jpeg,image/png,image/jpg"
            multiple
          >
            <el-button type="primary" link :icon="Plus">上传图片</el-button>
          </el-upload>
        </el-form-item>

        <el-form-item label="详情图">
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <div v-for="(url, idx) in publishForm.detailGallery" :key="idx" style="position:relative">
              <el-image :src="url" fit="cover" style="width:80px;height:80px;border-radius:4px;border:1px solid #e4e7ed" />
              <el-icon class="img-close" @click="removeDetailUrl(idx)"><Close /></el-icon>
            </div>
          </div>
          <el-upload
            action="#"
            :auto-upload="true"
            :http-request="(opts) => handleImageUpload(opts, 'detailGallery')"
            :show-file-list="false"
            accept="image/jpeg,image/png,image/jpg"
            multiple
          >
            <el-button type="primary" link :icon="Plus">上传图片</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="参考价" required>
          <el-input-number v-model="publishForm.marketPrice" :precision="2" :min="0" style="width:160px" />
          <span style="margin-left:8px;color:#8c8c8c;font-size:13px">元</span>
        </el-form-item>
        <el-form-item label="商品类型" required>
          <el-select v-model="serviceConfig.goodsType" style="width:160px">
            <el-option v-for="t in goodsTypeOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="发货时间" required>
          <el-select v-model="serviceConfig.shipmentLimitSecond" style="width:160px">
            <el-option v-for="s in shipmentLimitOptions" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="运费模板" required>
          <el-select v-model="publishForm.costTemplateId" placeholder="请选择运费模板" style="width:220px">
            <el-option
              v-for="t in logisticsTemplates"
              :key="t.costTemplateId"
              :label="t.templateName"
              :value="t.costTemplateId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="服务承诺">
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <el-checkbox v-model="serviceConfig.isRefundable">7天无理由退货</el-checkbox>
            <el-checkbox v-model="serviceConfig.isFolt">假一罚十</el-checkbox>
            <el-checkbox v-model="serviceConfig.secondHand">二手商品</el-checkbox>
            <el-checkbox v-model="serviceConfig.badFruitClaim">坏果包赔</el-checkbox>
            <el-checkbox v-model="serviceConfig.lackOfWeightClaim">缺重包退</el-checkbox>
          </div>
        </el-form-item>
        <el-form-item label="SKU 规格" required>
          <!-- 规格组 -->
          <div v-for="(group, gIdx) in skuSpecs" :key="gIdx" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <el-select v-model="group.specName" placeholder="选择规格维度" style="width:140px" @change="onSpecGroupNameChange(group)">
              <el-option v-for="d in specDims" :key="d.parent_spec_id" :label="d.parent_spec_name" :value="d.parent_spec_name" />
            </el-select>
            <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
              <el-input v-for="(val, vIdx) in group.values" :key="vIdx" v-model="group.values[vIdx]" placeholder="规格值" size="small" style="width:110px" @blur="onSpecValueChange" />
              <el-button type="primary" link :icon="Plus" size="small" @click="addSpecValue(gIdx)">添加值</el-button>
              <el-button type="danger" link :icon="Delete" size="small" @click="removeSpecValue(gIdx, group.values.length - 1)">删除值</el-button>
            </div>
            <el-button type="danger" link :icon="Delete" size="small" @click="removeSpecGroup(gIdx)">删除组</el-button>
          </div>
          <el-button type="primary" link :icon="Plus" @click="addSpecGroup" style="margin-bottom:12px">添加规格组</el-button>

          <!-- SKU 矩阵 -->
          <el-table :data="publishForm.skus" size="small" border>
            <el-table-column v-if="!skuSpecs.length" prop="specName" label="规格名" width="140">
              <template #default="{ row }">
                <el-input v-model="row.specName" placeholder="默认" size="small" />
              </template>
            </el-table-column>
            <el-table-column v-else label="规格组合" min-width="140">
              <template #default="{ row }">
                <span>{{ skuRowLabel(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="price" label="单买价(元)" width="120">
              <template #default="{ row }">
                <el-input-number v-model="row.price" :precision="2" :min="0" size="small" style="width:100px" />
              </template>
            </el-table-column>
            <el-table-column prop="multiPrice" label="拼单价(元)" width="120">
              <template #default="{ row }">
                <el-input-number v-model="row.multiPrice" :precision="2" :min="0" size="small" style="width:100px" />
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="库存" width="100">
              <template #default="{ row }">
                <el-input-number v-model="row.quantity" :min="0" :precision="0" size="small" style="width:90px" />
              </template>
            </el-table-column>
            <el-table-column label="上架" width="70">
              <template #default="{ row }">
                <el-checkbox v-model="row.isOnSale" />
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishVisible = false">取消</el-button>
        <el-button type="primary" @click="handlePublish" :loading="publishing">立即发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { useShopStore } from '@/stores/shop'
import { goodsApi } from '@/api/goods'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Edit, Check, Close, Picture, Plus, Delete } from '@element-plus/icons-vue'

const goodsStore = useGoodsStore()
const shopStore = useShopStore()

watch(() => shopStore.currentId, () => {
  goodsStore.params.page = 1
  goodsStore.fetchList()
}, { immediate: false })
const selectedIds = ref([])
const editVisible = ref(false)
const editForm = ref({})
const editInfo = ref(null)
const editLoading = ref(false)
const saving = ref(false)
const syncing = ref(false)

// 发布商品
const publishVisible = ref(false)
const publishing = ref(false)
const publishForm = ref({
  catPath: [],
  goodsName: '',
  goodsDesc: '',
  carouselGallery: [''],
  detailGallery: [''],
  marketPrice: 0,
  costTemplateId: '',
  skus: [{ specName: '默认', price: 0, multiPrice: 0, quantity: 0 }]
})
const catRule = ref(null)
const propertyValues = ref({})
const remoteValues = ref({})
const propLoading = ref({})
const logisticsTemplates = ref([])
const serviceConfig = ref({
  goodsType: '1',
  isRefundable: true,
  isFolt: true,
  secondHand: false,
  badFruitClaim: false,
  lackOfWeightClaim: false,
  shipmentLimitSecond: 86400,
})

// AI 标题优化 / SPU / 多维 SKU
const optimizingTitle = ref(false)
const spuLoading = ref(false)
const spuList = ref([])
const selectedSpuId = ref(null)
const specDims = ref([])
const skuSpecs = ref([])

const allProperties = computed(() => {
  return catRule.value?.goods_properties_rule?.properties || []
})

const visibleProperties = computed(() => {
  return allProperties.value.filter(p => isPropertyVisible(p))
})

function isPropertyVisible(p) {
  if (!p.show_condition?.length) return p.required || p.is_important
  const conditions = Array.isArray(p.show_condition) ? p.show_condition : [p.show_condition]
  return conditions.some(cond => {
    const parentPid = cond.parent_ref_pid
    const parentVids = cond.parent_vids || []
    const selected = propertyValues.value[parentPid]
    if (Array.isArray(selected)) {
      return selected.some(s => parentVids.includes(s?.vid))
    }
    if (selected && typeof selected === 'object') {
      return parentVids.includes(selected.vid)
    }
    return false
  })
}

function propertyOptions(p) {
  const local = p.values || []
  if (local.length > 0) return local
  return remoteValues.value[p.ref_pid] || []
}

async function searchPropertyValueOptions(p, query) {
  if (!query || !shopStore.currentId || !publishForm.value.catPath?.length) return
  propLoading.value[p.ref_pid] = true
  try {
    const catId = publishForm.value.catPath[publishForm.value.catPath.length - 1]
    const list = await goodsApi.searchPropertyValues(shopStore.currentId, catId, p.ref_pid, query)
    remoteValues.value[p.ref_pid] = (list || []).map(v => ({
      vid: v.vid,
      value: v.value,
      parent_vids: v.parent_vids,
      extend_info: v.extend_info
    }))
  } catch (err) {
    ElMessage.error(err.message || '属性值搜索失败')
  } finally {
    propLoading.value[p.ref_pid] = false
  }
}

const goodsTypeOptions = computed(() => {
  const types = catRule.value?.goods_service_rule?.goods_type_list || ['1']
  return types.map(t => ({ value: String(t), label: `类型 ${t}` }))
})

const serviceRule = computed(() => {
  const map = catRule.value?.goods_service_rule?.goods_service_rule_map || {}
  return map[serviceConfig.value.goodsType] || {}
})

const shipmentLimitOptions = computed(() => {
  const list = serviceRule.value?.shipment_limit_second_list || [86400]
  return list.map(s => ({
    value: s,
    label: s === 86400 ? '24小时' : s === 172800 ? '48小时' : s === 0 ? '当日发货' : `${s}秒`
  }))
})

// 发布商品相关
const cascaderProps = {
  lazy: true,
  lazyLoad(node, resolve) {
    const parentCatId = node.level === 0 ? 0 : node.value
    if (!shopStore.currentId) return resolve([])
    goodsApi.getCategories(shopStore.currentId, parentCatId)
      .then(list => resolve(list.map(c => ({ value: c.catId, label: c.catName, leaf: c.leaf }))))
      .catch(() => resolve([]))
  }
}

async function openPublishDialog() {
  publishForm.value = {
    catPath: [],
    goodsName: '',
    goodsDesc: '',
    carouselGallery: [],
    detailGallery: [],
    marketPrice: 0,
    costTemplateId: undefined,
    skus: [{ specName: '默认', price: 0, multiPrice: 0, quantity: 0 }]
  }
  catRule.value = null
  propertyValues.value = {}
  remoteValues.value = {}
  skuSpecs.value = []
  specDims.value = []
  spuList.value = []
  selectedSpuId.value = null
  logisticsTemplates.value = []
  publishVisible.value = true
  if (shopStore.currentId) {
    try {
      logisticsTemplates.value = await goodsApi.getLogisticsTemplates(shopStore.currentId)
    } catch (err) {
      ElMessage.warning('运费模板加载失败，请手动填写')
    }
  }
}

function formatSkus(skus) {
  if (!skus) return []
  if (Array.isArray(skus)) return skus
  try { return JSON.parse(skus) } catch { return [] }
}

function addCarouselUrl() { publishForm.value.carouselGallery.push('') }
function removeCarouselUrl(idx) { publishForm.value.carouselGallery.splice(idx, 1) }
function addDetailUrl() { publishForm.value.detailGallery.push('') }
function removeDetailUrl(idx) { publishForm.value.detailGallery.splice(idx, 1) }
function addSku() { publishForm.value.skus.push({ specName: '', price: 0, multiPrice: 0, quantity: 0 }) }
function removeSku(idx) { publishForm.value.skus.splice(idx, 1) }

async function compressImage(file, maxWidth = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('请选择图片文件'))
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round(height * maxWidth / width)
          width = maxWidth
        } else {
          width = Math.round(width * maxWidth / height)
          height = maxWidth
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve(dataUrl)
    }
    img.onerror = () => reject(new Error('图片读取失败'))
    img.src = url
  })
}

async function handleImageUpload(options, galleryKey) {
  if (!shopStore.currentId) {
    options.onError(new Error('请先选择店铺'))
    return ElMessage.warning('请先选择店铺')
  }
  try {
    const base64 = await compressImage(options.file)
    const res = await goodsApi.uploadImage(shopStore.currentId, base64)
    publishForm.value[galleryKey].push(res.url)
    options.onSuccess({ url: res.url })
  } catch (err) {
    options.onError(err)
    ElMessage.error(err.message || '图片上传失败')
  }
}

async function onCategoryChange() {
  catRule.value = null
  propertyValues.value = {}
  remoteValues.value = {}
  skuSpecs.value = []
  specDims.value = []
  spuList.value = []
  selectedSpuId.value = null
  publishForm.value.skus = [{ specName: '默认', price: 0, multiPrice: 0, quantity: 0 }]

  const path = publishForm.value.catPath
  if (!path?.length) return
  const catId = path[path.length - 1]
  try {
    const [rule, specs] = await Promise.all([
      goodsApi.getCatRule(shopStore.currentId, catId),
      goodsApi.getSpecs(shopStore.currentId, catId),
    ])
    catRule.value = rule?.cat_rule_get_response || rule
    specDims.value = specs || []
    initServiceConfig()
    initProperties()
  } catch (err) {
    ElMessage.error('类目规则加载失败')
  }
}

function initServiceConfig() {
  const types = catRule.value?.goods_service_rule?.goods_type_list || ['1']
  const goodsType = String(types.includes(2) ? 2 : types[0])
  const map = catRule.value?.goods_service_rule?.goods_service_rule_map || {}
  const r = map[goodsType] || {}
  serviceConfig.value = {
    goodsType,
    isRefundable: r.refundable_rule !== 0,
    isFolt: r.folt_rule !== 0,
    secondHand: false,
    badFruitClaim: r.bad_claim_rule === 2,
    lackOfWeightClaim: r.lack_of_weight_claim_rule === 2,
    shipmentLimitSecond: (r.shipment_limit_second_list || [86400])[0],
  }
}

function initProperties() {
  const list = allProperties.value
  for (const p of list) {
    p.remoteSearch = false
    if (p.choose_max_num > 1) {
      propertyValues.value[p.ref_pid] = []
    } else if (p.values?.length) {
      propertyValues.value[p.ref_pid] = p.values[0] || null
    } else {
      propertyValues.value[p.ref_pid] = ''
    }
  }
  remoteValues.value = {}
}

// ─── AI 优化标题 ─────────────────────────────────────────────────────────────
async function handleOptimizeTitle(formRef, catName) {
  if (!shopStore.currentId) return ElMessage.warning('请先选择店铺')
  const title = formRef.goodsName?.trim()
  if (!title) return ElMessage.warning('请先输入商品标题')
  optimizingTitle.value = true
  try {
    const res = await goodsApi.optimizeTitle(shopStore.currentId, {
      title,
      keywords: formRef.goodsDesc?.trim() || '',
      catName: catName || '',
      catRule: catRule.value,
    })
    formRef.goodsName = res.title
    ElMessage.success('标题已优化')
  } catch (err) {
    ElMessage.error(err.message || '标题优化失败')
  } finally {
    optimizingTitle.value = false
  }
}

// ─── SPU 搜索 ────────────────────────────────────────────────────────────────
async function searchSpu(keyword) {
  if (!shopStore.currentId || !publishForm.value.catPath?.length || !keyword) return
  spuLoading.value = true
  try {
    const catId = publishForm.value.catPath[publishForm.value.catPath.length - 1]
    spuList.value = await goodsApi.searchSpu(shopStore.currentId, catId, keyword)
  } catch (err) {
    ElMessage.error(err.message || 'SPU 搜索失败')
  } finally {
    spuLoading.value = false
  }
}

async function onSpuChange(spuId) {
  if (!spuId || !shopStore.currentId) return
  try {
    const spu = await goodsApi.getSpu(shopStore.currentId, spuId)
    for (const p of spu.keyProps || []) {
      if (p.vid) {
        propertyValues.value[p.refPid] = { vid: p.vid, value: p.value, value_unit: p.valueUnit }
      } else if (p.value) {
        propertyValues.value[p.refPid] = p.value
      }
    }
    ElMessage.success('已回填 SPU 关键属性')
  } catch (err) {
    ElMessage.error(err.message || '获取 SPU 详情失败')
  }
}

// ─── 多维 SKU 规格组 ─────────────────────────────────────────────────────────
function addSpecGroup() {
  skuSpecs.value.push({ specName: '', parentSpecId: 0, values: [''] })
}
function removeSpecGroup(idx) {
  skuSpecs.value.splice(idx, 1)
  regenerateSkus()
}
function addSpecValue(groupIdx) {
  skuSpecs.value[groupIdx].values.push('')
}
function removeSpecValue(groupIdx, valIdx) {
  skuSpecs.value[groupIdx].values.splice(valIdx, 1)
  regenerateSkus()
}
function onSpecGroupNameChange(group) {
  const dim = specDims.value.find(d => d.parent_spec_name === group.specName)
  group.parentSpecId = dim?.parent_spec_id || 0
  regenerateSkus()
}
function onSpecValueChange() {
  regenerateSkus()
}

function regenerateSkus() {
  const groups = skuSpecs.value.filter(g => g.specName && g.values.some(v => v.trim()))
  if (!groups.length) {
    publishForm.value.skus = [{ specName: '默认', price: 0, multiPrice: 0, quantity: 0 }]
    return
  }

  // 笛卡尔积生成规格组合
  const combos = groups.reduce((acc, g) => {
    const vals = g.values.filter(v => v.trim()).map(v => ({ specName: g.specName, parentSpecId: g.parentSpecId, valueName: v.trim() }))
    if (!acc.length) return vals.map(v => [v])
    const next = []
    for (const a of acc) {
      for (const v of vals) next.push([...a, v])
    }
    return next
  }, [])

  const existing = publishForm.value.skus || []
  const existingMap = new Map()
  for (const row of existing) {
    if (row.specs?.length) {
      const key = row.specs.map(s => `${s.specName}:${s.valueName}`).sort().join('|')
      existingMap.set(key, row)
    }
  }

  publishForm.value.skus = combos.map(combo => {
    const key = combo.map(s => `${s.specName}:${s.valueName}`).sort().join('|')
    const old = existingMap.get(key)
    return old || {
      specs: combo,
      price: 0,
      multiPrice: 0,
      quantity: 0,
      isOnSale: true,
      thumbUrl: '',
    }
  })
}

function skuRowLabel(row) {
  if (row.specs?.length) return row.specs.map(s => s.valueName).join(' / ')
  return row.specName || '默认'
}

function buildGoodsProperties() {
  const result = []
  for (const p of visibleProperties.value) {
    const val = propertyValues.value[p.ref_pid]
    if (Array.isArray(val)) {
      for (const v of val) {
        if (v && (v.vid || v.value)) {
          result.push({ refPid: p.ref_pid, vid: v.vid || 0, value: v.value || '', valueUnit: v.value_unit || '' })
        }
      }
    } else if (typeof val === 'object' && val) {
      result.push({ refPid: p.ref_pid, vid: val.vid || 0, value: val.value || '', valueUnit: val.value_unit || '' })
    } else if (typeof val === 'string' && val.trim()) {
      result.push({ refPid: p.ref_pid, value: val.trim(), valueUnit: p.value_unit?.[0] || '' })
    }
  }
  return result
}

async function handlePublish() {
  if (!shopStore.currentId) return ElMessage.warning('请先选择店铺')
  const form = publishForm.value
  if (!form.catPath?.length) return ElMessage.warning('请选择商品类目')
  if (!form.goodsName.trim()) return ElMessage.warning('请填写商品标题')
  if (!form.carouselGallery.length || !form.carouselGallery.some(u => u.trim())) {
    return ElMessage.warning('请至少上传一张轮播图')
  }
  if (!form.costTemplateId) return ElMessage.warning('请填写运费模板 ID')
  if (!form.skus.length || form.skus.some(s => s.price <= 0 || s.multiPrice <= 0)) {
    return ElMessage.warning('请填写完整的 SKU 价格和库存')
  }
  const requiredProps = visibleProperties.value.filter(p => p.required)
  for (const p of requiredProps) {
    const val = propertyValues.value[p.ref_pid]
    const empty = Array.isArray(val) ? !val.length : !val || (typeof val === 'object' ? !(val.vid || val.value) : !String(val).trim())
    if (empty) return ElMessage.warning(`请填写属性：${p.name}`)
  }

  publishing.value = true
  try {
    const catId = form.catPath[form.catPath.length - 1]
    await goodsApi.publish(shopStore.currentId, {
      catId,
      goodsName: form.goodsName.trim(),
      goodsDesc: form.goodsDesc.trim(),
      carouselGallery: form.carouselGallery.filter(u => u.trim()),
      detailGallery: form.detailGallery.filter(u => u.trim()),
      marketPrice: form.marketPrice,
      costTemplateId: form.costTemplateId,
      skus: form.skus,
      skuSpecs: skuSpecs.value,
      goodsType: serviceConfig.value.goodsType,
      shipmentLimitSecond: serviceConfig.value.shipmentLimitSecond,
      isRefundable: serviceConfig.value.isRefundable,
      isFolt: serviceConfig.value.isFolt,
      secondHand: serviceConfig.value.secondHand,
      badFruitClaim: serviceConfig.value.badFruitClaim,
      lackOfWeightClaim: serviceConfig.value.lackOfWeightClaim,
      goodsProperties: buildGoodsProperties()
    })
    ElMessage.success('商品发布成功')
    publishVisible.value = false
    goodsStore.fetchList()
  } finally {
    publishing.value = false
  }
}

// 库存行内编辑
const editingStockId = ref(null)
const editingStockVal = ref(0)
const stockInputRef = ref()

onMounted(() => goodsStore.fetchList())

function handleSearch() {
  goodsStore.params.page = 1
  goodsStore.fetchList()
}

function handleReset() {
  goodsStore.params.keyword = ''
  goodsStore.params.status = ''
  goodsStore.params.page = 1
  goodsStore.fetchList()
}

function handleSelectionChange(rows) {
  selectedIds.value = rows.map(r => r.goods_id)
}

async function openEdit(row) {
  if (!shopStore.currentId) return ElMessage.warning('请先选择店铺')
  editLoading.value = true
  try {
    const info = await goodsApi.getInfo(shopStore.currentId, row.goods_id)
    editInfo.value = info
    const skuList = info.sku_list || []
    const firstSku = skuList[0] || {}
    const marketPrice = (() => {
      if (typeof info.market_price === 'number') return info.market_price / 100
      const single = parseFloat(firstSku.single_price)
      if (!isNaN(single)) return single
      return 0
    })()
    editForm.value = {
      goodsName: info.goods_name || '',
      goodsDesc: info.goods_desc || '',
      carouselGallery: Array.isArray(info.carousel_gallery) ? [...info.carousel_gallery] : [],
      detailGallery: Array.isArray(info.detail_gallery) ? [...info.detail_gallery] : [],
      marketPrice,
      skus: skuList.map(s => ({
        skuId: s.sku_id,
        specIdList: s.spec_id_list,
        specInfo: typeof s.spec === 'string' ? s.spec : ((s.spec || []).map(sp => sp.spec_name).join(' / ') || '默认'),
        price: s.single_price ? parseFloat(s.single_price) : (s.price ? s.price / 100 : 0),
        multiPrice: s.group_price ? parseFloat(s.group_price) : (s.multi_price ? s.multi_price / 100 : 0),
        quantity: s.sku_quantity ?? s.quantity ?? 0,
        weight: s.weight || 0,
        thumbUrl: s.sku_img || s.thumb_url || '',
        isOnsale: s.is_sku_onsale !== 0 && s.is_sku_onsale !== false,
        skuProperties: s.sku_properties || [],
      })),
      isRefundable: !!info.is_refundable,
      isFolt: !!info.is_folt,
      secondHand: !!info.second_hand,
      shipmentLimitSecond: info.shipment_limit_second || 86400,
    }
    editVisible.value = true
  } finally {
    editLoading.value = false
  }
}

async function handleSave() {
  if (!editInfo.value) return
  saving.value = true
  try {
    const info = editInfo.value
    const skus = (info.sku_list || []).map((s, idx) => {
      const formSku = editForm.value.skus[idx] || {}
      const sku = { ...s }
      sku.price = Math.round(formSku.price * 100)
      sku.multi_price = Math.round(formSku.multiPrice * 100)
      // quantity 在更新接口中表示增减数量，不改动库存，删除该字段
      delete sku.quantity
      return sku
    })
    const payload = {
      goods_id: info.goods_id,
      goods_name: editForm.value.goodsName,
      goods_desc: editForm.value.goodsDesc,
      cat_id: info.cat_id,
      cost_template_id: info.cost_template_id,
      country_id: info.country_id ?? 0,
      goods_type: info.goods_type,
      market_price: Math.round(editForm.value.marketPrice * 100),
      carousel_gallery: editForm.value.carouselGallery.filter(u => u.trim()),
      detail_gallery: editForm.value.detailGallery.filter(u => u.trim()),
      image_url: editForm.value.carouselGallery[0] || info.image_url,
      thumb_url: editForm.value.carouselGallery[0] || info.thumb_url,
      sku_list: skus,
      is_folt: editForm.value.isFolt,
      is_refundable: editForm.value.isRefundable,
      second_hand: editForm.value.secondHand,
      shipment_limit_second: String(editForm.value.shipmentLimitSecond),
      is_pre_sale: info.is_pre_sale || false,
      operate_type: 0,
    }
    await goodsApi.updateInfo(shopStore.currentId, payload)
    ElMessage.success('保存成功')
    editVisible.value = false
    goodsStore.fetchList()
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row) {
  await goodsStore.batchUpdateStatus([row.goods_id], row.status !== 'on')
  ElMessage.success('操作成功')
}

async function batchOnShelf() {
  await goodsStore.batchUpdateStatus(selectedIds.value, true)
  ElMessage.success('批量上架成功')
}

async function batchOffShelf() {
  await goodsStore.batchUpdateStatus(selectedIds.value, false)
  ElMessage.success('批量下架成功')
}

async function handleSync() {
  if (!shopStore.currentId) return ElMessage.warning('请先选择店铺')
  syncing.value = true
  try {
    await goodsApi.sync(shopStore.currentId)
    await goodsStore.fetchList()
    ElMessage.success('同步成功')
  } finally {
    syncing.value = false
  }
}

// 库存行内编辑
function startEditStock(row) {
  editingStockId.value = row.goods_id
  editingStockVal.value = row.stock
  nextTick(() => stockInputRef.value?.focus())
}

async function saveStock(row) {
  if (editingStockVal.value === row.stock) {
    cancelEditStock()
    return
  }
  try {
    await goodsStore.updateStock(row.goods_id, editingStockVal.value)
    ElMessage.success('库存已更新')
  } finally {
    cancelEditStock()
  }
}

function cancelEditStock() {
  editingStockId.value = null
  editingStockVal.value = 0
}
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.actions { display: flex; gap: 8px; }

.no-img {
  width: 48px; height: 48px;
  background: #fafafa;
  border: 1px dashed #d9d9d9;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
}
.no-img.large { width: 80px; height: 80px; }

.stock-cell {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
}
.edit-icon { color: #bfbfbf; opacity: 0; transition: opacity 0.2s; }
.stock-cell:hover .edit-icon { opacity: 1; }

.stock-edit { display: flex; align-items: center; gap: 2px; }

.img-preview { display: flex; align-items: center; }

.img-close {
  position: absolute; top: -6px; right: -6px;
  width: 18px; height: 18px; border-radius: 50%;
  background: #ff4d4f; color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 12px;
}
</style>
