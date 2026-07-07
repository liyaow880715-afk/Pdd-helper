'use strict';

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const refundService = require('../services/refund.service');
const asyncHandler = require('../middleware/asyncHandler');

// 手动触发售后退款同步
router.post('/sync/refunds', asyncHandler(async (req, res) => {
  const { shopId, hoursAgo = 24 } = req.body;
  if (!shopId) return res.json({ code: 1, message: '请传入 shopId' });
  const result = await refundService.syncRefunds(+shopId, +hoursAgo);
  res.json({ code: 0, data: result });
}));

// 本地退款明细（支持分页、时间范围筛选）
router.get('/refunds', (req, res) => {
  const { shopId, startTime, endTime, page = 1, pageSize = 20 } = req.query;
  if (!shopId) return res.json({ code: 1, message: '请传入 shopId' });

  const conditions = ['shop_id=?'];
  const params = [+shopId];
  if (startTime) { conditions.push('DATE(updated_at) >= ?'); params.push(startTime); }
  if (endTime) { conditions.push('DATE(updated_at) <= ?'); params.push(endTime); }

  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM refunds WHERE ${where}`).get(...params).cnt;
  const list = db.prepare(`
    SELECT * FROM refunds WHERE ${where}
    ORDER BY updated_at DESC LIMIT ? OFFSET ?
  `).all(...params, +pageSize, (+page - 1) * +pageSize);

  res.json({ code: 0, data: { list, total, page: +page, pageSize: +pageSize } });
});

module.exports = router;
