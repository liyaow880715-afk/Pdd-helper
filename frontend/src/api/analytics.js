import request from './request'

export const analyticsApi = {
  getSummary: (shopId, startDate, endDate) => request.get('/analytics/summary', { params: { shopId, startDate, endDate } }),
  getTrend: (shopId, days = 7) => request.get('/analytics/trend', { params: { shopId, days } }),
  getTopGoods: (shopId, startDate, endDate, limit = 10) => request.get('/analytics/top-goods', { params: { shopId, startDate, endDate, limit } }),
  getStockAnalysis: (shopId) => request.get('/analytics/stock', { params: { shopId } }),
  getRepurchase: (shopId, startDate, endDate) => request.get('/analytics/repurchase', { params: { shopId, startDate, endDate } }),
  generateDaily: (shopId) => request.post('/report/daily', { shopId }),
  generateWeekly: (shopId) => request.post('/report/weekly', { shopId })
}
