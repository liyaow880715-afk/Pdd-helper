'use strict';

/**
 * 推广分析服务
 * - 多多进宝：推广链接生成、订单归因
 * - 推广中心：搜索/场景计划同步、报表分析
 * - 渠道追踪：UTM 链接、效果统计
 * - AI 推广策略建议
 */

const { forShop } = require('../api/pdd-client');
const db = require('../utils/db');
const ai = require('../utils/ai');
const logger = require('../utils/logger');

// ─── 数据库初始化（推广相关表）──────────────────────────────────────────────────

db.exec(`
  -- 推广计划表（多多进宝 + 搜索推广 + 场景推广）
  CREATE TABLE IF NOT EXISTS promotion_plans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id     INTEGER NOT NULL,
    plan_type   TEXT NOT NULL,            -- ddk | search | scene
    pdd_plan_id TEXT,
    plan_name   TEXT,
    goods_id    TEXT,
    status      TEXT DEFAULT 'active',    -- active | paused | ended
    commission_rate INTEGER,              -- 进宝佣金（千分比）
    bid         INTEGER,                  -- 出价（分）
    budget      INTEGER,                  -- 日限额（分）
    keywords    TEXT,                     -- JSON 数组
    start_date  DATE,
    end_date    DATE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 渠道表
  CREATE TABLE IF NOT EXISTS channels (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_name TEXT NOT NULL,
    channel_type TEXT,                    -- wechat | xiaohongshu | douyin | kuaishou | other
    channel_desc TEXT,
    cost_per_click INTEGER DEFAULT 0,     -- 预估点击成本（分）
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 追踪链接表
  CREATE TABLE IF NOT EXISTS tracking_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code  TEXT UNIQUE NOT NULL,
    shop_id     INTEGER NOT NULL,
    goods_id    TEXT,
    plan_id     INTEGER REFERENCES promotion_plans(id),
    channel_id  INTEGER REFERENCES channels(id),
    target_url  TEXT NOT NULL,
    short_url   TEXT,
    click_count INTEGER DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    total_gmv   INTEGER DEFAULT 0,        -- 成交额（分）
    total_cost  INTEGER DEFAULT 0,        -- 推广花费（分）
    is_active   BOOLEAN DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 多多进宝订单归因表
  CREATE TABLE IF NOT EXISTS ddk_orders (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id          INTEGER NOT NULL,
    order_sn         TEXT NOT NULL,
    goods_id         TEXT,
    goods_name       TEXT,
    order_amount     INTEGER,             -- 分
    commission_amount INTEGER,            -- 分
    order_create_time DATETIME,
    pid              TEXT,                -- 推广位ID
    tracking_link_id INTEGER REFERENCES tracking_links(id),
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shop_id, order_sn)
  );

  -- 推广效果日报（聚合加速）
  CREATE TABLE IF NOT EXISTS promotion_daily_stats (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_link_id INTEGER REFERENCES tracking_links(id),
    shop_id          INTEGER NOT NULL,
    stat_date        DATE NOT NULL,
    clicks           INTEGER DEFAULT 0,
    orders           INTEGER DEFAULT 0,
    gmv              INTEGER DEFAULT 0,
    spend            INTEGER DEFAULT 0,
    commission       INTEGER DEFAULT 0,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tracking_link_id, stat_date)
  );

  CREATE INDEX IF NOT EXISTS idx_tracking_shop ON tracking_links(shop_id);
  CREATE INDEX IF NOT EXISTS idx_tracking_plan  ON tracking_links(plan_id);
  CREATE INDEX IF NOT EXISTS idx_ddk_shop       ON ddk_orders(shop_id);
  CREATE INDEX IF NOT EXISTS idx_ddk_link       ON ddk_orders(tracking_link_id);
  CREATE INDEX IF NOT EXISTS idx_stats_shop_date ON promotion_daily_stats(shop_id, stat_date);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_plans_unique ON promotion_plans(shop_id, plan_type, pdd_plan_id);
`);

// ─── 推广计划同步 ───────────────────────────────────────────────────────────────

