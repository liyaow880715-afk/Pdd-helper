'use strict';

const express = require('express');
const router = express.Router();
const promotion = require('../services/promotion.service');
const asyncHandler = require('../middleware/asyncHandler');

// ─── 推广计划 ───────────────────────────────────────────────────────────────────

/** GET /api/v1/promotion/plans?shopId=1 */
router.get('/promotion/plans', asyncHandler(async (req, res) => {
  const { shopId } = req.query;
  const plans = promotion.getLocalPlans(+shopId);
  res.json({ code: 0, data: plans });
}));

/** POST /api/v1/promotion/plans/sync */
router.post('/promotion/plans/sync', asyncHandler(async (req, res) => {
  const { shopId, type } = req.body;
  if (type === 'ad' || type === 'cps') {
    const result = await promotion.syncAdPlans(+shopId);
    res.json({ code: 0, data: result });
  } else {
    const result = await promotion.syncDdkPlans(+shopId);
    res.json({ code: 0, data: result });
  }
}));

// ─── CPS 单品推广管理 ─────────────────────────────────────────────────────────

/** GET /api/v1/promotion/cps/mall?shopId=1 */
router.get('/promotion/cps/mall', asyncHandler(async (req, res) => {
  const { shopId } = req.query;
  if (!shopId) return res.json({ code: 1, message: 'shopId 必填' });
  const data = await promotion.syncAdPlans(+shopId);
  res.json({ code: 0, data });
}));

/** GET /api/v1/promotion/cps/unit?shopId=1&goodsId=xxx */
router.get('/promotion/cps/unit', asyncHandler(async (req, res) => {
  const { shopId, goodsId } = req.query;
  if (!shopId || !goodsId) return res.json({ code: 1, message: 'shopId / goodsId 必填' });
  const data = await promotion.queryCpsUnit(+shopId, goodsId);
  res.json({ code: 0, data });
}));

/** POST /api/v1/promotion/cps/unit { shopId, units: [{goods_id, rate, ...}] } */
router.post('/promotion/cps/unit', asyncHandler(async (req, res) => {
  const { shopId, units } = req.body;
  if (!shopId || !Array.isArray(units) || !units.length) {
    return res.json({ code: 1, message: 'shopId / units 必填' });
  }
  const data = await promotion.createCpsUnit(+shopId, units);
  res.json({ code: 0, data });
}));

/** PUT /api/v1/promotion/cps/unit */
router.put('/promotion/cps/unit', asyncHandler(async (req, res) => {
  const { shopId, units } = req.body;
  if (!shopId || !Array.isArray(units) || !units.length) {
    return res.json({ code: 1, message: 'shopId / units 必填' });
  }
  const data = await promotion.updateCpsUnit(+shopId, units);
  res.json({ code: 0, data });
}));

/** DELETE /api/v1/promotion/cps/unit { shopId, goodsId } */
router.delete('/promotion/cps/unit', asyncHandler(async (req, res) => {
  const { shopId, goodsId } = req.body;
  if (!shopId || !goodsId) return res.json({ code: 1, message: 'shopId / goodsId 必填' });
  const data = await promotion.deleteCpsUnit(+shopId, goodsId);
  res.json({ code: 0, data });
}));

// ─── 渠道管理 ───────────────────────────────────────────────────────────────────

/** GET /api/v1/promotion/channels */
router.get('/promotion/channels', asyncHandler(async (req, res) => {
  const list = promotion.listChannels();
  res.json({ code: 0, data: list });
}));

/** POST /api/v1/promotion/channels */
router.post('/promotion/channels', asyncHandler(async (req, res) => {
  const id = promotion.addChannel(req.body);
  res.json({ code: 0, data: { id } });
}));

/** DELETE /api/v1/promotion/channels/:id */
router.delete('/promotion/channels/:id', asyncHandler(async (req, res) => {
  promotion.deleteChannel(+req.params.id);
  res.json({ code: 0 });
}));

// ─── 追踪链接 ───────────────────────────────────────────────────────────────────

/** GET /api/v1/promotion/links?shopId=1 */
router.get('/promotion/links', asyncHandler(async (req, res) => {
  const { shopId } = req.query;
  const list = promotion.listTrackingLinks(+shopId);
  res.json({ code: 0, data: list });
}));

/** POST /api/v1/promotion/links */
router.post('/promotion/links', asyncHandler(async (req, res) => {
  const { shopId, goodsId, planId, channelId, targetUrl } = req.body;
  const shortCode = promotion.createTrackingLink({ shopId, goodsId, planId, channelId, targetUrl });
  res.json({ code: 0, data: { shortCode } });
}));

// ─── 数据统计 ───────────────────────────────────────────────────────────────────

/** GET /api/v1/promotion/summary?shopId=1 */
router.get('/promotion/summary', asyncHandler(async (req, res) => {
  const { shopId } = req.query;
  const data = promotion.getPromotionSummary(+shopId);
  res.json({ code: 0, data });
}));

/** GET /api/v1/promotion/channel-stats?shopId=1 */
router.get('/promotion/channel-stats', asyncHandler(async (req, res) => {
  const { shopId } = req.query;
  const data = promotion.getChannelStats(+shopId);
  res.json({ code: 0, data });
}));

// ─── AI 策略 ────────────────────────────────────────────────────────────────────

/** POST /api/v1/promotion/ai-strategy */
router.post('/promotion/ai-strategy', asyncHandler(async (req, res) => {
  const { shopId, aiOptions } = req.body;
  const strategy = await promotion.generatePromotionStrategy(+shopId, aiOptions);
  res.json({ code: 0, data: strategy });
}));

module.exports = router;
