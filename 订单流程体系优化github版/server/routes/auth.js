/**
 * 认证路由 — 登录 / 验证 / 改密
 * 纯用户权限：admin（is_admin=1）自动全权限，普通用户从 user_permissions 表读取
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { signToken, verifyToken } = require('../auth-middleware');

const router = express.Router();

/** 获取用户权限（admin=全部write，普通用户查user_permissions表） */
async function getUserPermissions(db, userId, isAdmin) {
  if (isAdmin) {
    const modules = await db.prepare('SELECT key FROM modules').all();
    const map = {};
    for (const m of modules) map[m.key] = 'write';
    // 如果模块表为空，直接给 admin 全权限（防止部署异常）
    if (Object.keys(map).length === 0) {
      const fallback = ['dashboard','quotation-engine','quote-doc','contract',
        'schedule','production-tracking','customer','supplier',
        'material','formula','shape','formula-calc',
        'user-manager','audit-log'];
      for (const k of fallback) map[k] = 'write';
    }
    return map;
  }
  const perms = await db.prepare('SELECT module, permission_level FROM user_permissions WHERE user_id = ?').all(userId);
  const map = {};
  for (const p of perms) map[p.module] = p.permission_level;
  return map;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ code: 400, msg: '请输入账号和密码' });
    }

    const db = getDb();
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.json({ code: 401, msg: '账号或密码错误' });
    }

    if (!user.is_active) {
      return res.json({ code: 401, msg: '账号已被禁用，请联系管理员' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.json({ code: 401, msg: '账号或密码错误' });
    }

    await db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(user.id);

    const permissions = await getUserPermissions(db, user.id, user.is_admin);
    const token = signToken({
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
      display_name: user.display_name,
    });

    res.json({
      code: 0,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          is_admin: !!user.is_admin,
          must_change_pwd: !!user.must_change_pwd,
        },
        permissions,
      }
    });
  } catch (e) {
    console.error('[auth] login error:', e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// POST /api/auth/verify
router.post('/verify', verifyToken, async (req, res) => {
  try {
    const db = getDb();
    const user = await db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(req.user.uid);
    if (!user) {
      return res.json({ code: 401, msg: '用户不存在或已被禁用' });
    }

    const permissions = await getUserPermissions(db, user.id, user.is_admin);

    res.json({
      code: 0,
      data: {
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          is_admin: !!user.is_admin,
          must_change_pwd: !!user.must_change_pwd,
        },
        permissions,
      }
    });
  } catch (e) {
    console.error('[auth] verify error:', e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', verifyToken, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      return res.json({ code: 400, msg: '请提供旧密码和新密码' });
    }
    if (new_password.length < 4) {
      return res.json({ code: 400, msg: '密码至少4位' });
    }

    const db = getDb();
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.uid);
    if (!user) return res.json({ code: 401, msg: '用户不存在' });

    if (!bcrypt.compareSync(old_password, user.password)) {
      return res.json({ code: 400, msg: '旧密码错误' });
    }

    const hash = bcrypt.hashSync(new_password, 10);
    await db.prepare("UPDATE users SET password = ?, must_change_pwd = 0, updated_at = datetime('now','localtime') WHERE id = ?").run(hash, user.id);

    res.json({ code: 0, msg: '密码修改成功' });
  } catch (e) {
    console.error('[auth] change-password error:', e);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