/** 同步多多进宝计划（通过 ddk 订单反推，或手动录入） */
async function syncDdkPlans(shopId) {
  // 多多进宝没有直接的"计划列表"API，通常通过推广位(p_id)管理
  // 这里简化为：从已有追踪链接中归集
  logger.info(`[推广] 店铺 ${shopId} 同步进宝数据...`);
  const api = forShop(shopId);

  // 拉取近24小时进宝订单
  const res = await api.ddkOrderList();
  const orders = (res.ddk_order_list_range_get_response || {}).order_list || [];

  const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO ddk_orders
      (shop_id, order_sn, goods_id, goods_name, order_amount, commission_amount, order_create_time, pid)
    VALUES (@shop_id, @order_sn, @goods_id, @goods_name, @order_amount, @commission_amount, @order_create_time, @pid)
  `);

  let newCount = 0;
  for (const o of orders) {
    const row = {
      shop_id: shopId,
      order_sn: o.order_sn,
      goods_id: String(o.goods_id || ''),
      goods_name: o.goods_name || '',
      order_amount: Math.round((o.order_amount || 0) * 100),
      commission_amount: Math.round((o.promotion_amount || 0) * 100),
      order_create_time: o.order_create_time
        ? new Date(o.order_create_time * 1000).toISOString()
        : null,
      pid: o.p_id || '',
    };
    if (insertOrder.run(row).changes > 0) {
      newCount++;
      // 尝试按 pid 归因到 tracking_link
      const link = db.prepare('SELECT id FROM tracking_links WHERE short_code=?').get(o.p_id || '');
      if (link) {
        db.prepare('UPDATE ddk_orders SET tracking_link_id=? WHERE shop_id=? AND order_sn=?')
          .run(link.id, shopId, o.order_sn);
        db.prepare(`
          UPDATE tracking_links
          SET order_count = order_count + 1,
              total_gmv   = total_gmv + ?,
              total_cost  = total_cost + ?
          WHERE id = ?
        `).run(row.order_amount, row.commission_amount, link.id);
      }
    }
  }

  logger.info(`[推广] 店铺 ${shopId} 进宝订单同步完成，新增 ${newCount} 条`);
  return { total: orders.length, newCount };
}

function mapCpsStatus(status) {
  switch (status) {
    case 1: return 'active';
    case 2: return 'paused';
    case 3: return 'ended';
    default: return 'paused';
  }
}

/** 同步 CPS 全店推广计划（替换已下线的 pdd.ad.api.*） */
async function syncAdPlans(shopId) {
  logger.info(`[推广] 店铺 ${shopId} 同步 CPS 全店推广计划...`);
  const api = forShop(shopId);

  try {
    const res = await api.cpsMallUnitQuery();
    const unit = res.goods_cps_mall_unit_query_response || {};

    const insert = db.prepare(`
      INSERT INTO promotion_plans (shop_id, plan_type, pdd_plan_id, plan_name, goods_id, status, commission_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_id, plan_type, pdd_plan_id) DO UPDATE SET
        plan_name=excluded.plan_name, status=excluded.status,
        commission_rate=excluded.commission_rate, end_date=CURRENT_TIMESTAMP
    `);
    insert.run(shopId, 'cps_mall', 'mall', '全店推广', '', mapCpsStatus(unit.status), unit.rate || 0);

    logger.info(`[推广] 店铺 ${shopId} CPS 全店推广同步完成，rate=${unit.rate} status=${unit.status}`);
    return { count: 1, rate: unit.rate, status: unit.status };
  } catch (err) {
    logger.warn(`[推广] 店铺 ${shopId} CPS 全店推广同步失败: ${err.message}`);
    return { count: 0, error: err.message };
  }
}

/** 查询 CPS 单品推广 */
async function queryCpsUnit(shopId, goodsId) {
  const api = forShop(shopId);
  const res = await api.cpsUnitQuery(goodsId);
  return res.goods_cps_unit_query_response || res;
}

/** 创建/修改 CPS 单品推广 */
async function createCpsUnit(shopId, units) {
  const api = forShop(shopId);
  const res = await api.cpsUnitCreate(units);
  return res.goods_cps_unit_create_response || res;
}

async function updateCpsUnit(shopId, units) {
  const api = forShop(shopId);
  const res = await api.cpsUnitChange(units);
  return res.goods_cps_unit_change_response || res;
}

/** 删除 CPS 单品推广 */
async function deleteCpsUnit(shopId, goodsId) {
  const api = forShop(shopId);
  const res = await api.cpsUnitDelete(goodsId);
  return res.goods_cps_unit_delete_response || res;
}

// ─── 渠道 & 追踪链接管理 ────────────────────────────────────────────────────────

function listChannels() {
  return db.prepare('SELECT * FROM channels ORDER BY id DESC').all();
}

function addChannel({ channelName, channelType, channelDesc, costPerClick }) {
  return db.prepare(
    'INSERT INTO channels (channel_name, channel_type, channel_desc, cost_per_click) VALUES (?,?,?,?)'
  ).run(channelName, channelType || '', channelDesc || '', costPerClick || 0).lastInsertRowid;
}

function deleteChannel(id) {
  db.prepare('DELETE FROM channels WHERE id=?').run(id);
}

/** 创建追踪链接 */
function createTrackingLink({ shopId, goodsId, planId, channelId, targetUrl }) {
  const shortCode = genShortCode(6);
  db.prepare(`
    INSERT INTO tracking_links (short_code, shop_id, goods_id, plan_id, channel_id, target_url, short_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(shortCode, shopId, goodsId || '', planId || null, channelId || null, targetUrl, `https://pdd.cc/${shortCode}`);
  return shortCode;
}

function listTrackingLinks(shopId) {
  return db.prepare(`
    SELECT t.*, c.channel_name, p.plan_name, p.plan_type
    FROM tracking_links t
    LEFT JOIN channels c ON t.channel_id = c.id
    LEFT JOIN promotion_plans p ON t.plan_id = p.id
    WHERE t.shop_id=?
    ORDER BY t.created_at DESC
  `).all(shopId);
}

function genShortCode(len = 6) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  // 简单防重复
  const existing = db.prepare('SELECT 1 FROM tracking_links WHERE short_code=?').get(code);
  return existing ? genShortCode(len) : code;
}

