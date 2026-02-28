-- ═══════════════════════════════════════════════════════════════
--  RigAsset Pro  –  PostgreSQL Schema  (Revised v2)
--  Run: psql -U postgres -d rigasset_db -f schema.sql
--
--  Changes from v1:
--    • transfers.transfer_type  → added CHECK constraint (7 types from UI)
--    • bom_items.parent_id      → ON DELETE CASCADE (orphan fix)
--    • bom_items / assets       → CHECK (value/qty/cost >= 0)
--    • contracts                → CHECK (end_date >= start_date), added currency
--    • certificates             → added rig_id FK, created_by, CHECK dates
--    • maintenance_schedules    → CHECK dates, added work_order_no
--    • maintenance_logs         → added completed_by_user_id FK
--    • rigs                     → added rig_number INT, mast_height_ft, max_hook_load_ton
--    • assets                   → added year_manufactured, weight_kg, dimensions
--    • users                    → added phone, avatar_color; initials GENERATED column
--    • notifications            → added CHECK on entity_type values
--    • New: work_orders table
--    • New: audit_log table
--    • New: v_contracts view
--    • New: v_bom_summary view
--    • New: v_certificates view
--    • New: v_dashboard_summary view
--    • v_maintenance             → 'In Progress' kept as-is (not overridden to Overdue)
--    • More indexes: contracts.end_date, assets.serial_number, partial on notif.is_read
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════
--  TABLES
-- ═══════════════════════════════════════════════════════════════

-- ─── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name       TEXT          NOT NULL,
  email           TEXT          UNIQUE NOT NULL,
  password_hash   TEXT          NOT NULL,
  role            TEXT          NOT NULL DEFAULT 'Viewer'
                                CHECK (role IN (
                                  'Admin','Asset Manager',
                                  'Operations Manager','Editor','Viewer'
                                )),
  department      TEXT,
  phone           TEXT,
  initials        TEXT          GENERATED ALWAYS AS (
                                  LEFT(UPPER(TRIM(full_name)),1) ||
                                  COALESCE(LEFT(UPPER(TRIM(SPLIT_PART(full_name,' ',2))),1),'')
                                ) STORED,
  avatar_color    TEXT          NOT NULL DEFAULT '#0070F2',
  status          TEXT          NOT NULL DEFAULT 'Active'
                                CHECK (status IN ('Active','Inactive','Suspended')),
  alert_maint     BOOLEAN       NOT NULL DEFAULT true,
  alert_certs     BOOLEAN       NOT NULL DEFAULT true,
  alert_contracts BOOLEAN       NOT NULL DEFAULT false,
  alert_assets    BOOLEAN       NOT NULL DEFAULT false,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users IS 'Application users with role-based access control';
COMMENT ON COLUMN users.initials     IS 'Auto-generated 2-char initials from full_name for avatar display';
COMMENT ON COLUMN users.avatar_color IS 'Hex colour for avatar circle in the UI';

