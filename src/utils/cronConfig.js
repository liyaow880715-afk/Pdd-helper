'use strict';

/**
 * 从数据库读取 Cron / 开关配置，提供默认值和校验
 */

const db = require('./db');
const cron = require('node-cron');

function get(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM config WHERE key=?').get(key);
    return row && row.value ? row.value : fallback;
  } catch (err) {
    return fallback;
  }
}

function isEnabled(key, fallback = true) {
  const val = get(key, null);
  if (val === null) return fallback;
  return val !== 'false' && val !== '0';
}

function validate(expr) {
  return cron.validate(expr);
}

module.exports = { get, isEnabled, validate };
