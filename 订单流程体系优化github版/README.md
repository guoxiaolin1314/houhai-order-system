# 订单流程体系优化 GitHub 版

## 厚海锐膜 · 订单流程体系优化（报价→合同→排产→生产跟踪）

面膜/护肤品代工行业的订单流程管理系统。

### 技术栈
- 前端：HTML + CSS + JavaScript（纯 SPA）
- 后端：Express（Node.js）
- 数据库：SQLite（开发）/ PostgreSQL（生产）

### 本地启动
```bash
npm install
npm start
```
然后访问 http://localhost:3000

### 初始账号
- admin / 123456（管理员）
- 其他账号在用户管理面板创建

### Zeabur 部署
需设置环境变量：
- `JWT_SECRET` — JWT 签名密钥
- `DATABASE_URL` — PostgreSQL 连接串（生产用）
- `DEEPSEEK_API_KEY` — AI 识别功能（可选）
