import request from './request'

export const getShops = () => request.get('/shops')

export const addShop = (data) => request.post('/shops', data)

export const updateShop = (id, data) => request.put(`/shops/${id}`, data)

export const verifyShop = (id) => request.post(`/shops/${id}/verify`)

export const disableShop = (id) => request.delete(`/shops/${id}`)

export const enableShop = (id) => request.post(`/shops/${id}/enable`)

export const getAuthUrl = ({ clientId, clientSecret, name, redirectUri, shopId }) =>
  request.get('/pdd-auth/authorize', { params: { clientId, clientSecret, name, redirectUri, shopId } })

export const getDefaultPddApp = () => request.get('/pdd-auth/default-app')
