'use strict';

/**
 * 系统资源监控任务
 * - 检查内存使用率
 * - 检查日志目录磁盘占用
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const cronConfig = require('../utils/cronConfig');
const monitor = require('../utils/monitor');
const logger = require('../utils/logger');

let memTask = null;
let diskTask = null;

function getMemUsagePercent() {
  const total = os.totalmem();
  const free = os.freemem();
  return Math.round(((total - free) / total) * 100);
}

function getLogDirSizeMB() {
  const logDir = path.join(__dirname, '../../logs');
  try {
    const files = fs.readdirSync(logDir);
    const totalBytes = files.reduce((sum, f) => {
      try { return sum + fs.statSync(path.join(logDir, f)).size; } catch { return sum; }
    }, 0);
    return (totalBytes / 1024 / 1024).toFixed(1);
  } catch { return 0; }
}

function start() {
  if (memTask) {
    memTask.stop();
    memTask = null;
  }
  if (diskTask) {
    diskTask.stop();
    diskTask = null;
  }

  const memExpr = cronConfig.get('job_monitor_mem_cron', '*/5 * * * *');
  const diskExpr = cronConfig.get('job_monitor_disk_cron', '0 2 * * *');

  if (!cronConfig.validate(memExpr)) {
    logger.error(`[系统监控] 内存检查 cron 表达式无效: ${memExpr}`);
  } else {
    memTask = cron.schedule(memExpr, async () => {
      const memPercent = getMemUsagePercent();
      if (memPercent >= 85) {
        await monitor.systemAlert(
          '内存使用率过高',
          `当前内存使用率 **${memPercent}%**，请检查服务状态`
        );
      }
    });
  }

  if (!cronConfig.validate(diskExpr)) {
    logger.error(`[系统监控] 磁盘检查 cron 表达式无效: ${diskExpr}`);
  } else {
    diskTask = cron.schedule(diskExpr, async () => {
      const sizeMB = getLogDirSizeMB();
      if (sizeMB > 500) {
        await monitor.systemAlert(
          '日志目录占用过大',
          `日志目录已占用 **${sizeMB} MB**，建议清理`
        );
      }
      logger.info(`[系统监控] 日志目录占用: ${sizeMB} MB，内存使用率: ${getMemUsagePercent()}%`);
    });
  }

  logger.info(`[系统监控] 资源监控已启动（内存: ${memExpr} / 磁盘: ${diskExpr}）`);
}

function stop() {
  if (memTask) {
    memTask.stop();
    memTask = null;
  }
  if (diskTask) {
    diskTask.stop();
    diskTask = null;
  }
}

function restart() {
  stop();
  start();
}

module.exports = { start, stop, restart };
