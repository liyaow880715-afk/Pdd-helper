'use strict';

/**
 * 店铺管理服务：增删改查多个拼多多账号
 */

const db = require('../utils/db');
const config = require('../config');
const { forShop, refreshToken: doRefreshToken } = require('../api/pdd-client');
const logger = require('../utils/logger');

/** 获取所有店铺列表（不返回敏感凭证） */
function listShops() {
  return db.prepare(`
    SELECT id, name, client_id, status, created_at, updated_at FROM shops ORDER BY id
  `).all();
}

/** 获取单个店铺（含凭证，内部使用） */
function getShop(shopId) {
  return db.prepare('SELECT * FROM shops WHERE id=?').get(shopId);
}

/** 添加店铺（支持 OAuth 自动添加，access_token 可后续补充） */
function addShop({ name, clientId, clientSecret, accessToken, refreshToken, mallId, redirectUri }) {
  const finalClientId = clientId || config.pdd.clientId;
  const finalClientSecret = clientSecret || config.pdd.clientSecret;
  if (!name || !finalClientId || !finalClientSecret) {
    throw new Error('name / clientId / clientSecret 为必填（或未配置默认应用）');
  }
  const result = db.prepare(`
    INSERT INTO shops (name, client_id, client_secret, access_token, refresh_token, mall_id, redirect_uri, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(name, finalClientId, finalClientSecret, accessToken || null, refreshToken || null, mallId || null, redirectUri || null);
  logger.info(`[店铺] 新增店铺: ${name} (id=${result.lastInsertRowid})`);
  return result.lastInsertRowid;
}

/** 更新店铺信息 */
function updateShop(shopId, { name, clientId, clientSecret, accessToken, refreshToken, expiresAt, mallId, status }) {
  const fields = [], values = [];
  if (name)         { fields.push('name=?');          values.push(name); }
  if (clientId)     { fields.push('client_id=?');     values.push(clientId); }
  if (clientSecret) { fields.push('client_secret=?'); values.push(clientSecret); }
  if (accessToken !== undefined)  { fields.push('access_token=?');  values.push(accessToken); }
  if (refreshToken !== undefined) { fields.push('refresh_token=?'); values.push(refreshToken); }
  if (expiresAt !== undefined)    { fields.push('expires_at=?');    values.push(expiresAt); }
  if (mallId !== undefined)       { fields.push('mall_id=?');       values.push(mallId); }
  if (status)       { fields.push('status=?');        values.push(status); }
  if (!fields.length) throw new Error('没有可更新的字段');
  fields.push('updated_at=CURRENT_TIMESTAMP');
  values.push(shopId);
  db.prepare(`UPDATE shops SET ${fields.join(',')} WHERE id=?`).run(...values);
  logger.info(`[店铺] 更新店铺 id=${shopId}`);
}

/** 获取需要刷新 token 的店铺（2小时内过期） */
function getShopsNeedRefresh() {
  const now = new Date().toISOString();
  const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  return db.prepare(`
    SELECT * FROM shops
    WHERE status = 'active'
      AND refresh_token IS NOT NULL
      AND (expires_at IS NULL OR expires_at <= ?)
  `).all(twoHoursLater);
}

/** 删除店铺（软删除，改为 disabled） */
function disableShop(shopId) {
  db.prepare("UPDATE shops SET status='disabled', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(shopId);
  logger.info(`[店铺] 禁用店铺 id=${shopId}`);
}

/** 启用店铺 */
function enableShop(shopId) {
  db.prepare("UPDATE shops SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(shopId);
  logger.info(`[店铺] 启用店铺 id=${shopId}`);
}

/**
 * 验证店铺凭证是否有效（调用拼多多 pdd.time.get 接口）
 */
async function verifyShop(shopId) {
  try {
    const api = forShop(shopId);
    await api.getGoodsList({ page: 1, page_size: 1 });
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/** 刷新单个店铺的 access_token */
async function refreshShopToken(shopId) {
  const shop = getShop(shopId);
  if (!shop || !shop.refresh_token) throw new Error('店铺不存在或无 refresh_token');
  const res = await doRefreshToken(shop.refresh_token, shop.client_id, shop.client_secret);
  const result = res.pop_auth_token_refresh_response || res;
  const token = result.access_token;
  const refresh = result.refresh_token;
  const expiresAtTs = result.expires_at;       // 秒级时间戳
  const expiresIn = result.expires_in;         // 剩余秒数
  if (!token) throw new Error('刷新 token 失败，拼多多未返回 access_token');
  const expireDate = expiresAtTs
    ? new Date(expiresAtTs * 1000).toISOString()
    : (expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null);
  updateShop(shopId, {
    accessToken: token,
    refreshToken: refresh || shop.refresh_token,
    expiresAt: expireDate,
  });
  logger.info(`[店铺] Token 刷新成功 id=${shopId}`);
  return { success: true };
}

function getShopByClientId(clientId) {
  return db.prepare('SELECT * FROM shops WHERE client_id=?').get(clientId);
}

module.exports = { listShops, getShop, getShopByClientId, addShop, updateShop, disableShop, enableShop, verifyShop, getShopsNeedRefresh, refreshShopToken };
