import request from './request'

export const ordersApi = {
  getList: (shopId, params) => request.get('/orders', { params: { shopId, ...params } }),
  ship: (shopId, orderSn, trackingNumber) => request.post(`/orders/${orderSn}/ship`, { shopId, trackingNumber }),
  batchShip: (shopId, list) => request.post('/orders/batch-ship', { shopId, list }),
  sync: (shopId) => request.post('/sync/orders', { shopId }),
  syncHistory: (shopId, startDate, endDate) => request.post('/sync/orders/history', { shopId, startDate, endDate })
}
