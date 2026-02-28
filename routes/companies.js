// routes/companies.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, canWrite, isAdminOrManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// ── GET /api/companies ───────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const params = [];
  const conditions = [];

  if (status) { params.push(status); conditions.push(`c.status = $${params.length}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(LOWER(c.name) LIKE $${params.length} OR LOWER(c.contact_name) LIKE $${params.length})`);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const { rows } = await query(`
    SELECT
      c.*,
      COUNT(DISTINCT ct.id) AS contract_count,
      COUNT(DISTINCT r.id)  AS rig_count,
      COUNT(DISTINCT a.id)  AS asset_count
    FROM companies c
    LEFT JOIN contracts ct ON ct.company_id = c.id
    LEFT JOIN rigs      r  ON r.company_id  = c.id
    LEFT JOIN assets    a  ON a.company_id  = c.id
    ${where}
    GROUP BY c.id
    ORDER BY c.name
  `, params);

  res.json(rows);
}));

// ── GET /api/companies/:id ───────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM companies WHERE id = $1 OR company_code = $1`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Company not found' });
  res.json(rows[0]);
}));

// ── POST /api/companies ──────────────────────────────────────
router.post('/', canWrite,
  [
    body('companyCode').trim().notEmpty().withMessage('companyCode required'),
    body('name').trim().notEmpty().withMessage('name required'),
    body('type').isIn(['Drilling Contractor', 'Operator', 'Service Company', 'Other']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { companyCode, name, type, country, contactName, contactEmail, contactPhone, address, status = 'Active' } = req.body;

    const { rows } = await query(`
      INSERT INTO companies (company_code, name, type, country, contact_name, contact_email, contact_phone, address, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [companyCode, name, type, country || null, contactName || null,
        contactEmail || null, contactPhone || null, address || null, status]);

    res.status(201).json(rows[0]);
  })
);

// ── PUT /api/companies/:id ───────────────────────────────────
router.put('/:id', canWrite, asyncHandler(async (req, res) => {
  const { name, type, country, contactName, contactEmail, contactPhone, address, status } = req.body;

  const { rows } = await query(`
    UPDATE companies SET
      name          = COALESCE($1, name),
      type          = COALESCE($2, type),
      country       = COALESCE($3, country),
      contact_name  = COALESCE($4, contact_name),
      contact_email = COALESCE($5, contact_email),
      contact_phone = COALESCE($6, contact_phone),
      address       = COALESCE($7, address),
      status        = COALESCE($8, status)
    WHERE id = $9 OR company_code = $9
    RETURNING *
  `, [name, type, country, contactName, contactEmail, contactPhone, address, status, req.params.id]);

  if (!rows.length) return res.status(404).json({ error: 'Company not found' });
  res.json(rows[0]);
}));

// ── DELETE /api/companies/:id ────────────────────────────────
router.delete('/:id', isAdminOrManager, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `DELETE FROM companies WHERE id = $1 OR company_code = $1 RETURNING company_code, name`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Company not found' });
  res.json({ message: `Company ${rows[0].name} deleted` });
}));

module.exports = router;
