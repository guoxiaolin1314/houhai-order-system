/**
 * JWT 鉴权中间件
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'order-flow-dev-secret-key-2026';
const JWT_EXPIRES = '7d';

/** 生成 token */
function signToken(user) {
  return jwt.sign(
    {
      uid: user.id,
      username: user.username,
      is_admin: user.is_admin,
      display_name: user.display_name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

/** 验证 token — 中间件 */
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, msg: '未登录或token已过期' });
  }
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, msg: 'token无效或已过期' });
  }
}

module.exports = { signToken, verifyToken, JWT_SECRET };
