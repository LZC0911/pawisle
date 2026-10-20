/* =====================================================
   绒屿 PAWISLE API · Cloudflare Workers + D1
   - 与 contract/api-contract.md 形状 1:1
   - 首次请求自动建表 + 写入种子数据（幂等）
   - 演示态固定用户 u1（林晚晴）；归属地来自 request.cf
===================================================== */
const DEMO_USER = "u1", DEMO_NAME = "林晚晴";

/* ---------- 鉴权：PBKDF2 密码散列 + HMAC-SHA256 JWT（Web Crypto，零依赖） ----------
   生产部署务必执行：wrangler secret put JWT_SECRET */
const DEV_SECRET = "pawisle-dev-secret-do-not-use-in-prod";
const DEV_EMAIL = "demo@pawisle.cn", DEV_PASS = "pawisle2026";
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
const randHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b=>b.toString(16).padStart(2,"0")).join("");
function hexToBytes(h){ return Uint8Array.from(h.match(/../g).map(x=>parseInt(x,16))); }
async function hashPassHex(pass,saltHex){
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:hexToBytes(saltHex),iterations:100000},key,256);
  return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function signJWT(payload,secret){
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const data = b64u(new TextEncoder().encode(JSON.stringify({alg:"HS256",typ:"JWT"})))+"."+b64u(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(data));
  return data+"."+b64u(sig);
}
async function verifyJWT(token,secret){
  const parts = String(token||"").split(".");
  if(parts.length!==3) return null;
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const ok = await crypto.subtle.verify("HMAC",key,unb64u(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  if(!ok) return null;
  try{ const pl = JSON.parse(new TextDecoder().decode(unb64u(parts[1])));
    if(pl.exp && Date.now()>pl.exp) return null;
    return pl;
  }catch(e){ return null; }
}
async function authUser(request,env){
  const m = (request.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i);
  if(!m) return null;
  const pl = await verifyJWT(m[1],env.JWT_SECRET||DEV_SECRET);
  return pl && pl.sub ? pl.sub : null;
}
const issueToken = (env,uid,name) => signJWT({sub:uid,name,exp:Date.now()+30*24*3600*1000},env.JWT_SECRET||DEV_SECRET);

/* ---------- 建表（与 contract/d1-schema.sql 一致） ---------- */
const SCHEMA = [
`CREATE TABLE IF NOT EXISTS pets(id TEXT PRIMARY KEY,user_id TEXT DEFAULT 'u1',name TEXT NOT NULL,species TEXT NOT NULL,breed TEXT,gender TEXT,age TEXT,weight REAL,score INTEGER,avatar TEXT,tags TEXT DEFAULT '[]')`,
`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,pass_hash TEXT,salt TEXT,created_at INTEGER)`,
`CREATE TABLE IF NOT EXISTS weights(id INTEGER PRIMARY KEY AUTOINCREMENT,pet_id TEXT NOT NULL,d TEXT NOT NULL,w REAL NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_weights_pet ON weights(pet_id)`,
`CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY AUTOINCREMENT,pet_id TEXT NOT NULL,date TEXT NOT NULL,type TEXT,icon TEXT,title TEXT,note TEXT)`,
`CREATE INDEX IF NOT EXISTS idx_records_pet ON records(pet_id,date DESC)`,
`CREATE TABLE IF NOT EXISTS reminders(id TEXT PRIMARY KEY,pet_id TEXT NOT NULL,title TEXT,date TEXT,icon TEXT,urgent INTEGER DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS circles(id TEXT PRIMARY KEY,name TEXT,members TEXT,"desc" TEXT,species TEXT)`,
`CREATE TABLE IF NOT EXISTS circle_members(user_id TEXT NOT NULL,circle_id TEXT NOT NULL,PRIMARY KEY(user_id,circle_id))`,
`CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,circle TEXT,author TEXT,pet TEXT,time TEXT,title TEXT,excerpt TEXT,img TEXT,likes INTEGER DEFAULT 0,comments INTEGER DEFAULT 0,views TEXT,essence INTEGER DEFAULT 0,member_only INTEGER DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY AUTOINCREMENT,post_id TEXT NOT NULL,author TEXT,text TEXT,time TEXT,created_at INTEGER)`,
`CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`,
`CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT,cat TEXT,price REAL,member REAL,img TEXT,tag TEXT,"desc" TEXT)`,
`CREATE TABLE IF NOT EXISTS cart(user_id TEXT NOT NULL,product_id TEXT NOT NULL,qty INTEGER DEFAULT 1,PRIMARY KEY(user_id,product_id))`,
`CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_no TEXT UNIQUE,user_id TEXT,items TEXT,total REAL,created_at INTEGER)`,
`CREATE TABLE IF NOT EXISTS memberships(user_id TEXT PRIMARY KEY,plan TEXT,updated_at INTEGER)`,
`CREATE TABLE IF NOT EXISTS page_views(id INTEGER PRIMARY KEY AUTOINCREMENT,page TEXT,ref TEXT,country TEXT,region TEXT,city TEXT,ua TEXT,ts INTEGER)`,
`CREATE INDEX IF NOT EXISTS idx_pv_ts ON page_views(ts)`,
`CREATE INDEX IF NOT EXISTS idx_pv_country ON page_views(country)`
];

/* ---------- 种子数据（来自原型 mock，INSERT OR REPLACE 幂等） ---------- */
const SEED = [
`INSERT OR REPLACE INTO pets(id,name,species,breed,gender,age,weight,score,avatar,tags) VALUES
 ('niangao','年糕','cat','布偶猫','妹妹','2岁4个月',4.6,92,'assets/pet-niangao.jpg','["已绝育","室内饲养","玻璃胃"]'),
 ('keke','可可','dog','金毛寻回犬','弟弟','5岁1个月',28.4,87,'assets/pet-keke.jpg','["已绝育","髋关节关注","每日两遛"]')`,
`INSERT OR REPLACE INTO weights(pet_id,d,w) VALUES
 ('niangao','05-20',4.2),('niangao','06-20',4.3),('niangao','07-20',4.35),('niangao','08-20',4.4),('niangao','09-20',4.5),('niangao','10-20',4.6),
 ('keke','05-20',27.2),('keke','06-20',27.6),('keke','07-20',27.9),('keke','08-20',28.1),('keke','09-20',28.3),('keke','10-20',28.4)`,
`INSERT OR REPLACE INTO records(pet_id,date,type,icon,title,note) VALUES
 ('niangao','2026-10-12','洗护','scissors','季度洗护 + 毛发护理','毛质状态良好，美容师建议保持每周梳毛 3 次'),
 ('niangao','2026-09-08','驱虫','pill','体内外驱虫（大宠爱）','下次驱虫：2026-12-08'),
 ('niangao','2026-07-15','体检','stethoscope','年度体检','各项指标正常，建议增加饮水量'),
 ('niangao','2026-05-21','疫苗','syringe','狂犬疫苗','接种顺利，无不良反应'),
 ('niangao','2026-05-07','疫苗','syringe','猫三联加强针','抗体水平合格'),
 ('keke','2026-10-05','体检','stethoscope','半年度体检','髋关节轻度磨损，建议补充软骨素'),
 ('keke','2026-08-19','疫苗','syringe','犬四联 + 狂犬','接种顺利'),
 ('keke','2026-07-02','洗护','scissors','夏季剃毛 + 药浴','皮肤状态良好')`,
`INSERT OR REPLACE INTO reminders(id,pet_id,title,date,icon,urgent) VALUES
 ('r1','niangao','指甲护理','10-24','scissors',1),
 ('r2','niangao','换粮过渡第 3 天','10-22','bone',0),
 ('r3','niangao','体内外驱虫','12-08','pill',0),
 ('r4','keke','软骨素补货','10-25','pill',1),
 ('r5','keke','疫苗抗体检测','11-19','syringe',0)`,
`INSERT OR REPLACE INTO circles(id,name,members,"desc",species) VALUES
 ('c1','布偶猫研究所','12.8k','布偶猫的喂养、护理与行为交流','cat'),
 ('c2','金毛大家庭','23.4k','大型犬训练、运动与健康管理','dog'),
 ('c3','科学喂养圈','31.2k','生骨肉、熟自制与主粮测评','all'),
 ('c4','猫咪行为学社','8.6k','读懂猫主子的每一个信号','cat'),
 ('c5','老年犬照护联盟','6.2k','陪伴 TA 们优雅地变老','dog'),
 ('c6','萌宠摄影集','15.7k','用镜头记录毛孩子的日常','all')`,
`INSERT OR REPLACE INTO circle_members(user_id,circle_id) VALUES ('u1','c1'),('u1','c3')`,
`INSERT OR REPLACE INTO posts(id,circle,author,pet,time,title,excerpt,img,likes,comments,views,essence,member_only) VALUES
 ('p1','布偶猫研究所','沈知遥','布偶 · 糯米','2小时前','换粮第七天，软便终于消失了（附完整过渡表）','从旧粮到新粮按 25% 递增，配合益生菌，第 5 天开始便便成型。过渡表贴在正文，玻璃胃布偶家庭可以直接抄作业。','assets/post-cat1.jpg',486,132,'2.1w',1,0),
 ('p2','金毛大家庭','陈屿','金毛 · 豆豆','4小时前','5 岁金毛髋关节养护实录：从跛行到恢复晨跑','体检发现髋关节磨损后，我们坚持了 4 个月的游泳训练 + 软骨素 + 体重管理。分享给同样焦虑的家长们。','assets/post-dog1.jpg',358,96,'1.4w',0,0),
 ('p3','老年犬照护联盟','顾一禾','田园犬 · 阿福','6小时前','13 岁阿福的居家适老化改造清单','防滑垫、缓坡台阶、加高食盆、夜间感应灯……一共 17 项改造，花费不到 800 元，但阿福的起居质量提升肉眼可见。','assets/post-senior.jpg',294,78,'9.6k',1,0),
 ('p4','科学喂养圈','苏晚晴','英短 · 布丁','8小时前','【会员专享】十款热门冻干横评：蛋白含量与复水性实测','实验室送检 + 自家三只猫试吃双维度打分，附完整数据表格。结论可能和你想的不太一样。','assets/post-feed.jpg',572,210,'3.2w',0,1),
 ('p5','猫咪行为学社','林深处','橘猫 · 蛋黄','10小时前','猫半夜跑酷不是精力旺盛，是捕猎时钟没被满足','睡前 15 分钟逗猫棒模拟捕猎 + 一顿夜宵，坚持一周，凌晨四点的跑酷声消失了。原理和方法都写在正文。',NULL,431,145,'1.8w',0,0),
 ('p6','萌宠摄影集','快门三秒','边牧 · 拿铁','12小时前','逆光拍毛孩子的 3 个黄金时段','日出后 1 小时、日落前 40 分钟、树荫下的正午。附参数设置和引导宠物看镜头的土办法。',NULL,267,54,'8.2k',0,0),
 ('p7','布偶猫研究所','沈知遥','布偶 · 糯米','昨天','梳毛工具红黑榜：排梳、针梳、开结刀怎么选','长毛猫家庭工具柜大公开。排梳选不锈钢宽细两用，开结刀慎用于腋下……',NULL,189,67,'6.4k',0,0),
 ('p8','金毛大家庭','阿澈','金毛 · 可乐','昨天','狗狗游泳第一课：从抗拒到主动下水','不要用扔的。找缓坡水域 + 救生衣 + 零食阶梯奖励，三次下水就敢自己游了。',NULL,342,88,'1.1w',0,0),
 ('p9','科学喂养圈','苏晚晴','英短 · 布丁','昨天','【会员专享】主食罐喂养成本测算：每月到底要花多少','按体重分段测算，附不同预算下的品牌组合方案，以及大促囤货的价格锚点。',NULL,508,176,'2.4w',0,1),
 ('p10','猫咪行为学社','林深处','橘猫 · 蛋黄','2天前','多猫家庭新猫隔离期到底要多久','至少 7 天，分气味交换、隔门对视、短时会面三步走。太快见面的代价可能是长期关系紧张。',NULL,256,93,'7.8k',0,0),
 ('p11','老年犬照护联盟','顾一禾','田园犬 · 阿福','2天前','老年犬体检项目取舍：哪些每年必做','血常规+生化+SDMA 是底线，心脏超声和腹部 B 超看品种。和医生沟通的 checklist 放在正文。',NULL,178,45,'5.3k',0,0),
 ('p12','萌宠摄影集','快门三秒','边牧 · 拿铁','3天前','手机也能拍的「证件照」布光法','一扇北向窗户 + 一张白床单 + 一块反光板（快递箱内衬锡纸也行），成本 0 元。',NULL,312,61,'9.1k',0,0)`,
`INSERT OR REPLACE INTO products(id,name,cat,price,member,img,tag,"desc") VALUES
 ('g1','深海三文鱼全价猫粮 1.5kg','主粮',169,139,'assets/prod-food.jpg','热卖','86% 动物性原料，三文鱼单一肉源低敏配方，适合玻璃胃猫咪。'),
 ('g2','鸡肉南瓜主食罐 170g×6','主粮',89,72,'assets/prod-can.jpg','新品','无谷无胶，开罐可见真实肉丝，含水量 78%，帮猫咪补足水分。'),
 ('g3','冻干鹌鹑蛋黄 100g','零食',59,47,'assets/prod-freeze.jpg','口碑','-36℃ 低温冻干锁鲜，卵磷脂天然补充，毛发亮泽看得见。'),
 ('g4','深海鱼油软胶囊 60 粒','保健',129,99,'assets/prod-fishoil.jpg','复购王','rTG 形态高浓度 Omega-3，EPA+DHA ≥ 85%，美毛护心脑。'),
 ('g5','犬用软骨素关节片 120 片','保健',149,119,'assets/prod-joint.jpg','兽医推荐','氨糖+软骨素+MSM 黄金三角，中大型犬关节日常养护。'),
 ('g6','智能定时喂食器 4L','智能',329,269,'assets/prod-feeder.jpg','智能','App 远程出粮、语音唤食、断电续航 30 天，出差不再焦虑。'),
 ('g7','实木多层猫爬架','用品',459,389,'assets/prod-tree.jpg','高颜值','E0 级橡胶木，剑麻柱可替换，承重 25kg，稳如磐石。'),
 ('g8','耐咬发声磨牙玩具套装','用品',49,39,'assets/prod-toy.jpg','凑单','天然橡胶，内置发声器，洁齿颗粒设计，拆家转移神器。'),
 ('g9','宠物年度体检套餐（全国 300 院通用）','服务',399,319,'assets/prod-checkup.jpg','会员 8 折','血常规、生化 16 项、DR 影像、心脏听诊，含专业报告解读。'),
 ('g10','陶瓷恒温饮水机 2L','智能',199,159,'assets/prod-fountain.jpg','静音','陶瓷机身抑菌易洁，四重过滤，30dB 静音水泵，活水更吸引猫咪。')`,
`INSERT OR REPLACE INTO memberships(user_id,plan,updated_at) VALUES ('u1','free',0)`
];

/* ---------- 首次请求自动建表 + 种子 ---------- */
let booted = false;
async function ensureReady(env){
  if(booted) return;
  const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pets'").first();
  if(!t){
    await env.DB.batch(SCHEMA.map(s=>env.DB.prepare(s)));
    for(const s of SEED) await env.DB.prepare(s).run();
    /* 演示账号：demo@pawisle.cn / pawisle2026 */
    const salt = randHex(16);
    await env.DB.prepare("INSERT OR IGNORE INTO users(id,name,email,pass_hash,salt,created_at) VALUES(?,?,?,?,?,?)")
      .bind(DEMO_USER,DEMO_NAME,DEV_EMAIL,await hashPassHex(DEV_PASS,salt),salt,Date.now()).run();
  }
  booted = true;
}

/* ---------- 工具 ---------- */
function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
}
function corsOf(req){
  const o = req.headers.get("Origin");
  const h = {"Access-Control-Allow-Origin":o||"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
  if(o) h["Access-Control-Allow-Credentials"] = "true";
  return h;
}
const mapPost = r => ({id:r.id,circle:r.circle,author:r.author,pet:r.pet,time:r.time,title:r.title,excerpt:r.excerpt,img:r.img,likes:r.likes,comments:r.comments,views:r.views,essence:!!r.essence,memberOnly:!!r.member_only});
const mapProduct = r => ({id:r.id,name:r.name,cat:r.cat,price:r.price,member:r.member,img:r.img,tag:r.tag,desc:r.desc});
async function getPet(env,id,uid){
  const r = await env.DB.prepare("SELECT * FROM pets WHERE id=? AND user_id=?").bind(id,uid||DEMO_USER).first();
  if(!r) return null;
  return {id:r.id,name:r.name,species:r.species,breed:r.breed,gender:r.gender,age:r.age,weight:r.weight,score:r.score,avatar:r.avatar,tags:JSON.parse(r.tags||"[]")};
}

/* ---------- 路由 ---------- */
export default {
  async fetch(request,env,ctx){
    const C = corsOf(request);
    const send = r => { for(const k in C) r.headers.set(k,C[k]); return r; };
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:C});
    try{
      await ensureReady(env);
      return send(await route(request,env,new URL(request.url)));
    }catch(e){
      return send(json({error:String(e&&e.message||e)},500));
    }
  }
};

