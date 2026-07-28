# 付款上线清单

付款功能采用“默认关闭”策略：D1、爱发电验单密钥、三款商品身份或结算页任一项缺失时，不允许 AI 绕过计费，也不会展示可点击的付款链接。

## 1. D1

1. 在 Cloudflare 创建或确认数据库 `ziwei-ai-db`。
2. 将真实数据库 ID 写入 `worker/wrangler.jsonc` 的 `database_id`。
3. 按顺序应用 `worker/migrations/0001_ai_billing_cache.sql`、`0002_afdian_billing.sql`、`0003_billing_ledger.sql`。
4. 在 Cloudflare Pages 项目的 Settings → Bindings 中也创建名为 `DB` 的 D1 binding，指向同一个数据库。Pages 和独立 Worker 的 binding 不会自动互通。

## 2. 爱发电服务端配置

在爱发电开发者后台取得 `user_id` 与 API Token。然后给 Cloudflare Worker（以及复用 Worker 代码的 Pages Functions）配置：

- Secret：`AFDIAN_API_TOKEN`
- Secret：`AFDIAN_WEBHOOK_TOKEN`（自行生成的高强度随机值）
- Variable：`AFDIAN_USER_ID`
- Variable：`AFDIAN_PACKAGE_1_PLAN_ID`、`AFDIAN_PACKAGE_1_SKU_ID`
- Variable：`AFDIAN_PACKAGE_3_PLAN_ID`、`AFDIAN_PACKAGE_3_SKU_ID`
- Variable：`AFDIAN_PACKAGE_10_PLAN_ID`、`AFDIAN_PACKAGE_10_SKU_ID`

商品 ID 必须从真实爱发电订单的 `plan_id` 和 `sku_detail[].sku_id` 获取，不能根据公开商品页地址猜测。

Webhook 地址配置为：

```text
https://你的正式域名/api/afdian/webhook?token=你的_AFDIAN_WEBHOOK_TOKEN
```

回调到达后，服务端还会通过爱发电 `query-order` API 回查订单。只有订单成功、`product_type=1`、plan/SKU/套餐全部匹配且订单号未处理过，才会充值。

## 3. 前端结算页

在 Cloudflare Pages 的构建环境变量中配置三条完整的爱发电结算页：

- `NEXT_PUBLIC_AFDIAN_CHECKOUT_1`
- `NEXT_PUBLIC_AFDIAN_CHECKOUT_3`
- `NEXT_PUBLIC_AFDIAN_CHECKOUT_10`

必须是爱发电或爱发电域名下的 `/order/create` URL，并且已有真实的 32 位 `plan_id` 与 `sku`（或 `sku_id`）参数。前端会追加：

```text
custom_order_id=ziwei:<浏览器客户端ID>:<1|3|10>
```

配置不完整时购买按钮会保持禁用。

## 4. 部署前验证

```bash
npm install
npm --prefix worker install
npm run check
npx --prefix worker wrangler deploy --dry-run
```

部署后先确认：

- `GET /health`（独立 Worker）返回 `database: true`、`billing: true`
- `POST /api/billing/session` 不再是 404/405/503
- 未配置 token 的 Webhook 请求返回 401
- 页面能显示付费余额，三个购买按钮均为“自动到账”

以上全部通过后，再做 ¥1.88 实单测试。
