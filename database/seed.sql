-- ═══════════════════════════════════════════════════════════════
--  RigAsset Pro  –  Seed Data
--  Run AFTER schema.sql
-- ═══════════════════════════════════════════════════════════════

-- ─── USERS (passwords are bcrypt of 'RigAsset2025!') ─────────
INSERT INTO users (id, full_name, email, password_hash, role, department, status) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Ahmad Mohammed',   'admin@rigasset.com',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin',              'Asset Management', 'Active'),
  ('11111111-0000-0000-0000-000000000002', 'Sara Al-Rashid',   'sara@rigasset.com',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Asset Manager',      'Operations',       'Active'),
  ('11111111-0000-0000-0000-000000000003', 'James Miller',     'james@rigasset.com',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Operations Manager', 'Operations',       'Active'),
  ('11111111-0000-0000-0000-000000000004', 'Layla Hassan',     'layla@rigasset.com',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Editor',             'Contracts',        'Active'),
  ('11111111-0000-0000-0000-000000000005', 'David Chen',       'david@rigasset.com',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Viewer',             'Engineering',      'Active'),
  ('11111111-0000-0000-0000-000000000006', 'Fatima Al-Zahra',  'fatima@rigasset.com',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Editor',             'Maintenance',      'Active')
ON CONFLICT (email) DO NOTHING;

-- ─── COMPANIES ────────────────────────────────────────────────
INSERT INTO companies (id, company_code, name, type, country, contact_name, contact_email, status) VALUES
  ('22222222-0000-0000-0000-000000000001', 'CMP001', 'Arabian Drilling Company',   'Drilling Contractor', 'Saudi Arabia', 'Khalid Al-Rashid',    'k.rashid@adc.com.sa',          'Active'),
  ('22222222-0000-0000-0000-000000000002', 'CMP002', 'NABORS Industries',          'Drilling Contractor', 'USA',          'James Wilson',         'j.wilson@nabors.com',          'Active'),
  ('22222222-0000-0000-0000-000000000003', 'CMP003', 'Patterson-UTI Energy',       'Drilling Contractor', 'USA',          'Sarah Johnson',        's.johnson@patenergy.com',      'Active'),
  ('22222222-0000-0000-0000-000000000004', 'CMP004', 'Al-Khafji Joint Operations', 'Operator',            'Kuwait',       'Mohammed Al-Khafji',   'm.khafji@kjo.com',             'Active'),
  ('22222222-0000-0000-0000-000000000005', 'CMP005', 'Parker Drilling',            'Drilling Contractor', 'USA',          'Mike Parker',          'm.parker@parkerdrilling.com',  'Inactive')
ON CONFLICT (company_code) DO NOTHING;

-- ─── RIGS (14 rigs) ───────────────────────────────────────────
INSERT INTO rigs (id, rig_id, name, type, company_id, location, depth_capacity, horsepower, status) VALUES
  ('33333333-0000-0000-0000-000000000001', 'RIG01', 'Rig 1',  'AC Drive',   '22222222-0000-0000-0000-000000000001', 'Ghawar Field – Block A',        '25,000 ft', 2000, 'Active'),
  ('33333333-0000-0000-0000-000000000002', 'RIG02', 'Rig 2',  'Mechanical', '22222222-0000-0000-0000-000000000001', 'Ghawar Field – Block B',        '20,000 ft', 1500, 'Active'),
  ('33333333-0000-0000-0000-000000000003', 'RIG03', 'Rig 3',  'Electric',   '22222222-0000-0000-0000-000000000002', 'Permian Basin, TX',              '30,000 ft', 3000, 'Active'),
  ('33333333-0000-0000-0000-000000000004', 'RIG04', 'Rig 4',  'SCR',        '22222222-0000-0000-0000-000000000002', 'Permian Basin – South',          '28,000 ft', 2500, 'Maintenance'),
  ('33333333-0000-0000-0000-000000000005', 'RIG05', 'Rig 5',  'AC Drive',   '22222222-0000-0000-0000-000000000003', 'DJ Basin, CO',                   '22,000 ft', 2000, 'Active'),
  ('33333333-0000-0000-0000-000000000006', 'RIG06', 'Rig 6',  'SCR',        '22222222-0000-0000-0000-000000000003', 'Eagle Ford, TX',                 '18,000 ft', 1500, 'Active'),
  ('33333333-0000-0000-0000-000000000007', 'RIG07', 'Rig 7',  'Mechanical', '22222222-0000-0000-0000-000000000004', 'Khafji Field – North',           '18,000 ft', 1200, 'Active'),
  ('33333333-0000-0000-0000-000000000008', 'RIG08', 'Rig 8',  'AC Drive',   '22222222-0000-0000-0000-000000000004', 'Khafji Field – South',           '20,000 ft', 1800, 'Standby'),
  ('33333333-0000-0000-0000-000000000009', 'RIG09', 'Rig 9',  'Electric',   '22222222-0000-0000-0000-000000000001', 'Safaniyah Offshore Tie-in',      '24,000 ft', 2200, 'Active'),
  ('33333333-0000-0000-0000-000000000010', 'RIG10', 'Rig 10', 'SCR',        '22222222-0000-0000-0000-000000000005', 'Empty Quarter – Block C',        '26,000 ft', 2000, 'Active'),
  ('33333333-0000-0000-0000-000000000011', 'RIG11', 'Rig 11', 'AC Drive',   '22222222-0000-0000-0000-000000000005', 'Empty Quarter – Block D',        '24,000 ft', 2000, 'Maintenance'),
  ('33333333-0000-0000-0000-000000000012', 'RIG12', 'Rig 12', 'Mechanical', '22222222-0000-0000-0000-000000000001', 'Abqaiq Field',                   '21,000 ft', 1600, 'Active'),
  ('33333333-0000-0000-0000-000000000013', 'RIG13', 'Rig 13', 'Electric',   '22222222-0000-0000-0000-000000000002', 'Haradh Gas Field',               '32,000 ft', 3000, 'Active'),
  ('33333333-0000-0000-0000-000000000014', 'RIG14', 'Rig 14', 'AC Drive',   '22222222-0000-0000-0000-000000000003', 'Hawiyah Gas Field',              '28,000 ft', 2500, 'Standby')
ON CONFLICT (rig_id) DO NOTHING;

-- ─── CONTRACTS ────────────────────────────────────────────────
INSERT INTO contracts (id, contract_no, company_id, rig_id, start_date, end_date, value_usd, status) VALUES
  ('44444444-0000-0000-0000-000000000001', 'CON-2024-001', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '2024-01-15', '2025-01-14', 4800000, 'Active'),
  ('44444444-0000-0000-0000-000000000002', 'CON-2024-002', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003', '2024-03-01', '2025-03-01', 3200000, 'Active'),
  ('44444444-0000-0000-0000-000000000003', 'CON-2024-003', '22222222-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000007', '2023-07-01', '2024-07-01', 6100000, 'Expired'),
  ('44444444-0000-0000-0000-000000000004', 'CON-2025-001', '22222222-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000005', '2025-01-10', '2026-01-10', 1950000, 'Pending')
ON CONFLICT (contract_no) DO NOTHING;

-- ─── ASSETS (24 assets across 14 rigs) ────────────────────────
INSERT INTO assets (id, asset_id, name, category, company_id, rig_id, location, status, value_usd, acquisition_date, serial_number, notes) VALUES
  -- Rig 1
  ('55555555-0000-0000-0000-000000000001','AST-001','Top Drive System',         'Drilling Equipment','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001','Ghawar Field – Block A','Contracted', 1200000,'2021-03-15','TD-7821',  'High-capacity 1000T top drive'),
  ('55555555-0000-0000-0000-000000000002','AST-002','BOP Stack 18-3/4"',        'Drilling Equipment','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001','Ghawar Field – Block A','Contracted',  850000,'2020-07-20','BOP-4422', 'Cameron BOP Stack'),
  -- Rig 2
  ('55555555-0000-0000-0000-000000000003','AST-003','Derrick Structure 142ft',  'Drilling Equipment','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000002','Ghawar Field – Block B','Active',     2100000,'2018-05-01','DRK-0078', 'IRI 142ft mast structure'),
  ('55555555-0000-0000-0000-000000000004','AST-004','Mud Pumps (3x)',           'Drilling Equipment','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000002','Ghawar Field – Block B','Maintenance',  620000,'2019-11-05','MP-1103',  'National 14-P-220 pumps'),
  -- Rig 3
  ('55555555-0000-0000-0000-000000000005','AST-005','Drawworks 1500HP',         'Drilling Equipment','22222222-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000003','Permian Basin, TX',    'Active',     1800000,'2020-08-12','DW-3312',  'National 1500HP drawworks'),
  ('55555555-0000-0000-0000-000000000006','AST-006','CAT 3516 Generator Set',   'Power Generation',  '22222222-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000003','Permian Basin, TX',    'Active',      480000,'2022-01-10','GEN-7712', '2000kW prime power generator'),
  -- Rig 4
  ('55555555-0000-0000-0000-000000000007','AST-007','Casing Running Tool',      'Drilling Equipment','22222222-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000004','Permian Basin – South','Inactive',    130000,'2020-03-15','CRT-9910', 'Hydraulic CRT for 13-3/8" casing'),
  ('55555555-0000-0000-0000-000000000008','AST-008','H2S Detection System',     'Safety Equipment',  '22222222-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000004','Permian Basin – South','Active',       75000,'2022-06-15','SFT-2291', 'Multi-point H2S gas detection'),
  -- Rig 5
  ('55555555-0000-0000-0000-000000000009','AST-009','Rotary Table 37.5"',       'Drilling Equipment','22222222-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000005','DJ Basin, CO',         'Active',      320000,'2021-06-20','RT-5501',  '37.5" rotary table 500T capacity'),
  ('55555555-0000-0000-0000-000000000010','AST-010','Emergency Fire Suppression','Safety Equipment', '22222222-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000005','DJ Basin, CO',         'Active',       88000,'2023-05-20','SFT-4451', 'Dry chemical fire suppression'),
  -- Rig 6
  ('55555555-0000-0000-0000-000000000011','AST-011','Satellite VSAT System',    'Communication',     '22222222-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000006','Eagle Ford, TX',       'Active',      145000,'2021-09-01','COM-8811', 'Hughes VSAT 1.8m dish'),
  ('55555555-0000-0000-0000-000000000012','AST-012','Rig Mover & Substructure', 'Drilling Equipment','22222222-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000006','Eagle Ford, TX',       'Active',      950000,'2019-03-10','RMV-0601', 'Self-propelled walking system'),
  -- Rig 7
  ('55555555-0000-0000-0000-000000000013','AST-013','Heavy-Duty Crew Bus',      'Transportation',    '22222222-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000007','Khafji Field – North', 'Active',       95000,'2023-02-28','TRN-0341', '40-seat crew transportation'),
  ('55555555-0000-0000-0000-000000000014','AST-014','Light Plant System',       'Power Generation',  '22222222-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000007','Khafji Field – North', 'Maintenance',  42000,'2021-11-15','LGT-1102', 'LED light plants x6'),
  -- Rig 8
  ('55555555-0000-0000-0000-000000000015','AST-015','Drilling Jars – Hydraulic','Drilling Equipment','22222222-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000008','Khafji Field – South', 'Active',      210000,'2022-12-01','JAR-3301', 'Hydraulic drilling jars set'),
  -- Rig 9
  ('55555555-0000-0000-0000-000000000016','AST-016','Top Drive NOV 500T',       'Drilling Equipment','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000009','Safaniyah Tie-in',     'Active',     1050000,'2022-04-18','TD-9901',  'NOV 500T top drive system'),
  ('55555555-0000-0000-0000-000000000017','AST-017','Accumulator Unit 120 Gal', 'Drilling Equipment','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000009','Safaniyah Tie-in',     'Active',      185000,'2021-07-22','ACC-0091', '120 gal hydraulic accumulator'),
  -- Rig 10
  ('55555555-0000-0000-0000-000000000018','AST-018','Centrifugal Pump Set',     'Drilling Equipment','22222222-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000010','Empty Quarter – Block C','Active',    160000,'2023-01-15','CP-1001',  '3x centrifugal charge pumps'),
  -- Rig 11
  ('55555555-0000-0000-0000-000000000019','AST-019','SCR Control House',        'Power Generation',  '22222222-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000011','Empty Quarter – Block D','Maintenance',420000,'2020-09-30','SCR-1101', 'Silicon controlled rectifier house'),
  -- Rig 12
  ('55555555-0000-0000-0000-000000000020','AST-020','BOP Annular 13-5/8"',      'Drilling Equipment','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000012','Abqaiq Field',         'Active',      740000,'2021-02-14','BOP-1201', '13-5/8" 10K annular BOP'),
  ('55555555-0000-0000-0000-000000000021','AST-021','Degasser Vessel',          'Drilling Equipment','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000012','Abqaiq Field',         'Active',       95000,'2022-08-05','DEG-1201', 'Atmospheric degasser 500 GPM'),
  -- Rig 13
  ('55555555-0000-0000-0000-000000000022','AST-022','Iron Roughneck',           'Drilling Equipment','22222222-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000013','Haradh Gas Field',     'Active',      580000,'2022-11-20','IRN-1301', 'Automated iron roughneck 60k ft-lb'),
  -- Rig 14
  ('55555555-0000-0000-0000-000000000023','AST-023','Shale Shaker 4-Panel',     'Drilling Equipment','22222222-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000014','Hawiyah Gas Field',    'Standby',     220000,'2023-06-01','SS-1401',  '4-panel linear motion shaker'),
  ('55555555-0000-0000-0000-000000000024','AST-024','Standby Generator 500kW',  'Power Generation',  '22222222-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000014','Hawiyah Gas Field',    'Active',      195000,'2022-03-10','GEN-1401', 'Emergency standby generator')
ON CONFLICT (asset_id) DO NOTHING;

-- ─── MAINTENANCE SCHEDULES ────────────────────────────────────
INSERT INTO maintenance_schedules
  (pm_id, asset_id, task_name, task_type, frequency_days, last_done_date, next_due_date, alert_days, technician, estimated_hours, estimated_cost, priority, status, notes)
VALUES
  ('PM-001','55555555-0000-0000-0000-000000000001','Top Drive Annual Inspection',      'Inspection',        365,'2024-03-15','2025-03-15',30,'Baker Hughes Team',      16, 8500,'Critical','Scheduled',  'Full strip-down inspection per NOV manual ch.7'),
  ('PM-002','55555555-0000-0000-0000-000000000001','Gearbox Oil Change',               'Oil Change',         90,'2024-11-01','2025-01-30',14,'Mohammed Al-Farsi',       4, 1200,'High',    'Scheduled',  'Drain and replace ISO 320 gear oil. Check for metal particles.'),
  ('PM-003','55555555-0000-0000-0000-000000000002','BOP Pressure Test',                'Pressure Test',     180,'2024-07-10','2025-01-10',30,'Bureau Veritas',           8, 4500,'Critical','Scheduled',  '15K psi pressure test per API 16A'),
  ('PM-004','55555555-0000-0000-0000-000000000002','Ram Packer Inspection',            'Inspection',         90,'2024-10-15','2025-01-13',14,'Omar Hassan',              6, 2200,'High',    'Scheduled',  'Inspect and replace worn ram packers'),
  ('PM-005','55555555-0000-0000-0000-000000000004','Mud Pump Liner Inspection',        'Inspection',         30,'2024-12-20','2025-01-19', 7,'Ahmed Khalid',             3,  800,'High',    'Scheduled',  'Inspect liner wear. Replace if >15% worn.'),
  ('PM-006','55555555-0000-0000-0000-000000000004','Valve & Seat Replacement',         'Filter Replacement', 60,'2024-11-25','2025-01-24', 7,'Ahmed Khalid',             5, 3200,'High',    'Scheduled',  'Replace suction and discharge valves and seats'),
  ('PM-007','55555555-0000-0000-0000-000000000003','Derrick Structural Inspection',    'Inspection',        365,'2024-02-01','2025-02-01',30,'SGS Inspection',          12, 6000,'Critical','Scheduled',  'Full visual and NDT inspection of derrick per API 4F'),
  ('PM-008','55555555-0000-0000-0000-000000000006','Generator Oil & Filter Change',    'Oil Change',        250,'2024-10-01','2025-06-08',14,'CAT Dealer Team',          6, 2800,'Normal',  'Scheduled',  '250-hour PM service. Oil, fuel, air filters, coolant check.'),
  ('PM-009','55555555-0000-0000-0000-000000000006','Generator Load Bank Test',         'Electrical Check',   90,'2024-11-15','2025-02-13',14,'Hamdan Ali',               4, 1500,'Normal',  'Scheduled',  'Full load bank test at 100% rated capacity for 4 hours.'),
  ('PM-010','55555555-0000-0000-0000-000000000008','H2S Sensor Calibration',           'Calibration',        30,'2024-12-28','2025-01-27', 7,'Safety Officer',           2,  400,'Critical','Scheduled',  'Calibrate all H2S sensors with certified calibration gas.'),
  ('PM-011','55555555-0000-0000-0000-000000000008','SCBA Equipment Inspection',        'Safety Check',      180,'2024-07-01','2025-01-01',14,'Safety Officer',           3,  600,'Critical','Scheduled',  'Inspect all 30 SCBA units. Check cylinder pressure.'),
  ('PM-012','55555555-0000-0000-0000-000000000011','VSAT Antenna Alignment',           'General Service',   180,'2024-06-15','2024-12-15',14,'Hughes Network Tech',      3, 1800,'Normal',  'Completed',  'Check and realign satellite dish. Clean feed horn.'),
  ('PM-013','55555555-0000-0000-0000-000000000015','Jar Jar Tool Function Test',       'Inspection',         90,'2024-10-20','2025-01-18', 7,'Fishing Tool Engr',        4, 2000,'High',    'Scheduled',  'Function test hydraulic jars at rated load.'),
  ('PM-014','55555555-0000-0000-0000-000000000004','Triplex Pump Packing Change',      'General Service',    45,'2024-11-10','2024-12-25', 7,'Ahmed Khalid',             6, 1800,'High',    'Completed',  'Replace all piston packing sets on 3 pumps.')
ON CONFLICT (pm_id) DO NOTHING;

-- ─── SAMPLE NOTIFICATIONS ─────────────────────────────────────
INSERT INTO notifications (user_id, type, icon, title, description, entity_type, is_read) VALUES
  (NULL, 'warning', 'exclamation-triangle', 'Contract Expiry Warning',  'CON-2024-001 contract expires in 15 days',       'contract',    false),
  (NULL, 'warning', 'tools',               'Maintenance Alert',         'AST-004 Mud Pumps require scheduled maintenance', 'maintenance', false),
  (NULL, 'info',    'file-import',          'System Ready',             'RigAsset Pro backend is online',                  NULL,          false),
  (NULL, 'success', 'check-circle',         'Asset Activated',          'AST-016 Top Drive NOV 500T has been activated',   'asset',       false)
ON CONFLICT DO NOTHING;
