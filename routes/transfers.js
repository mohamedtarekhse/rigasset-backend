// routes/transfers.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../config/db');
const { authenticate, canWrite, isAdminOrManager, isAdminOrOps, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// ── GET /api/transfers ───────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { status, priority, asset, search, page = 1, limit = 50 } = req.query;
  const params = [];
  const conditions = [];

  if (status) { params.push(status); conditions.push(`t.status = $${params.length}`); }
  if (priority) { params.push(priority); conditions.push(`t.priority = $${params.length}`); }
  if (asset) { params.push(asset); conditions.push(`(a.asset_id = $${params.length} OR a.id::text = $${params.length})`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(LOWER(t.transfer_id) LIKE $${params.length} OR LOWER(a.name) LIKE $${params.length} OR LOWER(t.destination) LIKE $${params.length})`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);

  const { rows } = await query(`
    SELECT
      t.*,
      a.name        AS asset_name,
      a.asset_id    AS asset_code,
      r.name        AS rig_name,
      dr.name       AS dest_rig_name,
      dc.name       AS dest_company_name,
      u.full_name   AS requested_by_name,
      ou.full_name  AS ops_approver_name,
      mu.full_name  AS mgr_approver_name
    FROM transfers t
    LEFT JOIN assets    a  ON a.id  = t.asset_id
    LEFT JOIN rigs      r  ON r.id  = a.rig_id
    LEFT JOIN rigs      dr ON dr.id = t.dest_rig_id
    LEFT JOIN companies dc ON dc.id = t.dest_company_id
    LEFT JOIN users     u  ON u.id  = t.requested_by
    LEFT JOIN users     ou ON ou.id = t.ops_approved_by
    LEFT JOIN users     mu ON mu.id = t.mgr_approved_by
    ${where}
    ORDER BY t.request_date DESC, t.transfer_id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  res.json({ data: rows, total: rows.length });
}));

// ── GET /api/transfers/:id ───────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT t.*, a.name AS asset_name, a.asset_id AS asset_code,
      r.name AS rig_name, dr.name AS dest_rig_name, dc.name AS dest_company_name,
      u.full_name AS requested_by_name,
      ou.full_name AS ops_approver_name, mu.full_name AS mgr_approver_name
    FROM transfers t
    LEFT JOIN assets    a  ON a.id  = t.asset_id
    LEFT JOIN rigs      r  ON r.id  = a.rig_id
    LEFT JOIN rigs      dr ON dr.id = t.dest_rig_id
    LEFT JOIN companies dc ON dc.id = t.dest_company_id
    LEFT JOIN users     u  ON u.id  = t.requested_by
    LEFT JOIN users     ou ON ou.id = t.ops_approved_by
    LEFT JOIN users     mu ON mu.id = t.mgr_approved_by
    WHERE t.id = $1 OR t.transfer_id = $1
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Transfer not found' });
  res.json(rows[0]);
}));