async function route(request,env,url){
  const p = url.pathname, m = request.method;
  let mm;
  if(m==="GET"  && p==="/api/health")  return json({ok:true,service:"pawisle-api"});
  if(m==="POST" && p==="/api/auth/register") return hRegister(request,env);
  if(m==="POST" && p==="/api/auth/login")    return hLogin(request,env);
  if(m==="GET"  && p==="/api/me")            return hMe(request,env);
  if(m==="GET"  && p==="/api/home")    return hHome(request,env,url);
  if(m==="GET"  && (mm=p.match(/^\/api\/pets\/([\w-]+)\/health$/)))  return hHealth(request,env,mm[1]);
  if(m==="POST" && (mm=p.match(/^\/api\/pets\/([\w-]+)\/records$/))) return hAddRecord(request,env,mm[1]);
  if(m==="GET"  && p==="/api/community") return hCommunity(env,url);
  if(m==="GET"  && (mm=p.match(/^\/api\/posts\/([\w-]+)$/)))          return hGetPost(env,mm[1]);
  if(m==="POST" && (mm=p.match(/^\/api\/posts\/([\w-]+)\/comments$/))) return hAddComment(request,env,mm[1]);
  if(m==="POST" && (mm=p.match(/^\/api\/circles\/([\w-]+)\/join$/)))   return hToggleCircle(request,env,mm[1]);
  if(m==="GET"  && p==="/api/products") return hProducts(env,url);
  if(m==="POST" && p==="/api/cart")     return hAddToCart(request,env);
  if(m==="POST" && p==="/api/orders")   return hCheckout(request,env);
  if(m==="POST" && p==="/api/membership/subscribe") return hSubscribe(request,env);
  if(m==="POST" && p==="/api/track")    return hTrack(request,env);
  if(m==="GET"  && p==="/api/stats")    return hStats(env);
  return json({error:"Not Found",path:p},404);
}

