'use strict';

/**
 * 推广接口权限验证脚本
 * 运行方式：node src/scripts/check_promotion_api.js
 */

const { call } = require('../api/pdd-gateway');

const shopId = process.env.SHOP_ID ? +process.env.SHOP_ID : 2;

const tests = [
  { type: 'pdd.ad.api.advertiser.query.account.balance', params: {} },
  { type: 'pdd.ad.api.advertiser.query.account.info', params: {} },
  { type: 'pdd.ad.api.plan.query.list', params: { page: 1, page_size: 10 } },
  { type: 'pdd.ad.api.unit.query.list', params: { plan_id: 0, page: 1, page_size: 10 } },
  { type: 'pdd.ddk.order.list.range.get', params: { start_time: Math.floor(Date.now()/1000)-86400, end_time: Math.floor(Date.now()/1000), page: 1, page_size: 10 } },
];

(async () => {
  console.log(`[推广接口检测] 店铺 ${shopId}`);
  for (const t of tests) {
    try {
      const res = await call(t.type, t.params, shopId);
      console.log(`✅ ${t.type} 调用成功`);
      console.log(JSON.stringify(res, null, 2).slice(0, 300));
    } catch (err) {
      console.log(`❌ ${t.type} 失败: ${err.message}`);
    }
  }
})();
