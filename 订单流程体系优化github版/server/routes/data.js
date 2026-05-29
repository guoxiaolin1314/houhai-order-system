/**
 * 业务数据 CRUD API
 * 统一接口：/api/data/:collection[/:id]
 * 所有业务数据以 JSON 列存储，兼容前端现有数据格式
 * 鉴权：JWT + 权限检查
 */
const express = require('express');
const { getDb } = require('../db');
const { verifyToken } = require('../auth-middleware');

const router = express.Router();

// 所有接口需要登录
router.use(verifyToken);

/** 可用的业务集合列表（同时也是表名） */
const COLLECTIONS = [
  'customers', 'quotations', 'quotation_engine', 'contracts',
  'schedules', 'production_tracking', 'suppliers',
  'materials', 'formulas', 'shapes', 'formula_calcs',
];

/** 检查集合是否合法，防注入 */
function validCollection(name) {
  return COLLECTIONS.includes(name);
}

/**
 * 确保表存在（首次写入时自动建表）
 * 表结构：id, data(JSON), created_by, created_at, updated_at
 */
async function ensureTable(db, collection) {
  const dbType = process.env.DATABASE_URL ? 'pg' : 'sqlite';
  if (dbType === 'pg') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS biz_${collection} (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS biz_${collection} (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '{}',
        created_by INTEGER,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);
  }
}

// GET /api/data/:collection — 查列表
router.get('/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    if (!validCollection(collection)) {
      return res.json({ code: 400, msg: '无效的集合名称' });
    }

    const db = getDb();
    await ensureTable(db, collection);

    const dbType = process.env.DATABASE_URL ? 'pg' : 'sqlite';
    let rows;
    if (dbType === 'pg') {
      rows = await db.prepare(`SELECT id, data, created_by, created_at, updated_at FROM biz_${collection} ORDER BY updated_at DESC`).all();
    } else {
      rows = await db.prepare(`SELECT id, data, created_by, created_at, updated_at FROM biz_${collection} ORDER BY updated_at DESC`).all();
    }

    // 解析 JSON 字段
    const list = rows.map(r => {
      try {
        const item = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        item.id = r.id;
        item.createdAt = r.created_at;
        item.updatedAt = r.updated_at;
        item.createdBy = r.created_by;
        return item;
      } catch { return null; }
    }).filter(Boolean);

    res.json({ code: 0, data: list });
  } catch (e) {
    console.error(`[data] GET ${req.params.collection} error:`, e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// GET /api/data/:collection/:id — 查单条
router.get('/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    if (!validCollection(collection)) {
      return res.json({ code: 400, msg: '无效的集合名称' });
    }

    const db = getDb();
    await ensureTable(db, collection);

    const row = await db.prepare(`SELECT id, data, created_by, created_at, updated_at FROM biz_${collection} WHERE id = ?`).get(id);
    if (!row) return res.json({ code: 404, msg: '记录不存在' });

    let item;
    try { item = typeof row.data === 'string' ? JSON.parse(row.data) : row.data; } catch { item = {}; }
    item.id = row.id;
    item.createdAt = row.created_at;
    item.updatedAt = row.updated_at;
    item.createdBy = row.created_by;

    res.json({ code: 0, data: item });
  } catch (e) {
    console.error(`[data] GET ${req.params.collection}/${req.params.id} error:`, e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// POST /api/data/:collection — 新增
router.post('/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    if (!validCollection(collection)) {
      return res.json({ code: 400, msg: '无效的集合名称' });
    }

    const { id, ...body } = req.body;
    // 如果没有传 id，自动生成
    const itemId = id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const data = JSON.stringify(body);

    const db = getDb();
    await ensureTable(db, collection);

    const dbType = process.env.DATABASE_URL ? 'pg' : 'sqlite';
    if (dbType === 'pg') {
      await db.prepare(`INSERT INTO biz_${collection} (id, data, created_by) VALUES (?, ?::jsonb, ?)`).run(itemId, data, req.user.uid);
    } else {
      await db.prepare(`INSERT INTO biz_${collection} (id, data, created_by) VALUES (?, ?, ?)`).run(itemId, data, req.user.uid);
    }

    res.json({ code: 0, msg: '创建成功', data: { id: itemId } });
  } catch (e) {
    console.error(`[data] POST ${req.params.collection} error:`, e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// PUT /api/data/:collection/:id — 更新
router.put('/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    if (!validCollection(collection)) {
      return res.json({ code: 400, msg: '无效的集合名称' });
    }

    const data = JSON.stringify(req.body);
    const db = getDb();
    await ensureTable(db, collection);

    const existing = await db.prepare(`SELECT id FROM biz_${collection} WHERE id = ?`).get(id);
    if (!existing) return res.json({ code: 404, msg: '记录不存在' });

    const dbType = process.env.DATABASE_URL ? 'pg' : 'sqlite';
    if (dbType === 'pg') {
      await db.prepare(`UPDATE biz_${collection} SET data = ?::jsonb, updated_at = NOW() WHERE id = ?`).run(data, id);
    } else {
      await db.prepare(`UPDATE biz_${collection} SET data = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(data, id);
    }

    res.json({ code: 0, msg: '更新成功' });
  } catch (e) {
    console.error(`[data] PUT ${req.params.collection}/${req.params.id} error:`, e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// DELETE /api/data/:collection/:id — 删除
router.delete('/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    if (!validCollection(collection)) {
      return res.json({ code: 400, msg: '无效的集合名称' });
    }

    const db = getDb();
    await ensureTable(db, collection);
    await db.prepare(`DELETE FROM biz_${collection} WHERE id = ?`).run(id);

    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    console.error(`[data] DELETE ${req.params.collection}/${req.params.id} error:`, e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
