import request from './request'

export const goodsApi = {
  getList: (shopId, params) => request.get('/goods', { params: { shopId, ...params } }),
  update: (shopId, goodsId, data) => request.put(`/goods/${goodsId}`, { shopId, ...data }),
  batchUpdateStatus: (shopId, goodsIds, onSale) => request.post('/goods/batch-status', { shopId, goodsIds, onSale }),
  sync: (shopId) => request.post('/sync/goods', { shopId }),
  getCategories: (shopId, parentCatId = 0) => request.get('/goods/categories', { params: { shopId, parentCatId } }),
  getCatRule: (shopId, catId) => request.get('/goods/cat-rule', { params: { shopId, catId } }),
  getLogisticsTemplates: (shopId) => request.get('/goods/logistics-templates', { params: { shopId } }),
  uploadImage: (shopId, image) => request.post('/upload/image', { shopId, image }),
  getCatTemplate: (shopId, catId) => request.get('/goods/cat-template', { params: { shopId, catId } }),
  getSpecs: (shopId, catId) => request.get('/goods/specs', { params: { shopId, catId } }),
  searchPropertyValues: (shopId, catId, refPid, value = '', parentVid = 0) => request.get('/goods/property-values', {
    params: { shopId, catId, refPid, value, parentVid }
  }),
  searchSpu: (shopId, catId, keyword) => request.get('/goods/spu-search', { params: { shopId, catId, keyword } }),
  getSpu: (shopId, spuId) => request.get('/goods/spu', { params: { shopId, spuId } }),
  optimizeTitle: (shopId, data) => request.post('/goods/optimize-title', { shopId, ...data }),
  publish: (shopId, data) => request.post('/goods/publish', { shopId, ...data }),
  getInfo: (shopId, goodsId) => request.get('/goods/info', { params: { shopId, goodsId } }),
  updateInfo: (shopId, data) => request.post('/goods/update-info', { shopId, ...data })
}
