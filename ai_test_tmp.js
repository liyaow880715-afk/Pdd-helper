const cs = require('/home/ubuntu/src/services/customer.service');
const shopId = 2;
const userId = 'test-user-' + Date.now();
const message = '你们家的零食好吃吗';
console.log('测试消息:', message);
(async () => {
  try {
    const result = await cs.handleMessage(shopId, userId, message);
    console.log('回复类型:', result.replyType);
    console.log('回复内容:', result.reply);
  } catch (err) {
    console.error('测试失败:', err.message);
  }
})();