/* ----------  handlers ---------- */
async function hHome(request,env,url){
  const uid = await authUser(request,env);
  const pet = await getPet(env, url.searchParams.get("petId")||"niangao", uid);
  if(!pet) return json({error:"宠物不存在"},404);
  const posts = (await env.DB.prepare("SELECT * FROM posts ORDER BY rowid LIMIT 6").all()).results.map(mapPost);
  const circles = (await env.DB.prepare("SELECT * FROM circles ORDER BY rowid").all()).results;
  return json({pet,posts,circles});
}

async function hHealth(request,env,id){
  const uid = await authUser(request,env);
  const pet = await getPet(env,id,uid);
  if(!pet) return json({error:"宠物不存在"},404);
  const weights = (await env.DB.prepare("SELECT d,w FROM weights WHERE pet_id=? ORDER BY d").bind(id).all()).results;
  const timeline = (await env.DB.prepare("SELECT date,type,icon,title,note FROM records WHERE pet_id=? ORDER BY date DESC").bind(id).all()).results;
  const reminders = (await env.DB.prepare("SELECT id,title,date,icon,urgent FROM reminders WHERE pet_id=?").bind(id).all()).results
    .map(r=>({id:r.id,title:r.title,date:r.date,icon:r.icon,urgent:!!r.urgent}));
  return json({pet,weights,timeline,reminders});
}

