// routes/dashboard.js
const express = require('express');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// ── GET /api/dashboard ───────────────────────────────────────
// Returns all KPI data needed to populate the frontend dashboard
router.get('/', asyncHandler(async (req, res) => {
  const [assets, rigs, contracts, maint, transfers, notifications] = await Promise.all([

    // Asset KPIs
    query(`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE status = 'Active')         AS active,
        COUNT(*) FILTER (WHERE status = 'Maintenance')    AS maintenance,
        COUNT(*) FILTER (WHERE status = 'Contracted')     AS contracted,
        COUNT(*) FILTER (WHERE status = 'Inactive')       AS inactive,
        COUNT(*) FILTER (WHERE status = 'Standby')        AS standby,
        COALESCE(SUM(value_usd), 0)                       AS total_value,
        COUNT(DISTINCT rig_id)                            AS rigs_with_assets
      FROM assets
    `),

    // Rig KPIs
    query(`
      SELECT
        COUNT(*)                                            AS total,
        COUNT(*) FILTER (WHERE status = 'Active')           AS active,
        COUNT(*) FILTER (WHERE status = 'Maintenance')      AS maintenance,
        COUNT(*) FILTER (WHERE status = 'Standby')          AS standby
      FROM rigs
    `),

    // Contract KPIs
    query(`
      SELECT
        COUNT(*)                                                AS total,
        COUNT(*) FILTER (WHERE status = 'Active')               AS active,
        COUNT(*) FILTER (WHERE status = 'Pending')              AS pending,
        COUNT(*) FILTER (WHERE status = 'Expired')              AS expired,
        COALESCE(SUM(value_usd) FILTER (WHERE status='Active'), 0) AS active_value,
        COUNT(*) FILTER (
          WHERE status = 'Active'
            AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        ) AS expiring_soon
      FROM contracts
    `),

    // Maintenance KPIs (live status)
    query(`
      SELECT
        COUNT(*)                                                                        AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('Completed','Cancelled')
                          AND next_due_date < CURRENT_DATE)                            AS overdue,
        COUNT(*) FILTER (WHERE status NOT IN ('Completed','Cancelled')
                          AND next_due_date >= CURRENT_DATE
                          AND next_due_date <= CURRENT_DATE + alert_days)              AS due_soon,
        COUNT(*) FILTER (WHERE status = 'Completed')                                   AS completed,
        COUNT(*) FILTER (WHERE status = 'Scheduled'
                          AND next_due_date > CURRENT_DATE + alert_days)               AS scheduled
      FROM maintenance_schedules
    `),

    // Transfer KPIs
    query(`
      SELECT
        COUNT(*)                                               AS total,
        COUNT(*) FILTER (WHERE status = 'Pending')             AS pending,
        COUNT(*) FILTER (WHERE status = 'Ops Approved')        AS ops_approved,
        COUNT(*) FILTER (WHERE status = 'Completed')           AS completed,
        COUNT(*) FILTER (WHERE status = 'Rejected')            AS rejected
      FROM transfers
    `),

    // Unread notification count
    query(`
      SELECT COUNT(*) AS unread
      FROM notifications
      WHERE is_read = false AND (user_id IS NULL OR user_id = $1)
    `, [req.user.id]),
  ]);

  // Assets by rig (for rig selector pills)
  const { rows: byRig } = await query(`
    SELECT
      r.rig_id, r.name AS rig_name, r.status AS rig_status,
      COUNT(a.id) AS asset_count,
      COUNT(ms.id) FILTER (WHERE ms.next_due_date < CURRENT_DATE
        AND ms.status NOT IN ('Completed','Cancelled')) AS overdue_pm,
      COUNT(ms.id) FILTER (WHERE ms.next_due_date >= CURRENT_DATE
        AND ms.next_due_date <= CURRENT_DATE + ms.alert_days
        AND ms.status NOT IN ('Completed','Cancelled')) AS due_soon_pm
    FROM rigs r
    LEFT JOIN assets a ON a.rig_id = r.id
    LEFT JOIN maintenance_schedules ms ON ms.asset_id = a.id
    GROUP BY r.id, r.rig_id, r.name, r.status
    ORDER BY r.rig_id
  `);

  // Top 5 upcoming maintenance (overdue + due soon)
  const { rows: upcomingMaint } = await query(`
    SELECT ms.pm_id, ms.task_name, ms.priority, ms.next_due_date,
      (ms.next_due_date - CURRENT_DATE) AS days_until_due,
      a.name AS asset_name, a.asset_id AS asset_code,
      r.name AS rig_name,
      CASE
        WHEN ms.next_due_date < CURRENT_DATE THEN 'Overdue'
        ELSE 'Due Soon'
      END AS alert_type
    FROM maintenance_schedules ms
    LEFT JOIN assets a ON a.id = ms.asset_id
    LEFT JOIN rigs   r ON r.id = a.rig_id
    WHERE ms.status NOT IN ('Completed','Cancelled')
      AND ms.next_due_date <= CURRENT_DATE + ms.alert_days
    ORDER BY ms.next_due_date ASC
    LIMIT 10
  `);

  // Expiring contracts
  const { rows: expiringContracts } = await query(`
    SELECT ct.contract_no, ct.end_date,
      (ct.end_date - CURRENT_DATE) AS days_until_expiry,
      c.name AS company_name, r.name AS rig_name
    FROM contracts ct
    LEFT JOIN companies c ON c.id = ct.company_id
    LEFT JOIN rigs      r ON r.id = ct.rig_id
    WHERE ct.status = 'Active'
      AND ct.end_date <= CURRENT_DATE + 30
    ORDER BY ct.end_date ASC
  `);

  res.json({
    assets:           assets.rows[0],
    rigs:             rigs.rows[0],
    contracts:        contracts.rows[0],
    maintenance:      maint.rows[0],
    transfers:        transfers.rows[0],
    unreadNotifications: parseInt(notifications.rows[0].unread),
    byRig,
    upcomingMaintenance: upcomingMaint,
    expiringContracts,
    generatedAt: new Date().toISOString(),
  });
}));

module.exports = router;
