'use strict';

const { forShop } = require('../api/pdd-client');
const db = require('../utils/db');
const feishu = require('../utils/feishu');
const logger = require('../utils/logger');
const config = require('../config');
const ai = require('../utils/ai');

/** 同步指定店铺商品 */
async function syncGoods(shopId) {
  logger.info(`[商品同步] 店铺 ${shopId} 开始...`);
  const api = forShop(shopId);
  const res = await api.getGoodsList({ page_size: 100 });
  const goods = (res.goods_list_get_response || {}).goods_list || [];

  const upsert = db.prepare(`
    INSERT INTO goods (shop_id, goods_id, goods_name, price, stock, status, image_url, skus)
    VALUES (@shop_id,@goods_id,@goods_name,@price,@stock,@status,@image_url,@skus)
    ON CONFLICT(shop_id, goods_id) DO UPDATE SET
      goods_name=excluded.goods_name, price=excluded.price,
      stock=excluded.stock, status=excluded.status, image_url=excluded.image_url,
      skus=excluded.skus, updated_at=CURRENT_TIMESTAMP
  `);
  for (const g of goods) {
    let price = g.min_group_price ? g.min_group_price / 100 : null;
    let imageUrl = g.thumb_url || g.image_url || null;
    let detail = {};
    try {
      const detailRes = await api.getGoodsDetail(g.goods_id);
      detail = (detailRes.goods_detail_get_response || {});
      price = extractPrice(detail);
      if (!imageUrl) imageUrl = detail.thumb_url || detail.image_url || null;
    } catch (err) {
      logger.warn(`[商品同步] 获取商品 ${g.goods_id} 详情失败: ${err.message}`);
    }
    upsert.run({
      shop_id: shopId,
      goods_id: String(g.goods_id),
      goods_name: g.goods_name,
      price,
      stock: g.goods_quantity || 0,
      status: g.is_onsale ? 'on' : 'off',
      image_url: imageUrl,
      skus: JSON.stringify(extractSkus(detail)),
    });
  }
  logger.op('商品同步', `店铺 ${shopId} 完成，共 ${goods.length} 件`);
  return goods.length;
}

/** 获取店铺可发布类目 */
async function getAuthCategories(shopId, parentCatId = 0) {
  const api = forShop(shopId);
  const res = await api.getAuthCats(parentCatId);
  const list = (res.goods_auth_cats_get_response || {}).goods_cats_list || [];
  return list.map(c => ({
    catId: c.cat_id,
    catName: c.cat_name,
    level: c.level,
    parentCatId: c.parent_cat_id,
    leaf: !!c.leaf,
  }));
}

/** 获取类目发布规则 */
async function getCatRule(shopId, catId) {
  const api = forShop(shopId);
  return api.getCatRule(catId);
}

/** 获取店铺运费模板 */
async function getLogisticsTemplates(shopId) {
  const api = forShop(shopId);
  const res = await api.getLogisticsTemplates();
  const list = (res.goods_logistics_template_get_response || {}).logistics_template_list || [];
  return list.map(t => ({
    templateId: t.template_id,
    templateName: t.template_name,
    costTemplateId: t.cost_template_id ?? t.template_id,
    freeShip: !!t.free_ship,
  }));
}

/** 上传图片到拼多多图床 */
async function uploadImage(shopId, base64Image) {
  const api = forShop(shopId);
  const prefixMatch = base64Image.match(/^data:image\/(png|jpeg|jpg);base64,/i);
  if (!prefixMatch) throw new Error('仅支持 jpg/png 图片');
  const mime = prefixMatch[1].toLowerCase();
  const b64 = base64Image.replace(/^data:image\/[^;]+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > 2 * 1024 * 1024) throw new Error('单张图片不能超过 2MB');
  const res = await api.uploadImage(`data:image/${mime === 'jpg' ? 'jpeg' : mime};base64,${b64}`);
  const url = (res.goods_image_upload_response || {}).image_url;
  if (!url) throw new Error('拼多多未返回图片 URL');
  return url;
}

/** 获取类目属性模板 */
async function getCatTemplate(shopId, catId) {
  const api = forShop(shopId);
  const res = await api.getCatTemplate(catId);
  return res.goods_cat_template_get_response || res;
}