async function hAddRecord(request,env,petId){
  const uid = await authUser(request,env);
  if(!uid) return json({error:"请先登录"},401);
  if(!await getPet(env,petId,uid)) return json({error:"宠物不存在"},404);
  const b = await request.json();
  await env.DB.prepare("INSERT INTO records(pet_id,date,type,icon,title,note) VALUES(?,?,?,?,?,?)")
    .bind(petId,b.date||"",b.type||"",b.icon||"",b.title||"",b.note||"").run();
  return json({petId,type:b.type,icon:b.icon,title:b.title,date:b.date,note:b.note});
}

async function hCommunity(env,url){
  const tab = url.searchParams.get("tab")||"";
  let cid = url.searchParams.get("circle")||"";
  if(cid==="undefined"||cid==="null"||cid==="all") cid="";
  const cond = [], args = [];
  if(cid){
    const c = await env.DB.prepare("SELECT name FROM circles WHERE id=?").bind(cid).first();
    if(c){ cond.push("circle=?"); args.push(c.name); }
  }
  if(tab==="essence") cond.push("essence=1");
  let sql = "SELECT * FROM posts";
  if(cond.length) sql += " WHERE "+cond.join(" AND ");
  sql += " ORDER BY rowid "+(tab==="latest"?"DESC":"ASC");
  const st = env.DB.prepare(sql);
  const posts = (await (args.length?st.bind(...args):st).all()).results.map(mapPost);
  const circles = (await env.DB.prepare("SELECT * FROM circles ORDER BY rowid").all()).results;
  return json({posts,circles});
}

