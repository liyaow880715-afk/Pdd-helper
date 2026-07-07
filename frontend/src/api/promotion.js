import request from './request'

export const getPlans = (shopId) => request.get('/promotion/plans', { params: { shopId } })
export const syncPlans = (data) => request.post('/promotion/plans/sync', data)

export const getCpsMall = (shopId) => request.get('/promotion/cps/mall', { params: { shopId } })
export const getCpsUnit = (shopId, goodsId) => request.get('/promotion/cps/unit', { params: { shopId, goodsId } })
export const createCpsUnit = (data) => request.post('/promotion/cps/unit', data)
export const updateCpsUnit = (data) => request.put('/promotion/cps/unit', data)
export const deleteCpsUnit = (data) => request.delete('/promotion/cps/unit', { data })

export const getChannels = () => request.get('/promotion/channels')
export const addChannel = (data) => request.post('/promotion/channels', data)
export const deleteChannel = (id) => request.delete(`/promotion/channels/${id}`)

export const getLinks = (shopId) => request.get('/promotion/links', { params: { shopId } })
export const createLink = (data) => request.post('/promotion/links', data)

export const getSummary = (shopId) => request.get('/promotion/summary', { params: { shopId } })
export const getChannelStats = (shopId) => request.get('/promotion/channel-stats', { params: { shopId } })

export const getAiStrategy = (data) => request.post('/promotion/ai-strategy', data)
