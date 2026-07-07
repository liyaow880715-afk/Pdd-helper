'use strict';

/**
 * 知识库服务
 * 货盘 + 客服话术的统一管理，为 AI 客服提供检索增强上下文
 */

const db = require('../utils/db');
const logger = require('../utils/logger');

// --- 分类管理 ---

function listCategories(shopId, type) {
  let sql = 'SELECT * FROM kb_categories WHERE shop_id=? ORDER BY sort_order ASC, id ASC';
  let params = [shopId];
  if (type) {
    sql = 'SELECT * FROM kb_categories WHERE shop_id=? AND type=? ORDER BY sort_order ASC, id ASC';
    params = [shopId, type];
  }
  return db.prepare(sql).all(...params);
}

function addCategory(shopId, { name, type, sortOrder = 0 }) {
  if (!name || !type) throw new Error('name 和 type 必填');
  return db.prepare(
    'INSERT INTO kb_categories (shop_id, name, type, sort_order) VALUES (?,?,?,?)'
  ).run(shopId, name, type, sortOrder).lastInsertRowid;
}

function updateCategory(id, { name, sortOrder }) {
  const fields = [], vals = [];
  if (name !== undefined) { fields.push('name=?'); vals.push(name); }
  if (sortOrder !== undefined) { fields.push('sort_order=?'); vals.push(sortOrder); }
  if (!fields.length) throw new Error('无可更新字段');
  vals.push(id);
  db.prepare(`UPDATE kb_categories SET ${fields.join(',')} WHERE id=?`).run(...vals);
}

function deleteCategory(id) {
  db.prepare('DELETE FROM kb_categories WHERE id=?').run(id);
}

// --- 货盘管理 ---

