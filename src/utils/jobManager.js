'use strict';

/**
 * 统一调度各定时任务，支持按配置键动态重启
 */

const orderJob = require('../jobs/order.job');
const stockJob = require('../jobs/stock.job');
const reportJob = require('../jobs/report.job');
const refundJob = require('../jobs/refund.job');
const monitorJob = require('../jobs/monitor.job');
const tokenJob = require('../jobs/token.job');

const jobs = {
  order: orderJob,
  stock: stockJob,
  report: reportJob,
  refund: refundJob,
  monitor: monitorJob,
  token: tokenJob,
};

function startAll() {
  orderJob.start();
  refundJob.start();
  stockJob.start();
  reportJob.start();
  monitorJob.start();
  tokenJob.start();
}

function restartByName(name) {
  const job = jobs[name];
  if (job && typeof job.restart === 'function') {
    job.restart();
    return true;
  }
  return false;
}

/**
 * 根据配置键重启对应任务
 * 支持：job_order_enabled / job_order_cron / job_monitor_mem_cron 等
 */
function restartByKey(key) {
  const match = key.match(/^job_([^_]+)_(enabled|cron|mem_cron|disk_cron)$/);
  if (!match) return false;
  return restartByName(match[1]);
}

module.exports = { startAll, restartByName, restartByKey };
