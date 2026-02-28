// routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

const signAccess = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

const signRefresh = (userId) =>
  jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const { rows } = await query(
      'SELECT * FROM users WHERE email = $1', [email]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    if (user.status !== 'Active') {
      return res.status(403).json({ error: 'Account is inactive or suspended' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last_login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const accessToken  = signAccess(user.id, user.role);
    const refreshToken = signRefresh(user.id);

    // Store refresh token hash in DB
    const tokenHash = await bcrypt.hash(refreshToken, 6);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id:         user.id,
        fullName:   user.full_name,
        email:      user.email,
        role:       user.role,
        department: user.department,
      },
    });
  })
);

// ── POST /api/auth/register  (Admin only in production) ──────
router.post('/register',
  [
    body('fullName').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').optional().isIn(['Admin','Asset Manager','Operations Manager','Editor','Viewer']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { fullName, email, password, role = 'Viewer', department } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);

    const { rows } = await query(
      `INSERT INTO users (full_name, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role, department, created_at`,
      [fullName, email, passwordHash, role, department || null]
    );

    res.status(201).json({ user: rows[0], message: 'User created successfully' });
  })
);

// ── POST /api/auth/refresh ───────────────────────────────────
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  // Find stored tokens for this user and validate
  const { rows } = await query(
    'SELECT * FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW()',
    [decoded.userId]
  );

  let matched = false;
  for (const row of rows) {
    if (await bcrypt.compare(refreshToken, row.token_hash)) {
      matched = true;
      break;
    }
  }
  if (!matched) return res.status(401).json({ error: 'Refresh token not recognized' });

  const { rows: users } = await query(
    'SELECT id, role FROM users WHERE id = $1 AND status = $2',
    [decoded.userId, 'Active']
  );
  if (!users.length) return res.status(401).json({ error: 'User not found' });

  const newAccess = signAccess(users[0].id, users[0].role);
  res.json({ accessToken: newAccess });
}));

// ── POST /api/auth/logout ────────────────────────────────────
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);
  res.json({ message: 'Logged out successfully' });
}));

// ── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, full_name, email, role, department, status,
            alert_maint, alert_certs, alert_contracts, alert_assets,
            last_login, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  res.json(rows[0]);
}));

// ── PUT /api/auth/change-password ────────────────────────────
router.put('/change-password', authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  })
);

module.exports = router;
