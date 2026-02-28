// routes/contracts.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, canWrite, isAdminOrManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// ── GET /api/contracts ───────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { status, company, rig, search } = req.query;
  const params = [];
  const conditions = [];

  if (status)  { params.push(status);  conditions.push(`ct.status = $${params.length}`); }
  if (company) { params.push(company); conditions.push(`c.name = $${params.length}`); }
  if (rig)     { params.push(rig);     conditions.push(`r.name = $${params.length}`); }
  if (search)  {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(LOWER(ct.contract_no) LIKE $${params.length} OR LOWER(c.name) LIKE $${params.length})`);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const { rows } = await query(`
    SELECT
      ct.*,
      c.name  AS company_name,
      r.name  AS rig_name,
      r.rig_id AS rig_code,
      (ct.end_date - CURRENT_DATE) AS days_until_expiry,
      COUNT(a.id) AS asset_count
    FROM contracts ct
    LEFT JOIN companies c ON c.id = ct.company_id
    LEFT JOIN rigs      r ON r.id = ct.rig_id
    LEFT JOIN assets    a ON a.contract_id = ct.id
    ${where}
    GROUP BY ct.id, c.name, r.name, r.rig_id
    ORDER BY ct.end_date ASC
  `, params);

  res.json(rows);
}));

// ── GET /api/contracts/expiring ──────────────────────────────
// Returns contracts expiring within N days (default 30)
router.get('/expiring', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days || '30');
  const { rows } = await query(`
    SELECT ct.*, c.name AS company_name, r.name AS rig_name,
      (ct.end_date - CURRENT_DATE) AS days_until_expiry
    FROM contracts ct
    LEFT JOIN companies c ON c.id = ct.company_id
    LEFT JOIN rigs      r ON r.id = ct.rig_id
    WHERE ct.status = 'Active'
      AND ct.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1
    ORDER BY ct.end_date ASC
  `, [days]);
  res.json(rows);
}));

// ── GET /api/contracts/:id ───────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT ct.*, c.name AS company_name, c.contact_email,
      r.name AS rig_name, r.rig_id AS rig_code,
      (ct.end_date - CURRENT_DATE) AS days_until_expiry
    FROM contracts ct
    LEFT JOIN companies c ON c.id = ct.company_id
    LEFT JOIN rigs      r ON r.id = ct.rig_id
    WHERE ct.id = $1 OR ct.contract_no = $1
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Contract not found' });
  res.json(rows[0]);
}));

// ── POST /api/contracts ──────────────────────────────────────
router.post('/', canWrite,
  [
    body('contractNo').trim().notEmpty(),
    body('startDate').isDate(),
    body('endDate').isDate(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { contractNo, companyId, rigId, startDate, endDate, valueUsd = 0, status = 'Pending', notes } = req.body;

    const { rows } = await query(`
      INSERT INTO contracts (contract_no, company_id, rig_id, start_date, end_date, value_usd, status, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [contractNo, companyId || null, rigId || null, startDate, endDate,
        valueUsd, status, notes || null, req.user.id]);

    res.status(201).json(rows[0]);
  })
);

// ── PUT /api/contracts/:id ───────────────────────────────────
router.put('/:id', canWrite, asyncHandler(async (req, res) => {
  const { companyId, rigId, startDate, endDate, valueUsd, status, notes } = req.body;

  const { rows } = await query(`
    UPDATE contracts SET
      company_id = COALESCE($1, company_id),
      rig_id     = COALESCE($2, rig_id),
      start_date = COALESCE($3, start_date),
      end_date   = COALESCE($4, end_date),
      value_usd  = COALESCE($5, value_usd),
      status     = COALESCE($6, status),
      notes      = COALESCE($7, notes)
    WHERE id = $8 OR contract_no = $8
    RETURNING *
  `, [companyId, rigId, startDate, endDate, valueUsd, status, notes, req.params.id]);

  if (!rows.length) return res.status(404).json({ error: 'Contract not found' });
  res.json(rows[0]);
}));

// ── DELETE /api/contracts/:id ────────────────────────────────
router.delete('/:id', isAdminOrManager, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `DELETE FROM contracts WHERE id = $1 OR contract_no = $1 RETURNING contract_no`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Contract not found' });
  res.json({ message: `Contract ${rows[0].contract_no} deleted` });
}));

module.exports = router;
