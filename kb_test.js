const kb = require('/home/ubuntu/src/services/knowledge.service');
const tests = ['发什么快递', '你们店什么时候发货', '我要退款', '你好', '在吗'];
for (const shopId of [2, 3]) {
  console.log('\n店铺', shopId);
  for (const msg of tests) {
    const result = kb.getKnowledgeContext(shopId, msg);
    const hit = result.scripts[0];
    console.log(`  "${msg}" -> ${hit ? hit.title : '未命中'}`);
  }
}
