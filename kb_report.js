const db = require('/home/ubuntu/src/utils/db');
const shops = db.prepare('SELECT id,name FROM shops').all();
console.log('店铺列表:', shops);
for (const s of shops) {
  const sc = db.prepare("SELECT COUNT(*) c FROM kb_scripts WHERE shop_id=? AND status='active'").get(s.id).c;
  const pc = db.prepare("SELECT COUNT(*) c FROM kb_products WHERE shop_id=? AND status='active'").get(s.id).c;
  console.log('店铺' + s.id + ' ' + s.name + ': 话术=' + sc + ' 货盘=' + pc);
}
const stats = db.prepare("SELECT reply_type, COUNT(*) c FROM customer_messages WHERE DATE(created_at)=DATE('now','localtime') GROUP BY reply_type").all();
console.log('今日消息类型:', stats);
const top = db.prepare("SELECT message, reply_type, COUNT(*) c FROM customer_messages WHERE reply_type IN ('ai','fallback','manual') AND DATE(created_at)>=DATE('now','-7 day') GROUP BY message ORDER BY c DESC LIMIT 15").all();
console.log('近7天走AI/兜底/人工的问题TOP15:', top);