// ── POST /api/transfers ──────────────────────────────────────
router.post('/',
  canWrite,
  [
    body('transferId').trim().notEmpty(),
    body('assetId').notEmpty().withMessage('Asset is required'),
    body('destination').trim().notEmpty().withMessage('Destination is required'),
    body('reason').trim().notEmpty().withMessage('Reason is required'),
    body('priority').isIn(['Critical','High','Normal','Low']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      transferId, assetId, destination, destRigId, destCompanyId,
      priority, transferType = 'Field to Field', reason, instructions,
      requestDate, requiredDate,
    } = req.body;

    // Resolve asset
    const { rows: assetRows } = await query(
      'SELECT id, location FROM assets WHERE id = $1 OR asset_id = $1', [assetId]
    );
    if (!assetRows.length) return res.status(404).json({ error: 'Asset not found' });

    const { rows } = await query(`
      INSERT INTO transfers
        (transfer_id, asset_id, current_location, destination, dest_rig_id, dest_company_id,
         priority, transfer_type, reason, instructions, requested_by, request_date, required_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [transferId, assetRows[0].id, assetRows[0].location, destination,
        destRigId||null, destCompanyId||null, priority, transferType,
        reason, instructions||null, req.user.id,
        requestDate || new Date().toISOString().slice(0,10),
        requiredDate||null]);

    // Notify ops managers
    await query(`
      INSERT INTO notifications (user_id, type, icon, title, description, entity_type, entity_id)
      SELECT id, 'info', 'exchange-alt', 'New Transfer Request',
        $1, 'transfer', $2
      FROM users WHERE role = 'Operations Manager'
    `, [`Transfer request ${transferId} submitted for your review`, rows[0].id]);

    res.status(201).json(rows[0]);
  })
);

// ── POST /api/transfers/:id/approve-ops ──────────────────────
// Stage 1: Operations Manager approval
router.post('/:id/approve-ops',
  authorize('Admin', 'Operations Manager'),
  asyncHandler(async (req, res) => {
    const { action, comment } = req.body;
    if (!['approve','reject','hold'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve, reject, or hold' });
    }
    if (!comment?.trim()) {
      return res.status(400).json({ error: 'Decision comment is required' });
    }

    const { rows: tr } = await query(
      'SELECT * FROM transfers WHERE id = $1 OR transfer_id = $1', [req.params.id]
    );
    if (!tr.length) return res.status(404).json({ error: 'Transfer not found' });
    if (tr[0].status !== 'Pending') {
      return res.status(409).json({ error: `Transfer is already ${tr[0].status}` });
    }

    const newStatus = action === 'approve' ? 'Ops Approved' : action === 'reject' ? 'Rejected' : 'On Hold';

    const { rows } = await query(`
      UPDATE transfers SET
        ops_approved_by = $1, ops_action = $2,
        ops_date = CURRENT_DATE, ops_comment = $3, status = $4
      WHERE id = $5
      RETURNING *
    `, [req.user.id, action, comment, newStatus, tr[0].id]);

    // Notify Asset Managers if approved
    if (action === 'approve') {
      await query(`
        INSERT INTO notifications (user_id, type, icon, title, description, entity_type, entity_id)
        SELECT id, 'info', 'user-tie',
          'Transfer Awaiting Final Approval',
          $1, 'transfer', $2
        FROM users WHERE role IN ('Admin','Asset Manager')
      `, [`Transfer ${tr[0].transfer_id} approved by Ops Manager – needs your final decision`, tr[0].id]);
    }

    res.json(rows[0]);
  })
);

// ── POST /api/transfers/:id/approve-mgr ──────────────────────
// Stage 2: Asset Manager final approval
router.post('/:id/approve-mgr',
  authorize('Admin', 'Asset Manager'),
  asyncHandler(async (req, res) => {
    const { action, comment } = req.body;
    if (!['approve','reject','hold'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve, reject, or hold' });
    }
    if (!comment?.trim()) {
      return res.status(400).json({ error: 'Decision comment is required' });
    }

    const { rows: tr } = await query(
      'SELECT * FROM transfers WHERE id = $1 OR transfer_id = $1', [req.params.id]
    );
    if (!tr.length) return res.status(404).json({ error: 'Transfer not found' });
    if (tr[0].status !== 'Ops Approved') {
      return res.status(409).json({ error: `Transfer must be Ops Approved first (currently: ${tr[0].status})` });
    }

    const newStatus = action === 'approve' ? 'Completed' : action === 'reject' ? 'Rejected' : 'On Hold';

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(`
        UPDATE transfers SET
          mgr_approved_by = $1, mgr_action = $2,
          mgr_date = CURRENT_DATE, mgr_comment = $3, status = $4
        WHERE id = $5
        RETURNING *
      `, [req.user.id, action, comment, newStatus, tr[0].id]);

      // If fully approved → update asset location, rig, company
      if (action === 'approve') {
        await client.query(`
          UPDATE assets SET
            location   = $1,
            rig_id     = COALESCE($2, rig_id),
            company_id = COALESCE($3, company_id)
          WHERE id = $4
        `, [tr[0].destination, tr[0].dest_rig_id, tr[0].dest_company_id, tr[0].asset_id]);

        // Log asset history
        await client.query(`
          INSERT INTO asset_history (asset_id, action, changed_by, notes)
          VALUES ($1, 'Transfer Completed', $2, $3)
        `, [tr[0].asset_id, req.user.id, `Transferred to ${tr[0].destination} via ${tr[0].transfer_id}`]);

        // Broadcast completion notification
        await client.query(`
          INSERT INTO notifications (type, icon, title, description, entity_type, entity_id)
          VALUES ('success','check-double','Transfer Completed',$1,'transfer',$2)
        `, [`Transfer ${tr[0].transfer_id} fully approved – asset relocated`, tr[0].id]);
      }

      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ── DELETE /api/transfers/:id  (cancel pending only) ─────────
router.delete('/:id', canWrite, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `DELETE FROM transfers
     WHERE (id = $1 OR transfer_id = $1)
       AND status IN ('Pending','On Hold')
     RETURNING transfer_id`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Transfer not found or not cancellable' });
  res.json({ message: `Transfer ${rows[0].transfer_id} cancelled` });
}));

module.exports = router;
