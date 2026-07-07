# 拼多多推广 API 权限申请指南

## 一、当前状态

已分别用直接网关调用验证：

| 接口 | 结果 |
|------|------|
| `pdd.ad.api.advertiser.query.account.balance` | `code=20034` 接口处于下线状态 / 无权限 |
| `pdd.ad.api.advertiser.query.account.info` | `code=20034` 接口处于下线状态 / 无权限 |
| `pdd.ad.api.plan.query.list` | `code=20034` 接口处于下线状态 / 无权限 |
| `pdd.ad.api.unit.query.list` | `code=20034` 接口处于下线状态 / 无权限 |
| `pdd.ad.api.report.goods.report.query` | `code=20031` 应用没有此接口的调用权限 |
| `pdd.ddk.order.list.range.get`（多多进宝） | 此前已报 `code=20031` 无权限 |

结论：**当前应用在拼多多开放平台没有申请「多多推广 API」和「多多进宝」权限包，必须先申请权限。**

## 二、需要申请的权限包

### 1. 多多推广 API（搜索推广 + 场景推广）

对应文档中的接口族：

- `pdd.ad.api.advertiser.*` — 开户、账户信息、余额
- `pdd.ad.api.plan.*` — 推广计划增删改查
- `pdd.ad.api.unit.*` — 推广单元增删改查
- `pdd.ad.api.keyword.*` — 关键词（搜索广告）
- `pdd.ad.api.unit.bid.*` — 定向/资源位
- `pdd.ad.api.unit.creative.*` — 创意
- `pdd.ad.api.report.*` — 分天/小时/分级报表
- `pdd.ad.api.goods.*` — 推广可用商品、长图、轮播图

在开放平台申请时，可统一搜索/选择 **「多多推广 API」** 或 **「推广中心」** 权限包。

### 2. 多多进宝 API

需要申请的接口：

- `pdd.ddk.goods.search`
- `pdd.ddk.goods.detail`
- `pdd.ddk.goods.promotion.url.generate`
- `pdd.ddk.goods.pid.generate`
- `pdd.ddk.goods.pid.query`
- `pdd.ddk.order.list.range.get`
- `pdd.ddk.order.list.increment.get`
- `pdd.ddk.order.detail.get`

在开放平台申请 **「多多进宝」** 权限包。

## 三、申请方式

### 方式 A：后台自助申请（推荐先尝试）

1. 登录 [拼多多开放平台](https://open.pinduoduo.com/)
2. 进入应用 **「店铺运营小助手」** 详情页
3. 找到 **「权限包管理」** / **「能力管理」** / **「接口权限」**
4. 搜索并申请：
   - `多多推广 API`
   - `多多进宝`
5. 填写使用场景，提交审核

### 方式 B：邮件申请（如后台找不到或需要加急）

多多推广专用邮箱（文档中给出）：

```text
ad-isv@pinduoduo.com
```

建议邮件主题：`【权限申请】店铺运营小助手 ClientID=16c201de6cc54163921dbc8c829426dd`

邮件正文模板：

```text
拼多多开放平台推广团队，您好：

我是应用「店铺运营小助手」的开发者，现申请开通以下推广相关接口权限：

1. 多多推广 API（搜索推广 + 场景推广）
   - pdd.ad.api.advertiser.query.account.info
   - pdd.ad.api.advertiser.query.account.balance
   - pdd.ad.api.plan.query.list
   - pdd.ad.api.unit.query.list
   - pdd.ad.api.keyword.query.list
   - pdd.ad.api.unit.creative.query.list
   - pdd.ad.api.report.daily.report.query
   - pdd.ad.api.report.entity.report.query
   - pdd.ad.api.report.hourly.report.query

2. 多多进宝 API
   - pdd.ddk.goods.search
   - pdd.ddk.goods.promotion.url.generate
   - pdd.ddk.goods.pid.generate
   - pdd.ddk.order.list.range.get
   - pdd.ddk.order.list.increment.get

应用 ClientID：16c201de6cc54163921dbc8c829426dd
授权店铺：测试店铺1（shop_id=2）
服务器 IP：122.152.201.146

使用场景：为商家提供一站式店铺运营管理，包括推广计划/单元/关键词/创意数据同步、推广日报表分析与 ROI 监控。

盼复，谢谢！
```

## 四、权限通过后的验证

权限审批通过后，可在服务器上执行以下脚本快速验证：

```bash
# 已放在 /home/ubuntu/src/scripts/check_promotion_api.js
node /home/ubuntu/src/scripts/check_promotion_api.js
```

该脚本会调用余额、计划列表、单元列表、多多进宝订单 4 个接口，打印是否成功。

## 五、权限通过后下一步开发

权限开通后，将按以下顺序实现：

1. 推广账户余额/账户信息同步
2. 推广计划 + 推广单元列表同步
3. 关键词 + 创意列表同步
4. 推广日报表（分天/小时/分级）同步
5. 前端推广分析页改造：账户概览、计划/单元、报表趋势、关键词/创意、渠道追踪

---

> 注意：推广 API 一般有调用配额限制，对接成功后需要注意限流与缓存策略。
