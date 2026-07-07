'use strict';

/**
 * 数据分析服务
 * - 销售统计（日/周/月）
 * - 商品分析（热销/滞销/退款率）
 * - AI 洞察（DeepSeek）
 * - 报表生成
 */

const db = require('../utils/db');
const ai = require('../utils/ai');
const feishu = require('../utils/feishu');
const logger = require('../utils/logger');
const shopService = require('../services/shop.service');

// ─── 销售统计 ─────────────────────────────────────────────────────────────────

/**
 * 获取指定日期范围的销售汇总
 * @param {number} shopId
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 */
function getSalesSummary(shopId, startDate, endDate) {
  const orderRow = db.prepare(`
    SELECT
      COUNT(*) AS orderCount,
      COALESCE(SUM(CASE WHEN status != 'refund' THEN goods_amount ELSE 0 END), 0) AS grossAmount
    FROM orders
    WHERE shop_id=? AND DATE(created_at) BETWEEN ? AND ?
  `).get(shopId, startDate, endDate);
  const refundRow = db.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) AS refundAmount, COUNT(*) AS refundCount
    FROM refunds
    WHERE shop_id=? AND DATE(updated_at) BETWEEN ? AND ?
  `).get(shopId, startDate, endDate);
  const totalAmount = +(orderRow.grossAmount - refundRow.refundAmount).toFixed(2);
  const netOrderCount = Math.max(0, orderRow.orderCount - refundRow.refundCount);
  return {
    orderCount: orderRow.orderCount,
    totalAmount,
    avgAmount: netOrderCount > 0 ? +(totalAmount / netOrderCount).toFixed(2) : 0,
    refundCount: refundRow.refundCount,
  };
}

/**
 * 热销商品 TOP N
 */
function getTopGoods(shopId, startDate, endDate, limit = 10) {
  // goods_info 存的是 JSON 数组，这里按订单数统计（简化版）
  return db.prepare(`
    SELECT goods_info, COUNT(*) AS orderCount, SUM(goods_amount) AS totalAmount
    FROM orders
    WHERE shop_id=? AND DATE(created_at) BETWEEN ? AND ? AND status != 'refund'
    GROUP BY goods_info
    ORDER BY orderCount DESC
    LIMIT ?
  `).all(shopId, startDate, endDate, limit);
}

/**
 * 每日销售趋势（最近 N 天）
 */
function getDailyTrend(shopId, days = 7) {
  return db.prepare(`
    SELECT
      d.date,
      COALESCE(d.orderCount, 0)                       AS orderCount,
      COALESCE(d.grossAmount, 0) - COALESCE(r.refundAmount, 0) AS totalAmount
    FROM (
      SELECT DATE(created_at) AS date,
             COUNT(*) AS orderCount,
             SUM(CASE WHEN status != 'refund' THEN goods_amount ELSE 0 END) AS grossAmount
      FROM orders
      WHERE shop_id=? AND DATE(created_at) >= DATE('now', ? || ' days')
      GROUP BY DATE(created_at)
    ) d
    LEFT JOIN (
      SELECT DATE(updated_at) AS date, SUM(refund_amount) AS refundAmount
      FROM refunds
      WHERE shop_id=? AND DATE(updated_at) >= DATE('now', ? || ' days')
      GROUP BY DATE(updated_at)
    ) r ON d.date = r.date
    ORDER BY d.date ASC
  `).all(shopId, `-${days}`, shopId, `-${days}`);
}

/**
 * 指定日期范围的销售趋势
 */
function getTrendRange(shopId, startDate, endDate) {
  return db.prepare(`
    SELECT
      d.date,
      COALESCE(d.orderCount, 0)                       AS orderCount,
      COALESCE(d.grossAmount, 0) - COALESCE(r.refundAmount, 0) AS totalAmount
    FROM (
      SELECT DATE(created_at) AS date,
             COUNT(*) AS orderCount,
             SUM(CASE WHEN status != 'refund' THEN goods_amount ELSE 0 END) AS grossAmount
      FROM orders
      WHERE shop_id=? AND DATE(created_at) BETWEEN ? AND ?
      GROUP BY DATE(created_at)
    ) d
    LEFT JOIN (
      SELECT DATE(updated_at) AS date, SUM(refund_amount) AS refundAmount
      FROM refunds
      WHERE shop_id=? AND DATE(updated_at) BETWEEN ? AND ?
      GROUP BY DATE(updated_at)
    ) r ON d.date = r.date
    ORDER BY d.date ASC
  `).all(shopId, startDate, endDate, shopId, startDate, endDate);
}

/**
 * 库存周转分析（低库存 + 滞销）
 */
function getStockAnalysis(shopId) {
  const lowStock = db.prepare(
    "SELECT * FROM goods WHERE shop_id=? AND stock<=10 AND status='on' ORDER BY stock ASC"
  ).all(shopId);

  const overStock = db.prepare(
    "SELECT * FROM goods WHERE shop_id=? AND stock>=200 AND status='on' ORDER BY stock DESC LIMIT 20"
  ).all(shopId);

  return { lowStock, overStock };
}

// ─── 客户复购分析 ─────────────────────────────────────────────────────────────

function getRepurchaseStats(shopId, startDate, endDate) {
  // 周期内有订单的买家
  const buyerRows = db.prepare(`
    SELECT
      buyer_phone,
      COUNT(*) AS orderCount,
      MIN(created_at) AS firstOrderAt,
      COALESCE(SUM(total_amount), 0) AS totalAmount
    FROM orders
    WHERE shop_id=? AND buyer_phone != ''
      AND DATE(created_at) BETWEEN ? AND ?
      AND status != 'refund'
    GROUP BY buyer_phone
  `).all(shopId, startDate, endDate);

  const totalBuyers = buyerRows.length;
  const repeatBuyers = buyerRows.filter(r => r.orderCount >= 2).length;
  const totalOrders = buyerRows.reduce((sum, r) => sum + r.orderCount, 0);
  const repeatOrders = buyerRows
    .filter(r => r.orderCount >= 2)
    .reduce((sum, r) => sum + r.orderCount, 0);

  // 老客：在周期开始之前就有过订单，且在周期内再次下单的买家
  const oldBuyerRow = db.prepare(`
    SELECT COUNT(DISTINCT o2.buyer_phone) AS cnt
    FROM orders o2
    WHERE o2.shop_id=? AND o2.buyer_phone != ''
      AND DATE(o2.created_at) < ?
      AND o2.buyer_phone IN (
        SELECT DISTINCT buyer_phone FROM orders
        WHERE shop_id=? AND DATE(created_at) BETWEEN ? AND ? AND status != 'refund'
      )
  `).get(shopId, startDate, shopId, startDate, endDate);
  const oldBuyers = oldBuyerRow ? oldBuyerRow.cnt : 0;

  // 复购率 / 老客占比
  const repurchaseRate = totalBuyers > 0
    ? ((repeatBuyers / totalBuyers) * 100).toFixed(1) + '%'
    : '0%';
  const oldBuyerRate = totalBuyers > 0
    ? ((oldBuyers / totalBuyers) * 100).toFixed(1) + '%'
    : '0%';

  const topRepeatBuyers = buyerRows
    .filter(r => r.orderCount >= 2)
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10)
    .map(r => ({
      buyerPhone: r.buyer_phone,
      orderCount: r.orderCount,
      totalAmount: +r.totalAmount.toFixed(2),
    }));

  return {
    totalBuyers,
    repeatBuyers,
    repurchaseRate,
    totalOrders,
    repeatOrders,
    oldBuyers,
    newBuyers: totalBuyers - oldBuyers,
    oldBuyerRate,
    topRepeatBuyers,
  };
}

// ─── 报告数据组装 ─────────────────────────────────────────────────────────────

function parseTopGoodsName(goodsInfo) {
  try {
    const items = JSON.parse(goodsInfo);
    return items[0]?.goods_name || '未知商品';
  } catch {
    return '未知商品';
  }
}

/**
 * 组装指定周期的报告数据
 */
function buildReportData(shopId, startDate, endDate) {
  const summary = getSalesSummary(shopId, startDate, endDate);
  const trend = getTrendRange(shopId, startDate, endDate);
  const topGoodsRaw = getTopGoods(shopId, startDate, endDate, 10);
  const { lowStock, overStock } = getStockAnalysis(shopId);
  const repurchase = getRepurchaseStats(shopId, startDate, endDate);

  const topGoods = topGoodsRaw.map(g => ({
    name: parseTopGoodsName(g.goods_info),
    orderCount: g.orderCount,
    totalAmount: +g.totalAmount.toFixed(2),
  }));

  const refundRate = summary.orderCount > 0
    ? ((summary.refundCount / summary.orderCount) * 100).toFixed(1) + '%'
    : '0%';

  return {
    period: `${startDate} ~ ${endDate}`,
    summary: {
      orderCount: summary.orderCount,
      totalAmount: summary.totalAmount,
      avgAmount: summary.avgAmount,
      refundCount: summary.refundCount,
      refundRate,
    },
    trend: trend.map(t => ({
      date: t.date,
      orderCount: t.orderCount,
      totalAmount: +(+t.totalAmount).toFixed(2),
    })),
    topGoods,
    stock: {
      lowStockCount: lowStock.length,
      overStockCount: overStock.length,
      lowStockNames: lowStock.slice(0, 5).map(g => g.goods_name),
    },
    repurchase,
  };
}

// ─── AI 分析 ──────────────────────────────────────────────────────────────────

/**
 * 生成 AI 销售洞察
 */
async function generateAiInsight(shopId, date, aiOptions = {}) {
  const d = date || new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const summary = getSalesSummary(shopId, yesterday, yesterday);
  const trend = getDailyTrend(shopId, 7);
  const { lowStock } = getStockAnalysis(shopId);

  const salesData = {
    date: yesterday,
    orderCount: summary.orderCount,
    totalAmount: summary.totalAmount.toFixed(2),
    avgAmount: summary.avgAmount.toFixed(2),
    refundCount: summary.refundCount,
    refundRate: summary.orderCount > 0
      ? ((summary.refundCount / summary.orderCount) * 100).toFixed(1) + '%'
      : '0%',
    trend7Days: trend.map(t => ({ date: t.date, orders: t.orderCount, amount: t.totalAmount.toFixed(2) })),
    lowStockCount: lowStock.length,
  };

  try {
    const insight = await ai.analyzeSales(salesData, aiOptions);
    // 缓存到 config 表
    db.prepare(`
      INSERT INTO config (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
    `).run(`ai_insight_${shopId}_${yesterday}`, insight);
    return insight;
  } catch (err) {
    logger.error(`[分析] AI 洞察生成失败: ${err.message}`);
    return null;
  }
}

// ─── 报表生成 ─────────────────────────────────────────────────────────────────

/**
 * 生成并推送每日日报
 */
async function sendDailyReport(shopId, shopName, aiOptions = {}) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  logger.info(`[日报] 店铺 ${shopId} 生成 ${yesterday} 日报...`);

  const report = await generateReport(shopId, 'daily', yesterday, yesterday, aiOptions);
  const metrics = report.metrics;

  await feishu.sendDailyReport(shopName, {
    date: yesterday,
    totalAmount: metrics.summary.totalAmount,
    orderCount: metrics.summary.orderCount,
    topGoods: metrics.topGoods.slice(0, 5).map(g => ({ name: g.name, count: g.orderCount })),
    aiSuggestion: report.insight,
  });

  db.prepare('UPDATE reports SET feishu_sent_at=CURRENT_TIMESTAMP WHERE id=?').run(report.id);
  logger.info(`[日报] 店铺 ${shopId} 日报已推送 id=${report.id}`);
  return report;
}

/**
 * 生成并推送每周周报
 */
async function sendWeeklyReport(shopId, shopName, aiOptions = {}) {
  const today = new Date();
  const endDate = new Date(today - 86400000).toISOString().slice(0, 10);
  const startDate = new Date(today - 7 * 86400000).toISOString().slice(0, 10);
  logger.info(`[周报] 店铺 ${shopId} 生成 ${startDate}~${endDate} 周报...`);

  const report = await generateReport(shopId, 'weekly', startDate, endDate, aiOptions);
  const metrics = report.metrics;

  await feishu.sendCard(
    `📈 每周经营周报 · ${shopName} · ${startDate}~${endDate}`,
    [
      `💰 **周销售额：** ¥${metrics.summary.totalAmount.toFixed(2)}`,
      `📦 **周订单量：** ${metrics.summary.orderCount} 单`,
      `🔄 **退款率：** ${metrics.summary.refundRate}`,
      `⚠️ **低库存商品：** ${metrics.stock.lowStockCount} 件`,
      '',
      `🤖 **AI 经营建议：**\n${report.insight}`,
    ],
    'blue'
  );

  db.prepare('UPDATE reports SET feishu_sent_at=CURRENT_TIMESTAMP WHERE id=?').run(report.id);
  logger.info(`[周报] 店铺 ${shopId} 周报已推送 id=${report.id}`);
  return report;
}

/**
 * 生成并保存 AI 分析报告
 */
async function generateReport(shopId, type, startDate, endDate, aiOptions = {}) {
  const shop = shopService.getShop(shopId);
  if (!shop) throw new Error('店铺不存在');

  const data = buildReportData(shopId, startDate, endDate);
  const title = type === 'daily'
    ? `日报 · ${shop.name} · ${startDate}`
    : (type === 'weekly' ? `周报 · ${shop.name} · ${startDate}~${endDate}` : `经营分析 · ${shop.name} · ${startDate}~${endDate}`);

  let insight = '（AI 分析暂不可用）';
  try {
    insight = await ai.analyzeReport(data, type, aiOptions);
    if (!insight || !insight.trim()) {
      logger.warn('[报告] AI 返回空内容，使用默认提示');
      insight = '（AI 未返回有效分析内容）';
    }
  } catch (err) {
    logger.warn(`[报告] AI 分析失败: ${err.message}`);
  }

  const content = `# ${title}\n\n${insight}\n\n---\n**核心数据**\n- 销售额：¥${data.summary.totalAmount.toFixed(2)}\n- 订单量：${data.summary.orderCount} 单\n- 客单价：¥${data.summary.avgAmount.toFixed(2)}\n- 退款率：${data.summary.refundRate}\n- 低库存商品：${data.stock.lowStockCount} 件`;

  const result = db.prepare(`
    INSERT INTO reports (shop_id, type, title, start_date, end_date, metrics, insight, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(shopId, type, title, startDate, endDate, JSON.stringify(data), insight, content);

  const report = {
    id: result.lastInsertRowid,
    shopId,
    type,
    title,
    startDate,
    endDate,
    metrics: data,
    insight,
    content,
    createdAt: new Date().toISOString(),
  };

  logger.info(`[报告] 生成${type}报告 id=${report.id} shop=${shop.name}`);
  return report;
}

function getReports(shopId, { type, limit = 20, offset = 0 } = {}) {
  let sql = 'SELECT * FROM reports WHERE shop_id=?';
  const params = [shopId];
  if (type && type !== 'all') {
    sql += ' AND type=?';
    params.push(type);
  }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(+limit, +offset);
  return db.prepare(sql).all(...params).map(row => ({
    id: row.id,
    shopId: row.shop_id,
    type: row.type,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    insight: row.insight,
    content: row.content,
    feishuSentAt: row.feishu_sent_at,
    createdAt: row.created_at,
  }));
}

function getReportById(id) {
  const row = db.prepare('SELECT * FROM reports WHERE id=?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    shopId: row.shop_id,
    type: row.type,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    metrics: row.metrics ? JSON.parse(row.metrics) : null,
    insight: row.insight,
    content: row.content,
    feishuSentAt: row.feishu_sent_at,
    createdAt: row.created_at,
  };
}

module.exports = {
  getSalesSummary,
  getTopGoods,
  getDailyTrend,
  getTrendRange,
  getStockAnalysis,
  getRepurchaseStats,
  buildReportData,
  generateAiInsight,
  generateReport,
  getReports,
  getReportById,
  sendDailyReport,
  sendWeeklyReport,
};
