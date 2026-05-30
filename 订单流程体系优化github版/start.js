/**
 * 启动脚本 — 启动服务器并打开浏览器
 * 使用方式：node start.js
 */
const { spawn } = require('child_process');
const http = require('http');

const SERVER_PORT = process.env.PORT || 3000;
const SERVER_SCRIPT = './server.js';

console.log('🚀 正在启动订单流程系统...\n');

const server = spawn('node', [SERVER_SCRIPT], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env, PORT: SERVER_PORT }
});

// 轮询等待服务器就绪
let attempts = 0;
const maxAttempts = 20;
const checkInterval = setInterval(() => {
  attempts++;
  const req = http.get(`http://localhost:${SERVER_PORT}/login.html`, (res) => {
    if (res.statusCode === 200) {
      clearInterval(checkInterval);
      console.log(`\n✅ 服务器已就绪：http://localhost:${SERVER_PORT}/\n`);

      // 打开浏览器
      const plat = process.platform;
      const url = `http://localhost:${SERVER_PORT}/`;
      if (plat === 'win32') {
        spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore' });
      } else if (plat === 'darwin') {
        spawn('open', [url], { detached: true, stdio: 'ignore' });
      } else {
        spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
      }

      console.log('浏览器已打开：' + url);
      console.log('\n按 Ctrl+C 停止服务');
    }
  });
  req.on('error', () => {
    // 服务器还没启动，继续等
  });
  req.end();

  if (attempts >= maxAttempts) {
    clearInterval(checkInterval);
    console.log('\n⚠️ 服务器启动超时，请手动刷新 http://localhost:3000/');
  }
}, 500);

// 进程退出时清理
process.on('SIGINT', () => {
  console.log('\n正在停止服务...');
  server.kill();
  process.exit();
});