/** 搜索类目属性值 */
async function searchPropertyValues(shopId, catId, refPid, value, parentVid = 0) {
  const api = forShop(shopId);
  const res = await api.searchPropertyValues(catId, refPid, value, parentVid);
  const data = res.goods_template_property_value_search_response || res;
  return (data || {}).values || [];
}

/** 获取类目销售规格维度 */
async function getSpecsList(shopId, catId) {
  const api = forShop(shopId);
  const res = await api.getSpecs(catId);
  return (res.goods_spec_get_response || {}).goods_spec_list || [];
}

/** AI 优化商品标题 */
async function optimizeTitle(shopId, { title, keywords = '', catName = '', catRule = null }) {
  if (!title || !title.trim()) throw new Error('原标题不能为空');

  const settings = ai.getAiSettings ? ai.getAiSettings() : {};
  const model = settings.chatModel || config.ai.chatModel;

  // 从 catRule 提取关键属性作为参考
  let propSummary = '';
  if (catRule?.goods_properties_rule?.properties?.length) {
    propSummary = catRule.goods_properties_rule.properties
      .filter(p => p.required || p.is_important)
      .map(p => `${p.name}${p.values?.length ? `(${p.values.slice(0, 3).map(v => v.value).join('/')})` : ''}`)
      .join('，');
  }

  const prompt = `你是拼多多商品标题优化专家。请根据以下信息生成一个更吸引人的商品标题：
- 原标题：${title.trim()}
- 类目：${catName || '未指定'}
- 关键词/卖点：${keywords || '未指定'}
- 类目关键属性：${propSummary || '未指定'}
要求：
1. 控制在 30 个汉字（60 个字符）以内。
2. 保留核心关键词，突出卖点。
3. 符合拼多多搜索和合规规范，不要特殊符号、不要虚假宣传。
4. 直接返回优化后的标题，不要解释、不要引号。`;

  const optimized = await ai.callApi(model, [{ role: 'user', content: prompt }], 200, { timeout: 15000 });
  const clean = (optimized || '').replace(/["'"]/g, '').trim();
  if (!clean) return title.trim();
  if (clean.length > 60) return clean.slice(0, 60);
  return clean;
}

/** 搜索拼多多标品 */
async function searchSpu(shopId, catId, keyword) {
  const api = forShop(shopId);
  const res = await api.searchSpu(catId, keyword);
  const data = res.goods_spu_search_response || res;
  const list = (data || {}).spu_list || [];
  return list.map(s => ({
    spuId: s.spu_id,
    spuName: s.spu_name,
    keyProps: (s.key_prop || []).map(p => ({
      refPid: p.ref_pid,
      vid: p.vid,
      value: p.value,
      valueUnit: p.value_unit,
    })),
  }));
}

/** 获取标品详情 */
async function getSpu(shopId, spuId) {
  const api = forShop(shopId);
  const res = await api.getSpu(spuId);
  const data = res.goods_spu_get_response || res;
  const s = (data || {}).spu || {};
  return {
    spuId: s.spu_id,
    spuName: s.spu_name,
    keyProps: (s.key_prop || []).map(p => ({
      refPid: p.ref_pid,
      vid: p.vid,
      value: p.value,
      valueUnit: p.value_unit,
    })),
  };
}

/** 获取商品线上详情（用于编辑） */
async function getGoodsInfo(shopId, goodsId) {
  const api = forShop(shopId);
  const [infoRes, detailRes] = await Promise.all([
    api.getGoodsInfo(goodsId),
    api.getGoodsDetail(goodsId).catch(err => {
      logger.warn(`[商品详情] 店铺 ${shopId} goodsId=${goodsId} detail.get 失败: ${err.message}`);
      return null;
    })
  ]);
  const info = infoRes.goods_info_get_response?.goods_info
    || infoRes.goods_info_get_response
    || infoRes.goods_information_get_response?.goods_info
    || infoRes.goods_information_get_response
    || infoRes;
  const detail = detailRes?.goods_detail_get_response || null;

  return {
    ...info,
    carousel_gallery: detail?.carousel_gallery_list || info.carousel_gallery || [],
    detail_gallery: detail?.detail_gallery_list || info.detail_gallery || [],
    video_gallery: detail?.video_gallery || info.video_gallery || [],
    package_label_gallery: detail?.package_label_gallery_list || info.package_label_gallery || [],
    market_price: detail?.market_price || info.market_price || 0,
    goods_desc: detail?.goods_desc || info.goods_desc || '',
    goods_property_list: detail?.goods_property_list || info.goods_property_list || [],
    sku_list: detail?.sku_list || info.sku_list || [],
    cost_template_id: detail?.cost_template_id || info.cost_template_id,
    cat_id: detail?.cat_id || info.cat_id,
  };
}

