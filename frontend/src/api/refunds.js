import request from './request'

export const refundsApi = {
  getList: (shopId, params) => request.get('/refunds', { params: { shopId, ...params } }),
  sync: (shopId, hoursAgo = 24) => request.post('/sync/refunds', { shopId, hoursAgo })
}
