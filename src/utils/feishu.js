'use strict';

/**
 * 兼容旧名的通知入口
 * 底层已统一为 notify.js，支持飞书 / 企业微信。
 */

const notify = require('./notify');

module.exports = {
  sendMessage: notify.sendMessage,
  sendCard: notify.sendCard,
  notifyNewOrder: notify.notifyNewOrder,
  notifyRefund: notify.notifyRefund,
  notifyShipFail: notify.notifyShipFail,
  notifyStockWarning: notify.notifyStockWarning,
  sendDailyReport: notify.sendDailyReport,
  notifyAlert: notify.notifyAlert,
  getChannelConfig: notify.getChannelConfig,
};
