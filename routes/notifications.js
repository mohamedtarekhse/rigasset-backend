// routes/notifications.js
const express = require('express');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// ── GET /api/notifications ───────────────────────────────────
// Returns notifications for current user + broadcast (user_id IS NULL)
router.get('/', asyncHandler(async (req, res) => {
  const { unread, limit = 50 } = req.query;

  const conditions = ['(n.user_id = $1 OR n.user_id IS NULL)'];
  const params = [req.user.id];

  if (unread === 'true') {
    conditions.push('n.is_read = false');
  }

  const { rows } = await query(`
    SELECT n.*, a.asset_id AS entity_code
    FROM notifications n
    LEFT JOIN assets a ON a.id = n.entity_id AND n.entity_type = 'asset'
    WHERE ${conditions.join(' AND ')}
    ORDER BY n.created_at DESC
    LIMIT $${params.length + 1}
  `, [...params, parseInt(limit)]);

  const unreadCount = rows.filter(r => !r.is_read).length;
  res.json({ notifications: rows, unreadCount });
}));

// ── PUT /api/notifications/read-all ─────────────────────────
router.put('/read-all', asyncHandler(async (req, res) => {
  await query(
    `UPDATE notifications SET is_read = true
     WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false`,
    [req.user.id]
  );
  res.json({ message: 'All notifications marked as read' });
}));

// ── PUT /api/notifications/:id/read ─────────────────────────
router.put('/:id/read', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = true WHERE id = $1', [req.params.id]);
  res.json({ message: 'Notification marked as read' });
}));

// ── DELETE /api/notifications/:id ───────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  await query(
    'DELETE FROM notifications WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)',
    [req.params.id, req.user.id]
  );
  res.json({ message: 'Notification deleted' });
}));

// ── DELETE /api/notifications (clear all read) ───────────────
router.delete('/', asyncHandler(async (req, res) => {
  const { rowCount } = await query(
    `DELETE FROM notifications
     WHERE (user_id = $1 OR user_id IS NULL) AND is_read = true`,
    [req.user.id]
  );
  res.json({ message: `${rowCount} read notifications cleared` });
}));

module.exports = router;
