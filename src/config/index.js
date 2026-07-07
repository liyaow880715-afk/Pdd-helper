require('dotenv').config();

const db = require('../utils/db');
function dbConfig(key, fallback = null) {
  try {
    const row = db.prepare('SELECT value FROM config WHERE key=?').get(key);
    return row ? row.value : fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  pdd: {
    clientId: process.env.PDD_CLIENT_ID,
    clientSecret: process.env.PDD_CLIENT_SECRET,
    accessToken: process.env.PDD_ACCESS_TOKEN,
    apiUrl: 'https://gw-api.pinduoduo.com/api/router',
    authUrl: 'https://fuwu.pinduoduo.com/service-market/auth',
    redirectUri: process.env.PDD_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/v1/pdd-auth/callback`,
  },

  // 通用 AI 配置（兼容多家大模型）
  ai: {
    baseURL: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
    apiKey: process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY,
    chatModel: process.env.AI_CHAT_MODEL || 'deepseek-chat',
    reasonerModel: process.env.AI_REASONER_MODEL || 'deepseek-reasoner',
    dailyLimit: parseInt(process.env.AI_DAILY_LIMIT || dbConfig('deepseek_daily_limit', '1000'), 10),
  },

  // 保留旧别名兼容已有代码
  get deepseek() { return this.ai; },

  feishu: {
    webhookUrl: process.env.FEISHU_WEBHOOK_URL,
  },

  notify: {
    channel: process.env.NOTIFY_CHANNEL || 'feishu', // feishu | wecom | wecom-aibot
    feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL,
    wecomWebhookUrl: process.env.WECOM_WEBHOOK_URL,
    wecomAibotBotId: process.env.WECOM_AIBOT_BOT_ID,
    wecomAibotSecret: process.env.WECOM_AIBOT_SECRET,
    wecomAibotDefaultChatId: process.env.WECOM_AIBOT_DEFAULT_CHAT_ID,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    expiresIn: '7d',
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },

  logistics: {
    provider: '圆通快递',
    code: 'yuantong',
  },

  stock: {
    warningThreshold: 10,
  },
};
