'use strict';

const express = require('express');
const router = express.Router();
const kb = require('../services/knowledge.service');
const asyncHandler = require('../middleware/asyncHandler');

// --- 分类 ---

router.get('/knowledge/categories', (req, res) => {
  const { shopId, type } = req.query;
  res.json({ code: 0, data: kb.listCategories(+shopId || 0, type) });
});

router.post('/knowledge/categories', (req, res) => {
  try {
    const { shopId, name, type, sortOrder } = req.body;
    const id = kb.addCategory(+shopId || 0, { name, type, sortOrder });
    res.json({ code: 0, data: { id }, message: '分类创建成功' });
  } catch (err) {
    res.json({ code: 1, message: err.message });
  }
});

router.put('/knowledge/categories/:id', (req, res) => {
  try {
    kb.updateCategory(+req.params.id, req.body);
    res.json({ code: 0, message: '更新成功' });
  } catch (err) {
    res.json({ code: 1, message: err.message });
  }
});

router.delete('/knowledge/categories/:id', (req, res) => {
  kb.deleteCategory(+req.params.id);
  res.json({ code: 0, message: '已删除' });
});

// --- 货盘 ---

router.get('/knowledge/products', (req, res) => {
  const { shopId, categoryId, keyword, status, page, pageSize } = req.query;
  if (!shopId) return res.json({ code: 1, message: '请传入 shopId' });
  const data = kb.listProducts(+shopId, { categoryId: categoryId ? +categoryId : null, keyword, status, page, pageSize });
  res.json({ code: 0, data });
});

router.post('/knowledge/products', (req, res) => {
  try {
    const { shopId, ...data } = req.body;
    const id = kb.addProduct(+shopId || 0, data);
    res.json({ code: 0, data: { id }, message: '商品添加成功' });
  } catch (err) {
    res.json({ code: 1, message: err.message });
  }
});

router.put('/knowledge/products/:id', (req, res) => {
  try {
    kb.updateProduct(+req.params.id, req.body);
    res.json({ code: 0, message: '更新成功' });
  } catch (err) {
    res.json({ code: 1, message: err.message });
  }
});

router.delete('/knowledge/products/:id', (req, res) => {
  kb.deleteProduct(+req.params.id);
  res.json({ code: 0, message: '已删除' });
});

router.post('/knowledge/products/sync', asyncHandler(async (req, res) => {
  const { shopId } = req.body;
  if (!shopId) return res.json({ code: 1, message: '请传入 shopId' });
  const result = kb.syncFromPdd(+shopId);
  res.json({ code: 0, data: result, message: `同步完成：新增${result.added} 更新${result.updated}` });
}));

// --- 话术 ---

router.get('/knowledge/scripts', (req, res) => {
  const { shopId, categoryId, keyword, status, page, pageSize } = req.query;
  if (!shopId) return res.json({ code: 1, message: '请传入 shopId' });
  const data = kb.listScripts(+shopId, { categoryId: categoryId ? +categoryId : null, keyword, status, page, pageSize });
  res.json({ code: 0, data });
});

router.post('/knowledge/scripts', (req, res) => {
  try {
    const { shopId, ...data } = req.body;
    const id = kb.addScript(+shopId || 0, data);
    res.json({ code: 0, data: { id }, message: '话术添加成功' });
  } catch (err) {
    res.json({ code: 1, message: err.message });
  }
});

router.put('/knowledge/scripts/:id', (req, res) => {
  try {
    kb.updateScript(+req.params.id, req.body);
    res.json({ code: 0, message: '更新成功' });
  } catch (err) {
    res.json({ code: 1, message: err.message });
  }
});

router.delete('/knowledge/scripts/:id', (req, res) => {
  kb.deleteScript(+req.params.id);
  res.json({ code: 0, message: '已删除' });
});

// --- 搜索（客服用） ---

router.get('/knowledge/search', (req, res) => {
  const { shopId, keyword, type } = req.query;
  if (!shopId || !keyword) return res.json({ code: 1, message: 'shopId 和 keyword 必填' });
  const result = {};
  if (!type || type === 'product') {
    result.products = kb.searchProducts(+shopId, keyword, 5);
  }
  if (!type || type === 'script') {
    result.scripts = kb.searchScripts(+shopId, keyword, 5);
  }
  res.json({ code: 0, data: result });
});

module.exports = router;
