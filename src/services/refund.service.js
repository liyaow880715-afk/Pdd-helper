'use strict';

/**
 * 售后退款同步服务
 * - 按 30 分钟窗口拉取拼多多售后单
 * - 只同步“退款成功”售后单，用于扣减成交金额
 */

const { forShop } = require('../api/pdd-client');
const db = require('../utils/db');
const logger = require('../utils/logger');

const WINDOW_SECONDS = 30 * 60;

function mapStatus(o) {
  return o.after_sales_status || 0;
}

async function syncRefunds(shopId, hoursAgo = 24) {
  logger.info(`[退款同步] 店铺 ${shopId} 开始...`);
  const api = forShop(shopId);
  const now = Math.floor(Date.now() / 1000);
  const start = now - hoursAgo * 3600;

  const upsert = db.prepare(`
    INSERT INTO refunds (shop_id, refund_id, order_sn, after_sales_status, after_sales_type, refund_amount, goods_amount, updated_at)
    VALUES (@shop_id, @refund_id, @order_sn, @after_sales_status, @after_sales_type, @refund_amount, @goods_amount, @updated_at)
    ON CONFLICT(refund_id) DO UPDATE SET
      after_sales_status=excluded.after_sales_status,
      refund_amount=excluded.refund_amount,
      goods_amount=excluded.goods_amount,
      updated_at=excluded.updated_at
  `);

  let total = 0;
  let windowStart = start;
  while (windowStart < now) {
    const windowEnd = Math.min(windowStart + WINDOW_SECONDS, now);
    let page = 1;
    while (page <= 100) {
      const res = await api.getRefundList({
        after_sales_type: 1,
        after_sales_status: 10,
        start_updated_at: windowStart,
        end_updated_at: windowEnd,
        page,
        page_size: 100,
      });
      const list = (res.refund_increment_get_response || {}).refund_list || [];
      if (!list.length) break;
      for (const r of list) {
        upsert.run({
          shop_id: shopId,
          refund_id: String(r.id),
          order_sn: r.order_sn,
          after_sales_status: mapStatus(r),
          after_sales_type: r.after_sales_type || 1,
          refund_amount: parseFloat(r.refund_amount || 0),
          goods_amount: parseFloat(r.order_amount || 0),
          updated_at: r.updated_time || new Date().toISOString(),
        });
        total++;
      }
      if (list.length < 100) break;
      page++;
    }
    windowStart = windowEnd;
  }

  logger.op('退款同步', `店铺 ${shopId} 完成，共 ${total} 条退款成功记录`);
  return { total };
}

function getRefundSummary(shopId, startDate, endDate) {
  return db.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) AS refundAmount, COUNT(*) AS refundCount
    FROM refunds
    WHERE shop_id=? AND DATE(updated_at) BETWEEN ? AND ?
  `).get(shopId, startDate, endDate);
}

module.exports = { syncRefunds, getRefundSummary };
