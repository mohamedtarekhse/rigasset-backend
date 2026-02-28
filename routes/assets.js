// routes/assets.js
const express = require('express');
const { body, query: qv, param, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, canWrite, isAdminOrManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// ── GET /api/assets ──────────────────────────────────────────
// Query params: rig, company, status, category, search, page, limit
router.get('/', asyncHandler(async (req, res) => {
  const { rig, company, status, category, search, page = 1, limit = 100 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conditions = [];

  if (rig) {
    params.push(rig);
    conditions.push(`r.name = $${params.length}`);
  }
  if (company) {
    params.push(company);
    conditions.push(`c.name = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`a.category = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(LOWER(a.asset_id) LIKE $${params.length} OR LOWER(a.name) LIKE $${params.length} OR LOWER(a.serial_number) LIKE $${params.length} OR LOWER(a.location) LIKE $${params.length})`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const sql = `
    SELECT
      a.id, a.asset_id, a.name, a.category, a.location, a.status,
      a.value_usd, a.acquisition_date, a.serial_number, a.manufacturer,
      a.model, a.notes, a.created_at, a.updated_at,
      r.name       AS rig_name,
      r.rig_id     AS rig_code,
      r.id         AS rig_id,
      c.name       AS company_name,
      c.company_code,
      c.id         AS company_id,
      ct.contract_no,
      ct.id        AS contract_id
    FROM assets a
    LEFT JOIN rigs      r  ON r.id  = a.rig_id
    LEFT JOIN companies c  ON c.id  = a.company_id
    LEFT JOIN contracts ct ON ct.id = a.contract_id
    ${where}
    ORDER BY a.asset_id
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(parseInt(limit), offset);

  const countSql = `
    SELECT COUNT(*) FROM assets a
    LEFT JOIN rigs      r ON r.id = a.rig_id
    LEFT JOIN companies c ON c.id = a.company_id
    ${where}
  `;
  const countParams = params.slice(0, -2);

  const [data, count] = await Promise.all([
    query(sql, params),
    query(countSql, countParams),
  ]);

  res.json({
    data: data.rows,
    total: parseInt(count.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit),
  });
}));

// ── GET /api/assets/summary ──────────────────────────────────
router.get('/summary', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE status = 'Active')         AS active,
      COUNT(*) FILTER (WHERE status = 'Maintenance')    AS maintenance,
      COUNT(*) FILTER (WHERE status = 'Contracted')     AS contracted,
      COUNT(*) FILTER (WHERE status = 'Inactive')       AS inactive,
      COALESCE(SUM(value_usd), 0)                       AS total_value,
      COUNT(DISTINCT rig_id)                            AS rigs_with_assets
    FROM assets
  `);
  res.json(rows[0]);
}));

// ── GET /api/assets/by-rig ───────────────────────────────────
router.get('/by-rig', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT
      r.rig_id, r.name AS rig_name, r.status AS rig_status,
      COUNT(a.id)                                       AS asset_count,
      COUNT(a.id) FILTER (WHERE a.status='Active')      AS active,
      COUNT(a.id) FILTER (WHERE a.status='Maintenance') AS maintenance,
      COALESCE(SUM(a.value_usd), 0)                     AS total_value
    FROM rigs r
    LEFT JOIN assets a ON a.rig_id = r.id
    GROUP BY r.id, r.rig_id, r.name, r.status
    ORDER BY r.rig_id
  `);
  res.json(rows);
}));