-- ─── COMPANIES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_code    TEXT          UNIQUE NOT NULL,
  name            TEXT          NOT NULL,
  type            TEXT          NOT NULL DEFAULT 'Drilling Contractor'
                                CHECK (type IN (
                                  'Drilling Contractor','Operator',
                                  'Service Company','Other'
                                )),
  country         TEXT,
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  address         TEXT,
  website         TEXT,
  status          TEXT          NOT NULL DEFAULT 'Active'
                                CHECK (status IN ('Active','Inactive')),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── RIGS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rigs (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  rig_id            TEXT        UNIQUE NOT NULL,     -- 'RIG01' … 'RIG14'
  rig_number        INTEGER     UNIQUE,              -- 1 … 14  (for ORDER BY rig_number)
  name              TEXT        UNIQUE NOT NULL,     -- 'Rig 1' … 'Rig 14'
  type              TEXT        NOT NULL
                                CHECK (type IN (
                                  'AC Drive','Mechanical','Electric','SCR','Other'
                                )),
  company_id        UUID        REFERENCES companies(id) ON DELETE SET NULL,
  location          TEXT,
  depth_capacity    TEXT,                            -- human-readable, e.g. '25,000 ft'
  depth_capacity_ft INTEGER     CHECK (depth_capacity_ft IS NULL OR depth_capacity_ft > 0),
  horsepower        INTEGER     CHECK (horsepower        IS NULL OR horsepower        > 0),
  mast_height_ft    INTEGER     CHECK (mast_height_ft    IS NULL OR mast_height_ft    > 0),
  max_hook_load_ton INTEGER     CHECK (max_hook_load_ton IS NULL OR max_hook_load_ton > 0),
  status            TEXT        NOT NULL DEFAULT 'Active'
                                CHECK (status IN ('Active','Maintenance','Standby','Retired')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN rigs.rig_number       IS 'Integer 1-14 for natural sort order';
COMMENT ON COLUMN rigs.depth_capacity   IS 'Human-readable depth string, e.g. "25,000 ft"';
COMMENT ON COLUMN rigs.depth_capacity_ft IS 'Numeric feet value for filtering / sorting';

-- ─── CONTRACTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_no     TEXT          UNIQUE NOT NULL,
  company_id      UUID          REFERENCES companies(id) ON DELETE SET NULL,
  rig_id          UUID          REFERENCES rigs(id)      ON DELETE SET NULL,
  start_date      DATE          NOT NULL,
  end_date        DATE          NOT NULL,
  value_usd       NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (value_usd >= 0),
  currency        TEXT          NOT NULL DEFAULT 'USD',
  status          TEXT          NOT NULL DEFAULT 'Pending'
                                CHECK (status IN ('Active','Pending','Expired','Terminated')),
  notes           TEXT,
  created_by      UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_contract_dates CHECK (end_date >= start_date)
);

COMMENT ON COLUMN contracts.currency IS 'ISO 4217 currency code (default USD)';

-- ─── ASSETS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id         TEXT         UNIQUE NOT NULL,     -- 'AST-001' … 'AST-024'+
  name             TEXT         NOT NULL,
  category         TEXT         NOT NULL
                                CHECK (category IN (
                                  'Drilling Equipment','Power Generation',
                                  'Transportation','Safety Equipment',
                                  'Communication','Other'
                                )),
  company_id       UUID         REFERENCES companies(id) ON DELETE SET NULL,
  rig_id           UUID         REFERENCES rigs(id)      ON DELETE SET NULL,
  contract_id      UUID         REFERENCES contracts(id) ON DELETE SET NULL,
  location         TEXT,
  status           TEXT         NOT NULL DEFAULT 'Active'
                                CHECK (status IN (
                                  'Active','Maintenance','Inactive',
                                  'Contracted','Retired','Standby'
                                )),
  value_usd        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (value_usd >= 0),
  acquisition_date DATE,
  year_manufactured INTEGER     CHECK (
                                  year_manufactured IS NULL OR
                                  (year_manufactured >= 1950 AND year_manufactured <= 2100)
                                ),
  serial_number    TEXT,
  manufacturer     TEXT,
  model            TEXT,
  weight_kg        NUMERIC(10,2) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  dimensions       TEXT,        -- e.g. '2.4m × 1.2m × 1.8m'
  notes            TEXT,
  created_by       UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN assets.year_manufactured IS 'Year the equipment was manufactured (1950-2100)';
COMMENT ON COLUMN assets.dimensions        IS 'Free-text physical dimensions, e.g. "2.4m × 1.2m × 1.8m"';

-- Asset change history
CREATE TABLE IF NOT EXISTS asset_history (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id    UUID         NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  action      TEXT         NOT NULL,
  changed_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  old_values  JSONB,
  new_values  JSONB,
  notes       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── BILL OF MATERIALS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bom_items (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id         TEXT          UNIQUE NOT NULL,   -- 'BOM-001' …
  asset_id       UUID          NOT NULL REFERENCES assets(id)    ON DELETE CASCADE,
  -- CASCADE: deleting a parent node removes its children (no orphan subtrees)
  parent_id      UUID          REFERENCES bom_items(id)          ON DELETE CASCADE,
  name           TEXT          NOT NULL,
  part_number    TEXT,
  item_type      TEXT          NOT NULL DEFAULT 'Serialized'
                               CHECK (item_type IN ('Serialized','Bulk')),
  serial_number  TEXT,
  manufacturer   TEXT,
  quantity       NUMERIC(12,3) NOT NULL DEFAULT 1   CHECK (quantity       >= 0),
  uom            TEXT          NOT NULL DEFAULT 'EA'
                               CHECK (uom IN ('EA','SET','KG','L','M','FT','BOX','PCS','KIT')),
  unit_cost_usd  NUMERIC(18,2) NOT NULL DEFAULT 0   CHECK (unit_cost_usd  >= 0),
  lead_time_days INTEGER       NOT NULL DEFAULT 0   CHECK (lead_time_days >= 0),
  status         TEXT          NOT NULL DEFAULT 'Active'
                               CHECK (status IN ('Active','Inactive','Obsolete','On Order')),
  notes          TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN bom_items.parent_id IS 'Self-ref FK; DELETE CASCADE removes entire subtree with parent';

-- ─── CERTIFICATES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  cert_no      TEXT          UNIQUE NOT NULL,
  asset_id     UUID          REFERENCES assets(id) ON DELETE CASCADE,
  rig_id       UUID          REFERENCES rigs(id)   ON DELETE CASCADE,
  cert_type    TEXT          NOT NULL,
  issued_by    TEXT,
  issue_date   DATE,
  expiry_date  DATE,
  document_url TEXT,
  status       TEXT          NOT NULL DEFAULT 'Valid'
                             CHECK (status IN ('Valid','Expiring','Expired','Revoked')),
  notes        TEXT,
  created_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cert_owner CHECK (asset_id IS NOT NULL OR rig_id IS NOT NULL),
  CONSTRAINT chk_cert_dates CHECK (
    issue_date IS NULL OR expiry_date IS NULL OR expiry_date >= issue_date
  )
);

COMMENT ON COLUMN certificates.rig_id IS 'Cert may belong to a rig (API 4F mast cert) or an asset — one must be set';

-- ─── MAINTENANCE SCHEDULES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  pm_id            TEXT          UNIQUE NOT NULL,   -- 'PM-001' …
  asset_id         UUID          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  task_name        TEXT          NOT NULL,
  task_type        TEXT          NOT NULL
                                 CHECK (task_type IN (
                                   'Oil Change','Inspection','Calibration','Overhaul',
                                   'Filter Replacement','Lubrication','Pressure Test',
                                   'Electrical Check','Safety Check','General Service'
                                 )),
  priority         TEXT          NOT NULL DEFAULT 'Normal'
                                 CHECK (priority IN ('Critical','High','Normal','Low')),
  frequency_days   INTEGER       NOT NULL DEFAULT 30  CHECK (frequency_days   > 0),
  last_done_date   DATE,
  next_due_date    DATE          NOT NULL,
  alert_days       INTEGER       NOT NULL DEFAULT 14  CHECK (alert_days      >= 0),
  technician       TEXT,
  estimated_hours  NUMERIC(6,2)  CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  estimated_cost   NUMERIC(18,2) CHECK (estimated_cost  IS NULL OR estimated_cost  >= 0),
  work_order_no    TEXT,         -- optional link to external CMMS / ERP work order
  status           TEXT          NOT NULL DEFAULT 'Scheduled'
                                 CHECK (status IN (
                                   'Scheduled','In Progress','Completed','Cancelled'
                                 )),
  notes            TEXT,
  created_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_maint_dates CHECK (
    last_done_date IS NULL OR next_due_date >= last_done_date
  )
);

COMMENT ON COLUMN maintenance_schedules.work_order_no IS 'Optional ref to external CMMS/ERP work order number';

-- Maintenance completion log
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id          UUID          NOT NULL REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
  completion_date      DATE          NOT NULL,
  completed_by         TEXT          NOT NULL,
  completed_by_user_id UUID          REFERENCES users(id) ON DELETE SET NULL,
  actual_hours         NUMERIC(6,2)  CHECK (actual_hours IS NULL OR actual_hours >= 0),
  actual_cost          NUMERIC(18,2) CHECK (actual_cost  IS NULL OR actual_cost  >= 0),
  parts_used           TEXT,
  work_notes           TEXT,
  next_due_date        DATE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN maintenance_logs.completed_by         IS 'Free-text technician name';
COMMENT ON COLUMN maintenance_logs.completed_by_user_id IS 'Optional FK to users table if technician has an account';

-- ─── WORK ORDERS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_orders (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  wo_number        TEXT          UNIQUE NOT NULL,   -- 'WO-2025-001'
  schedule_id      UUID          REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
  asset_id         UUID          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  title            TEXT          NOT NULL,
  description      TEXT,
  priority         TEXT          NOT NULL DEFAULT 'Normal'
                                 CHECK (priority IN ('Critical','High','Normal','Low')),
  assigned_to      UUID          REFERENCES users(id) ON DELETE SET NULL,
  assigned_team    TEXT,
  planned_start    DATE,
  planned_end      DATE,
  actual_start     TIMESTAMPTZ,
  actual_end       TIMESTAMPTZ,
  estimated_hours  NUMERIC(6,2)  CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  actual_hours     NUMERIC(6,2)  CHECK (actual_hours    IS NULL OR actual_hours    >= 0),
  estimated_cost   NUMERIC(18,2) CHECK (estimated_cost  IS NULL OR estimated_cost  >= 0),
  actual_cost      NUMERIC(18,2) CHECK (actual_cost     IS NULL OR actual_cost     >= 0),
  status           TEXT          NOT NULL DEFAULT 'Open'
                                 CHECK (status IN (
                                   'Open','In Progress','On Hold','Completed','Cancelled'
                                 )),
  completion_notes TEXT,
  created_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_wo_dates CHECK (
    planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start
  )
);

-- ─── ASSET TRANSFERS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfers (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id       TEXT          UNIQUE NOT NULL,   -- 'TR-001' …
  asset_id          UUID          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  current_location  TEXT          NOT NULL,
  destination       TEXT          NOT NULL,
  dest_rig_id       UUID          REFERENCES rigs(id)      ON DELETE SET NULL,
  dest_company_id   UUID          REFERENCES companies(id) ON DELETE SET NULL,
  priority          TEXT          NOT NULL DEFAULT 'Normal'
                                  CHECK (priority IN ('Critical','High','Normal','Low')),
  transfer_type     TEXT          NOT NULL DEFAULT 'Field to Field'
                                  CHECK (transfer_type IN (
                                    'Field to Field',
                                    'Field to Warehouse',
                                    'Warehouse to Field',
                                    'Rig to Rig',
                                    'For Maintenance',
                                    'For Inspection',
                                    'Return to Owner'
                                  )),
  reason            TEXT          NOT NULL,
  instructions      TEXT,
  requested_by      UUID          REFERENCES users(id) ON DELETE SET NULL,
  request_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
  required_date     DATE,
  status            TEXT          NOT NULL DEFAULT 'Pending'
                                  CHECK (status IN (
                                    'Pending','Ops Approved','Completed',
                                    'Rejected','On Hold'
                                  )),
  -- Stage 1 — Operations Manager
  ops_approved_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
  ops_action        TEXT          CHECK (ops_action IN ('approve','reject','hold')),
  ops_date          DATE,
  ops_comment       TEXT,
  -- Stage 2 — Asset Manager
  mgr_approved_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
  mgr_action        TEXT          CHECK (mgr_action IN ('approve','reject','hold')),
  mgr_date          DATE,
  mgr_comment       TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transfer_dates CHECK (
    required_date IS NULL OR required_date >= request_date
  )
);

-- ─── NOTIFICATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          REFERENCES users(id) ON DELETE CASCADE, -- NULL = broadcast
  type        TEXT          NOT NULL DEFAULT 'info'
                            CHECK (type IN ('info','success','warning','error')),
  icon        TEXT          NOT NULL DEFAULT 'bell',
  title       TEXT          NOT NULL,
  description TEXT,
  entity_type TEXT          CHECK (entity_type IN (
                              'asset','maintenance','transfer',
                              'contract','certificate','work_order'
                            )),
  entity_id   UUID,
  is_read     BOOLEAN       NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN notifications.user_id IS 'NULL = broadcast notification visible to all users';

-- ─── AUDIT LOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name  TEXT          NOT NULL,
  record_id   UUID          NOT NULL,
  action      TEXT          NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_by  UUID          REFERENCES users(id) ON DELETE SET NULL,
  ip_address  INET,
  old_data    JSONB,
  new_data    JSONB,
  changed_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Immutable system-wide audit trail for all significant data changes';

-- ─── REFRESH TOKENS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT          NOT NULL,
  expires_at  TIMESTAMPTZ   NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
--  INDEXES
-- ═══════════════════════════════════════════════════════════════

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status         ON users(status);

-- Companies
CREATE INDEX IF NOT EXISTS idx_companies_status     ON companies(status);

-- Rigs
CREATE INDEX IF NOT EXISTS idx_rigs_company         ON rigs(company_id);
CREATE INDEX IF NOT EXISTS idx_rigs_status          ON rigs(status);
CREATE INDEX IF NOT EXISTS idx_rigs_number          ON rigs(rig_number);

-- Contracts
CREATE INDEX IF NOT EXISTS idx_contracts_company    ON contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_rig        ON contracts(rig_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status     ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date   ON contracts(end_date);   -- expiry queries

-- Assets
CREATE INDEX IF NOT EXISTS idx_assets_rig           ON assets(rig_id);
CREATE INDEX IF NOT EXISTS idx_assets_company       ON assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_contract      ON assets(contract_id);
CREATE INDEX IF NOT EXISTS idx_assets_status        ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category      ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_serial        ON assets(serial_number); -- lookup by serial

-- Asset history
CREATE INDEX IF NOT EXISTS idx_asset_history_asset  ON asset_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_history_date   ON asset_history(created_at DESC);

-- BOM
CREATE INDEX IF NOT EXISTS idx_bom_asset            ON bom_items(asset_id);
CREATE INDEX IF NOT EXISTS idx_bom_parent           ON bom_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_bom_part_no          ON bom_items(part_number);

-- Certificates
CREATE INDEX IF NOT EXISTS idx_certs_asset          ON certificates(asset_id);
CREATE INDEX IF NOT EXISTS idx_certs_rig            ON certificates(rig_id);
CREATE INDEX IF NOT EXISTS idx_certs_expiry         ON certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_certs_status         ON certificates(status);

-- Maintenance
CREATE INDEX IF NOT EXISTS idx_maint_asset          ON maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_maint_next_due       ON maintenance_schedules(next_due_date);
CREATE INDEX IF NOT EXISTS idx_maint_status         ON maintenance_schedules(status);
CREATE INDEX IF NOT EXISTS idx_maint_priority       ON maintenance_schedules(priority);
CREATE INDEX IF NOT EXISTS idx_maint_asset_due      ON maintenance_schedules(asset_id, next_due_date);

-- Maintenance logs
CREATE INDEX IF NOT EXISTS idx_maint_logs_sched     ON maintenance_logs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_maint_logs_date      ON maintenance_logs(completion_date DESC);

-- Work orders
CREATE INDEX IF NOT EXISTS idx_wo_asset             ON work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_wo_schedule          ON work_orders(schedule_id);
CREATE INDEX IF NOT EXISTS idx_wo_assigned          ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_wo_status            ON work_orders(status);

-- Transfers
CREATE INDEX IF NOT EXISTS idx_transfers_asset      ON transfers(asset_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status     ON transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_date       ON transfers(request_date DESC);

-- Notifications (partial index — only unread rows, far smaller)
CREATE INDEX IF NOT EXISTS idx_notif_user           ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread         ON notifications(user_id, created_at DESC)
  WHERE is_read = false;

-- Audit log
CREATE INDEX IF NOT EXISTS idx_audit_record         ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_user           ON audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_date           ON audit_log(changed_at DESC);

-- Refresh tokens
CREATE INDEX IF NOT EXISTS idx_refresh_user         ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires      ON refresh_tokens(expires_at);

-- ═══════════════════════════════════════════════════════════════
--  TRIGGER: auto-set updated_at on every UPDATE
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $body$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','companies','rigs','contracts','assets',
    'bom_items','certificates','maintenance_schedules',
    'transfers','work_orders'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_%I ON %I;
       CREATE TRIGGER trg_set_updated_%I
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END;
$body$;

-- ═══════════════════════════════════════════════════════════════
--  TRIGGER: auto-expire certificate status on insert / update
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_cert_auto_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expiry_date IS NOT NULL AND NEW.status != 'Revoked' THEN
    IF    NEW.expiry_date <  CURRENT_DATE                          THEN NEW.status := 'Expired';
    ELSIF NEW.expiry_date <= CURRENT_DATE + INTERVAL '30 days'    THEN NEW.status := 'Expiring';
    ELSE                                                                NEW.status := 'Valid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cert_auto_status ON certificates;
CREATE TRIGGER trg_cert_auto_status
  BEFORE INSERT OR UPDATE OF expiry_date ON certificates
  FOR EACH ROW EXECUTE FUNCTION fn_cert_auto_status();

-- ═══════════════════════════════════════════════════════════════
--  VIEWS
-- ═══════════════════════════════════════════════════════════════

-- ── Assets (enriched) ─────────────────────────────────────────
CREATE OR REPLACE VIEW v_assets AS
SELECT
  a.*,
  r.name           AS rig_name,
  r.rig_id         AS rig_code,
  r.rig_number,
  r.location       AS rig_location,
  r.status         AS rig_status,
  c.name           AS company_name,
  c.company_code,
  ct.contract_no,
  ct.status        AS contract_status,
  ct.end_date      AS contract_end_date
FROM assets a
LEFT JOIN rigs      r  ON r.id  = a.rig_id
LEFT JOIN companies c  ON c.id  = a.company_id
LEFT JOIN contracts ct ON ct.id = a.contract_id;

-- ── Maintenance (live status computed in SQL) ──────────────────
CREATE OR REPLACE VIEW v_maintenance AS
SELECT
  ms.*,
  a.name           AS asset_name,
  a.asset_id       AS asset_code,
  a.location       AS asset_location,
  r.name           AS rig_name,
  r.rig_id         AS rig_code,
  r.rig_number,
  CURRENT_DATE     AS today,
  (ms.next_due_date - CURRENT_DATE) AS days_until_due,
  CASE
    -- preserve explicit terminal / in-progress statuses
    WHEN ms.status IN ('Completed','Cancelled','In Progress') THEN ms.status
    WHEN ms.next_due_date < CURRENT_DATE                      THEN 'Overdue'
    WHEN ms.next_due_date <= CURRENT_DATE + ms.alert_days     THEN 'Due Soon'
    ELSE 'Scheduled'
  END AS live_status
FROM maintenance_schedules ms
LEFT JOIN assets a ON a.id = ms.asset_id
LEFT JOIN rigs   r ON r.id = a.rig_id;

-- ── Transfers (all FK names resolved) ─────────────────────────
CREATE OR REPLACE VIEW v_transfers AS
SELECT
  t.*,
  a.name           AS asset_name,
  a.asset_id       AS asset_code,
  a.location       AS asset_current_location,
  r.name           AS source_rig_name,
  dr.name          AS dest_rig_name,
  dc.name          AS dest_company_name,
  u.full_name      AS requested_by_name,
  ou.full_name     AS ops_approver_name,
  mu.full_name     AS mgr_approver_name
FROM transfers t
LEFT JOIN assets    a  ON a.id  = t.asset_id
LEFT JOIN rigs      r  ON r.id  = a.rig_id
LEFT JOIN rigs      dr ON dr.id = t.dest_rig_id
LEFT JOIN companies dc ON dc.id = t.dest_company_id
LEFT JOIN users     u  ON u.id  = t.requested_by
LEFT JOIN users     ou ON ou.id = t.ops_approved_by
LEFT JOIN users     mu ON mu.id = t.mgr_approved_by;

-- ── Contracts (with live expiry status) ───────────────────────
CREATE OR REPLACE VIEW v_contracts AS
SELECT
  ct.*,
  c.name           AS company_name,
  c.contact_email  AS company_email,
  r.name           AS rig_name,
  r.rig_id         AS rig_code,
  r.rig_number,
  (ct.end_date - CURRENT_DATE) AS days_until_expiry,
  CASE
    WHEN ct.status IN ('Expired','Terminated')               THEN ct.status
    WHEN ct.end_date < CURRENT_DATE                          THEN 'Expired'
    WHEN ct.end_date <= CURRENT_DATE + 30                    THEN 'Expiring Soon'
    ELSE ct.status
  END AS live_status,
  COUNT(a.id) AS asset_count
FROM contracts ct
LEFT JOIN companies c ON c.id       = ct.company_id
LEFT JOIN rigs      r ON r.id       = ct.rig_id
LEFT JOIN assets    a ON a.contract_id = ct.id
GROUP BY ct.id, c.name, c.contact_email, r.name, r.rig_id, r.rig_number;

-- ── BOM cost roll-up per asset ─────────────────────────────────
CREATE OR REPLACE VIEW v_bom_summary AS
SELECT
  a.id             AS asset_uuid,
  a.asset_id       AS asset_code,
  a.name           AS asset_name,
  r.name           AS rig_name,
  COUNT(b.id)                                                       AS total_items,
  COUNT(b.id) FILTER (WHERE b.item_type = 'Serialized')            AS serialized_count,
  COUNT(b.id) FILTER (WHERE b.item_type = 'Bulk')                  AS bulk_count,
  COUNT(b.id) FILTER (WHERE b.status = 'On Order')                 AS on_order_count,
  COUNT(b.id) FILTER (WHERE b.status = 'Obsolete')                 AS obsolete_count,
  COALESCE(SUM(b.quantity * b.unit_cost_usd), 0)                   AS total_bom_value
FROM assets a
LEFT JOIN bom_items b ON b.asset_id = a.id
LEFT JOIN rigs      r ON r.id       = a.rig_id
GROUP BY a.id, a.asset_id, a.name, r.name;

-- ── Certificates (live expiry) ─────────────────────────────────
CREATE OR REPLACE VIEW v_certificates AS
SELECT
  c.*,
  (c.expiry_date - CURRENT_DATE) AS days_until_expiry,
  CASE
    WHEN c.status = 'Revoked'                              THEN 'Revoked'
    WHEN c.expiry_date IS NULL                             THEN 'Valid'
    WHEN c.expiry_date < CURRENT_DATE                      THEN 'Expired'
    WHEN c.expiry_date <= CURRENT_DATE + 30               THEN 'Expiring'
    ELSE 'Valid'
  END AS live_status,
  a.name           AS asset_name,
  a.asset_id       AS asset_code,
  rg.name          AS rig_name
FROM certificates c
LEFT JOIN assets a  ON a.id  = c.asset_id
LEFT JOIN rigs   rg ON rg.id = c.rig_id;

-- ── Dashboard KPI summary (single query for the UI) ────────────
CREATE OR REPLACE VIEW v_dashboard_summary AS
SELECT
  -- Assets
  (SELECT COUNT(*)                FROM assets)                                            AS total_assets,
  (SELECT COUNT(*)                FROM assets WHERE status = 'Active')                   AS active_assets,
  (SELECT COUNT(*)                FROM assets WHERE status = 'Maintenance')              AS maintenance_assets,
  (SELECT COUNT(*)                FROM assets WHERE status = 'Contracted')               AS contracted_assets,
  (SELECT COALESCE(SUM(value_usd),0) FROM assets)                                        AS total_asset_value,
  -- Rigs
  (SELECT COUNT(*)                FROM rigs)                                             AS total_rigs,
  (SELECT COUNT(*)                FROM rigs WHERE status = 'Active')                     AS active_rigs,
  (SELECT COUNT(*)                FROM rigs WHERE status = 'Maintenance')                AS maintenance_rigs,
  -- Contracts
  (SELECT COUNT(*)                FROM contracts WHERE status = 'Active')                AS active_contracts,
  (SELECT COUNT(*)                FROM contracts
     WHERE status = 'Active'
       AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)                         AS expiring_contracts,
  -- Maintenance
  (SELECT COUNT(*)                FROM maintenance_schedules
     WHERE status NOT IN ('Completed','Cancelled')
       AND next_due_date < CURRENT_DATE)                                                 AS overdue_pm,
  (SELECT COUNT(*)                FROM maintenance_schedules
     WHERE status NOT IN ('Completed','Cancelled')
       AND next_due_date >= CURRENT_DATE
       AND next_due_date <= CURRENT_DATE + alert_days)                                  AS due_soon_pm,
  -- Transfers
  (SELECT COUNT(*)                FROM transfers WHERE status = 'Pending')               AS pending_transfers,
  (SELECT COUNT(*)                FROM transfers WHERE status = 'Ops Approved')          AS ops_approved_transfers,
  -- Certificates
  (SELECT COUNT(*)                FROM certificates
     WHERE expiry_date < CURRENT_DATE AND status != 'Revoked')                          AS expired_certs,
  (SELECT COUNT(*)                FROM certificates
     WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
       AND status != 'Revoked')                                                          AS expiring_certs,
  -- Work orders
  (SELECT COUNT(*)                FROM work_orders WHERE status = 'Open')                AS open_work_orders,
  (SELECT COUNT(*)                FROM work_orders WHERE status = 'In Progress')         AS active_work_orders;
