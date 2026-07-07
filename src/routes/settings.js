'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../utils/db');
const ai = require('../utils/ai');
const feishu = require('../utils/feishu');
const wecomBot = require('../utils/wecom-bot');
const jobManager = require('../utils/jobManager');
const cronConfig = require('../utils/cronConfig');
const logger = require('../utils/logger');
const asyncHandler = require('../middleware/asyncHandler');

// 配置 key 白名单
const ALLOWED_KEYS = [
  'notify_channel',
  'feishu_webhook_url',
  'wecom_webhook_url',
  'wecom_aibot_enabled',
  'wecom_aibot_bot_id',
  'wecom_aibot_secret',
  'wecom_aibot_default_chat_id',
  'wecom_aibot_default_shop_id',
  'stock_warning_threshold',
  'job_order_enabled',
  'job_stock_enabled',
  'job_report_enabled',
  'job_refund_enabled',
  'job_order_cron',
  'job_stock_cron',
  'job_report_cron',
  'job_weekly_cron',
  'job_refund_cron',
  'deepseek_daily_limit',
  'ai_base_url',
  'ai_api_key',
  'ai_chat_model',
  'ai_reasoner_model',
  'ai_user_agent',
  'ai_auto_reply',
  'ai_cs_system_prompt'
];

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key=?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare(`
    INSERT INTO config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
  `).run(key, String(value));
}

/**
 * GET /api/v1/settings
 * 获取所有配置
 */
router.get('/settings', (req, res) => {
  const result = {};
  for (const key of ALLOWED_KEYS) {
    const val = getConfig(key);
    // 布尔类型转换
    if (key.startsWith('job_')) {
      result[key] = val === null ? true : val === 'true';
    } else if (key === 'stock_warning_threshold' || key === 'deepseek_daily_limit') {
      result[key] = val ? +val : (key === 'stock_warning_threshold' ? 10 : 1000);
    } else if (key === 'ai_auto_reply') {
      result[key] = val === null ? true : val !== 'false';
    } else {
      result[key] = val || '';
    }
  }
  // AI 今日调用统计
  result.ai_stats = ai.getDailyStats();
  // 可用模型列表
  try {
    const modelsRow = db.prepare("SELECT value FROM config WHERE key='ai_available_models'").get();
    result.ai_available_models = modelsRow ? JSON.parse(modelsRow.value) : [];
  } catch {
    result.ai_available_models = [];
  }
  res.json({ code: 0, data: result });
});

/**
 * PUT /api/v1/settings
 * 保存配置（批量）
 */
router.put('/settings', (req, res) => {
  const body = req.body || {};
  const updated = [];
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      // cron 表达式校验
      if (key.endsWith('_cron') && body[key] && !cronConfig.validate(body[key])) {
        return res.json({ code: 1, message: `Cron 表达式无效: ${body[key]}` });
      }
      setConfig(key, body[key]);
      updated.push(key);
    }
  }
  // 动态重启对应的定时任务（开关或 cron 变化都生效）
  for (const key of updated) {
    if (key.startsWith('job_')) {
      jobManager.restartByKey(key);
    }
  }
  logger.op('系统设置', `更新配置: ${updated.join(', ')}`);
  res.json({ code: 0, message: '保存成功' });
});

/**
 * POST /api/v1/settings/ai-models/sync
 * 从当前 AI 配置的 /models 接口拉取可用模型并本地缓存
 */
router.post('/settings/ai-models/sync', asyncHandler(async (req, res) => {
  const settings = ai.getAiSettings();
  if (!settings.baseURL || !settings.apiKey) {
    return res.json({ code: 1, message: '请先配置 AI Base URL 和 API Key' });
  }

  try {
    const client = axios.create({
      baseURL: settings.baseURL,
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'User-Agent': settings.userAgent || 'KimiCLI/1.3',
      },
      timeout: 20000,
    });

    const response = await client.get('/models');
    const list = (response.data?.data || []).map(m => ({
      id: m.id,
      object: m.object,
      owned_by: m.owned_by,
    }));

    db.prepare(`
      INSERT INTO config (key, value) VALUES ('ai_available_models', ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
    `).run(JSON.stringify(list));

    logger.op('AI设置', `同步可用模型 ${list.length} 个`);
    return res.json({ code: 0, data: list });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const status = err.response?.status;
    logger.warn(`[AI模型同步] 失败 status=${status}: ${msg}`);
    return res.json({ code: 1, message: `同步模型失败: ${msg}` });
  }
}));

/**
 * POST /api/v1/settings/test-webhook
 * 测试通知（根据 notify_channel 自动选择企业微信/飞书/智能机器人）
 */
router.post('/settings/test-webhook', asyncHandler(async (req, res) => {
  const { channel } = feishu.getChannelConfig ? feishu.getChannelConfig() : { channel: 'feishu' };
  if (channel === 'wecom-aibot') {
    // 配置可能已变更，重启后等待认证完成再推送，否则会出现 WebSocket not connected
    await wecomBot.restart();
  }
  try {
    await feishu.sendMessage('✅ 通知测试成功！来自拼多多店铺管理系统');
  } catch (err) {
    return res.json({ code: 1, message: `测试通知发送失败：${err.message}` });
  }
  const channelName = channel === 'wecom-aibot' ? '企业微信智能机器人' : (channel === 'wecom' ? '企业微信' : '飞书');
  res.json({ code: 0, message: `测试通知已发送（${channelName}）` });
}));

/**
 * GET /api/v1/settings/logs
 * 操作日志列表
 */
router.get('/settings/logs', (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const limit = +pageSize;
  const offset = (+page - 1) * limit;

  // 从 config 表读取日志（key 以 log_ 开头）
  const total = db.prepare("SELECT COUNT(*) AS cnt FROM config WHERE key LIKE 'log_%'").get().cnt;
  const list = db.prepare(
    "SELECT key, value, updated_at FROM config WHERE key LIKE 'log_%' ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  ).all(limit, offset).map(row => {
    try {
      return { ...JSON.parse(row.value), created_at: row.updated_at };
    } catch {
      return { action: row.key, detail: row.value, status: 'success', created_at: row.updated_at };
    }
  });

  res.json({ code: 0, data: { list, total } });
});

module.exports = router;