async function hGetPost(env,id){
  const r = await env.DB.prepare("SELECT * FROM posts WHERE id=?").bind(id).first();
  if(!r) return json({error:"帖子不存在"},404);
  const comments = (await env.DB.prepare("SELECT author,text,time FROM comments WHERE post_id=? ORDER BY id DESC").bind(id).all()).results;
  return json({post:mapPost(r),comments});
}

async function hAddComment(request,env,pid){
  const uid = await authUser(request,env);
  if(!uid) return json({error:"请先登录"},401);
  const u = await env.DB.prepare("SELECT name FROM users WHERE id=?").bind(uid).first();
  const {text=""} = await request.json();
  if(!String(text).trim()) return json({error:"内容不能为空"},400);
  const c = {author:(u&&u.name)||"圈友",text:String(text).trim(),time:"刚刚"};
  await env.DB.prepare("INSERT INTO comments(post_id,author,text,time,created_at) VALUES(?,?,?,?,?)")
    .bind(pid,c.author,c.text,c.time,Date.now()).run();
  await env.DB.prepare("UPDATE posts SET comments=comments+1 WHERE id=?").bind(pid).run();
  return json(c);
}

async function hToggleCircle(request,env,cid){
  const uid = await authUser(request,env);
  if(!uid) return json({error:"请先登录"},401);
  const ex = await env.DB.prepare("SELECT 1 x FROM circle_members WHERE user_id=? AND circle_id=?").bind(uid,cid).first();
  if(ex){
    await env.DB.prepare("DELETE FROM circle_members WHERE user_id=? AND circle_id=?").bind(uid,cid).run();
    return json({joined:false});
  }
  await env.DB.prepare("INSERT OR IGNORE INTO circle_members(user_id,circle_id) VALUES(?,?)").bind(uid,cid).run();
  return json({joined:true});
}

