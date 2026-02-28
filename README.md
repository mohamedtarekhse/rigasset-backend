# RigAsset Pro – Backend API

REST API backend for the **RigAsset Pro** Land Rig Asset Management System.  
Built with **Node.js + Express + PostgreSQL**.

---

## Tech Stack

| Layer       | Technology                       |
|-------------|----------------------------------|
| Runtime     | Node.js ≥ 18                     |
| Framework   | Express 4                        |
| Database    | PostgreSQL 14+                   |
| Auth        | JWT (access + refresh tokens)    |
| Passwords   | bcryptjs (cost factor 12)        |
| Validation  | express-validator                |
| Security    | helmet, cors, express-rate-limit |

---

## Project Structure

```
rigasset-backend/
├── server.js               ← Entry point
├── package.json
├── .env.example            ← Copy to .env
│
├── config/
│   └── db.js               ← PostgreSQL pool
│
├── database/
│   ├── schema.sql          ← All tables, indexes, views, triggers
│   ├── seed.sql            ← Demo data (14 rigs, 24 assets, users…)
│   └── init.js             ← One-time DB setup script
│
├── middleware/
│   ├── auth.js             ← JWT verify + role guards
│   └── errorHandler.js     ← Global error handler + asyncHandler
│
└── routes/
    ├── auth.js             ← Login, register, refresh, logout
    ├── assets.js           ← Asset CRUD + history
    ├── rigs.js             ← Rig CRUD
    ├── companies.js        ← Company CRUD
    ├── contracts.js        ← Contract CRUD + expiry alerts
    ├── maintenance.js      ← PM schedules, logs, alerts
    ├── transfers.js        ← Transfer requests + 2-stage approval
    ├── bom.js              ← Bill of Materials CRUD + tree
    ├── users.js            ← User management
    ├── notifications.js    ← Notifications
    └── dashboard.js        ← Aggregated KPI summary
```

---

## Quick Start

### 1. Prerequisites
- Node.js ≥ 18
- PostgreSQL 14+

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your DB credentials and JWT secrets
```

### 4. Initialize database
```bash
npm run db:init
# Creates the database, runs schema.sql, inserts seed data
```

### 5. Start the server
```bash
npm run dev       # development (nodemon auto-reload)
npm start         # production
```

Server starts on `http://localhost:3000`

---

## Default Seed Users

| Name              | Email                    | Password         | Role               |
|-------------------|--------------------------|------------------|--------------------|
| Ahmad Mohammed    | admin@rigasset.com       | RigAsset2025!    | Admin              |
| Sara Al-Rashid    | sara@rigasset.com        | RigAsset2025!    | Asset Manager      |
| James Miller      | james@rigasset.com       | RigAsset2025!    | Operations Manager |
| Layla Hassan      | layla@rigasset.com       | RigAsset2025!    | Editor             |
| David Chen        | david@rigasset.com       | RigAsset2025!    | Viewer             |
| Fatima Al-Zahra   | fatima@rigasset.com      | RigAsset2025!    | Editor             |

> ⚠️ **Change all passwords before deploying to production.**

---

## Authentication