function listProducts(shopId, { categoryId, keyword, status = 'active', page = 1, pageSize = 20 } = {}) {
  let where = 'shop_id=? AND status=?';
  let params = [shopId, status];
  if (categoryId) { where += ' AND category_id=?'; params.push(categoryId); }
  if (keyword) { where += ' AND (name LIKE ? OR specs LIKE ? OR selling_points LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM kb_products WHERE ${where}`).get(...params).cnt;
  const limit = +pageSize;
  const offset = (+page - 1) * limit;
  const list = db.prepare(`SELECT * FROM kb_products WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  return { list: list.map(parseProduct), total, page: +page, pageSize: limit };
}

function getProduct(id) {
  const row = db.prepare('SELECT * FROM kb_products WHERE id=?').get(id);
  return row ? parseProduct(row) : null;
}

function parseProduct(row) {
  return {
    ...row,
    specs: safeJson(row.specs, {}),
    images: safeJson(row.images, []),
    price: row.price ?? null,
    stock: row.stock ?? null,
  };
}

function addProduct(shopId, data) {
  const { name, categoryId, specs, price, stock, sellingPoints, images, goodsId, skuId } = data;
  if (!name) throw new Error('name 必填');
  return db.prepare(
    'INSERT INTO kb_products (shop_id, goods_id, sku_id, name, category_id, specs, price, stock, selling_points, images) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(shopId, goodsId || null, skuId || null, name, categoryId || null, JSON.stringify(specs || {}), price || null, stock || null, sellingPoints || null, JSON.stringify(images || [])).lastInsertRowid;
}

function updateProduct(id, data) {
  const { name, categoryId, specs, price, stock, sellingPoints, images, status } = data;
  const fields = [], vals = [];
  if (name !== undefined) { fields.push('name=?'); vals.push(name); }
  if (categoryId !== undefined) { fields.push('category_id=?'); vals.push(categoryId); }
  if (specs !== undefined) { fields.push('specs=?'); vals.push(JSON.stringify(specs)); }
  if (price !== undefined) { fields.push('price=?'); vals.push(price); }
  if (stock !== undefined) { fields.push('stock=?'); vals.push(stock); }
  if (sellingPoints !== undefined) { fields.push('selling_points=?'); vals.push(sellingPoints); }
  if (images !== undefined) { fields.push('images=?'); vals.push(JSON.stringify(images)); }
  if (status !== undefined) { fields.push('status=?'); vals.push(status); }
  if (!fields.length) throw new Error('无可更新字段');
  fields.push('updated_at=CURRENT_TIMESTAMP');
  vals.push(id);
  db.prepare(`UPDATE kb_products SET ${fields.join(',')} WHERE id=?`).run(...vals);
}

function deleteProduct(id) {
  db.prepare('DELETE FROM kb_products WHERE id=?').run(id);
}

// 从拼多多已同步商品导入到货盘知识库
function syncFromPdd(shopId) {
  const rows = db.prepare('SELECT goods_id, goods_name, price, stock, status, image_url FROM goods WHERE shop_id=?').all(shopId);
  let added = 0, updated = 0;
  for (const g of rows) {
    const exists = db.prepare('SELECT id FROM kb_products WHERE shop_id=? AND goods_id=?').get(shopId, g.goods_id);
    const sellingPoints = g.goods_name ? `商品名称：${g.goods_name}` : '';
    if (exists) {
      db.prepare('UPDATE kb_products SET name=?, price=?, stock=?, selling_points=?, images=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(g.goods_name, g.price, g.stock, sellingPoints, JSON.stringify(g.image_url ? [g.image_url] : []), exists.id);
      updated++;
    } else {
      db.prepare('INSERT INTO kb_products (shop_id, goods_id, name, price, stock, selling_points, images, source) VALUES (?,?,?,?,?,?,?,?)')
        .run(shopId, g.goods_id, g.goods_name, g.price, g.stock, sellingPoints, JSON.stringify(g.image_url ? [g.image_url] : []), 'sync');
      added++;
    }
  }
  logger.info(`[知识库] shop=${shopId} 同步货盘完成: 新增${added} 更新${updated}`);
  return { added, updated };
}

// --- 话术管理 ---

function listScripts(shopId, { categoryId, keyword, status = 'active', page = 1, pageSize = 20 } = {}) {
  let where = 'shop_id=? AND status=?';
  let params = [shopId, status];
  if (categoryId) { where += ' AND category_id=?'; params.push(categoryId); }
  if (keyword) { where += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM kb_scripts WHERE ${where}`).get(...params).cnt;
  const limit = +pageSize;
  const offset = (+page - 1) * limit;
  const list = db.prepare(`SELECT * FROM kb_scripts WHERE ${where} ORDER BY hit_count DESC, updated_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  return { list: list.map(parseScript), total, page: +page, pageSize: limit };
}

function getScript(id) {
  const row = db.prepare('SELECT * FROM kb_scripts WHERE id=?').get(id);
  return row ? parseScript(row) : null;
}

function parseScript(row) {
  return { ...row, tags: safeJson(row.tags, []) };
}

function addScript(shopId, data) {
  const { title, content, categoryId, tags } = data;
  if (!title || !content) throw new Error('title 和 content 必填');
  return db.prepare(
    'INSERT INTO kb_scripts (shop_id, category_id, title, content, tags) VALUES (?,?,?,?,?)'
  ).run(shopId, categoryId || null, title, content, JSON.stringify(tags || [])).lastInsertRowid;
}

function updateScript(id, data) {
  const { title, content, categoryId, tags, status } = data;
  const fields = [], vals = [];
  if (title !== undefined) { fields.push('title=?'); vals.push(title); }
  if (content !== undefined) { fields.push('content=?'); vals.push(content); }
  if (categoryId !== undefined) { fields.push('category_id=?'); vals.push(categoryId); }
  if (tags !== undefined) { fields.push('tags=?'); vals.push(JSON.stringify(tags)); }
  if (status !== undefined) { fields.push('status=?'); vals.push(status); }
  if (!fields.length) throw new Error('无可更新字段');
  fields.push('updated_at=CURRENT_TIMESTAMP');
  vals.push(id);
  db.prepare(`UPDATE kb_scripts SET ${fields.join(',')} WHERE id=?`).run(...vals);
}

function deleteScript(id) {
  db.prepare('DELETE FROM kb_scripts WHERE id=?').run(id);
}

function incrementScriptHit(id) {
  db.prepare('UPDATE kb_scripts SET hit_count=hit_count+1 WHERE id=?').run(id);
}

// --- 搜索/检索（用于客服 AI） ---

function searchProducts(shopId, keyword, limit = 5) {
  const rows = db.prepare(
    'SELECT * FROM kb_products WHERE shop_id=? AND status=? AND (name LIKE ? OR specs LIKE ? OR selling_points LIKE ?) ORDER BY updated_at DESC LIMIT ?'
  ).all(shopId, 'active', `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit);
  return rows.map(parseProduct);
}

function searchScripts(shopId, keyword, limit = 5) {
  const rows = db.prepare(
    'SELECT * FROM kb_scripts WHERE shop_id=? AND status=? AND (title LIKE ? OR content LIKE ? OR tags LIKE ?) ORDER BY hit_count DESC LIMIT ?'
  ).all(shopId, 'active', `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit);
  return rows.map(parseScript);
}

/**
 * 为 AI 客服组装知识库上下文
 * 根据买家消息，检索相关货盘和话术，拼接成 prompt 片段
 */
function getKnowledgeContext(shopId, message) {
  const keywords = extractKeywords(message);
  const mainKeyword = keywords[0] || message.slice(0, 20);

  const products = searchProducts(shopId, mainKeyword, 3);
  const scripts = searchScripts(shopId, mainKeyword, 3);

  let context = '';

  if (products.length) {
    context += '\n【店铺商品信息】\n';
    products.forEach((p, i) => {
      context += `${i + 1}. ${p.name}`;
      if (p.price) context += ` 价格: ¥${p.price}`;
      if (p.stock !== null) context += ` 库存: ${p.stock}`;
      if (p.selling_points) context += ` 卖点: ${p.selling_points}`;
      const specs = Object.entries(p.specs || {}).map(([k, v]) => `${k}:${v}`).join(', ');
      if (specs) context += ` 规格: {${specs}}`;
      context += '\n';
    });
  }

  if (scripts.length) {
    context += '\n【推荐回复话术】\n';
    scripts.forEach((s, i) => {
      context += `${i + 1}. ${s.title}: ${s.content}\n`;
    });
  }

  return { context, products, scripts };
}

// --- 工具 ---

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function extractKeywords(message) {
  // 简单提取：去除标点，按长度筛选关键词
  const cleaned = message.replace(/[，。！？、；：""''（）【】《》]/g, ' ');
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  // 去重并保留前 3 个
  return [...new Set(words)].slice(0, 3);
}

module.exports = {
  // 分类
  listCategories, addCategory, updateCategory, deleteCategory,
  // 货盘
  listProducts, getProduct, addProduct, updateProduct, deleteProduct, syncFromPdd,
  // 话术
  listScripts, getScript, addScript, updateScript, deleteScript, incrementScriptHit,
  // 检索
  searchProducts, searchScripts, getKnowledgeContext,
};
