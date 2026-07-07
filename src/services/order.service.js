'use strict';

const { forShop } = require('../api/pdd-client');
const db = require('../utils/db');
const feishu = require('../utils/feishu');
const logger = require('../utils/logger');
const shopService = require('./shop.service');

const DAY_SECONDS = 86400;
const MAX_HISTORY_DAYS = 90;

/** 把 Unix 秒转成北京时间的 YYYY-MM-DD */
function toBeijingDateString(ts) {
  return new Date(ts * 1000 + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 把 YYYY-MM-DD 按北京时间解析为 Unix 秒（startOfDay / endOfDay） */
function beijingDateToUnixSeconds(dateStr, endOfDay = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // 北京时间 00:00:00 = UTC 前一天 16:00:00；23:59:59 = UTC 当天 15:59:59
  const ms = endOfDay
    ? Date.UTC(y, m - 1, d, 15, 59, 59)
    : Date.UTC(y, m - 1, d, -8, 0, 0);
  return Math.floor(ms / 1000);
}

/** 把 [startDate, endDate] 拆成 24h 时间片（含边界），最多回溯 90 天 */
function splitDateRangeInto24hChunks(startDate, endDate) {
  const chunks = [];
  let startAt = beijingDateToUnixSeconds(startDate);
  let endAt = beijingDateToUnixSeconds(endDate, true);
  const now = Math.floor(Date.now() / 1000);
  const earliest = now - MAX_HISTORY_DAYS * DAY_SECONDS;

  if (startAt > endAt) return chunks;
  if (endAt > now) endAt = now;
  if (startAt < earliest) {
    logger.warn(`[历史订单同步] 起始日期超出 90 天，自动截断到 ${new Date(earliest * 1000).toISOString()}`);
    startAt = earliest;
  }

  let current = startAt;
  while (current <= endAt) {
    const chunkEnd = Math.min(current + DAY_SECONDS - 1, endAt);
    chunks.push({ startAt: current, endAt: chunkEnd });
    current += DAY_SECONDS;
  }
  return chunks;
}

/** 通用指数退避重试 */
async function callWithRetry(fn, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn(`[订单同步] 请求失败（attempt ${attempt + 1}），${delay}ms 后重试: ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/** 解析订单增量接口响应（兼容不同返回结构） */
function parseIncrementResponse(res) {
  const keys = [
    'order_sn_increment_get_response',
    'order_number_list_increment_get_response',
    'order_number_list_get_response',
    'order_list_get_response',
  ];
  for (const k of keys) {
    if (res && res[k]) return res[k];
  }
  return {};
}

/** 提取增量接口返回的订单列表 */
function extractIncrementList(resp) {
  return resp.order_sn_list || resp.order_list || [];
}

/** 判断增量接口返回的是否为完整订单对象 */
function isFullOrder(item) {
  return item && typeof item === 'object' && (item.receiver_name !== undefined || item.item_list !== undefined || item.pay_amount !== undefined);
}

const CURSOR_KEY = (shopId) => `order_sync_cursor_${shopId}`;
const INCREMENT_OVERLAP = 30; // 秒，避免边界漏单
const INCREMENT_CHUNK = 30 * 60; // 30 分钟

function getCursor(shopId) {
  const row = db.prepare('SELECT value FROM config WHERE key=?').get(CURSOR_KEY(shopId));
  return row ? parseInt(row.value, 10) : null;
}

function setCursor(shopId, ts) {
  db.prepare('INSERT OR REPLACE INTO config(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
    .run(CURSOR_KEY(shopId), String(ts));
}

/** 把 [startAt, endAt] 按 30 分钟切片（用于增量接口） */
function splitInto30MinChunks(startAt, endAt) {
  const chunks = [];
  let current = startAt;
  while (current < endAt) {
    const chunkEnd = Math.min(current + INCREMENT_CHUNK, endAt);
    chunks.push({ startAt: current, endAt: chunkEnd });
    current = chunkEnd;
  }
  return chunks;
}

async function fetchIncrementPages(api, startAt, endAt, options = {}) {
  const { pageSize = 50, maxPages = 200 } = options;
  const first = await callWithRetry(() => api.getOrderIncrementList({
    start_updated_at: startAt,
    end_updated_at: endAt,
    page: 1,
    page_size: pageSize,
  }));
  const resp = parseIncrementResponse(first);
  const totalCount = resp.total_count || 0;
  const raw = [];
  const firstList = extractIncrementList(resp);
  raw.push(...firstList);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages > maxPages) {
    logger.warn(`[订单增量] 时间片 ${startAt}~${endAt} 共 ${totalPages} 页，超过 ${maxPages} 页上限，可能存在遗漏`);
  }
  for (let page = 2; page <= totalPages && page <= maxPages; page++) {
    const res = await callWithRetry(() => api.getOrderIncrementList({
      start_updated_at: startAt,
      end_updated_at: endAt,
      page,
      page_size: pageSize,
    }));
    const list = extractIncrementList(parseIncrementResponse(res));
    raw.push(...list);
  }
  return raw;
}

async function fetchOrderDetail(api, orderSn) {
  const res = await callWithRetry(() => api.getOrderDetail(orderSn));
  return (res.order_info_get_response || {}).order_info;
}

/** 同步一个 30 分钟增量切片，返回 { count, newCount } */
async function syncIncrementChunk(shopId, api, startAt, endAt, notify = true) {
  const raw = await fetchIncrementPages(api, startAt, endAt, { pageSize: 50 });
  if (raw.length === 0) return { count: 0, newCount: 0 };

  let orders = [];
  if (typeof raw[0] === 'string') {
    // 只返回 order_sn，需要逐个查详情
    for (const orderSn of raw) {
      try {
        const detail = await fetchOrderDetail(api, orderSn);
        if (detail) orders.push(detail);
      } catch (err) {
        logger.error(`[订单增量] 店铺 ${shopId} 获取订单详情 ${orderSn} 失败: ${err.message}`);
      }
    }
  } else if (isFullOrder(raw[0])) {
    orders = raw;
  } else {
    // 未知结构：记录日志以便排查
    logger.warn(`[订单增量] 店铺 ${shopId} 返回未知结构，前 3 条: ${JSON.stringify(raw.slice(0, 3))}`);
    return { count: 0, newCount: 0 };
  }

  const { total, newCount } = await upsertOrders(shopId, orders, notify);
  return { count: total, newCount };
}

const upsertOrderStmt = db.prepare(`
  INSERT INTO orders
    (shop_id, order_sn, buyer_name, buyer_phone, buyer_address, goods_info, total_amount, goods_amount, status, tracking_number, created_at)
  VALUES (@shop_id,@order_sn,@buyer_name,@buyer_phone,@buyer_address,@goods_info,@total_amount,@goods_amount,@status,@tracking_number,@created_at)
  ON CONFLICT(order_sn) DO UPDATE SET
    buyer_name=excluded.buyer_name,
    buyer_phone=excluded.buyer_phone,
    buyer_address=excluded.buyer_address,
    goods_info=excluded.goods_info,
    total_amount=excluded.total_amount,
    goods_amount=excluded.goods_amount,
    status=excluded.status,
    tracking_number=excluded.tracking_number,
    created_at=excluded.created_at,
    updated_at=CURRENT_TIMESTAMP
`);

function buildOrderRow(shopId, o) {
  return {
    shop_id: shopId,
    order_sn: o.order_sn,
    buyer_name: o.receiver_name || '',
    buyer_phone: o.receiver_phone || '',
    buyer_address: `${o.province || ''}${o.city || ''}${o.town || ''}${o.address || ''}`,
    goods_info: JSON.stringify(o.item_list || []),
    total_amount: o.pay_amount || 0,
    goods_amount: o.goods_amount || 0,
    status: mapOrderStatus(o),
    tracking_number: o.tracking_number || '',
    created_at: o.confirm_time || o.pay_time || o.created_time || new Date().toISOString(),
  };
}

async function upsertOrders(shopId, orders, notify = true) {
  let newCount = 0;
  for (const o of orders) {
    const row = buildOrderRow(shopId, o);
    const existed = db.prepare('SELECT 1 FROM orders WHERE order_sn=?').get(o.order_sn);
    upsertOrderStmt.run(row);
    if (!existed && row.status === 'pending' && notify) {
      newCount++;
      await notifyNewOrder(shopId, row);
    }
  }
  return { total: orders.length, newCount };
}

async function fetchOrderPages(api, startAt, endAt, options = {}) {
  const { useHasNext = true, pageSize = 50, maxPages = 200, retries = 2 } = options;
  const orders = [];
  let page = 1;
  let hasNext = true;

  while (hasNext && page <= maxPages) {
    let lastError = null;
    let res = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        res = await api.getOrderList({
          order_status: 5,
          refund_status: 5,
          start_confirm_at: startAt,
          end_confirm_at: endAt,
          page,
          page_size: pageSize,
          use_has_next: useHasNext,
        });
        break;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          const delay = 1000 * Math.pow(2, attempt);
          logger.warn(`[订单同步] 第 ${page} 页请求失败（attempt ${attempt + 1}），${delay}ms 后重试: ${err.message}`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    if (!res) {
      throw Object.assign(new Error(`[订单同步] 第 ${page} 页重试 ${retries} 次后仍失败: ${lastError?.message}`), { cause: lastError });
    }

    const resp = res.order_list_get_response || {};
    const list = resp.order_list || [];
    orders.push(...list);
    if (useHasNext) {
      hasNext = !!resp.has_next;
    } else {
      hasNext = list.length === pageSize;
    }
    if (hasNext) page++;
  }

  if (hasNext) {
    logger.warn(`[订单同步] 时间片 ${startAt}~${endAt} 订单超过 ${maxPages} 页，可能存在遗漏`);
  }
  return orders;
}

/** 同步指定店铺订单（使用增量接口，默认近 30 分钟，带 30 秒重叠） */
async function syncOrders(shopId) {
  logger.info(`[订单同步] 店铺 ${shopId} 开始（增量）...`);
  const api = forShop(shopId);
  const now = Math.floor(Date.now() / 1000);
  let cursor = getCursor(shopId);

  // 没有游标时，先用 list.get 兜底同步近 24 小时，并初始化游标
  if (!cursor) {
    logger.warn(`[订单同步] 店铺 ${shopId} 无增量游标，先用 pdd.order.list.get 兜底近 24 小时`);
    const result = await syncOrdersRange(shopId, toBeijingDateString(now - DAY_SECONDS), toBeijingDateString(now));
    setCursor(shopId, now);
    return { total: result.total, newCount: 0 };
  }

  const startAt = Math.max(cursor - INCREMENT_OVERLAP, now - DAY_SECONDS);
  const endAt = now;
  const chunks = splitInto30MinChunks(startAt, endAt);
  if (chunks.length === 0) return { total: 0, newCount: 0 };

  let total = 0;
  let newCount = 0;
  for (const { startAt: s, endAt: e } of chunks) {
    try {
      const r = await syncIncrementChunk(shopId, api, s, e, true);
      total += r.count;
      newCount += r.newCount;
      setCursor(shopId, e);
    } catch (err) {
      logger.error(`[订单同步] 店铺 ${shopId} 增量切片 ${s}~${e} 失败: ${err.message}`);
      // 中断后续切片，避免时间空洞；下次任务会从上一个成功游标继续
      break;
    }
  }
  logger.op('订单同步', `店铺 ${shopId} 完成，共 ${total} 条，新增待发货 ${newCount} 条`);
  return { total, newCount };
}

/** 同步指定日期范围的历史订单（不触发新订单通知） */
async function syncOrdersRange(shopId, startDate, endDate) {
  if (!startDate || !endDate) throw new Error('startDate/endDate 必填');
  if (new Date(startDate) > new Date(endDate)) throw new Error('startDate 不能晚于 endDate');

  logger.info(`[历史订单同步] 店铺 ${shopId} ${startDate} ~ ${endDate}`);
  const api = forShop(shopId);
  const chunks = splitDateRangeInto24hChunks(startDate, endDate);
  if (chunks.length === 0) return { total: 0, chunks: 0 };

  let total = 0;
  const failed = [];
  for (const { startAt, endAt } of chunks) {
    try {
      const orders = await fetchOrderPages(api, startAt, endAt, { useHasNext: true, pageSize: 50 });
      await upsertOrders(shopId, orders, false);
      total += orders.length;
      logger.info(`[历史订单同步] 店铺 ${shopId} 切片 ${startAt}~${endAt} 完成 ${orders.length} 条`);
    } catch (err) {
      logger.error(`[历史订单同步] 店铺 ${shopId} 切片 ${startAt}~${endAt} 失败: ${err.message}`);
      failed.push({ startAt, endAt, error: err.message });
    }
  }

  if (failed.length === 0) {
    // 历史同步成功后，把增量游标设到结束时间，避免下次定时任务再用 list.get 兜底
    const lastChunkEnd = chunks[chunks.length - 1].endAt;
    setCursor(shopId, Math.min(Math.floor(Date.now() / 1000), lastChunkEnd + 1));
  }

  logger.op('历史订单同步', `店铺 ${shopId} ${startDate}~${endDate} 完成，共 ${total} 条，失败切片 ${failed.length} 个`);
  return { total, chunks: chunks.length, failed };
}

function mapOrderStatus(o) {
  // 售后状态：非 1（无售后/售后关闭）视为退款中/退款成功
  if (o.refund_status && o.refund_status !== 1) return 'refund';
  switch (o.order_status) {
    case 1: return 'pending';
    case 2: return 'shipped';
    case 3: return 'completed';
    default: return 'pending';
  }
}

/** 发货（圆通） */
async function shipOrder(shopId, orderSn, trackingNumber) {
  await forShop(shopId).shipOrder(orderSn, trackingNumber);
  db.prepare(`UPDATE orders SET status='shipped', tracking_number=?, updated_at=CURRENT_TIMESTAMP
    WHERE shop_id=? AND order_sn=?`).run(trackingNumber, shopId, orderSn);
  logger.op('手动发货', `店铺${shopId} 订单${orderSn} → 圆通 ${trackingNumber}`);
}

/** 批量发货 */
async function batchShip(shopId, list) {
  const results = await forShop(shopId).batchShipOrders(list);
  const update = db.prepare(`UPDATE orders SET status='shipped', tracking_number=?, updated_at=CURRENT_TIMESTAMP
    WHERE shop_id=? AND order_sn=?`);
  for (const r of results) {
    if (r.success) {
      const item = list.find(i => i.orderSn === r.orderSn);
      if (item) update.run(item.trackingNumber, shopId, r.orderSn);
    }
  }
  return results;
}

/** 查询本地订单（支持分页、状态、时间范围筛选） */
function getLocalOrders(shopId, { status, startTime, endTime, page = 1, pageSize = 20 } = {}) {
  const limit = +pageSize
  const offset = (+page - 1) * limit
  const conditions = ['shop_id=?']
  const params = [shopId]

  if (status) { conditions.push('status=?'); params.push(status) }
  if (startTime) { conditions.push("DATE(created_at) >= ?"); params.push(startTime) }
  if (endTime) { conditions.push("DATE(created_at) <= ?"); params.push(endTime) }

  const where = conditions.join(' AND ')

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM orders WHERE ${where}`)
    .get(...params).cnt

  const list = db.prepare(
    `SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset)

  return { list, total, page: +page, pageSize: limit }
}

async function notifyNewOrder(shopId, order) {
  const shop = shopService.getShop(shopId);
  const shopName = shop ? shop.name : `店铺 #${shopId}`;
  await feishu.notifyNewOrder(shopName, order);
}

module.exports = { syncOrders, syncOrdersRange, shipOrder, batchShip, getLocalOrders };