All endpoints (except `/health`, `/api`, and `/api/auth/login`) require a JWT Bearer token.

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@rigasset.com",
  "password": "RigAsset2025!"
}
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "fullName": "Ahmad Mohammed", "role": "Admin" }
}
```

### Use the token
```http
GET /api/assets
Authorization: Bearer eyJ...
```

### Refresh access token
```http
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "eyJ..." }
```

---

## Role Permissions

| Role               | Read | Create/Edit | Delete | Approve Transfers |
|--------------------|------|-------------|--------|-------------------|
| Admin              | ✅   | ✅          | ✅     | Both stages       |
| Asset Manager      | ✅   | ✅          | ✅     | Final approval    |
| Operations Manager | ✅   | ✅          | ❌     | Stage 1 approval  |
| Editor             | ✅   | ✅          | ❌     | ❌                |
| Viewer             | ✅   | ❌          | ❌     | ❌                |

---

## API Reference

### Dashboard
| Method | Endpoint          | Description                      |
|--------|-------------------|----------------------------------|
| GET    | /api/dashboard    | All KPIs, alerts, rig summary    |

### Assets
| Method | Endpoint                  | Description                    |
|--------|---------------------------|--------------------------------|
| GET    | /api/assets               | List all (filter: rig, status) |
| GET    | /api/assets/summary       | KPI counts                     |
| GET    | /api/assets/by-rig        | Asset counts per rig           |
| GET    | /api/assets/:id           | Single asset detail            |
| POST   | /api/assets               | Create asset                   |
| PUT    | /api/assets/:id           | Update asset                   |
| DELETE | /api/assets/:id           | Delete asset                   |
| GET    | /api/assets/:id/history   | Change history log             |

**Query params for GET /api/assets:**  
`?rig=Rig 1&company=Arabian Drilling Company&status=Active&category=Drilling Equipment&search=BOP&page=1&limit=50`

### Rigs
| Method | Endpoint       | Description    |
|--------|----------------|----------------|
| GET    | /api/rigs      | All 14 rigs    |
| GET    | /api/rigs/:id  | Single rig     |
| POST   | /api/rigs      | Create rig     |
| PUT    | /api/rigs/:id  | Update rig     |
| DELETE | /api/rigs/:id  | Delete rig     |

### Maintenance
| Method | Endpoint                         | Description               |
|--------|----------------------------------|---------------------------|
| GET    | /api/maintenance                 | All schedules             |
| GET    | /api/maintenance/alerts          | Overdue + due-soon only   |
| GET    | /api/maintenance/by-rig          | PM counts per rig         |
| GET    | /api/maintenance/:id             | Single schedule + logs    |
| POST   | /api/maintenance                 | Create schedule           |
| PUT    | /api/maintenance/:id             | Update schedule           |
| POST   | /api/maintenance/:id/complete    | Log completion, reset due |
| GET    | /api/maintenance/:id/logs        | Completion history        |
| DELETE | /api/maintenance/:id             | Delete schedule           |

**Query params:** `?rig=Rig 2&status=Overdue&priority=Critical&type=Inspection`

**Status filter values:** `Overdue`, `Due Soon`, `Scheduled`, `Completed`, `In Progress`

### Transfers (2-Stage Approval)
| Method | Endpoint                          | Description                   |
|--------|-----------------------------------|-------------------------------|
| GET    | /api/transfers                    | All transfer requests         |
| GET    | /api/transfers/:id                | Single transfer detail        |
| POST   | /api/transfers                    | Submit transfer request       |
| POST   | /api/transfers/:id/approve-ops    | Ops Manager review (Stage 1)  |
| POST   | /api/transfers/:id/approve-mgr    | Asset Manager review (Stage 2)|
| DELETE | /api/transfers/:id                | Cancel pending transfer       |

**Approval body:**
```json
{
  "action": "approve",
  "comment": "Approved – equipment needed urgently on Rig 5"
}
```
`action` can be `approve`, `reject`, or `hold`.

On final Asset Manager approval → asset `location`, `rig_id`, and `company_id` are **automatically updated**.

### Contracts
| Method | Endpoint                  | Description               |
|--------|---------------------------|---------------------------|
| GET    | /api/contracts            | All contracts             |
| GET    | /api/contracts/expiring   | Expiring within 30 days   |
| POST   | /api/contracts            | Create contract           |
| PUT    | /api/contracts/:id        | Update contract           |
| DELETE | /api/contracts/:id        | Delete contract           |

### Bill of Materials
| Method | Endpoint               | Description                        |
|--------|------------------------|------------------------------------|
| GET    | /api/bom               | All BOM items                      |
| GET    | /api/bom/summary       | Total counts and value             |
| GET    | /api/bom/tree/:assetId | Hierarchical tree for one asset    |
| GET    | /api/bom/:id           | Single BOM item                    |
| POST   | /api/bom               | Add BOM item                       |
| PUT    | /api/bom/:id           | Update BOM item                    |
| DELETE | /api/bom/:id           | Delete item + all children         |

### Users
| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| GET    | /api/users                      | All users (Admin/Mgr)    |
| GET    | /api/users/:id  or  /api/users/me | User detail            |
| POST   | /api/users                      | Create user (Admin)      |
| PUT    | /api/users/:id                  | Update user              |
| DELETE | /api/users/:id                  | Delete user (Admin)      |
| POST   | /api/users/:id/reset-password   | Reset password (Admin)   |

### Notifications
| Method | Endpoint                        | Description                |
|--------|---------------------------------|----------------------------|
| GET    | /api/notifications              | User's notifications       |
| PUT    | /api/notifications/read-all     | Mark all as read           |
| PUT    | /api/notifications/:id/read     | Mark one as read           |
| DELETE | /api/notifications/:id          | Delete notification        |
| DELETE | /api/notifications              | Clear all read             |

---

## Connecting the Frontend

To wire the HTML frontend to this API, replace the in-memory JavaScript arrays with `fetch()` calls. Example:

```javascript
// In your HTML file, add this API helper at the top of the <script> block
const API_BASE = 'http://localhost:3000/api';
let AUTH_TOKEN = localStorage.getItem('rigasset_token');

async function apiGet(path) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Replace static arrays with API calls:
// Old: let ASSETS = [ ... ];
// New:
async function loadAssets() {
  const { data } = await apiGet('/assets?limit=500');
  ASSETS = data;
  renderAssets();
}

// Call on page load:
window.onload = async function() {
  await loadAssets();
  // ... other loaders
}
```

---

## Database Views

Three convenience views are available for complex queries:

| View           | Description                                          |
|----------------|------------------------------------------------------|
| `v_assets`     | Assets joined with rig name, company name            |
| `v_maintenance`| PM schedules with live_status, days_until_due, rig   |
| `v_transfers`  | Transfers with all names resolved                    |

---

## Health Check

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"RigAsset Pro API","db":"connected"}
```

---

## Environment Variables

| Variable                | Default         | Description                     |
|-------------------------|-----------------|---------------------------------|
| PORT                    | 3000            | Server port                     |
| NODE_ENV                | development     | Environment                     |
| DB_HOST                 | localhost       | PostgreSQL host                 |
| DB_PORT                 | 5432            | PostgreSQL port                 |
| DB_NAME                 | rigasset_db     | Database name                   |
| DB_USER                 | postgres        | Database user                   |
| DB_PASSWORD             | —               | Database password               |
| JWT_SECRET              | —               | Access token secret (**change**)|
| JWT_EXPIRES_IN          | 8h              | Access token lifetime           |
| JWT_REFRESH_SECRET      | —               | Refresh token secret            |
| JWT_REFRESH_EXPIRES_IN  | 7d              | Refresh token lifetime          |
| CORS_ORIGINS            | localhost:3000  | Comma-separated allowed origins |
| RATE_LIMIT_MAX          | 200             | Requests per 15-minute window   |
