# 绒屿 PAWISLE · 后端交接契约（REST API + D1）

> 从前端 `api` 层（index.html）机械提取，请求/响应形状与 mock 1:1 一致。
> 参考实现见 `worker/`（Cloudflare Workers + D1）；前端把 `API_BASE` 改为 Worker 地址即接入。
> 已接入用户鉴权：注册/登录返回 JWT（HMAC-SHA256，30 天），前端请求头携带 `Authorization: Bearer <token>`。
> 写接口与 `/api/me` 需登录（401）；读接口未登录时回落到演示账号 `u1` 的数据。演示账号：`demo@pawisle.cn / pawisle2026`。

## 通用约定

- Base URL：`{API_BASE}`，例：`https://pawisle-api.<subdomain>.workers.dev`
- 请求/响应均为 JSON；写接口需 `Content-Type: application/json`
- 鉴权：密码 PBKDF2(100k, SHA-256) 加盐散列存储；JWT 密钥用 `wrangler secret put JWT_SECRET` 配置（缺省为开发密钥，仅限调试）
- CORS：反射 `Origin` + `Access-Control-Allow-Credentials: true`（前端 fetch 带 `credentials:"include"`）
- 访客归属地：由 Workers `request.cf`（country / region / city）提供，**无需第三方 IP 库**
- 图片字段（avatar/img）目前为前端相对路径 `assets/...`；正式版建议迁移至 R2 并返回完整 URL

## 端点映射（页面 → api 方法 → HTTP）

| 页面/触发 | api 方法 | Method + Path | 请求体 | 响应 |
|---|---|---|---|---|
| 登录/注册弹窗 | register | `POST /api/auth/register` | `{name,email,password}` | `{token,user,petId}`（注册送示例宠物） |
| 登录/注册弹窗 | login | `POST /api/auth/login` | `{email,password}` | `{token,user,petId}` |
| 启动会话同步 | me | `GET /api/me` | —（需 Bearer） | `{user,plan,petId}` |
| 首页 | getHome | `GET /api/home?petId=` | — | `{pet, posts[6], circles[]}` |
| 健康档案 | getHealth | `GET /api/pets/:id/health` | — | `{pet, weights[], timeline[], reminders[]}` |
| 健康档案·记一笔 | addRecord | `POST /api/pets/:id/records` | `{type,icon,title,date,note}` | 回显记录（含 petId） |
| 社区 | getCommunity | `GET /api/community?tab=&circle=` | — | `{posts[], circles[]}` |
| 帖子详情弹窗 | getPost | `GET /api/posts/:id` | — | `{post, comments[]}` |
| 帖子评论 | addComment | `POST /api/posts/:id/comments` | `{text}` | `{author,text,time}` |
| 加入/退出圈子 | toggleCircle | `POST /api/circles/:id/join` | `{}` | `{joined:boolean}` |
| 商城 | getProducts | `GET /api/products?cat=` | — | `Product[]` |
| 加入购物车 | addToCart | `POST /api/cart` | `{productId,qty}` | `[{id,qty}...]` 购物车全量 |
| 结算 | checkout | `POST /api/orders` | `{items:[{id,qty}]}` | `{orderNo}`（会员价结算并清空购物车） |
| 开通会员 | subscribe | `POST /api/membership/subscribe` | `{planId}` | `{plan:planId}` |
| 路由切换埋点 | trackPV | `POST /api/track` | `{page,ts,ref}` | `{ok:true}` |
| 运营后台（预留） | — | `GET /api/stats` | — | `{total_pv,today_pv,by_country[],by_page[],recent[]}` |
| 探活 | — | `GET /api/health` | — | `{ok:true}` |

## 关键形状

```
Pet      = {id,name,species,breed,gender,age,weight,score,avatar,tags[]}
Post     = {id,circle,author,pet,time,title,excerpt,img,likes,comments,views,essence,memberOnly}
Product  = {id,name,cat,price,member,img,tag,desc}
Circle   = {id,name,members,desc,species}        // members 为展示字符串，如 "12.8k"
Comment  = {author,text,time}
```

## 语义细则

- `GET /api/community`：`tab=essence` 只看精华；`tab=latest` 按时间倒序；其余为默认推荐序。`circle` 传圈子 id，`all`/空为全部。
- `GET /api/pets/:id/health`：`timeline` 按 date 倒序；`reminders.urgent` 为布尔。
- `POST /api/orders`：若用户会员 `plan != free`，按 `member` 会员价合计；成功后清空该用户购物车。
- `POST /api/posts/:id/comments`：写库并把 `posts.comments` 计数 +1，返回 `{author,text,time:"刚刚"}`。
- `GET /api/stats`：`by_country`/`by_page` 按访问量降序取 Top 20；`recent` 取最近 20 条（含 country/region/city）。
