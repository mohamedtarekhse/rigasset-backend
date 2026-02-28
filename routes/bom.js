// routes/bom.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, canWrite, isAdminOrManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// ── GET /api/bom  ────────────────────────────────────────────
// Query: assetId, rigName, type, status, search
router.get('/', asyncHandler(async (req, res) => {
  const { assetId, rigName, type, status, search } = req.query;
  const params = [];
  const conditions = [];

  if (assetId) {
    params.push(assetId);
    conditions.push(`(a.id::text = $${params.length} OR a.asset_id = $${params.length})`);
  }
  if (rigName) {
    params.push(rigName);
    conditions.push(`r.name = $${params.length}`);
  }
  if (type) {
    params.push(type);
    conditions.push(`b.item_type = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`b.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(LOWER(b.name) LIKE $${params.length} OR LOWER(b.part_number) LIKE $${params.length} OR LOWER(b.serial_number) LIKE $${params.length})`);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const { rows } = await query(`
    SELECT
      b.*,
      a.name     AS asset_name,
      a.asset_id AS asset_code,
      r.name     AS rig_name,
      p.name     AS parent_name,
      (b.quantity * b.unit_cost_usd) AS total_cost
    FROM bom_items b
    LEFT JOIN assets   a ON a.id = b.asset_id
    LEFT JOIN rigs     r ON r.id = a.rig_id
    LEFT JOIN bom_items p ON p.id = b.parent_id
    ${where}
    ORDER BY a.asset_id, b.parent_id NULLS FIRST, b.name
  `, params);

  res.json(rows);
}));

// ── GET /api/bom/summary ─────────────────────────────────────
router.get('/summary', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT
      COUNT(*)                                                  AS total_items,
      COUNT(*) FILTER (WHERE item_type = 'Serialized')         AS serialized,
      COUNT(*) FILTER (WHERE item_type = 'Bulk')               AS bulk,
      COUNT(*) FILTER (WHERE status = 'On Order')              AS on_order,
      COALESCE(SUM(quantity * unit_cost_usd), 0)               AS total_value
    FROM bom_items
  `);
  res.json(rows[0]);
}));

// ── GET /api/bom/tree/:assetId ───────────────────────────────
// Returns hierarchical tree for one asset
router.get('/tree/:assetId', asyncHandler(async (req, res) => {
  const { rows: asset } = await query(
    'SELECT id, name, asset_id FROM assets WHERE id = $1 OR asset_id = $1',
    [req.params.assetId]
  );
  if (!asset.length) return res.status(404).json({ error: 'Asset not found' });

  const { rows } = await query(`
    SELECT b.*, p.name AS parent_name,
      (b.quantity * b.unit_cost_usd) AS total_cost
    FROM bom_items b
    LEFT JOIN bom_items p ON p.id = b.parent_id
    WHERE b.asset_id = $1
    ORDER BY b.parent_id NULLS FIRST, b.name
  `, [asset[0].id]);

  // Build tree recursively
  const buildTree = (items, parentId = null) =>
    items
      .filter(i => (parentId ? i.parent_id === parentId : !i.parent_id))
      .map(i => ({ ...i, children: buildTree(items, i.id) }));

  const totalCost = rows.reduce((s, i) => s + parseFloat(i.total_cost || 0), 0);

  res.json({
    asset: asset[0],
    items: rows,
    tree: buildTree(rows),
    summary: {
      total: rows.length,
      serialized: rows.filter(i => i.item_type === 'Serialized').length,
      bulk: rows.filter(i => i.item_type === 'Bulk').length,
      onOrder: rows.filter(i => i.status === 'On Order').length,
      totalCost,
    },
  });
}));

// ── GET /api/bom/:id ─────────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT b.*, a.name AS asset_name, a.asset_id AS asset_code,
      r.name AS rig_name, p.name AS parent_name,
      (b.quantity * b.unit_cost_usd) AS total_cost
    FROM bom_items b
    LEFT JOIN assets    a ON a.id = b.asset_id
    LEFT JOIN rigs      r ON r.id = a.rig_id
    LEFT JOIN bom_items p ON p.id = b.parent_id
    WHERE b.id = $1 OR b.bom_id = $1
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'BOM item not found' });
  res.json(rows[0]);
}));

