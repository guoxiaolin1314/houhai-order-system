/**
 * 用户管理路由 — 仅 admin（is_admin=1）可操作
 * 包含用户CRUD + 权限管理
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { verifyToken } = require('../auth-middleware');

const router = express.Router();

// 所有接口需要登录 + 验证是 admin
router.use(verifyToken);

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.json({ code: 403, msg: '仅管理员可执行此操作' });
  }
  next();
}
router.use(requireAdmin);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const users = await db.prepare(`
      SELECT id, username, display_name, is_admin, is_active, must_change_pwd, last_login_at, created_at
      FROM users ORDER BY created_at DESC
    `).all();

    const result = [];
    for (const u of users) {
      const perms = await db.prepare('SELECT module, permission_level FROM user_permissions WHERE user_id = ?').all(u.id);
      const permMap = {};
      for (const p of perms) permMap[p.module] = p.permission_level;
      result.push({ ...u, permissions: permMap });
    }

    res.json({ code: 0, data: { users: result } });
  } catch (e) {
    console.error('[users] list error:', e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { username, display_name, password, permissions } = req.body;
    if (!username || !display_name || !password) {
      return res.json({ code: 400, msg: '请填写姓名、账号、密码' });
    }
    if (username.length < 2) return res.json({ code: 400, msg: '账号至少2位' });
    if (password.length < 4) return res.json({ code: 400, msg: '密码至少4位' });

    const db = getDb();
    const exist = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exist) return res.json({ code: 400, msg: '账号已存在' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.prepare(`
      INSERT INTO users (username, password, display_name, is_admin, must_change_pwd)
      VALUES (?, ?, ?, 0, 1)
    `).run(username, hash, display_name);

    if (permissions && typeof permissions === 'object') {
      for (const [module, level] of Object.entries(permissions)) {
        if (!['none', 'read', 'write'].includes(level)) continue;
        await db.prepare(`
          INSERT INTO user_permissions (user_id, module, permission_level) VALUES (?, ?, ?)
        `).run(result.lastInsertRowid || result.changes, module, level);
      }
    }

    await db.prepare("INSERT INTO audit_logs (user_id, username, action, detail) VALUES (?, ?, 'create_user', ?)")
      .run(req.user.uid, req.user.username, `创建用户 ${username}(${display_name})`);

    res.json({ code: 0, msg: '创建成功', data: { id: result.lastInsertRowid } });
  } catch (e) {
    console.error('[users] create error:', e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, is_active, password, permissions } = req.body;
    const db = getDb();

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.json({ code: 404, msg: '用户不存在' });

    const updates = [];
    const values = [];

    if (display_name !== undefined) { updates.push('display_name = ?'); values.push(display_name); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (password) {
      updates.push('password = ?');
      values.push(bcrypt.hashSync(password, 10));
      updates.push('must_change_pwd = 1');
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now','localtime')");
      values.push(id);
      await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    if (permissions && typeof permissions === 'object') {
      for (const [module, level] of Object.entries(permissions)) {
        if (!['none', 'read', 'write'].includes(level)) continue;
        await db.prepare(`
          INSERT INTO user_permissions (user_id, module, permission_level) VALUES (?, ?, ?)
          ON CONFLICT(user_id, module) DO UPDATE SET permission_level = excluded.permission_level
        `).run(parseInt(id), module, level);
      }
    }

    await db.prepare("INSERT INTO audit_logs (user_id, username, action, detail) VALUES (?, ?, 'update_user', ?)")
      .run(req.user.uid, req.user.username, `编辑用户 ${user.username}`);

    res.json({ code: 0, msg: '更新成功' });
  } catch (e) {
    console.error('[users] update error:', e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    if (parseInt(id) === req.user.uid) {
      return res.json({ code: 400, msg: '不能删除自己' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.json({ code: 404, msg: '用户不存在' });

    if (user.is_admin) {
      return res.json({ code: 400, msg: '不能删除管理员账号' });
    }

    await db.prepare('DELETE FROM users WHERE id = ?').run(id);

    await db.prepare("INSERT INTO audit_logs (user_id, username, action, detail) VALUES (?, ?, 'delete_user', ?)")
      .run(req.user.uid, req.user.username, `删除用户 ${user.username}(${user.display_name})`);

    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    console.error('[users] delete error:', e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
