'use strict';

/**
 * 统一通知通道（企业微信 / 飞书）
 * 通过配置 notify_channel 自动选择；未配置时按 webhook URL 域名推断。
 */

const axios = require('axios');
const config = require('../config');
const db = require('./db');
const logger = require('./logger');
const wecomBot = require('./wecom-bot');

function dbConfig(key, fallback = null) {
  try {
    const row = db.prepare('SELECT value FROM config WHERE key=?').get(key);
    return row ? row.value : fallback;
  } catch {
    return fallback;
  }
}

function getChannelConfig() {
  const channel = dbConfig('notify_channel', config.notify?.channel || 'feishu');
  const feishuUrl = dbConfig('feishu_webhook_url', config.feishu?.webhookUrl || config.notify?.feishuWebhookUrl || '');
  const wecomUrl = dbConfig('wecom_webhook_url', config.notify?.wecomWebhookUrl || '');
  const aibotCfg = wecomBot.getConfig();

  if (channel === 'wecom-aibot' && aibotCfg.enabled && aibotCfg.botId && aibotCfg.secret) {
    return { channel: 'wecom-aibot' };
  }
  if (channel === 'wecom' && wecomUrl) return { channel: 'wecom', url: wecomUrl };
  if (channel === 'feishu' && feishuUrl) return { channel: 'feishu', url: feishuUrl };

  // 未指定 channel 时，按 URL 自动推断
  if (wecomUrl && wecomUrl.includes('qyapi.weixin.qq.com')) return { channel: 'wecom', url: wecomUrl };
  if (feishuUrl && feishuUrl.includes('open.feishu.cn')) return { channel: 'feishu', url: feishuUrl };

  return { channel, url: wecomUrl || feishuUrl };
}

async function post(payload) {
  const { url } = getChannelConfig();
  if (!url) {
    logger.warn('[通知] Webhook 地址未配置，跳过发送');
    return;
  }
  try {
    const res = await axios.post(url, payload, { timeout: 10000 });
    if (res.data.errcode !== undefined && res.data.errcode !== 0) {
      logger.warn(`[通知] 企业微信发送失败: ${res.data.errmsg}`);
    } else if (res.data.code !== undefined && res.data.code !== 0) {
      logger.warn(`[通知] 飞书发送失败: ${res.data.msg}`);
    }
  } catch (err) {
    logger.error(`[通知] 请求异常: ${err.message}`);
  }
}

/** 纯文本消息 */
async function sendMessage(text) {
  const { channel } = getChannelConfig();
  if (channel === 'wecom-aibot') {
    try {
      return await wecomBot.sendToDefault(text);
    } catch (err) {
      logger.warn(`[通知] 企微机器人主动发送失败: ${err.message}`);
      return;
    }
  }
  if (channel === 'wecom') {
    return post({ msgtype: 'text', text: { content: text } });
  }
  return post({ msg_type: 'text', content: { text } });
}

/** 卡片/富文本消息：飞书用 interactive card，企业微信用 markdown，智能机器人用主动推送 */
async function sendCard(title, lines = [], color = 'blue') {
  const { channel } = getChannelConfig();
  const content = [`# ${title}`, '', ...lines].join('\n');
  if (channel === 'wecom-aibot') {
    try {
      return await wecomBot.sendToDefault(content);
    } catch (err) {
      logger.warn(`[通知] 企微机器人主动发送失败: ${err.message}`);
      return;
    }
  }
  if (channel === 'wecom') {
    return post({ msgtype: 'markdown', markdown: { content } });
  }
  const cardContent = lines.join('\n');
  return post({
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: title },
        template: color,
      },
      elements: [{ tag: 'div', text: { tag: 'lark_md', content: cardContent } }],
    },
  });
}

// ─── 业务通知模板 ─────────────────────────────────────────────────────────────

async function notifyNewOrder(shopName, order) {
  return sendCard(
    `📦 新订单 · ${shopName}`,
    [
      `**订单号：** ${order.order_sn}`,
      `**金额：** ¥${order.total_amount}`,
      `**买家：** ${order.buyer_name}`,
      `**地址：** ${order.buyer_address}`,
      `**时间：** ${new Date().toLocaleString('zh-CN')}`,
    ],
    'green'
  );
}

async function notifyRefund(shopName, order) {
  return sendCard(
    `🔴 退款申请 · ${shopName}`,
    [
      `**订单号：** ${order.order_sn}`,
      `**金额：** ¥${order.total_amount}`,
      `**买家：** ${order.buyer_name}`,
      `**原因：** ${order.refund_reason || '未填写'}`,
    ],
    'red'
  );
}

async function notifyShipFail(shopName, orderSn, reason) {
  return sendCard(`⚠️ 发货失败 · ${shopName}`, [`**订单号：** ${orderSn}`, `**原因：** ${reason}`], 'orange');
}

async function notifyStockWarning(shopName, items) {
  const lines = items.map(g => `- **${g.goods_name}**：剩余 ${g.stock} 件`);
  return sendCard(
    `⚠️ 库存预警 · ${shopName}`,
    [`以下商品库存不足，请及时补货：`, ...lines],
    'orange'
  );
}

async function sendDailyReport(shopName, data) {
  const { date, totalAmount, orderCount, topGoods = [], aiSuggestion = '' } = data;
  const topLines = topGoods.slice(0, 5).map((g, i) => `${i + 1}. ${g.name} — ${g.count} 单`);
  return sendCard(
    `📊 每日销售日报 · ${shopName} · ${date}`,
    [
      `💰 **销售额：** ¥${totalAmount.toFixed(2)}`,
      `📦 **订单量：** ${orderCount} 单`,
      '',
      '🔥 **热销商品 TOP 5：**',
      ...topLines,
      '',
      aiSuggestion ? `🤖 **AI 建议：**\n${aiSuggestion}` : '',
    ].filter(l => l !== undefined && l !== ''),
    'blue'
  );
}

async function notifyAlert(title, detail) {
  return sendCard(`🚨 系统告警：${title}`, [detail], 'red');
}

module.exports = {
  sendMessage,
  sendCard,
  notifyNewOrder,
  notifyRefund,
  notifyShipFail,
  notifyStockWarning,
  sendDailyReport,
  notifyAlert,
  getChannelConfig,
};