// ── POST /api/bom ────────────────────────────────────────────
router.post('/', canWrite,
  [
    body('bomId').trim().notEmpty(),
    body('assetId').notEmpty(),
    body('name').trim().notEmpty(),
    body('itemType').isIn(['Serialized', 'Bulk']),
    body('quantity').isFloat({ min: 0 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      bomId, assetId, parentId, name, partNumber, itemType,
      serialNumber, manufacturer, quantity, uom = 'EA',
      unitCostUsd = 0, leadTimeDays = 0, status = 'Active', notes,
    } = req.body;

    // Resolve asset
    const { rows: ar } = await query(
      'SELECT id FROM assets WHERE id = $1 OR asset_id = $1', [assetId]
    );
    if (!ar.length) return res.status(404).json({ error: 'Asset not found' });

    const { rows } = await query(`
      INSERT INTO bom_items
        (bom_id, asset_id, parent_id, name, part_number, item_type,
         serial_number, manufacturer, quantity, uom, unit_cost_usd,
         lead_time_days, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [bomId, ar[0].id, parentId || null, name, partNumber || null, itemType,
        serialNumber || null, manufacturer || null, quantity, uom,
        unitCostUsd, leadTimeDays, status, notes || null]);

    res.status(201).json(rows[0]);
  })
);

// ── PUT /api/bom/:id ─────────────────────────────────────────
router.put('/:id', canWrite, asyncHandler(async (req, res) => {
  const {
    name, partNumber, itemType, serialNumber, manufacturer,
    quantity, uom, unitCostUsd, leadTimeDays, status, notes,
  } = req.body;

  const { rows } = await query(`
    UPDATE bom_items SET
      name           = COALESCE($1, name),
      part_number    = COALESCE($2, part_number),
      item_type      = COALESCE($3, item_type),
      serial_number  = COALESCE($4, serial_number),
      manufacturer   = COALESCE($5, manufacturer),
      quantity       = COALESCE($6, quantity),
      uom            = COALESCE($7, uom),
      unit_cost_usd  = COALESCE($8, unit_cost_usd),
      lead_time_days = COALESCE($9, lead_time_days),
      status         = COALESCE($10, status),
      notes          = COALESCE($11, notes)
    WHERE id = $12 OR bom_id = $12
    RETURNING *
  `, [name, partNumber, itemType, serialNumber, manufacturer,
      quantity, uom, unitCostUsd, leadTimeDays, status, notes, req.params.id]);

  if (!rows.length) return res.status(404).json({ error: 'BOM item not found' });
  res.json(rows[0]);
}));

// ── DELETE /api/bom/:id ──────────────────────────────────────
// Cascades to children via parent_id SET NULL, then deletes them too
router.delete('/:id', isAdminOrManager, asyncHandler(async (req, res) => {
  // Recursively collect all descendant IDs
  const { rows: all } = await query('SELECT id, bom_id, parent_id FROM bom_items');
  const collectIds = (pid) => {
    const ids = [pid];
    all.filter(i => i.parent_id === pid).forEach(c => ids.push(...collectIds(c.id)));
    return ids;
  };
  const { rows: target } = await query(
    'SELECT id FROM bom_items WHERE id = $1 OR bom_id = $1', [req.params.id]
  );
  if (!target.length) return res.status(404).json({ error: 'BOM item not found' });

  const idsToDelete = collectIds(target[0].id);
  await query(`DELETE FROM bom_items WHERE id = ANY($1::uuid[])`, [idsToDelete]);

  res.json({ message: `Deleted BOM item and ${idsToDelete.length - 1} child component(s)` });
}));

module.exports = router;
