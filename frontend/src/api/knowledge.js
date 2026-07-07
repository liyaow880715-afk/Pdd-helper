import request from './request'

export const knowledgeApi = {
  // 分类
  getCategories: (params) => request.get('/knowledge/categories', { params }),
  createCategory: (data) => request.post('/knowledge/categories', data),
  updateCategory: (id, data) => request.put(`/knowledge/categories/${id}`, data),
  deleteCategory: (id) => request.delete(`/knowledge/categories/${id}`),

  // 货盘
  getProducts: (params) => request.get('/knowledge/products', { params }),
  createProduct: (data) => request.post('/knowledge/products', data),
  updateProduct: (id, data) => request.put(`/knowledge/products/${id}`, data),
  deleteProduct: (id) => request.delete(`/knowledge/products/${id}`),
  syncProducts: (data) => request.post('/knowledge/products/sync', data),

  // 话术
  getScripts: (params) => request.get('/knowledge/scripts', { params }),
  createScript: (data) => request.post('/knowledge/scripts', data),
  updateScript: (id, data) => request.put(`/knowledge/scripts/${id}`, data),
  deleteScript: (id) => request.delete(`/knowledge/scripts/${id}`),

  // 搜索
  search: (params) => request.get('/knowledge/search', { params }),
}