/** 更新商品线上信息（直接透传 PDD 报文） */
async function updateGoodsInfo(shopId, payload) {
  const api = forShop(shopId);
  const res = await api.updateGoodsInfo(payload);
  return res.goods_update_response || res;
}

/** 发布商品（前端传简化结构，后端转成 pdd.goods.add 完整报文） */
async function publishGoods(shopId, payload) {
  const api = forShop(shopId);
  const {
    catId, goodsName, goodsDesc,
    carouselGallery = [], detailGallery = [],
    marketPrice, skus = [], skuSpecs = [], costTemplateId,
    shipmentLimitSecond = 86400,
    isRefundable = true, isFolt = true, goodsType = '1',
    secondHand = false, badFruitClaim = false, lackOfWeightClaim = false,
    goodsProperties = [], packageLabelGallery = []
  } = payload;

  if (!catId || !goodsName || !carouselGallery.length || !skus.length) {
    throw new Error('catId / goodsName / carouselGallery / skus 必填');
  }
  if (!costTemplateId) throw new Error('运费模板 ID 必填');

  // 读取类目服务规则，判断是否需要包装标签图
  const catRuleRes = await api.getCatRule(catId);
  const serviceRule = (catRuleRes.cat_rule_get_response?.goods_service_rule?.goods_service_rule_map || {})[String(goodsType)] || {};
  const needPackageLabel = !!serviceRule.need_upload_package_label_required;
  const finalPackageLabelGallery = packageLabelGallery.length ? packageLabelGallery : (needPackageLabel ? carouselGallery : []);

  // SKU 价格校验
  const skuPrices = skus.map(s => +s.price).filter(p => p > 0);
  const skuMultiPrices = skus.map(s => +s.multiPrice).filter(p => p > 0);
  if (skuPrices.length !== skus.length || skuMultiPrices.length !== skus.length) {
    throw new Error('所有 SKU 必须填写单买价和拼单价');
  }
  const maxSinglePrice = Math.max(...skuPrices);
  if (marketPrice <= maxSinglePrice) {
    throw new Error(`参考价必须高于所有 SKU 中的最大单买价（当前最高 ¥${maxSinglePrice.toFixed(2)}）`);
  }
  for (const sku of skus) {
    const price = +sku.price;
    const multiPrice = +sku.multiPrice;
    if (price <= multiPrice) {
      throw new Error(`SKU「${skuLabel(sku)}」单买价必须大于拼单价`);
    }
    if (price - multiPrice < 1) {
      throw new Error(`SKU「${skuLabel(sku)}」单买价至少比拼单价高 1 元`);
    }
  }
  if (!skus.some(s => s.isOnSale !== false)) {
    throw new Error('至少需要一个 SKU 上架');
  }

  const skuLabel = (sku) => {
    if (sku.specName) return sku.specName;
    if (sku.specs?.length) return sku.specs.map(s => s.valueName).join(' / ');
    return '默认';
  };

  // 获取类目标准规格维度
  const specsRes = await api.getSpecs(catId);
  const specDims = (specsRes.goods_spec_get_response || {}).goods_spec_list || [];
  let defaultSpecDim = specDims.find(s => /口味|款式|型号|规格/.test(s.parent_spec_name));
  if (!defaultSpecDim && specDims.length) defaultSpecDim = specDims[0];

  const specIdMap = {};
  async function getChildSpecId(parentSpecId, valueName) {
    const key = `${parentSpecId}:${valueName}`;
    if (!specIdMap[key]) {
      const specRes = await api.getSpecId(catId, valueName, parentSpecId);
      const specId = (specRes.goods_spec_id_get_response || {}).spec_id;
      if (!specId) throw new Error(`规格值 "${valueName}" 生成 spec_id 失败`);
      specIdMap[key] = specId;
    }
    return specIdMap[key];
  }

  let skuList = [];
  if (skuSpecs?.length > 0 && skuSpecs.some(g => g.values?.length)) {
    // 多维 SKU
    for (const g of skuSpecs) {
      if (!g.specName) throw new Error('规格组名称不能为空');
      if (!g.values?.length) throw new Error(`规格组 ${g.specName} 至少需要有一个规格值`);
    }

    const groupDims = skuSpecs.map(g => {
      const dim = specDims.find(d => d.parent_spec_name === g.specName || d.parent_spec_id === g.parentSpecId);
      return {
        specName: g.specName,
        values: g.values,
        parentSpecId: dim?.parent_spec_id || defaultSpecDim?.parent_spec_id,
        parentSpecName: dim?.parent_spec_name || g.specName,
      };
    });

    skuList = await Promise.all(skus.map(async (sku) => {
      const rowSpecs = (sku.specs || []).map(s => {
        const g = groupDims.find(gg => gg.specName === s.specName || gg.parentSpecId === s.parentSpecId);
        return {
          parentSpecId: g?.parentSpecId || s.parentSpecId,
          parentSpecName: g?.parentSpecName || s.specName,
          valueName: s.valueName,
        };
      });
      const specIds = await Promise.all(rowSpecs.map(s => getChildSpecId(s.parentSpecId, s.valueName)));
      return {
        id: 0,
        out_sku_sn: sku.outSkuSn || '',
        spec_id_list: JSON.stringify(specIds),
        spec: rowSpecs.map((s, idx) => ({
          parent_id: s.parentSpecId,
          parent_name: s.parentSpecName,
          spec_id: specIds[idx],
          spec_name: s.valueName,
        })),
        price: Math.round(sku.price * 100),
        multi_price: Math.round(sku.multiPrice * 100),
        quantity: +sku.quantity || 0,
        thumb_url: sku.thumbUrl || carouselGallery[0],
        is_onsale: sku.isOnSale !== false ? 1 : 0,
        weight: sku.weight || 0,
        limit_quantity: sku.limitQuantity || 999999,
      };
    }));
  } else {
    // 单维度 SKU 兼容旧逻辑
    if (!defaultSpecDim) throw new Error('该类目未配置销售规格维度');
    const specMap = {};
    for (const sku of skus) {
      const name = sku.specName || '默认';
      if (!specMap[name]) {
        specMap[name] = await getChildSpecId(defaultSpecDim.parent_spec_id, name);
      }
    }
    skuList = skus.map((sku) => {
      const name = sku.specName || '默认';
      const specId = specMap[name];
      return {
        id: 0,
        out_sku_sn: sku.outSkuSn || '',
        spec_id_list: JSON.stringify([specId]),
        spec: [{
          parent_id: defaultSpecDim.parent_spec_id,
          parent_name: defaultSpecDim.parent_spec_name,
          spec_id: specId,
          spec_name: name,
        }],
        price: Math.round(sku.price * 100),
        multi_price: Math.round(sku.multiPrice * 100),
        quantity: +sku.quantity || 0,
        thumb_url: sku.thumbUrl || carouselGallery[0],
        is_onsale: sku.isOnSale !== false ? 1 : 0,
        weight: sku.weight || 0,
        limit_quantity: sku.limitQuantity || 999999,
      };
    });
  }

  const firstSku = skus[0];
  const addPayload = {
    goods_name: goodsName,
    cat_id: catId,
    goods_desc: goodsDesc || goodsName,
    carousel_gallery: carouselGallery,
    detail_gallery: detailGallery.length ? detailGallery : carouselGallery,
    package_label_gallery: finalPackageLabelGallery,
    image_url: carouselGallery[0],
    thumb_url: carouselGallery[0],
    market_price: Math.round(marketPrice * 100),
    two_pieces_discount: 95,
    price: Math.round(firstSku.price * 100),
    multi_price: Math.round(firstSku.multiPrice * 100),
    quantity: skus.reduce((sum, s) => sum + (+s.quantity || 0), 0),
    sku_list: skuList,
    cost_template_id: costTemplateId,
    shipment_limit_second: String(shipmentLimitSecond),
    is_pre_sale: 0,
    buy_limit: 999999,
    country_id: 1,
    is_onsale: 1,
    is_refundable: isRefundable ? 1 : 0,
    is_folt: isFolt ? 1 : 0,
    goods_type: String(goodsType),
    second_hand: secondHand ? 1 : 0,
    bad_fruit_claim: badFruitClaim ? 1 : 0,
    lack_of_weight_claim: lackOfWeightClaim ? 1 : 0,
    goods_properties: goodsProperties.map(p => ({
      ref_pid: p.refPid,
      vid: p.vid ?? 0,
      value: p.value || '',
      value_unit: p.valueUnit || '',
    })),
  };

  const res = await api.addGoods(addPayload);
  return res.goods_add_response || res;
}