async function hProducts(env,url){
  const cat = url.searchParams.get("cat")||"";
  if(cat && cat!=="全部" && cat!=="undefined"){
    return json((await env.DB.prepare("SELECT * FROM products WHERE cat=? ORDER BY rowid").bind(cat).all()).results.map(mapProduct));
  }
  return json((await env.DB.prepare("SELECT * FROM products ORDER BY rowid").all()).results.map(mapProduct));
}

async function hAddToCart(request,env){
  const uid = await authUser(request,env);
  if(!uid) return json({error:"请先登录"},401);
  const {productId,qty=1} = await request.json();
  await env.DB.prepare(`INSERT INTO cart(user_id,product_id,qty) VALUES(?,?,?)
    ON CONFLICT(user_id,product_id) DO UPDATE SET qty=qty+excluded.qty`).bind(uid,productId,qty).run();
  const rows = (await env.DB.prepare("SELECT product_id AS id,qty FROM cart WHERE user_id=?").bind(uid).all()).results;
  return json(rows);
}

async function hCheckout(request,env){
  const uid = await authUser(request,env);
  if(!uid) return json({error:"请先登录"},401);
  const {items=[]} = await request.json();
  if(!items.length) return json({error:"购物车为空"},400);
  const ms = await env.DB.prepare("SELECT plan FROM memberships WHERE user_id=?").bind(uid).first();
  const isPro = !!ms && ms.plan!=="free";
  let total = 0;
  for(const it of items){
    const p = await env.DB.prepare("SELECT price,member FROM products WHERE id=?").bind(it.id).first();
    if(p) total += (isPro?p.member:p.price)*(it.qty||1);
  }
  const orderNo = "PY"+Date.now().toString().slice(-8);
  await env.DB.prepare("INSERT INTO orders(order_no,user_id,items,total,created_at) VALUES(?,?,?,?,?)")
    .bind(orderNo,uid,JSON.stringify(items),Math.round(total*100)/100,Date.now()).run();
  await env.DB.prepare("DELETE FROM cart WHERE user_id=?").bind(uid).run();
  return json({orderNo});
}

