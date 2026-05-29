/**
 * 数据库连接层 — 双引擎
 *
 * 开发环境（无 DATABASE_URL）→ SQLite（better-sqlite3）
 * 生产环境（有 DATABASE_URL）→ PostgreSQL（pg）
 *
 * 统一返回 getDb()，调用方需 await：
 *   await db.prepare('SELECT ...').get(...)
 *   await db.prepare('SELECT ...').all(...)
 *   await db.prepare('INSERT ...').run(...)
 *   await db.exec('CREATE TABLE ...')
 */

const path = require('path');

let db;

/** 检测当前数据库类型 */
function dbType() {
  return process.env.DATABASE_URL ? 'pg' : 'sqlite';
}

/** ===== SQLite 实现（同步，用 better-sqlite3） ===== */
function createSqliteDb() {
  const Database = require('better-sqlite3');
  const fs = require('fs');
  const DB_PATH = path.join(__dirname, '..', 'data', 'order_flow.db');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // 包装成统一 async 接口（内部同步执行，返回 Promise.resolve）
  return {
    _raw: sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        get: (...params) => Promise.resolve(stmt.get(...params)),
        all: (...params) => Promise.resolve(stmt.all(...params)),
        run: (...params) => Promise.resolve(stmt.run(...params)),
      };
    },
    exec(sql) {
      return Promise.resolve(sqlite.exec(sql));
    },
    pragma(str) { sqlite.pragma(str); },
    close() { sqlite.close(); },
  };
}

/** ===== PostgreSQL 实现（异步，用 pg） ===== */
function createPgDb() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  /** 将 SQLite 的 ? 占位符转为 PostgreSQL 的 $1 $2 ... */
  function convertSql(sql, params) {
    let idx = 0;
    const converted = sql.replace(/\?/g, () => '$' + (++idx));
    return { sql: converted, params };
  }

  return {
    _pool: pool,
    prepare(sql) {
      return {
        get: async (...params) => {
          const { sql: psql, params: pparams } = convertSql(sql, params);
          const r = await pool.query(psql + ' LIMIT 1', pparams);
          return r.rows[0] || null;
        },
        all: async (...params) => {
          const { sql: psql, params: pparams } = convertSql(sql, params);
          const r = await pool.query(psql, pparams);
          return r.rows;
        },
        run: async (...params) => {
          const { sql: psql, params: pparams } = convertSql(sql, params);
          const r = await pool.query(psql, pparams);
          return { changes: r.rowCount };
        },
      };
    },
    exec(sql) {
      return pool.query(sql);
    },
    pragma() { /* no-op for PG */ },
    async close() { await pool.end(); },
  };
}

/** 获取数据库实例（单例） */
function getDb() {
  if (db) return db;

  if (dbType() === 'pg') {
    console.log('📦 连接 PostgreSQL...');
    db = createPgDb();
    console.log('✅ PostgreSQL 连接已建立');
  } else {
    console.log('📦 连接 SQLite...');
    db = createSqliteDb();
    console.log('✅ SQLite 连接已建立');
  }

  return db;
}

function close() {
  if (db) {
    if (db.close) db.close();
    db = null;
  }
}

module.exports = { getDb, close, dbType };