function extractPrice(detail) {
  const skuList = detail.sku_list || [];
  if (skuList.length) {
    const prices = skuList
      .map(s => s.multi_price || s.price)
      .filter(p => typeof p === 'number');
    if (prices.length) return Math.min(...prices) / 100;
  }
  if (detail.market_price) return detail.market_price / 100;
  if (detail.min_group_price) return detail.min_group_price / 100;
  return null;
}

function extractSkus(detail) {
  const skuList = detail.sku_list || [];
  return skuList.map(s => ({
    specInfo: (s.spec || []).map(sp => sp.spec_name).filter(Boolean).join(' / ') || '默认',
    price: (s.price || 0) / 100,
    multiPrice: (s.multi_price || 0) / 100,
    quantity: s.quantity || 0,
    thumbUrl: s.thumb_url || '',
    isOnSale: s.is_onsale,
  }));
}

/** 检查指定店铺库存预警 */
async function checkStockWarning(shopId) {
  const threshold = config.stock.warningThreshold;
  const lowStock = db.prepare(
    "SELECT * FROM goods WHERE shop_id=? AND stock<=? AND status='on'"
  ).all(shopId, threshold);

  if (!lowStock.length) return [];
  await feishu.notifyStockWarning(`店铺 #${shopId}`, lowStock);
  return lowStock;
}

