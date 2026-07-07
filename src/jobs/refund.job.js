'use strict';

const cron = require('node-cron');
const cronConfig = require('../utils/cronConfig');
const refundService = require('../services/refund.service');
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

  if (!cronConfig.isEnabled('job_refund_enabled', true)) {
    logger.info('[定时任务] 退款同步已禁用');
    return;
  }

  const expr = cronConfig.get('job_refund_cron', '*/10 * * * *');
  if (!cronConfig.validate(expr)) {
    logger.error(`[定时任务] 退款同步 cron 表达式无效: ${expr}`);
    return;
  }

  scheduledTask = cron.schedule(expr, async () => {
    const shops = shopService.listShops().filter(s => s.status === 'active');
    for (const shop of shops) {
      try {
        const result = await refundService.syncRefunds(shop.id, 24);
        failCounts[shop.id] = 0;
        logger.info(`[定时任务] 店铺「${shop.name}」退款同步: ${result.total} 条`);
      } catch (err) {
        failCounts[shop.id] = (failCounts[shop.id] || 0) + 1;
        logger.error(`[定时任务] 店铺「${shop.name}」退款同步失败(${failCounts[shop.id]}): ${err.message}`);
        if (failCounts[shop.id] >= 3) {
          await monitor.jobFail('退款同步', shop.name, err.message, failCounts[shop.id]);
        }
      }
    }
  });
  logger.info(`[定时任务] 退款同步已启动（cron: ${expr}）`);
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
