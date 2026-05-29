/**
 * 数据库初始化脚本
 * 纯用户权限系统 — 没有角色，每个用户独立配置权限
 * 支持 SQLite / PostgreSQL 双引擎
 */

const bcrypt = require('bcryptjs');
const { getDb, close, dbType } = require('./db');

const DEFAULT_PWD = bcrypt.hashSync('123456', 10);

async function init() {
  const db = getDb();
  const type = dbType();
  console.log('📦 初始化数据库... [' + type + ']');

  // ----- 用户表 -----
  if (type === 'pg') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        display_name TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        must_change_pwd INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        display_name TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        must_change_pwd INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )
    `);
  }

  // ----- 用户个人权限表 -----
  if (type === 'pg') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module TEXT NOT NULL,
        permission_level TEXT NOT NULL DEFAULT 'none',
        UNIQUE(user_id, module)
      )
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        module TEXT NOT NULL,
        permission_level TEXT NOT NULL DEFAULT 'none'
          CHECK(permission_level IN ('none','read','write')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, module)
      )
    `);
  }

  // ----- 模块定义表 -----
  if (type === 'pg') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '业务',
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '业务',
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  // ----- 操作日志表 -----
  if (type === 'pg') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        ip TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        ip TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )
    `);
  }

  // ===== 初始数据 =====
  const row = await db.prepare('SELECT COUNT(*) as c FROM users').get();
  const userCount = row ? row.c : 0;

  if (userCount === 0) {
    console.log('📝 插入初始数据...');

    // 插入模块定义
    const modules = [
      ['dashboard',             '数据看板',   '业务', 1],
      ['quotation-engine',      '报价引擎',   '业务', 2],
      ['quote-doc',             '报价单生成', '业务', 3],
      ['contract',              '合同生成',   '业务', 4],
      ['schedule',              '排产计算',   '生产', 5],
      ['production-tracking',   '生产跟踪',   '生产', 6],
      ['customer',              '客户档案',   '业务', 7],
      ['material',              '基材管理',   '基础数据', 8],
      ['formula',               '配方管理',   '基础数据', 9],
      ['shape',                 '模切形状',   '基础数据', 10],
      ['formula-calc',          '配方计算',   '基础数据', 11],
      ['supplier',              '供方信息',   '基础数据', 12],
      ['user-manager',          '用户管理',   '系统', 13],
      ['audit-log',             '操作日志',   '系统', 14],
    ];
    for (const m of modules) {
      await db.prepare('INSERT INTO modules (key, name, category, sort_order) VALUES (?, ?, ?, ?)').run(...m);
    }

    // 创建超级管理员
    await db.prepare(`
      INSERT INTO users (username, password, display_name, is_admin, must_change_pwd)
      VALUES (?, ?, ?, 1, 0)
    `).run('admin', DEFAULT_PWD, '系统管理员');

    console.log('✅ 初始数据插入完成');
    console.log('   管理员账号: admin / 123456');
  } else {
    console.log('⏭️  数据库已有数据，跳过初始化');
  }

  // ===== 强制确保 admin 用户存在（修复首次部署失败的情况）=====
  const adminExists = await db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    console.log('📝 创建 admin 用户...');
    const hash = bcrypt.hashSync('123456', 10);
    await db.prepare('INSERT INTO users (username, password, display_name, is_admin, must_change_pwd) VALUES (?, ?, ?, 1, 0)').run('admin', hash, '系统管理员');
    console.log('✅ admin 用户已创建');
  }

  console.log('✅ 数据库初始化完成');
}

// 导出 init 函数，由 server.js 在启动时 await 调用
module.exports = { init };