/** 查询本地商品（支持分页、状态筛选、关键词搜索） */
function getLocalGoods(shopId, { status, keyword, limit = 20, offset = 0 } = {}) {
  const conditions = ['shop_id=?'];
  const params = [shopId];

  if (status) { conditions.push('status=?'); params.push(status); }
  if (keyword) { conditions.push('goods_name LIKE ?'); params.push(`%${keyword}%`); }

  const where = conditions.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM goods WHERE ${where}`)
    .get(...params).cnt;

  const list = db.prepare(
    `SELECT * FROM goods WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return { list, total };
}

/** 更新商品 */
async function updateGoods(shopId, goodsId, data) {
  await forShop(shopId).updateGoods(goodsId, data);
  const fields = [], values = [];
  if (data.goodsName) { fields.push('goods_name=?'); values.push(data.goodsName); }
  if (data.price)     { fields.push('price=?');      values.push(data.price); }
  if (data.stock)     { fields.push('stock=?');      values.push(data.stock); }
  if (fields.length) {
    fields.push('updated_at=CURRENT_TIMESTAMP');
    values.push(shopId, String(goodsId));
    db.prepare(`UPDATE goods SET ${fields.join(',')} WHERE shop_id=? AND goods_id=?`).run(...values);
  }
}

/** 批量上下架 */
async function batchUpdateStatus(shopId, goodsIds, onSale) {
  const results = await forShop(shopId).batchUpdateGoodsStatus(goodsIds, onSale);
  const status = onSale ? 'on' : 'off';
  const update = db.prepare("UPDATE goods SET status=?, updated_at=CURRENT_TIMESTAMP WHERE shop_id=? AND goods_id=?");
  for (const r of results) {
    if (r.success) update.run(status, shopId, String(r.goodsId));
  }
  return results;
}

module.exports = {
  syncGoods, getAuthCategories, getCatRule, getLogisticsTemplates,
  uploadImage, getCatTemplate, searchPropertyValues,
  getSpecsList, optimizeTitle, searchSpu, getSpu,
  publishGoods, getGoodsInfo, updateGoodsInfo,
  checkStockWarning, getLocalGoods, updateGoods, batchUpdateStatus,
};
