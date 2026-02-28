// middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

// ── Verify access token ──────────────────────────────────────
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Fetch fresh user from DB to ensure account is still active
    const { rows } = await query(
      'SELECT id, full_name, email, role, department, status FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!rows.length || rows[0].status !== 'Active') {
      return res.status(401).json({ error: 'Account not found or inactive' });
    }
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ── Role-based authorization factory ────────────────────────
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Access denied. Required role: ${roles.join(' or ')}`,
      yourRole: req.user.role,
    });
  }
  next();
};

// Shorthand guards
const isAdmin = authorize('Admin');
const isAdminOrManager = authorize('Admin', 'Asset Manager');
const isAdminOrOps = authorize('Admin', 'Operations Manager');
const canWrite = authorize('Admin', 'Asset Manager', 'Operations Manager', 'Editor');

module.exports = { authenticate, authorize, isAdmin, isAdminOrManager, isAdminOrOps, canWrite };
