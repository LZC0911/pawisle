# 绒屿 PAWISLE

## demo测试页：https://lzc0911.github.io/pawisle/


面向中文宠物主的兴趣圈层工具社区 —— 以**宠物健康档案**为核心，叠加圈子社区、会员服务与精选电商。

单页高保真原型 + Cloudflare Workers/D1 真实后端，免备案即可上线。

---

## 功能一览

| 模块 | 说明 |
|---|---|
| 健康档案 | 宠物档案、健康评分、疫苗/驱虫/体检/就诊等记录 CRUD，完成状态勾选 |
| 圈子社区 | 6 大兴趣圈子、帖子流、点赞评论、加入/退出圈子 |
| 会员服务 | 三档会员套餐、订阅开通、会员中心 |
| 精选电商 | 商品列表、购物车、下单结算、订单管理 |
| 用户系统 | 注册 / 登录（JWT）、写接口按用户隔离 |
| 访问统计 | 页面访问量埋点、访客归属地（基于 `request.cf`，零第三方依赖）、统计看板 |

## 技术栈

- **前端**：单文件 SPA（原生 HTML + CSS + JS，hash 路由，localStorage 持久化），零构建、零外部依赖，双击即可离线打开
- **后端**：Cloudflare Workers（零依赖手写路由）+ D1（SQLite）
- **鉴权**：PBKDF2(100k, SHA-256) 加盐密码散列 + HMAC-SHA256 JWT（Web Crypto API，30 天有效期）
- **部署**：全程免备案 —— 前端可丢 Vercel/Cloudflare Pages/任意静态托管，后端跑 Cloudflare Workers

## 目录结构

```
pawisle/
├── index.html              # 前端单文件 SPA（含双模 API 层）
├── assets/                 # 16 张本地图片素材（宠物/帖子/商品）
├── worker/
│   ├── wrangler.toml       # Workers 配置（需填入自己的 D1 database_id）
│   └── src/index.js        # 后端全部代码：18 条建表 DDL + 种子数据 + 14+3 个接口
└── contract/
    ├── api-contract.md     # API 契约文档（端点/鉴权/数据结构）
    └── d1-schema.sql       # D1 数据库 schema
```

## 本地预览

直接双击打开 `index.html` 即可，无需任何构建。

- 未配置后端时自动使用**本地 mock 数据**，全部功能可演示
- 离线演示模式下，登录弹窗内**任意邮箱 + 任意密码**即可登录

## 部署真实后端（4 步）

前置：安装 [wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) 并 `wrangler login`。

```bash
# 1. 创建 D1 数据库
wrangler d1 create pawisle-db

# 2. 把输出的 database_id 填入 worker/wrangler.toml

# 3. 设置生产环境 JWT 密钥（必做）
wrangler secret put JWT_SECRET

# 4. 部署
cd worker && wrangler deploy
```

部署完成后，把得到的 Worker 地址填入 `index.html` 顶部的 `API_BASE` 常量，前端即自动切换为真实接口（请求失败会回退本地 mock，401 除外）。

首次请求时后端会**自动建表 + 写入种子数据**，无需手动执行 SQL。

### 演示账号

| 账号 | 密码 |
|---|---|
| `demo@pawisle.cn` | `pawisle2026` |

新注册的用户会自动获赠一只示例宠物和一条欢迎记录。

## API 概览

鉴权：`POST /api/auth/register` · `POST /api/auth/login` · `GET /api/me`

业务：`GET /api/home` · `GET /api/health` · `POST /api/records` · `PATCH /api/records/:id` · `GET /api/circle/:id` · `POST /api/posts/:id/comments` · `POST /api/circles/:id/toggle` · `GET /api/shop` · `POST /api/cart` · `POST /api/checkout` · `POST /api/subscribe`

统计：`POST /api/track` · `GET /api/stats`

完整字段与请求/响应结构见 [contract/api-contract.md](contract/api-contract.md)。

## 安全提示

- 生产环境**必须**通过 `wrangler secret put JWT_SECRET` 设置密钥，代码内置的 `DEV_SECRET` 仅限本地开发
- 密码使用 PBKDF2(100k, SHA-256) 加盐散列存储，不可逆
- 所有写接口均校验登录态并按用户隔离数据
