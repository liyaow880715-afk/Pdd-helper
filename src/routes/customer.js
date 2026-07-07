'use strict';

const express = require('express');
const router = express.Router();
const cs = require('../services/customer.service');
const asyncHandler = require('../middleware/asyncHandler');

function getShopId(req) {
  const shopId = req.query.shopId || req.body.shopId;
  if (!shopId) throw Object.assign(new Error('请传入 shopId'), { status: 400 });
  return +shopId;
}

// ─── 消息记录 ───────────────────────────────────────────────────────────────────

router.get('/customer/messages', asyncHandler(async (req, res) => {
  const shopId = getShopId(req);
  const { page = 1, pageSize = 20, replyType } = req.query;
  const limit = +pageSize;
  const offset = (+page - 1) * limit;
  const list = cs.getMessages(shopId, { limit, offset, replyType });
  const total = list.length < limit && page === 1
    ? list.length
    : cs.getMessages(shopId, { limit: 999999, offset: 0, replyType }).length;
  res.json({ code: 0, data: { list, total, page: +page, pageSize: limit } });
}));

// ─── 测试单条客服消息（可用于人工补回/调试 AI）────────────────────────────────────

router.post('/customer/test-message', asyncHandler(async (req, res) => {
  const shopId = getShopId(req);
  const { userId = 'test-user', message } = req.body;
  if (!message) return res.json({ code: 1, message: 'message 必填' });
  const result = await cs.handleMessage(shopId, userId, message);
  res.json({ code: 0, data: result });
}));

// ─── 回复模板 ───────────────────────────────────────────────────────────────────

router.get('/customer/templates', asyncHandler(async (req, res) => {
  const shopId = getShopId(req);
  res.json({ code: 0, data: cs.listTemplates(shopId) });
}));

router.post('/customer/templates', asyncHandler(async (req, res) => {
  const shopId = getShopId(req);
  const id = cs.addTemplate(shopId, req.body);
  res.json({ code: 0, data: { id } });
}));

router.put('/customer/templates/:id', asyncHandler(async (req, res) => {
  cs.updateTemplate(+req.params.id, req.body);
  res.json({ code: 0, message: '更新成功' });
}));

router.delete('/customer/templates/:id', asyncHandler(async (req, res) => {
  cs.deleteTemplate(+req.params.id);
  res.json({ code: 0, message: '删除成功' });
}));

// ─── 关键词规则 ─────────────────────────────────────────────────────────────────

router.get('/customer/rules', asyncHandler(async (req, res) => {
  const shopId = getShopId(req);
  res.json({ code: 0, data: cs.listRules(shopId) });
}));

router.post('/customer/rules', asyncHandler(async (req, res) => {
  const shopId = getShopId(req);
  const id = cs.addRule(shopId, req.body);
  res.json({ code: 0, data: { id } });
}));

router.put('/customer/rules/:id', asyncHandler(async (req, res) => {
  cs.updateRule(+req.params.id, req.body);
  res.json({ code: 0, message: '更新成功' });
}));

router.delete('/customer/rules/:id', asyncHandler(async (req, res) => {
  cs.deleteRule(+req.params.id);
  res.json({ code: 0, message: '删除成功' });
}));

// ─── 统计 ───────────────────────────────────────────────────────────────────────

router.get('/customer/stats', asyncHandler(async (req, res) => {
  const shopId = getShopId(req);
  const { date } = req.query;
  const stats = cs.getDailyStats(shopId, date);
  const topQuestions = cs.getTopQuestions(shopId, 10);
  res.json({ code: 0, data: { stats, topQuestions } });
}));

module.exports = router;
