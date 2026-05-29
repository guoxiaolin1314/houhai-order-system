/**
 * 订单流程体系优化 — 后端服务
 *
 * 功能：
 * 1. JWT 认证（登录/验证/改密）
 * 2. 用户管理 + 权限管理
 * 3. AI 解析代理
 * 4. 飞书 Webhook 代理
 * 5. 静态文件托管
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ===== 中间件 =====
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ===== 路由（先注册API，Express 5 static 不调用 next）=====
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/users', require('./server/routes/users'));
app.use('/api/data', require('./server/routes/data'));

// ===== AI 解析代理 =====
app.post('/api/ai-parse', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: '缺少 prompt 参数' });
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: '未配置 DEEPSEEK_API_KEY' });
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 500 })
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'DeepSeek API 错误', detail: errText });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('AI 代理请求失败:', err);
    res.status(500).json({ error: '服务器内部错误', detail: err.message });
  }
});

// ===== 飞书 Webhook 代理 =====
app.post('/api/webhook-proxy', async (req, res) => {
  try {
    const { url, text } = req.body;
    if (!url || !text) return res.status(400).json({ error: '缺少 url 或 text 参数' });
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text } })
    });
    const data = await response.text();
    res.json({ ok: response.ok, data });
  } catch (err) {
    console.error('Webhook 代理请求失败:', err);
    res.status(500).json({ error: '代理请求失败', detail: err.message });
  }
});

// ===== 静态文件托管（禁用缓存，防止浏览器用旧页面）=====
const STATIC_DIR = __dirname;
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});
app.use(express.static(STATIC_DIR, {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'login.html'));
});

// 主应用入口
app.get('/app', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, '订单流程体系优化.html'));
});

// ===== 初始化数据库（异步）=====
const { init: initDb } = require('./server/init-db');

// ===== 启动 =====
(async () => {
  try {
    await initDb();
  } catch (e) {
    console.error('DB init error:', e);
  }
  app.listen(PORT, () => {
    console.log('✅ 订单流程系统服务已启动，端口: ' + PORT);
  });
})();
