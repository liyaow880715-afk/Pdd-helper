'use strict';

const cron = require('node-cron');
const cronConfig = require('../utils/cronConfig');
const analyticsService = require('../services/analytics.service');
const shopService = require('../services/shop.service');
const monitor = require('../utils/monitor');
const logger = require('../utils/logger');

const failCounts = {};
let dailyTask = null;
let weeklyTask = null;

function start() {
  if (dailyTask) {
    dailyTask.stop();
    dailyTask = null;
  }
  if (weeklyTask) {
    weeklyTask.stop();
    weeklyTask = null;
  }

  if (!cronConfig.isEnabled('job_report_enabled', true)) {
    logger.info('[定时任务] 报表任务已禁用');
    return;
  }

  const dailyExpr = cronConfig.get('job_report_cron', '0 0 * * *');
  const weeklyExpr = cronConfig.get('job_weekly_cron', '0 9 * * 1');

  if (!cronConfig.validate(dailyExpr)) {
    logger.error(`[定时任务] 日报生成 cron 表达式无效: ${dailyExpr}`);
  } else {
    dailyTask = cron.schedule(dailyExpr, async () => {
      logger.info('[定时任务] 开始生成每日日报...');
      const shops = shopService.listShops().filter(s => s.status === 'active');
      for (const shop of shops) {
        try {
          await analyticsService.sendDailyReport(shop.id, shop.name);
          failCounts[`daily_${shop.id}`] = 0;
        } catch (err) {
          failCounts[`daily_${shop.id}`] = (failCounts[`daily_${shop.id}`] || 0) + 1;
          logger.error(`[日报] 店铺「${shop.name}」失败: ${err.message}`);
          await monitor.jobFail('日报生成', shop.name, err.message, failCounts[`daily_${shop.id}`]);
        }
      }
    });
  }

  if (!cronConfig.validate(weeklyExpr)) {
    logger.error(`[定时任务] 周报生成 cron 表达式无效: ${weeklyExpr}`);
  } else {
    weeklyTask = cron.schedule(weeklyExpr, async () => {
      logger.info('[定时任务] 开始生成每周周报...');
      const shops = shopService.listShops().filter(s => s.status === 'active');
      for (const shop of shops) {
        try {
          await analyticsService.sendWeeklyReport(shop.id, shop.name);
          failCounts[`weekly_${shop.id}`] = 0;
        } catch (err) {
          failCounts[`weekly_${shop.id}`] = (failCounts[`weekly_${shop.id}`] || 0) + 1;
          logger.error(`[周报] 店铺「${shop.name}」失败: ${err.message}`);
          await monitor.jobFail('周报生成', shop.name, err.message, failCounts[`weekly_${shop.id}`]);
        }
      }
    });
  }

  logger.info(`[定时任务] 报表任务已启动（日报: ${dailyExpr} / 周报: ${weeklyExpr}）`);
}

function stop() {
  if (dailyTask) {
    dailyTask.stop();
    dailyTask = null;
  }
  if (weeklyTask) {
    weeklyTask.stop();
    weeklyTask = null;
  }
}

function restart() {
  stop();
  start();
}

module.exports = { start, stop, restart };
