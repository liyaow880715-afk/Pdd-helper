'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(path.join(dbDir, 'pdd.db'));

function initDb() {
  db.exec(`
    -- 店铺表（多账号核心）
    CREATE TABLE IF NOT EXISTS shops (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      client_id     TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      access_token  TEXT NOT NULL,
      status    TEXT DEFAULT 'active',   -- active | disabled
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 商品表（加 shop_id）
    CREATE TABLE IF NOT EXISTS goods (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id  INTEGER NOT NULL DEFAULT 0,
      goods_id TEXT NOT NULL,
      goods_name TEXT,
      price    REAL,
      stock    INTEGER,
      status   TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(shop_id, goods_id)
    );

    -- 订单表（加 shop_id）
    CREATE TABLE IF NOT EXISTS orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id     INTEGER NOT NULL DEFAULT 0,
      order_sn    TEXT NOT NULL,
      buyer_name  TEXT,
      buyer_phone TEXT,
      buyer_address TEXT,
      goods_info  TEXT,
      total_amount REAL,
      status      TEXT,
      tracking_number TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(shop_id, order_sn)
    );

    -- 客服消息表（加 shop_id）
    CREATE TABLE IF NOT EXISTS customer_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id    INTEGER NOT NULL DEFAULT 0,
      user_id    TEXT,
      message    TEXT,
      reply      TEXT,
      reply_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 店铺授权状态记录（用于OAuth回调后临时存储state）
    CREATE TABLE IF NOT EXISTS shop_auth_states (
      state      TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      client_id  TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      redirect_uri TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 全局配置表
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 知识库分类表
    CREATE TABLE IF NOT EXISTS kb_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id    INTEGER NOT NULL DEFAULT 0,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL CHECK(type IN ('product','script')),
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 货盘知识库表
    CREATE TABLE IF NOT EXISTS kb_products (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id        INTEGER NOT NULL DEFAULT 0,
      goods_id       TEXT,
      sku_id         TEXT,
      name           TEXT NOT NULL,
      category_id    INTEGER,
      specs          TEXT, -- JSON
      price          REAL,
      stock          INTEGER,
      selling_points TEXT,
      images         TEXT, -- JSON array
      status         TEXT DEFAULT 'active',
      source         TEXT DEFAULT 'manual',
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 售后退款表
    CREATE TABLE IF NOT EXISTS refunds (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id       INTEGER NOT NULL DEFAULT 0,
      refund_id     TEXT UNIQUE NOT NULL,
      order_sn      TEXT NOT NULL,
      after_sales_status INTEGER,
      after_sales_type   INTEGER,
      refund_amount REAL,
      goods_amount  REAL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 客服话术知识库表
    CREATE TABLE IF NOT EXISTS kb_scripts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id      INTEGER NOT NULL DEFAULT 0,
      category_id  INTEGER,
      title        TEXT NOT NULL,
      content      TEXT NOT NULL,
      tags         TEXT, -- JSON array
      hit_count    INTEGER DEFAULT 0,
      status       TEXT DEFAULT 'active',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 迁移：旧表若无 shop_id 列则补加（兼容已有数据）
  const tables = ['goods', 'orders', 'customer_messages'];
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    if (!cols.includes('shop_id')) {
      db.exec(`ALTER TABLE ${t} ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 0`);
    }
  }

  // 迁移：image_url 字段
  const goodsCols = db.prepare('PRAGMA table_info(goods)').all().map(c => c.name);
  if (!goodsCols.includes('image_url')) {
    db.exec('ALTER TABLE goods ADD COLUMN image_url TEXT');
  }
  if (!goodsCols.includes('skus')) {
    db.exec('ALTER TABLE goods ADD COLUMN skus TEXT');
  }

  // 迁移：orders 表补充商品成交金额字段
  const orderCols = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
  if (!orderCols.includes('goods_amount')) {
    db.exec('ALTER TABLE orders ADD COLUMN goods_amount REAL');
  }

  // 迁移：goods 表补充 (shop_id, goods_id) 联合唯一索引，用于 UPSERT
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_shop_goods_unique ON goods(shop_id, goods_id)');
  } catch (e) {
    console.warn('[db] 创建 goods 联合唯一索引跳过:', e.message);
  }

  // 迁移：shops 表扩展字段（OAuth支持）
  const shopCols = db.prepare('PRAGMA table_info(shops)').all().map(c => c.name);
  if (!shopCols.includes('refresh_token')) {
    db.exec('ALTER TABLE shops ADD COLUMN refresh_token TEXT');
  }
  if (!shopCols.includes('expires_at')) {
    db.exec('ALTER TABLE shops ADD COLUMN expires_at DATETIME');
  }
  if (!shopCols.includes('mall_id')) {
    db.exec('ALTER TABLE shops ADD COLUMN mall_id TEXT');
  }
  if (!shopCols.includes('redirect_uri')) {
    db.exec('ALTER TABLE shops ADD COLUMN redirect_uri TEXT');
  }

  // 迁移：access_token 允许为空（新增店铺时可以先不填 token）
  const accessTokenCol = db.prepare('PRAGMA table_info(shops)').all().find(c => c.name === 'access_token');
  if (accessTokenCol && accessTokenCol.notnull) {
    db.exec(`
      CREATE TABLE shops_new (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        name      TEXT NOT NULL,
        client_id     TEXT NOT NULL,
        client_secret TEXT NOT NULL,
        access_token  TEXT,
        refresh_token TEXT,
        expires_at    DATETIME,
        mall_id       TEXT,
        redirect_uri  TEXT,
        status    TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO shops_new (id, name, client_id, client_secret, access_token, refresh_token, expires_at, mall_id, redirect_uri, status, created_at, updated_at)
      SELECT id, name, client_id, client_secret, access_token, refresh_token, expires_at, mall_id, redirect_uri, status, created_at, updated_at FROM shops;
      DROP TABLE shops;
      ALTER TABLE shops_new RENAME TO shops;
    `);
  }

  // AI 分析报告表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id       INTEGER NOT NULL,
      type          TEXT NOT NULL,      -- daily | weekly | custom
      title         TEXT,
      start_date    DATE,
      end_date      DATE,
      metrics       TEXT,               -- JSON
      insight       TEXT,               -- AI 分析原文
      content       TEXT,               -- 渲染后的报告内容（Markdown）
      feishu_sent_at DATETIME,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_reports_shop_type_date ON reports(shop_id, type, start_date);
  `);

  // 性能索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_shop_status         ON orders(shop_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_shop_created        ON orders(shop_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_shop_status_created ON orders(shop_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_goods_shop_status          ON goods(shop_id, status);
    CREATE INDEX IF NOT EXISTS idx_goods_shop_name            ON goods(shop_id, goods_name);
    CREATE INDEX IF NOT EXISTS idx_goods_shop_stock           ON goods(shop_id, stock);
    CREATE INDEX IF NOT EXISTS idx_cs_shop_created            ON customer_messages(shop_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_cs_shop_type               ON customer_messages(shop_id, reply_type);
    CREATE INDEX IF NOT EXISTS idx_kb_prod_shop_name          ON kb_products(shop_id, name);
    CREATE INDEX IF NOT EXISTS idx_kb_prod_shop_status        ON kb_products(shop_id, status);
    CREATE INDEX IF NOT EXISTS idx_kb_prod_shop_cat           ON kb_products(shop_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_kb_script_shop_title       ON kb_scripts(shop_id, title);
    CREATE INDEX IF NOT EXISTS idx_kb_script_shop_status      ON kb_scripts(shop_id, status);
    CREATE INDEX IF NOT EXISTS idx_kb_script_shop_cat         ON kb_scripts(shop_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_refunds_shop_updated       ON refunds(shop_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_refunds_order_sn           ON refunds(order_sn);
  `);

  console.log('Database initialized.');
}

initDb();

module.exports = db;
