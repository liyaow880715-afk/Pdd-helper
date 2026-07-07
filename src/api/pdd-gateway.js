'use strict';

/**
 * 直接调用拼多多开放平台网关（不经过 Java SDK 代理）
 * 用于 SDK 未覆盖的推广类接口（pdd.ad.api.*）
 */

const axios = require('axios');
const crypto = require('crypto');
const db = require('../utils/db');
const config = require('../config');
const logger = require('../utils/logger');

const GATEWAY_URL = 'https://gw-api.pinduoduo.com/api/router';

function getShopCredentials(shopId) {
  if (shopId) {
    const shop = db.prepare("SELECT * FROM shops WHERE id=? AND status='active'").get(shopId);
    if (!shop) throw new Error(`店铺 ${shopId} 不存在或已禁用`);
    return { clientId: shop.client_id, clientSecret: shop.client_secret, accessToken: shop.access_token };
  }
  return { clientId: config.pdd.clientId, clientSecret: config.pdd.clientSecret, accessToken: config.pdd.accessToken };
}

function generateSign(params, clientSecret) {
  const sortedKeys = Object.keys(params).sort();
  const signStr = clientSecret + sortedKeys.map(k => `${k}${params[k]}`).join('') + clientSecret;
  return crypto.createHash('md5').update(signStr, 'utf8').digest('hex').toUpperCase();
}

async function call(type, bizParams = {}, shopId = null, retry = 2) {
  const { clientId, clientSecret, accessToken } = getShopCredentials(shopId);
  const timestamp = String(Math.floor(Date.now() / 1000));

  const params = {
    type,
    client_id: clientId,
    data_type: 'JSON',
    timestamp,
  };
  if (accessToken) params.access_token = accessToken;

  for (const [key, value] of Object.entries(bizParams)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  params.sign = generateSign(params, clientSecret);

  try {
    const res = await axios.post(GATEWAY_URL, new URLSearchParams(params), {
      timeout: 20000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = res.data;

    if (data.error_response) {
      const { error_code, error_msg, sub_msg } = data.error_response;
      const msg = `[PDD-GW][shop=${shopId || 'default'}] ${type} 失败 code=${error_code} ${error_msg} ${sub_msg || ''}`;
      logger.error(msg);
      throw Object.assign(new Error(msg), { code: error_code });
    }
    return data;
  } catch (err) {
    if (err.response) {
      const msg = `[PDD-GW][shop=${shopId || 'default'}] ${type} 代理错误: ${err.response.data?.error || err.message}`;
      logger.error(msg);
      throw Object.assign(new Error(msg), { code: err.response.status });
    }
    if (err.code && err.code !== 'ECONNABORTED') throw err;
    if (retry > 0) {
      logger.warn(`[PDD-GW][shop=${shopId || 'default'}] ${type} 网络错误重试: ${err.message}`);
      await new Promise(r => setTimeout(r, 1500));
      return call(type, bizParams, shopId, retry - 1);
    }
    throw err;
  }
}

module.exports = { call, generateSign };