// ─── 数据统计 ───────────────────────────────────────────────────────────────────

/** 推广总览（近7天） */
function getPromotionSummary(shopId) {
  const ddkStats = db.prepare(`
    SELECT
      COUNT(*) AS orderCount,
      COALESCE(SUM(order_amount), 0) AS totalGmv,
      COALESCE(SUM(commission_amount), 0) AS totalCommission
    FROM ddk_orders
    WHERE shop_id=? AND order_create_time >= datetime('now', '-7 days')
  `).get(shopId);

  const linkStats = db.prepare(`
    SELECT
      SUM(click_count) AS totalClicks,
      SUM(order_count) AS totalOrders,
      SUM(total_gmv) AS totalGmv,
      SUM(total_cost) AS totalCost
    FROM tracking_links
    WHERE shop_id=?
  `).get(shopId);

  return {
    ddk: ddkStats,
    tracking: linkStats,
    roi: linkStats.totalCost > 0 ? (linkStats.totalGmv / linkStats.totalCost).toFixed(2) : '0.00',
  };
}

/** 各渠道效果对比 */
function getChannelStats(shopId) {
  return db.prepare(`
    SELECT
      c.channel_name,
      c.channel_type,
      SUM(t.click_count) AS clicks,
      SUM(t.order_count) AS orders,
      SUM(t.total_gmv) AS gmv,
      SUM(t.total_cost) AS cost
    FROM tracking_links t
    LEFT JOIN channels c ON t.channel_id = c.id
    WHERE t.shop_id=?
    GROUP BY t.channel_id
    ORDER BY gmv DESC
  `).all(shopId);
}

/** 推广计划列表（本地） */
function getLocalPlans(shopId) {
  return db.prepare('SELECT * FROM promotion_plans WHERE shop_id=? ORDER BY created_at DESC').all(shopId);
}

// ─── AI 推广策略建议 ────────────────────────────────────────────────────────────

async function generatePromotionStrategy(shopId, aiOptions = {}) {
  const stats = getPromotionSummary(shopId);
  const channels = getChannelStats(shopId);

  const prompt = `你是一位拼多多推广投放专家。请根据以下数据给出推广策略优化建议：

推广数据（近7天）：
- 多多进宝订单数：${stats.ddk.orderCount} 单
- 多多进宝GMV：¥${(stats.ddk.totalGmv / 100).toFixed(2)}
- 多多进宝佣金支出：¥${(stats.ddk.totalCommission / 100).toFixed(2)}
- 追踪链接总点击：${stats.tracking.totalClicks || 0}
- 追踪链接总订单：${stats.tracking.totalOrders || 0}
- 追踪链接总GMV：¥${(stats.tracking.totalGmv / 100).toFixed(2)}
- 追踪链接总花费：¥${(stats.tracking.totalCost / 100).toFixed(2)}

渠道分布：
${channels.map(ch => `- ${ch.channel_name || '未知渠道'}: 点击${ch.clicks || 0}, 订单${ch.orders || 0}, GMV ¥${(ch.gmv / 100).toFixed(2)}`).join('\n')}

请给出：
1. ROI 分析和问题诊断
2. 各渠道预算分配建议
3. 下一步优化动作（具体可执行）
4. 风险提示`;

  return ai.callApi(aiOptions.model || 'deepseek-chat', [
    { role: 'user', content: prompt },
  ], 800, aiOptions);
}

module.exports = {
  syncDdkPlans,
  syncAdPlans,
  queryCpsUnit,
  createCpsUnit,
  updateCpsUnit,
  deleteCpsUnit,
  listChannels,
  addChannel,
  deleteChannel,
  createTrackingLink,
  listTrackingLinks,
  getPromotionSummary,
  getChannelStats,
  getLocalPlans,
  generatePromotionStrategy,
};
