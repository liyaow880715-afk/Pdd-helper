'use strict';

/**
 * 通用 AI 调用工具（OpenAI 兼容格式）
 * 支持 DeepSeek / Kimi / 通义千问 / OpenAI 等任意兼容接口
 */

const axios = require('axios');
const config = require('../config');
const logger = require('./logger');
const db = require('./db');
// 懒加载 monitor，避免循环依赖
let monitor = null;
function getMonitor() {
  if (!monitor) monitor = require('./monitor');
  return monitor;
}

function dbConfig(key, fallback = null) {
  try {
    const row = db.prepare('SELECT value FROM config WHERE key=?').get(key);
    return row ? row.value : fallback;
  } catch {
    return fallback;
  }
}

function getAiSettings() {
  return {
    baseURL: dbConfig('ai_base_url', config.ai.baseURL),
    apiKey: dbConfig('ai_api_key', config.ai.apiKey),
    chatModel: dbConfig('ai_chat_model', config.ai.chatModel),
    reasonerModel: dbConfig('ai_reasoner_model', config.ai.reasonerModel),
    userAgent: dbConfig('ai_user_agent', 'KimiCLI/1.3'),
    dailyLimit: parseInt(dbConfig('deepseek_daily_limit', String(config.ai.dailyLimit)), 10),
    autoReply: dbConfig('ai_auto_reply', 'true') !== 'false',
  };
}

// ─── 调用计数（每日限额）────────────────────────────────────────────────────────

function getTodayKey() {
  return `ai_calls_${new Date().toISOString().slice(0, 10)}`;
}

function getCallCount() {
  const row = db.prepare('SELECT value FROM config WHERE key=?').get(getTodayKey());
  return row ? parseInt(row.value, 10) : 0;
}

function incrCallCount() {
  const key = getTodayKey();
  db.prepare(`
    INSERT INTO config (key, value) VALUES (?, '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
  `).run(key);
}

function isOverLimit(limit) {
  return getCallCount() >= limit;
}

// ─── 核心调用（支持自定义 baseURL / apiKey / model / userAgent）────────────────────

async function callApi(model, messages, maxTokens = 500, options = {}) {
  const settings = getAiSettings();
  const baseURL = options.baseURL || settings.baseURL;
  const apiKey = options.apiKey || settings.apiKey;
  const dailyLimit = options.dailyLimit || settings.dailyLimit;
  const timeout = options.timeout || 30000;
  const userAgent = options.userAgent || settings.userAgent || 'KimiCLI/1.3';

  if (!apiKey) {
    throw new Error('AI API Key 未配置');
  }

  if (isOverLimit(dailyLimit)) {
    logger.warn(`[AI] 今日调用已达上限 ${dailyLimit}`);
    getMonitor().aiLimitWarning(getCallCount(), dailyLimit).catch(() => {});
    throw new Error('AI 今日调用次数已达上限');
  }

  const count = getCallCount();
  if (count / dailyLimit >= 0.8) {
    getMonitor().aiLimitWarning(count, dailyLimit).catch(() => {});
  }

  const client = axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
    },
    timeout,
  });

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    ...(options.extraBody || {}),
  };

  try {
    const res = await client.post('/chat/completions', body);
    incrCallCount();
    return res.data.choices[0].message.content.trim();
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const status = err.response?.status;
    logger.error(`[AI][${model}] 调用失败 status=${status}: ${msg}`);
    getMonitor().apiError('AI', `${model}: ${msg}`, status).catch(() => {});
    throw new Error(`AI 服务异常: ${msg}`);
  }
}

// ─── 快捷方法（均支持 options 自定义）────────────────────────────────────────────

async function chat(userMessage, context = {}, options = {}) {
  const { faq = '', orderInfo = '', knowledgeContext = '' } = context;
  const systemPrompt = [
    '你是拼多多店铺专业客服，回复简洁友好，不超过 150 字。',
    '店铺规则：下单后 48 小时内发货，7 天无理由退换，物流使用圆通快递。',
    faq ? `\n常见问题：\n${faq}` : '',
    knowledgeContext ? `\n知识库参考（优先使用以下信息回复）：\n${knowledgeContext}` : '',
    orderInfo ? `\n买家订单信息：\n${orderInfo}` : '',
  ].filter(Boolean).join('');

  const settings = getAiSettings();
  const model = options.model || settings.chatModel;

  return callApi(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ], 200, options);
}

async function analyzeSales(salesData, options = {}) {
  const prompt = `请分析以下拼多多店铺销售数据，给出简洁的经营建议（300字以内）：

${JSON.stringify(salesData, null, 2)}

请输出：
1. 数据亮点
2. 存在问题
3. 改进建议`;

  const settings = getAiSettings();
  const model = options.model || settings.reasonerModel;

  return callApi(model, [
    { role: 'user', content: prompt },
  ], 800, options);
}

/**
 * 生成结构化的经营分析报告
 * @param {Object} reportData 由 analytics.service.buildReportData 组装的数据
 * @param {string} type daily | weekly | custom
 */
async function analyzeReport(reportData, type = 'custom', options = {}) {
  const typeName = type === 'daily' ? '每日日报' : (type === 'weekly' ? '每周周报' : '经营分析');
  const prompt = `你是一名资深的拼多多店铺运营顾问。请根据以下${typeName}数据，输出一份结构化的经营分析报告（使用 Markdown 格式）。

数据周期：${reportData.period}

### 原始数据
\`\`\`json
${JSON.stringify(reportData, null, 2)}
\`\`\`

请在报告中包含以下章节（每个章节用 ## 标题）：

## 数据概览
- 销售额、订单量、客单价、退款率等核心指标的整体情况。

## 趋势与亮点
- 周期内的销售趋势、热销商品、复购/老客表现等亮点。

## 风险预警
- 低库存、滞销、退款、新客户下滑等需要关注的问题。

## 经营建议
- 针对上述数据给出 3~5 条具体、可执行的运营建议。

要求：
- 语言简洁专业，适合店主直接阅读。
- 不要编造数据，所有结论必须基于上面的原始数据。
- 总字数控制在 600 字以内。`;

  const settings = getAiSettings();
  const model = options.model || settings.reasonerModel || settings.chatModel;

  return callApi(model, [
    { role: 'user', content: prompt },
  ], 1500, { ...options, timeout: 120000 });
}

function getDailyStats() {
  const settings = getAiSettings();
  return { used: getCallCount(), limit: settings.dailyLimit };
}

module.exports = { callApi, chat, analyzeSales, analyzeReport, getDailyStats, getAiSettings };
