'use strict';

/**
 * 拼多多开放平台 API 封装（多店铺版）
 * 通过 Java SDK 代理服务调用拼多多 API
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
let monitor = null;
function getMonitor() {
  if (!monitor) monitor = require('../utils/monitor');
  return monitor;
}
const db = require('../utils/db');

const PDD_PROXY_URL = process.env.PDD_PROXY_URL || 'http://localhost:8081';

// 每个店铺独立的限流队列
const queues = {};
const RATE_LIMIT_MS = 120;

// --- 店铺凭证 ---

function getShopCredentials(shopId) {
  if (shopId) {
    const shop = db.prepare("SELECT * FROM shops WHERE id=? AND status='active'").get(shopId);
    if (!shop) throw new Error(`店铺 ${shopId} 不存在或已禁用`);
    return { clientId: shop.client_id, clientSecret: shop.client_secret, accessToken: shop.access_token };
  }
  return { clientId: config.pdd.clientId, clientSecret: config.pdd.clientSecret, accessToken: config.pdd.accessToken };
}

// --- 核心请求（通过 Java SDK 代理） ---

async function call(type, params = {}, shopId = null, retry = 3) {
  const { clientId, clientSecret, accessToken } = getShopCredentials(shopId);

  const qKey = shopId || 'default';
  if (!queues[qKey]) queues[qKey] = Promise.resolve();
  queues[qKey] = queues[qKey].then(() => new Promise(r => setTimeout(r, RATE_LIMIT_MS)));
  await queues[qKey];

  try {
    const res = await axios.post(
      `${PDD_PROXY_URL}/invoke`,
      { type, params, clientId, clientSecret, accessToken },
      { timeout: 60000, headers: { 'Content-Type': 'application/json' } }
    );
    const data = res.data;

    if (data.error_response) {
      const { error_code, error_msg, sub_msg } = data.error_response;
      const msg = `[PDD][shop=${qKey}] ${type} 失败 code=${error_code} ${error_msg} ${sub_msg || ''}`;
      if (error_code === 10038 && retry > 0) {
        logger.warn(`${msg}，限流重试...`);
        await new Promise(r => setTimeout(r, 1000));
        return call(type, params, shopId, retry - 1);
      }
      logger.error(msg);
      if (error_code !== 10038) {
        getMonitor().apiError('拼多多API', `${type}: ${error_msg}`, error_code).catch(() => {});
      }
      throw Object.assign(new Error(msg), { code: error_code });
    }
    return data;
  } catch (err) {
    if (err.response) {
      const msg = `[PDD][shop=${qKey}] ${type} 代理错误: ${err.response.data?.error || err.message}`;
      logger.error(msg);
      throw Object.assign(new Error(msg), { code: err.response.status });
    }
    if (err.code && err.code !== 'ECONNABORTED') throw err;
    if (retry > 0) {
      logger.warn(`[PDD][shop=${qKey}] ${type} 网络错误重试: ${err.message}`);
      await new Promise(r => setTimeout(r, 1500));
      return call(type, params, shopId, retry - 1);
    }
    throw err;
  }
}

// --- 工厂函数 ---

function forShop(shopId) {
  const c = (type, params) => call(type, params, shopId);
  return {
    shopId,
    getGoodsList:           (p = {}) => c('pdd.goods.list.get', { page: 1, page_size: 100, ...p }),
    getGoodsDetail:         (goodsId) => c('pdd.goods.detail.get', { goods_id: goodsId }),
    getGoodsInfo:           (goodsId) => c('pdd.goods.information.get', { goods_id: goodsId }),
    updateGoodsInfo:        (data) => c('pdd.goods.information.update', data),
    getAuthCats:            (parentCatId = 0) => c('pdd.goods.authorization.cats', { parent_cat_id: parentCatId }),
    getGoodsCats:           (parentCatId = 0) => c('pdd.goods.cats.get', { parent_cat_id: parentCatId }),
    getCatRule:             (catId) => c('pdd.goods.cat.rule.get', { cat_id: catId }),
    getSpecs:               (catId) => c('pdd.goods.spec.get', { cat_id: catId }),
    getSpecId:              (catId, specName, parentSpecId = 0) => c('pdd.goods.spec.id.get', { cat_id: catId, spec_name: specName, parent_spec_id: parentSpecId }),
    addGoods:               (data) => c('pdd.goods.add', data),
    commitDraft:            (data) => c('pdd.goods.edit.goods.commit', data),
    submitDraft:            (data) => c('pdd.goods.submit.goods.commit', data),
    updateGoods:            (goodsId, data) => c('pdd.goods.detail.update', { goods_id: goodsId, ...data }),
    updateSkuStock:         (goodsId, skuId, qty) => c('pdd.goods.sku.stock.update', { goods_id: goodsId, sku_id: skuId, quantity: qty }),
    updateGoodsStatus:      (goodsId, onSale) => c('pdd.goods.status.update', { goods_id: goodsId, is_onsale: onSale ? 1 : 0 }),
    batchUpdateGoodsStatus: async (goodsIds, onSale) => {
      const results = [];
      for (const goodsId of goodsIds) {
        try { await c('pdd.goods.status.update', { goods_id: goodsId, is_onsale: onSale ? 1 : 0 }); results.push({ goodsId, success: true }); }
        catch (e) { results.push({ goodsId, success: false, error: e.message }); }
      }
      return results;
    },
    getLogisticsTemplates: (p = {}) => c('pdd.goods.logistics.template.get', { page: 1, page_size: 100, ...p }),
    uploadImage:           (base64) => c('pdd.goods.image.upload', { image: base64 }),
    getCatTemplate:        (catId) => c('pdd.goods.cat.template.get', { cat_id: catId }),
    searchPropertyValues:  (catId, refPid, value, parentVid = 0, p = {}) => c('pdd.goods.template.property.value.search', {
      cat_id: catId, ref_pid: refPid, value: value || '', parent_vid: parentVid || 0, page_num: 1, page_size: 100, ...p,
    }),
    searchSpu:             (catId, keyword, p = {}) => c('pdd.goods.spu.search', {
      cat_id: catId, spu_name: keyword, page: 1, page_size: 20, ...p,
    }),
    getSpu:                (spuId) => c('pdd.goods.spu.get', { spu_id: spuId }),
    getOrderList:    (p = {}) => c('pdd.order.list.get', { page: 1, page_size: 50, refund_status: 5, ...p }),
    getOrderIncrementList: (p = {}) => c('pdd.order.number.list.increment.get', {
      page: 1, page_size: 50, order_status: 5, refund_status: 5, is_lucky_flag: 1, ...p,
    }),
    getOrderDetail:  (orderSn) => c('pdd.order.information.get', { order_sn: orderSn }),
    shipOrder:       (orderSn, trackingNumber) => c('pdd.logistics.online.send', { order_sn: orderSn, logistics_id: 4, tracking_number: trackingNumber, logistics_name: '圆通快递' }),
    batchShipOrders: async (list) => {
      const results = [];
      for (const { orderSn, trackingNumber } of list) {
        try { await c('pdd.logistics.online.send', { order_sn: orderSn, logistics_id: 4, tracking_number: trackingNumber }); results.push({ orderSn, success: true }); }
        catch (e) { results.push({ orderSn, success: false, error: e.message }); }
      }
      return results;
    },
    addOrderRemark:    (orderSn, remark) => c('pdd.order.remark.update', { order_sn: orderSn, remark }),
    getLogisticsTrack: (orderSn) => c('pdd.logistics.track.get', { order_sn: orderSn }),
    getRefundList: (p = {}) => c('pdd.refund.list.increment.get', { page: 1, page_size: 100, ...p }),
    getMessageList:    (p = {}) => c('pdd.im.conversation.list.get', { page: 1, page_size: 20, ...p }),
    sendMessage:       (conversationId, content) => c('pdd.im.message.send', { conversation_id: conversationId, msg_type: 1, content }),
    ddkGenUrl:         (goodsId, pId) => c('pdd.ddk.goods.promotion.url.generate', {
      goods_id_list: `[${goodsId}]`, p_id: pId, generate_short_url: true,
    }),
    ddkOrderList:      (p = {}) => c('pdd.ddk.order.list.range.get', {
      start_time: Math.floor(Date.now() / 1000) - 86400,
      end_time: Math.floor(Date.now() / 1000),
      page: 1, page_size: 50, ...p,
    }),
    ddkSearchGoods:    (keyword, p = {}) => c('pdd.ddk.goods.search', {
      keyword, page: 1, page_size: 20, ...p,
    }),
    // ─── 多多推广 CPS（商品通用推广）────────────────────────────────────────────
    cpsMallUnitQuery:  () => c('pdd.goods.cps.mall.unit.query', {}),
    cpsMallUnitChange: (units) => c('pdd.goods.cps.mall.unit.change', { units }),
    cpsUnitQuery:      (goodsId) => c('pdd.goods.cps.unit.query', { goods_id: goodsId }),
    cpsUnitCreate:     (units) => c('pdd.goods.cps.unit.create', { units }),
    cpsUnitChange:     (units) => c('pdd.goods.cps.unit.change', { units }),
    cpsUnitDelete:     (goodsId) => c('pdd.goods.cps.unit.delete', { goods_id: goodsId }),

    // ─── 商品素材 / 视频 / 图片空间 ─────────────────────────────────────────────
    uploadVideo:          (data) => c('pdd.goods.video.upload', data),
    getFileInfo:          (data) => c('pdd.goods.file.info.get', data),
    uploadFilespaceImage: (base64) => c('pdd.goods.filespace.image.upload', { image: base64 }),
    createMaterial:       (data) => c('pdd.goods.material.create', data),
    deleteMaterial:       (data) => c('pdd.goods.material.delete', data),
    queryMaterial:        (data) => c('pdd.goods.material.query', data),

    // ─── 库存 / 价格单独更新 ────────────────────────────────────────────────────
    updateQuantity:       (data) => c('pdd.goods.quantity.update', data),
    updateSkuPrice:       (data) => c('pdd.goods.sku.price.update', data),

    // ─── 草稿 / 审核状态查询 ────────────────────────────────────────────────────
    getCommitDetail:      (data) => c('pdd.goods.commit.detail.get', data),
    getCommitList:        (data) => c('pdd.goods.commit.list.get', data),
    getCommitStatus:      (data) => c('pdd.goods.commit.status.get', data),
    getLatestCommitStatus:(data) => c('pdd.goods.latest.commit.status.get', data),

    // ─── 属性映射 ───────────────────────────────────────────────────────────────
    getOutPropertyMapping:(data) => c('pdd.goods.out.property.mapping.get', data),

    // ─── 旧推广中心（已下线，保留兼容）──────────────────────────────────────────
    adUnitList:        (p = {}) => c('pdd.ad.api.unit.query', { page: 1, page_size: 50, ...p }),
    adPlanList:        (p = {}) => c('pdd.ad.api.plan.query', { page: 1, page_size: 50, ...p }),
    adUnitReport:      (unitId, start, end) => c('pdd.ad.api.report.unit.query', {
      unit_id: unitId, start_date: start, end_date: end,
    }),
    adPlanReport:      (planId, start, end) => c('pdd.ad.api.report.plan.query', {
      plan_id: planId, start_date: start, end_date: end,
    }),
    adAccountBalance:  () => c('pdd.ad.api.account.balance.get', {}),
  };
}

// --- OAuth 授权 ---

async function callAuthApi(type, extraParams = {}, clientId, clientSecret) {
  const endpoint = type === 'pdd.pop.auth.token.create' ? '/auth/token/create' : '/auth/token/refresh';
  const payload = { clientId, clientSecret, ...extraParams };

  const res = await axios.post(`${PDD_PROXY_URL}${endpoint}`, payload, {
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = res.data;

  // 授权/刷新接口的错误可能在顶层，也可能嵌套在 pop_auth_token_*_response 里
  const topErr = data.error_response;
  const nestedKey = type === 'pdd.pop.auth.token.create'
    ? 'pop_auth_token_create_response'
    : 'pop_auth_token_refresh_response';
  const nestedErr = data[nestedKey]?.error_response;
  const err = topErr || nestedErr;
  if (err) {
    const { error_code, error_msg, sub_msg } = err;
    throw Object.assign(new Error(`[PDD][auth] ${type} 失败 code=${error_code} ${error_msg} ${sub_msg || ''}`), { code: error_code });
  }
  return data;
}

async function exchangeToken(code, clientId, clientSecret) {
  const data = await callAuthApi('pdd.pop.auth.token.create', { code }, clientId, clientSecret);
  return data.pop_auth_token_create_response || data;
}

async function refreshToken(refreshTokenValue, clientId, clientSecret) {
  const data = await callAuthApi('pdd.pop.auth.token.refresh', { refreshToken: refreshTokenValue }, clientId, clientSecret);
  return data.pop_auth_token_refresh_response || data;
}

module.exports = { forShop, call, exchangeToken, refreshToken };
