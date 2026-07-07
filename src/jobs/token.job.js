'use strict';

const cron = require('node-cron');
const cronConfig = require('../utils/cronConfig');
const shopService = require('../services/shop.service');
const logger = require('../utils/logger');

let scheduledTask = null;

function start() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  const expr = cronConfig.get('job_token_cron', '*/30 * * * *');
  if (!cronConfig.validate(expr)) {
    logger.error(`[定时任务] Token 刷新 cron 表达式无效: ${expr}`);
    return;
  }

  scheduledTask = cron.schedule(expr, async () => {
    logger.info('[定时任务] 开始扫描即将过期的店铺 token');
    try {
      const shops = shopService.getShopsNeedRefresh();
      if (!shops.length) {
        logger.info('[定时任务] 没有需要刷新的 token');
        return;
      }

      for (const shop of shops) {
        try {
          await shopService.refreshShopToken(shop.id);
        } catch (err) {
          logger.error(`[定时任务] 刷新店铺 ${shop.id} token 失败: ${err.message}`);
          if (err.message.includes('refresh_token') || err.code === '50001') {
            shopService.updateShop(shop.id, { status: 'disabled' });
            logger.warn(`[定时任务] 店铺 ${shop.id} refresh_token 失效，已标记为 disabled`);
          }
        }
      }
    } catch (err) {
      logger.error(`[定时任务] Token 刷新任务异常: ${err.message}`);
    }
  });
  logger.info(`[定时任务] Token 自动刷新已启动（cron: ${expr}）`);
}

function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

function restart() {
  stop();
  start();
}

module.exports = { start, stop, restart };
