'use strict';

/**
 * 企业微信智能机器人长连接客户端
 * - 接收单聊/群聊消息并调用客服/AI 回复
 * - 支持主动向指定会话推送消息（日报/周报/告警等）
 */

const AiBot = require('@wecom/aibot-node-sdk');
const config = require('../config');
const db = require('./db');
const logger = require('./logger');
const shopService = require('../services/shop.service');
const customerService = require('../services/customer.service');

let wsClient = null;
let defaultChatId = null;
let authResolve = null;
let authPromise = null;

function dbConfig(key, fallback = null) {
  try {
    const row = db.prepare('SELECT value FROM config WHERE key=?').get(key);
    return row ? row.value : fallback;
  } catch {
    return fallback;
  }
}

function getConfig() {
  return {
    enabled: dbConfig('wecom_aibot_enabled', 'false') !== 'false',
    botId: dbConfig('wecom_aibot_bot_id', config.notify?.wecomAibotBotId || ''),
    secret: dbConfig('wecom_aibot_secret', config.notify?.wecomAibotSecret || ''),
    defaultChatId: dbConfig('wecom_aibot_default_chat_id', config.notify?.wecomAibotDefaultChatId || ''),
    defaultShopId: +(dbConfig('wecom_aibot_default_shop_id', '') || 0),
  };
}

function getDefaultShopId() {
  const cfg = getConfig();
  if (cfg.defaultShopId) return cfg.defaultShopId;
  const shops = shopService.listShops().filter(s => s.status === 'active');
  return shops.length ? shops[0].id : null;
}

function createAuthPromise() {
  authPromise = new Promise((resolve) => {
    authResolve = resolve;
  });
}

async function handleTextMessage(frame) {
  const body = frame.body || {};
  const content = (body.text && body.text.content) || '';
  const userId = body.from && body.from.userid;
  const chatId = body.chatid || userId;
  const chatType = body.chattype || 'single';

  if (!content || !userId) return;

  logger.info(`[企微机器人] 收到${chatType === 'group' ? '群聊' : '单聊'}消息 user=${userId}: ${content}`);

  // 记录默认 chatid（如果用户在群里 @ 机器人，就能拿到群 chatid）
  if (chatId && !defaultChatId) {
    defaultChatId = chatId;
    logger.info(`[企微机器人] 已记录默认会话 chatid=${chatId}`);
  }

  const shopId = getDefaultShopId();
  if (!shopId) {
    return wsClient.reply(frame, {
      msgtype: 'markdown',
      markdown: { content: '当前没有可用的店铺，请先添加并启用店铺。' },
    }).catch(() => {});
  }

  try {
    const result = await customerService.handleMessage(shopId, userId, content);
    const replyText = result && result.reply ? result.reply : '抱歉，暂时无法处理您的请求。';
    // 普通消息回复仅支持 stream / markdown / template_card / 媒体，不支持纯 text
    await wsClient.reply(frame, {
      msgtype: 'markdown',
      markdown: { content: replyText },
    });
  } catch (err) {
    logger.error(`[企微机器人] 处理消息失败: ${err.message}`);
    try {
      await wsClient.reply(frame, {
        msgtype: 'markdown',
        markdown: { content: '处理消息时出错了，请稍后再试。' },
      });
    } catch (replyErr) {
      logger.error(`[企微机器人] 错误回复也失败: ${replyErr.message}`);
    }
  }
}

function start() {
  if (wsClient) return;
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.botId || !cfg.secret) {
    logger.info('[企微机器人] 未配置 Bot ID/Secret 或已禁用，跳过启动');
    return;
  }

  createAuthPromise();

  try {
    wsClient = new AiBot.WSClient({
      botId: cfg.botId,
      secret: cfg.secret,
      heartbeatInterval: 30000,
      maxReconnectAttempts: -1,
      logger: {
        debug: () => {},
        info: (m) => logger.info(`[企微机器人] ${m}`),
        warn: (m) => logger.warn(`[企微机器人] ${m}`),
        error: (m) => logger.error(`[企微机器人] ${m}`),
      },
    });

    wsClient
      .on('authenticated', () => {
        logger.info('[企微机器人] 长连接认证成功');
        if (authResolve) {
          authResolve();
          authResolve = null;
        }
      })
      .on('message.text', (frame) => {
        handleTextMessage(frame).catch(err => logger.error(`[企微机器人] 处理消息异常: ${err.message}`));
      })
      .on('event.enter_chat', (frame) => {
        wsClient.replyWelcome(frame, {
          msgtype: 'text',
          text: { content: '你好！我是店铺运营助手，可以帮你查订单、查库存、生成日报等，直接发消息给我即可。' },
        }).catch(() => {});
      })
      .on('reconnecting', (attempt) => {
        logger.warn(`[企微机器人] 第 ${attempt} 次重连中...`);
      })
      .on('disconnected', (reason) => {
        logger.warn(`[企微机器人] 连接断开: ${reason}`);
      })
      .on('error', (err) => {
        logger.error(`[企微机器人] SDK 错误: ${err.message}`);
      });

    wsClient.connect();
    logger.info('[企微机器人] 长连接启动中...');
  } catch (err) {
    logger.error(`[企微机器人] 启动失败: ${err.message}`);
  }
}

function stop() {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
    defaultChatId = null;
    if (authResolve) {
      authResolve();
      authResolve = null;
    }
    logger.info('[企微机器人] 长连接已停止');
  }
}

async function restart() {
  stop();
  start();
  return waitForAuthenticated(10000);
}

async function waitForAuthenticated(timeout = 10000) {
  if (!authPromise) {
    throw new Error('企微机器人未启动');
  }
  return Promise.race([
    authPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`等待认证超时（${timeout}ms）`)), timeout)),
  ]);
}

/**
 * 主动向指定会话发送 markdown 消息
 * @param {string} chatId 会话 ID（群聊 chatid 或单聊 userid）
 * @param {string} markdownContent markdown 内容
 */
async function sendMarkdown(chatId, markdownContent) {
  if (!wsClient) {
    throw new Error('企微机器人长连接未启动');
  }
  const target = chatId || defaultChatId || getConfig().defaultChatId;
  if (!target) {
    throw new Error('未指定会话 chatid，也无法从消息中自动获取');
  }
  return wsClient.sendMessage(target, {
    msgtype: 'markdown',
    markdown: { content: markdownContent },
  });
}

/**
 * 向默认会话发送 markdown 消息
 */
async function sendToDefault(markdownContent) {
  return sendMarkdown(null, markdownContent);
}

module.exports = {
  start,
  stop,
  restart,
  sendMarkdown,
  sendToDefault,
  getConfig,
  waitForAuthenticated,
};