async function hSubscribe(request,env){
  const uid = await authUser(request,env);
  if(!uid) return json({error:"请先登录"},401);
  const {planId} = await request.json();
  await env.DB.prepare("INSERT INTO memberships(user_id,plan,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,updated_at=excluded.updated_at")
    .bind(uid,planId,Date.now()).run();
  return json({plan:planId});
}

/* ---------- 鉴权 handlers ---------- */
async function firstPetId(env,uid){
  const r = await env.DB.prepare("SELECT id FROM pets WHERE user_id=? ORDER BY rowid LIMIT 1").bind(uid).first();
  return r ? r.id : null;
}
async function hRegister(request,env){
  const {name="",email="",password=""} = await request.json();
  if(!String(name).trim()) return json({error:"请填写昵称"},400);
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({error:"邮箱格式不正确"},400);
  if(String(password).length<6) return json({error:"密码至少 6 位"},400);
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if(exists) return json({error:"该邮箱已注册，请直接登录"},409);
  const uid = "u_"+randHex(6), salt = randHex(16);
  await env.DB.prepare("INSERT INTO users(id,name,email,pass_hash,salt,created_at) VALUES(?,?,?,?,?,?)")
    .bind(uid,String(name).trim(),email,await hashPassHex(String(password),salt),salt,Date.now()).run();
  /* 新用户送一只示例宠物，避免空档案 */
  const pid = "pet_"+randHex(4);
  await env.DB.prepare(`INSERT INTO pets(id,user_id,name,species,breed,gender,age,weight,score,avatar,tags)
    VALUES(?,?,'小家伙','cat','待完善','','',0,80,'assets/pet-niangao.jpg','["新成员"]')`).bind(pid,uid).run();
  await env.DB.prepare("INSERT INTO records(pet_id,date,type,icon,title,note) VALUES(?,?,?,?,?,?)")
    .bind(pid,new Date().toISOString().slice(0,10),"记录","sparkles","欢迎来到绒屿","完善 TA 的档案，开始记录每一次疫苗、体检与洗护").run();
  const user = {id:uid,name:String(name).trim(),email};
  return json({token:await issueToken(env,uid,user.name),user,petId:pid});
}
async function hLogin(request,env){
  const {email="",password=""} = await request.json();
  const u = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if(!u) return json({error:"邮箱或密码不正确"},401);
  if(await hashPassHex(String(password),u.salt)!==u.pass_hash) return json({error:"邮箱或密码不正确"},401);
  const user = {id:u.id,name:u.name,email:u.email};
  return json({token:await issueToken(env,u.id,u.name),user,petId:await firstPetId(env,u.id)});
}
async function hMe(request,env){
  const uid = await authUser(request,env);
  if(!uid) return json({error:"未登录"},401);
  const u = await env.DB.prepare("SELECT id,name,email FROM users WHERE id=?").bind(uid).first();
  if(!u) return json({error:"账号不存在"},401);
  const ms = await env.DB.prepare("SELECT plan FROM memberships WHERE user_id=?").bind(uid).first();
  return json({user:u,plan:(ms&&ms.plan)||"free",petId:await firstPetId(env,uid)});
}

