'use strict';

/**
 * 一键导入常见客服话术
 * 用法：node src/scripts/seed_kb_scripts.js [shopId]
 * 不传 shopId 则给所有 active 店铺导入
 */

const db = require('../utils/db');
const { addScript } = require('../services/knowledge.service');

const DEFAULT_SCRIPTS = [
  {
    title: '快递/物流',
    content: '亲，我们默认发圆通快递，下单后48小时内发货。您可以直接在订单详情里查看物流信息，也可以把订单号发给我，我帮您查~',
    tags: ['快递', '物流', '发什么快递', '查物流', '什么快递'],
  },
  {
    title: '发货时间',
    content: '亲，下单后我们会在48小时内安排发货，节假日可能会有延迟，发货后您会收到短信和消息提醒哦~',
    tags: ['发货', '多久发货', '什么时候发货', '发货时间', '何时发货'],
  },
  {
    title: '退款/售后',
    content: '亲，如需退款，请在订单详情申请售后，我们会尽快处理。支持7天无理由退换，收到退货后1-3个工作日退款到账。',
    tags: ['退款', '退货', '售后', '我要退款', '怎么退'],
  },
  {
    title: '欢迎语',
    content: '亲，欢迎光临~ 请问有什么可以帮您？',
    tags: ['你好', '在吗', '在不在', '嗨', 'hi', 'hello'],
  },
  {
    title: '转人工',
    content: '亲，已为您转接人工客服，请稍等片刻，人工客服上线后会立即回复您。',
    tags: ['人工', '客服', '找人工', '转人工', '人工客服'],
  },
  {
    title: '价格/优惠',
    content: '亲，我们店铺商品价格都是最优惠的，具体以商品详情页为准。如需批量采购或定制，可以联系人工客服哦~',
    tags: ['价格', '多少钱', '优惠', '便宜', '怎么卖'],
  },
  {
    title: '库存咨询',
    content: '亲，商品库存请以商品详情页显示为准，热销款可能随时售罄，喜欢的话建议尽快下单锁定库存~',
    tags: ['库存', '有货', '有没有货', '还有吗', '缺货'],
  },
  {
    title: '产品质量',
    content: '亲，我们店铺商品均为正品，质量有保障，支持7天无理由退换，您可以放心下单。',
    tags: ['质量', '正品', '好不好', '怎么样', '靠谱'],
  },
  {
    title: '活动/促销',
    content: '亲，当前店铺活动请以首页或商品详情页为准，如有大额优惠券或限时活动，会同步展示在商品页哦~',
    tags: ['活动', '促销', '优惠', '打折', '满减', '优惠券'],
  },
  {
    title: '订单查询',
    content: '亲，您可以在订单详情查看物流和售后进度。也可以把订单号发给我，我帮您查询最新状态。',
    tags: ['订单', '查订单', '我的订单', '订单号', '订单状态'],
  },
];

async function main() {
  const shopIdArg = process.argv[2];
  let shops;
  if (shopIdArg) {
    shops = db.prepare('SELECT id, name FROM shops WHERE id=?').all(shopIdArg);
  } else {
    shops = db.prepare("SELECT id, name FROM shops WHERE status='active'").all();
  }

  if (!shops.length) {
    console.log('没有需要导入的店铺');
    return;
  }

  for (const shop of shops) {
    console.log(`\n[店铺 ${shop.id}] ${shop.name}`);
    for (const s of DEFAULT_SCRIPTS) {
      try {
        const id = addScript(shop.id, {
          title: s.title,
          content: s.content,
          categoryId: null,
          tags: s.tags,
        });
        console.log(`  ✓ ${s.title} (id=${id})`);
      } catch (err) {
        console.error(`  ✗ ${s.title}: ${err.message}`);
      }
    }
  }
  console.log('\n导入完成');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
