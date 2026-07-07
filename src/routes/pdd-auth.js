'use strict';

const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { exchangeToken } = require('../api/pdd-client');
const shopService = require('../services/shop.service');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// ─── 生成授权链接 ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/pdd-auth/authorize
 * query: { clientId, clientSecret, name, redirectUri? }
 * 返回拼多多授权跳转 URL
 */
router.get('/authorize', (req, res) => {
  const { clientId, clientSecret, name } = req.query;
  const finalClientId = clientId || config.pdd.clientId;
  const finalClientSecret = clientSecret || config.pdd.clientSecret;
  if (!finalClientId || !finalClientSecret) {
    return res.json({ code: 1, message: 'clientId / clientSecret 均为必填，或未配置默认应用' });
  }

  const redirectUri = req.query.redirectUri || config.pdd.redirectUri;
  const state = crypto.randomBytes(16).toString('hex');

  // 临时存储 state 与店铺信息（有效期 10 分钟）
  db.prepare(`
    INSERT INTO shop_auth_states (state, name, client_id, client_secret, redirect_uri)
    VALUES (?, ?, ?, ?, ?)
  `).run(state, name, finalClientId, finalClientSecret, redirectUri);

  const url = new URL(config.pdd.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', finalClientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  res.json({
    code: 0,
    data: {
      authUrl: url.toString(),
      state,
      redirectUri,
    },
    message: '请引导用户访问 authUrl 完成授权',
  });
});

// ─── 拼多多回调 ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/pdd-auth/callback
 * 拼多多授权成功后重定向到此接口
 * query: { code, state }
 */
router.get('/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).json({ code: 1, message: '缺少 code 或 state 参数' });
  }

  // 查找临时存储的授权信息
  const authState = db.prepare('SELECT * FROM shop_auth_states WHERE state = ?').get(state);
  if (!authState) {
    return res.status(400).json({ code: 1, message: '授权已过期或 state 无效，请重新发起授权' });
  }

  // 删除已使用的 state
  db.prepare('DELETE FROM shop_auth_states WHERE state = ?').run(state);

  // 用 code 换取 token
  let tokenRes;
  try {
    tokenRes = await exchangeToken(code, authState.client_id, authState.client_secret);
  } catch (err) {
    logger.error(`[OAuth] 换 token 失败: ${err.message}`);
    return res.status(500).json({ code: 1, message: `换取 token 失败: ${err.message}` });
  }

  const result = tokenRes.pop_auth_token_create_response || tokenRes;
  const accessToken = result.access_token;
  const refreshToken = result.refresh_token;
  const mallId = result.mall_id || result.owner_id || result.owner_name;
  const expiresAtTs = result.expires_at;   // 秒级时间戳
  const expiresIn = result.expires_in;     // 剩余秒数
  const expireDate = expiresAtTs
    ? new Date(expiresAtTs * 1000).toISOString()
    : (expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null);

  if (!accessToken) {
    logger.error(`[OAuth] 拼多多未返回 access_token: ${JSON.stringify(tokenRes)}`);
    return res.status(500).json({ code: 1, message: '拼多多未返回 access_token，请检查应用权限、IP 白名单及回调地址配置' });
  }

  // 优先使用用户传入的名称，否则用拼多多返回的 owner_name / mall_name
  const shopName = authState.name || result.owner_name || result.mall_name || `店铺_${result.owner_id || mallId || '未知'}`;

  // 如果同一 client_id 已存在，则更新 token 并重新启用，避免重复创建
  const existing = shopService.getShopByClientId(authState.client_id);
  let shopId;
  if (existing) {
    shopService.updateShop(existing.id, {
      name: shopName,
      clientSecret: authState.client_secret,
      accessToken,
      refreshToken: refreshToken || null,
      mallId: mallId || null,
      redirectUri: authState.redirect_uri || existing.redirect_uri || null,
      status: 'active',
      expiresAt: expireDate || undefined,
    });
    shopId = existing.id;
    logger.info(`[OAuth] 店铺重新授权并更新 id=${shopId} name=${shopName} mall_id=${mallId}`);
  } else {
    // 存入数据库
    shopId = shopService.addShop({
      name: shopName,
      clientId: authState.client_id,
      clientSecret: authState.client_secret,
      accessToken,
      refreshToken: refreshToken || null,
      mallId: mallId || null,
      redirectUri: authState.redirect_uri || null,
    });

    // 更新过期时间
    if (expireDate) {
      shopService.updateShop(shopId, { expiresAt: expireDate });
    }
    logger.info(`[OAuth] 店铺授权成功 id=${shopId} name=${shopName} mall_id=${mallId}`);
  }

  logger.info(`[OAuth] 店铺授权成功 id=${shopId} name=${shopName} mall_id=${mallId}`);

  // 成功跳转前端页面（或返回 JSON）
  if (req.query.redirect === 'json') {
    return res.json({ code: 0, data: { shopId, mallId, name: shopName }, message: '授权成功' });
  }

  // 默认返回简单 HTML 提示
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>授权成功</title></head>
    <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
      <div style="text-align:center;">
        <h1 style="color:#52c41a;">✅ 店铺授权成功</h1>
        <p>店铺名称：${shopName}</p>
        <p>店铺 ID：${shopId}</p>
        <p>您可以关闭此页面，返回管理后台。</p>
      </div>
    </body>
    </html>
  `);
}));

// ─── 手动刷新 Token ───────────────────────────────────────────────────────────

/**
 * POST /api/v1/pdd-auth/refresh
 * body: { shopId }
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { shopId } = req.body;
  if (!shopId) return res.json({ code: 1, message: 'shopId 必填' });
  const result = await shopService.refreshShopToken(+shopId);
  res.json({ code: 0, data: result, message: 'Token 刷新成功' });
}));

/**
 * GET /api/v1/pdd-auth/default-app
 * 返回默认应用配置（只暴露 client_id，client_secret 留在服务端使用）
 */
router.get('/default-app', (req, res) => {
  res.json({
    code: 0,
    data: {
      clientId: config.pdd.clientId || null,
      hasSecret: !!config.pdd.clientSecret,
    },
  });
});

module.exports = router;