/* 访问量埋点：记录页面 + 访客归属地（request.cf 提供，无需第三方 IP 库） */
async function hTrack(request,env){
  let b = {}; try{ b = await request.json(); }catch(e){}
  const cf = request.cf||{};
  await env.DB.prepare("INSERT INTO page_views(page,ref,country,region,city,ua,ts) VALUES(?,?,?,?,?,?,?)")
    .bind(b.page||"",b.ref||"",cf.country||"",cf.region||"",cf.city||"",request.headers.get("User-Agent")||"",b.ts||Date.now()).run();
  return json({ok:true});
}

/* 运营统计：访问量 + 归属地分布 */
async function hStats(env){
  const total = (await env.DB.prepare("SELECT COUNT(*) c FROM page_views").first()).c;
  const d0 = new Date(); d0.setHours(0,0,0,0);
  const today = (await env.DB.prepare("SELECT COUNT(*) c FROM page_views WHERE ts>=?").bind(d0.getTime()).first()).c;
  const by_country = (await env.DB.prepare("SELECT country,COUNT(*) c FROM page_views GROUP BY country ORDER BY c DESC LIMIT 20").all()).results;
  const by_page = (await env.DB.prepare("SELECT page,COUNT(*) c FROM page_views GROUP BY page ORDER BY c DESC LIMIT 20").all()).results;
  const recent = (await env.DB.prepare("SELECT page,country,region,city,ts FROM page_views ORDER BY id DESC LIMIT 20").all()).results;
  return json({total_pv:total,today_pv:today,by_country,by_page,recent});
}