// ── GET /api/assets/:id ──────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT
      a.*, r.name AS rig_name, r.rig_id AS rig_code, r.id AS rig_id,
      c.name AS company_name, c.id AS company_id,
      ct.contract_no, ct.id AS contract_id, ct.start_date, ct.end_date, ct.value_usd AS contract_value
    FROM assets a
    LEFT JOIN rigs      r  ON r.id  = a.rig_id
    LEFT JOIN companies c  ON c.id  = a.company_id
    LEFT JOIN contracts ct ON ct.id = a.contract_id
    WHERE a.id = $1 OR a.asset_id = $1
  `, [req.params.id]);

  if (!rows.length) return res.status(404).json({ error: 'Asset not found' });
  res.json(rows[0]);
}));

// ── POST /api/assets ─────────────────────────────────────────
router.post('/',
  canWrite,
  [
    body('assetId').trim().notEmpty().withMessage('asset_id required'),
    body('name').trim().notEmpty(),
    body('category').isIn(['Drilling Equipment','Power Generation','Transportation','Safety Equipment','Communication','Other']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      assetId, name, category, rigId, companyId, contractId,
      location, status = 'Active', valueUsd = 0,
      acquisitionDate, serialNumber, manufacturer, model, notes,
    } = req.body;

    const { rows } = await query(`
      INSERT INTO assets
        (asset_id, name, category, rig_id, company_id, contract_id,
         location, status, value_usd, acquisition_date, serial_number,
         manufacturer, model, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [assetId, name, category, rigId||null, companyId||null, contractId||null,
        location, status, valueUsd, acquisitionDate||null, serialNumber||null,
        manufacturer||null, model||null, notes||null, req.user.id]);

    // Log creation in history
    await query(
      `INSERT INTO asset_history (asset_id, action, changed_by, new_values)
       VALUES ($1, 'Created', $2, $3)`,
      [rows[0].id, req.user.id, JSON.stringify(rows[0])]
    );

    res.status(201).json(rows[0]);
  })
);

// ── PUT /api/assets/:id ──────────────────────────────────────
router.put('/:id', canWrite, asyncHandler(async (req, res) => {
  const { rows: existing } = await query(
    'SELECT * FROM assets WHERE id = $1 OR asset_id = $1', [req.params.id]
  );
  if (!existing.length) return res.status(404).json({ error: 'Asset not found' });

  const old = existing[0];
  const {
    name, category, rigId, companyId, contractId,
    location, status, valueUsd, acquisitionDate,
    serialNumber, manufacturer, model, notes,
  } = req.body;

  const { rows } = await query(`
    UPDATE assets SET
      name = COALESCE($1, name),
      category = COALESCE($2, category),
      rig_id = COALESCE($3, rig_id),
      company_id = COALESCE($4, company_id),
      contract_id = COALESCE($5, contract_id),
      location = COALESCE($6, location),
      status = COALESCE($7, status),
      value_usd = COALESCE($8, value_usd),
      acquisition_date = COALESCE($9, acquisition_date),
      serial_number = COALESCE($10, serial_number),
      manufacturer = COALESCE($11, manufacturer),
      model = COALESCE($12, model),
      notes = COALESCE($13, notes)
    WHERE id = $14
    RETURNING *
  `, [name, category, rigId, companyId, contractId, location, status,
      valueUsd, acquisitionDate, serialNumber, manufacturer, model, notes, old.id]);

  await query(
    `INSERT INTO asset_history (asset_id, action, changed_by, old_values, new_values)
     VALUES ($1, 'Updated', $2, $3, $4)`,
    [old.id, req.user.id, JSON.stringify(old), JSON.stringify(rows[0])]
  );

  res.json(rows[0]);
}));

// ── DELETE /api/assets/:id ───────────────────────────────────
router.delete('/:id', isAdminOrManager, asyncHandler(async (req, res) => {
  const { rows } = await query(
    'DELETE FROM assets WHERE id = $1 OR asset_id = $1 RETURNING asset_id, name',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Asset not found' });
  res.json({ message: `Asset ${rows[0].asset_id} deleted`, asset: rows[0] });
}));

// ── GET /api/assets/:id/history ──────────────────────────────
router.get('/:id/history', asyncHandler(async (req, res) => {
  const { rows: asset } = await query(
    'SELECT id FROM assets WHERE id = $1 OR asset_id = $1', [req.params.id]
  );
  if (!asset.length) return res.status(404).json({ error: 'Asset not found' });

  const { rows } = await query(`
    SELECT h.*, u.full_name AS changed_by_name
    FROM asset_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.asset_id = $1
    ORDER BY h.created_at DESC
    LIMIT 50
  `, [asset[0].id]);

  res.json(rows);
}));

module.exports = router;
