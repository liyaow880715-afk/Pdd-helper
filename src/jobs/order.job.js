'use strict';

const cron = require('node-cron');
const cronConfig = require('../utils/cronConfig');
const orderService = require('../services/order.service');
const shopService = require('../services/shop.service');
const monitor = require('../utils/monitor');
const logger = require('../utils/logger');

const failCounts = {};
let scheduledTask = null;

function start() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  if (!cronConfig.isEnabled('job_order_enabled', true)) {
    logger.info('[定时任务] 订单同步已禁用');
    return;
  }

  const expr = cronConfig.get('job_order_cron', '*/5 * * * *');
  if (!cronConfig.validate(expr)) {
    logger.error(`[定时任务] 订单同步 cron 表达式无效: ${expr}`);
    return;
  }

  scheduledTask = cron.schedule(expr, async () => {
    const shops = shopService.listShops().filter(s => s.status === 'active');
    for (const shop of shops) {
      try {
        const result = await orderService.syncOrders(shop.id);
        failCounts[shop.id] = 0;
        logger.info(`[定时任务] 店铺「${shop.name}」订单同步: 新增 ${result.newCount} 条`);
      } catch (err) {
        failCounts[shop.id] = (failCounts[shop.id] || 0) + 1;
        logger.error(`[定时任务] 店铺「${shop.name}」同步失败(${failCounts[shop.id]}): ${err.message}`);
        if (failCounts[shop.id] >= 3) {
          await monitor.jobFail('订单同步', shop.name, err.message, failCounts[shop.id]);
        }
      }
    }
  });
  logger.info(`[定时任务] 订单同步已启动（cron: ${expr}）`);
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
