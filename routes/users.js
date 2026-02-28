// routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, isAdmin, isAdminOrManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

const SAFE_COLS = 'id, full_name, email, role, department, status, alert_maint, alert_certs, alert_contracts, alert_assets, last_login, created_at';

// ── GET /api/users ───────────────────────────────────────────
router.get('/', isAdminOrManager, asyncHandler(async (req, res) => {
  const { role, status, search } = req.query;
  const params = [];
  const conditions = [];

  if (role)   { params.push(role);   conditions.push(`role = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(LOWER(full_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await query(`SELECT ${SAFE_COLS} FROM users ${where} ORDER BY full_name`, params);
  res.json(rows);
}));

// ── GET /api/users/:id ───────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  // Users can only see their own record unless admin/manager
  const targetId = req.params.id === 'me' ? req.user.id : req.params.id;
  if (targetId !== req.user.id && !['Admin', 'Asset Manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { rows } = await query(
    `SELECT ${SAFE_COLS} FROM users WHERE id = $1`, [targetId]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}));

// ── POST /api/users  (Admin only) ───────────────────────────
router.post('/', isAdmin,
  [
    body('fullName').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('role').isIn(['Admin', 'Asset Manager', 'Operations Manager', 'Editor', 'Viewer']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { fullName, email, password, role, department } = req.body;
    const hash = await bcrypt.hash(password, 12);

    const { rows } = await query(`
      INSERT INTO users (full_name, email, password_hash, role, department)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING ${SAFE_COLS}
    `, [fullName, email, hash, role, department || null]);

    res.status(201).json(rows[0]);
  })
);

// ── PUT /api/users/:id ───────────────────────────────────────
router.put('/:id', asyncHandler(async (req, res) => {
  const targetId = req.params.id === 'me' ? req.user.id : req.params.id;

  // Non-admins can only edit themselves, and cannot change their own role/status
  const isOwnAccount = targetId === req.user.id;
  const isAdminUser  = req.user.role === 'Admin';

  if (!isOwnAccount && !isAdminUser) {
    return res.status(403).json({ error: 'Access denied' });
  }

  let { fullName, department, alertMaint, alertCerts, alertContracts, alertAssets } = req.body;
  // Only admins can change role/status
  const role   = isAdminUser ? req.body.role   : undefined;
  const status = isAdminUser ? req.body.status : undefined;

  const { rows } = await query(`
    UPDATE users SET
      full_name       = COALESCE($1, full_name),
      department      = COALESCE($2, department),
      alert_maint     = COALESCE($3, alert_maint),
      alert_certs     = COALESCE($4, alert_certs),
      alert_contracts = COALESCE($5, alert_contracts),
      alert_assets    = COALESCE($6, alert_assets),
      role            = COALESCE($7, role),
      status          = COALESCE($8, status)
    WHERE id = $9
    RETURNING ${SAFE_COLS}
  `, [fullName, department, alertMaint, alertCerts, alertContracts, alertAssets,
      role, status, targetId]);

  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}));

// ── DELETE /api/users/:id  (Admin only) ──────────────────────
router.delete('/:id', isAdmin, asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const { rows } = await query(
    'DELETE FROM users WHERE id = $1 RETURNING full_name, email', [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json({ message: `User ${rows[0].full_name} deleted` });
}));

// ── POST /api/users/:id/reset-password  (Admin only) ─────────
router.post('/:id/reset-password', isAdmin,
  [body('newPassword').isLength({ min: 8 })],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const hash = await bcrypt.hash(req.body.newPassword, 12);
    const { rows } = await query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING full_name',
      [hash, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `Password reset for ${rows[0].full_name}` });
  })
);

module.exports = router;
