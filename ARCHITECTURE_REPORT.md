# SHMS Current-State Architecture Report

**Project:** Student Health Management System (SHMS)
**Date:** 2026-09-22
**Scope:** Full read-only inspection of backend, frontend, database, and infrastructure

---

## 1. Project Structure

```
C:\Users\samue\Desktop\TO\
├── shms-backend/                    # Node.js + Express API
│   ├── src/
│   │   ├── app.js                   # Express app (CORS, JSON, routes, error handler)
│   │   ├── server.js                # HTTP server bootstrap
│   │   ├── config/                  # constants, db (Prisma), env (dotenv)
│   │   ├── controllers/             # 17 controller files
│   │   ├── repositories/            # 17 repository files (Prisma queries)
│   │   ├── services/                # 17 service files (business logic)
│   │   ├── routes/                  # 17 route files + index.js
│   │   ├── middleware/              # auth, role, error, notfound, rateLimiter, tenant, validate
│   │   ├── utils/                   # apiResponse, AppError, asyncHandler, auditLogger, calculateQueueEstimate, email, generateToken, logger, pagination, password, query, tenantAccess, tenantContext
│   │   ├── validations/             # Zod schemas (auth, appointment, consultation, dashboard, department, medical-record, notification, position, prescription, profile, report, schedule, service, staff)
│   │   ├── types/                   # Enums: appointmentStatus, notificationType, queueStatus, roles
│   │   └── generated/prisma/        # Prisma client output
│   ├── prisma/
│   │   ├── schema.prisma            # 18 models, 6 enums, 30+ indexes
│   │   ├── migrations/              # 28 migrations (Jul 2026 – Sep 2026)
│   │   └── prisma.config.ts
│   ├── docker-compose.yml           # Single-service container (API only)
│   ├── Dockerfile
│   ├── ecosystem.config.cjs         # PM2 config
│   ├── package.json                 # Node.js ESM, Express 5, Prisma 6.19.3
│   ├── scripts/                     # reset-test-accounts.mjs, seed-test-accounts.js
│   ├── jobs/                        # Empty
│   ├── backups/                     # Empty
│   ├── postman/                     # Postman collections
│   └── .tmp/loadtest/              # Investigation scripts (dashboard bottleneck, scalability)
│
├── shms-frontend/shms/              # Static SPA frontend
│   ├── index.html                   # Marketing landing page
│   ├── login.html                   # Split-panel login (email + matric/ID tab)
│   ├── register.html                # Student registration
│   ├── dashboard.html               # Student dashboard
│   ├── appointments.html            # Appointment list/booking
│   ├── queue.html                   # Queue status (student)
│   ├── checkin.html                 # Check-in page
│   ├── profile.html                 # Student profile
│   ├── notifications.html           # Notifications
│   ├── history.html                 # Consultation history
│   ├── complete-profile.html        # First-login profile completion
│   ├── forgot-password.html / reset-password.html
│   ├── admin/index.html             # Admin dashboard (SPA shell)
│   ├── staff/index.html             # Staff dashboard (SPA shell)
│   ├── analytics/                   # Analytics page
│   ├── ai/                          # AI Symptom Checker (frontend stub)
│   ├── lab/                         # Lab Results (frontend stub)
│   ├── pharmacy/                    # Pharmacy (frontend stub)
│   ├── telecom/                     # Telemedicine (frontend stub)
│   ├── records/                     # Records (frontend stub)
│   ├── components/                  # Reusable HTML components
│   ├── js/
│   │   ├── config.js                # Base URL resolution
│   │   ├── api.js                   # REST API client (IIFE module, 1036 lines)
│   │   ├── auth.js                  # Auth state, login/register forms, session management (485 lines)
│   │   └── utils.js                 # Formatting, pagination, sidebar builder, toast (361 lines)
│   ├── css/                         # styles.css, responsive.css
│   └── assets/                      # Images, logo
│
├── SHMS_MULTI_TENANT_HARDENING_REPORT.md
├── SHMS_TIER3_AUTHORIZATION_REPORT.md
├── SHMS4_RLS_IMPLEMENTATION_REPORT.md
├── SHMS5_PRODUCTION_READINESS_IMPLEMENTATION_REPORT.md
├── QA_HANDOFF.md
└── ARCHITECTURE_REPORT.md           # This file
```

---

## 2. Frontend Architecture

### 2.1 Technology
- **Type:** Static HTML + vanilla JavaScript SPA (no framework, no build step)
- **Served by:** Live Server (dev) or any static file server on port 5500
- **CSS:** Custom CSS with CSS variables, responsive breakpoints at 1024px and 768px
- **No bundler, no transpiler, no TypeScript**

### 2.2 Page Structure

| Page | Access | Description |
|---|---|---|
| `index.html` | Public | Marketing landing page (hero, features, testimonials, footer) |
| `login.html` | Public | Split-panel login with email/matric-number tab toggle |
| `register.html` | Public | Student registration (org selector, personal info, emergency contacts) |
| `complete-profile.html` | Student | First-login profile completion (faculty, department, level) |
| `dashboard.html` | Student | Student dashboard (appointments, queue status, health summary) |
| `appointments.html` | Student | Appointment list, booking modal, history |
| `queue.html` | Student | Live queue status (ticket, position, wait time) |
| `checkin.html` | Student | Appointment check-in |
| `profile.html` | All | User profile view/edit |
| `notifications.html` | All | Notification list with mark-read |
| `history.html` | Student | Consultation history |
| `admin/index.html` | Admin/SA | Dashboard shell (doctors, students, schedules, reports tabs) |
| `staff/index.html` | Staff | Dashboard shell (queue, patients, check-in tabs) |
| `analytics/index.html` | Admin/SA | Analytics dashboard |
| `ai/index.html` | All | AI Symptom Checker (frontend stub) |
| `lab/index.html` | All | Lab Results (frontend stub) |
| `pharmacy/index.html` | All | Pharmacy (frontend stub) |
| `telecom/index.html` | All | Telemedicine (frontend stub) |
| `records/index.html` | All | Records (frontend stub) |

### 2.3 JS Module Architecture

- **`config.js`** — Detects `SHMS_BASE` from script tag, resolves `SHMS_API_BASE` (localhost → `http://localhost:5000/api/v1`, production → same-origin `/api/v1`)
- **`api.js`** — IIFE returning global `API` object. All REST calls. Transforms backend shapes into frontend display shapes (`_mapAppointment`, `_mapStaffDoctor`, `_mapPatient`, `_mapQueueEntry`, `_mapNotification`). Includes in-memory caches for services and staff.
- **`auth.js`** — Global `Auth` object. Session in `localStorage` (`shms_token`, `shms_user`). Login/register form handlers, password toggle, notification bell polling (30s interval), role-based redirects, sidebar builder.
- **`utils.js`** — Global `Utils` object. Date formatting, time-ago, pagination renderer, toast notifications, sidebar HTML builder (role-aware), XSS sanitization, localStorage helpers.

### 2.4 Frontend State Management
- All state in `localStorage` (token + flattened user object)
- No client-side routing (each page loads independently)
- No reactive framework — DOM manipulation via `innerHTML` and `querySelector`
- API responses are transformed in `api.js` before being consumed by pages

---

## 3. Backend Architecture

### 3.1 Technology
- **Runtime:** Node.js ESM
- **Framework:** Express 5
- **ORM:** Prisma 6.19.3 (no driver adapter, plain `PrismaClient`)
- **Validation:** Zod (request body/query/params)
- **Auth:** JWT (`jsonwebtoken`)
- **Password hashing:** `bcrypt`
- **Logging:** Custom `logger.js` + `auditLogger.js` (writes `AuditLog` table)

### 3.2 Layered Architecture

```
Route → Middleware → Controller → Service → Repository → Prisma → PostgreSQL
```

| Layer | Files | Responsibility |
|---|---|---|
| **Route** | 17 route files | HTTP method, path, middleware chain |
| **Middleware** | 7 files | `authenticate` (JWT → user), `authorize` (role check), `validate` (Zod), `error` (global handler), `notfound` (404), `rateLimiter` (auth/api/reset limiters), `tenant` (defined but not mounted) |
| **Controller** | 17 files | Thin — extracts `req.user`, `req.body`, `req.query`, `req.params`, calls service, returns `successResponse` |
| **Service** | 17 files | Business logic, validation, tenant scoping (`withTenant`/`withSuperAdmin`), audit logging, retry loops for unique constraints |
| **Repository** | 17 files | Prisma queries, pagination (`buildPrismaQuery`), includes |
| **Utility** | 15 files | `tenantContext` (GUC injection), `tenantAccess` (org resolution), `auditLogger`, `pagination`, `password`, `email`, `generateToken`, `AppError`, `asyncHandler`, `query` (dynamic Prisma query builder) |

### 3.3 Tenant Context Mechanism

The core multi-tenancy mechanism:

1. **`withTenant(orgId, callback)`** — Opens a `prisma.$transaction`, sets `app.organization_id` via `set_config(..., true)` (transaction-local GUC), runs callback, commits. Fails closed if orgId is empty.
2. **`withSuperAdmin(callback)`** — Same but sets `app.organization_id = ''` and `app.bypass_rls = 'true'`.
3. **`resolveUserScope(user)`** — Returns `withSuperAdmin` for super_admin, otherwise returns `(cb) => withTenant(user.organizationId, cb)`.

Every service method wraps its database operations in one of these. The GUC is transaction-local (never leaks to pooled connections).

### 3.4 Pre-Auth Global Lookups (SECURITY DEFINER)

Four PostgreSQL functions bypass RLS for pre-authentication flows:

| Function | Purpose | Used by |
|---|---|---|
| `shms_auth_user(identifier)` | Login: lookup by email, matric number, or staff number across all orgs | `user.repository.js` → `findAuthUserByIdentifier`, `findUserByEmail` |
| `shms_user_by_reset_token(token)` | Password reset: find user by hashed unexpired token | `user.repository.js` → `findUserByResetToken` |
| `shms_user_org(user_id)` | Route context: get user's org before tenant scope | `user.repository.js` → `findUserOrgHint` |
| `shms_user_route(user_id)` | Auth middleware: get user + profile + organization | `user.repository.js` → `findUserWithProfileById` |

All are `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO shms_app`.

### 3.5 Key Service Patterns

- **Retry on unique constraint:** `checkInPatient`, `createStudentMedicalRecord`, `createNewStaff` — loop up to 5 attempts on `P2002`
- **Audit logging:** Every mutation calls `auditLogger()` which writes to `AuditLog` in its own `withTenant` transaction (non-failing, catches errors silently)
- **Status machine:** Appointments follow `ALLOWED_TRANSITIONS` map (scheduled → confirmed → checked_in → in_progress → completed, with cancel/no_show branches)
- **Schedule conflict detection:** `validateScheduleAndConflict` checks staff schedules and existing appointments for time overlaps

---

## 4. Database Architecture

### 4.1 Engine
- **PostgreSQL 18.4** (local Windows)
- **Database:** `shms_db`
- **Size:** ~36 MB (with ~30k test users)
- **Connection:** `DATABASE_URL`; `.env.example` documents the `shms_app` role. The local `.env` is gitignored, so the actual runtime role is unverifiable from the repository (see §12.2.1).
- **App role:** `shms_app` (non-superuser, used by SECURITY DEFINER functions and RLS policies)

### 4.2 Models (18 total)

| Model | Tenant Scope | Key Relationships |
|---|---|---|
| **Organization** | Global (root) | Has many Users, Departments, Positions, Services, Appointments, Queues, Schedules, AuditLogs, Notifications |
| **User** | `organizationId` (direct) | Belongs to Organization, has one Profile, one Staff, many AuditLogs, Notifications, NotificationPreference |
| **Profile** | Inherited: `user.organizationId` | Belongs to User, has one MedicalRecord |
| **MedicalRecord** | Inherited: `profile.user.organizationId` | Belongs to Profile, has many Appointments |
| **MedicalRecordCounter** | `organizationId` (direct) | Belongs to Organization; per-organization (recordYear, counter) sequence for medical record numbering |
| **Staff** | Inherited: `user.organizationId` | Belongs to User, Department, Position; has many Appointments, Schedules |
| **Schedule** | `organizationId` (direct) | Belongs to Organization, Staff; unique on (staffId, dayOfWeek) |
| **Department** | `organizationId` (direct) | Belongs to Organization; unique on (organizationId, code) |
| **Position** | `organizationId` (direct) | Belongs to Organization; unique on (organizationId, code) |
| **Service** | `organizationId` (direct) | Belongs to Organization; unique on (organizationId, code); has many Appointments |
| **Appointment** | `organizationId` (direct) | Belongs to Organization, MedicalRecord, Service, Staff (optional); has one Queue |
| **Queue** | `organizationId` (direct) | Belongs to Organization, Appointment (unique); has one Consultation; unique on (organizationId, queueDate, queueNumber) |
| **Consultation** | Inherited: `queue.organizationId` | Belongs to Queue; has one Prescription |
| **Prescription** | Inherited: `consultation.queue.organizationId` | Belongs to Consultation (cascade delete); has many PrescriptionItems |
| **PrescriptionItem** | Inherited: `prescription.consultation.queue.organizationId` | Belongs to Prescription (cascade delete) |
| **AuditLog** | `organizationId` (direct) | Belongs to Organization, User (optional) |
| **Notification** | `organizationId` (direct) | Belongs to User, Organization |
| **NotificationPreference** | Inherited: `user.organizationId` | Belongs to User (1:1) |

### 4.3 Enums

| Enum | Values |
|---|---|
| `Role` | student, staff, admin, super_admin |
| `MedicalRecordStatus` | active, archived |
| `EmploymentStatus` | active, suspended, resigned, retired |
| `AppointmentStatus` | scheduled, confirmed, checked_in, in_progress, completed, cancelled, no_show |
| `QueueStatus` | waiting, called, in_progress, completed, cancelled |
| `DayOfWeek` | monday, tuesday, wednesday, thursday, friday, saturday, sunday |

### 4.4 Indexes (30+ total)

Key performance indexes added in migration `20260913133128`:
- `User`: `(organizationId)`, `(organizationId, role)`
- `Appointment`: `(organizationId, appointmentDate)`, `(organizationId, status)`, `(organizationId, appointmentDate, status)`, `(staffId, appointmentDate)`, `(medicalRecordId)`, `(serviceId)`
- `Queue`: `(organizationId, status)`
- `Staff`: `(departmentId)`, `(positionId)`, `(employmentStatus)`
- `Consultation`: `(consultationDate)`
- `PrescriptionItem`: `(prescriptionId)`
- `MedicalRecord`: `(recordYear)`
- `AuditLog`: `(organizationId, createdAt)` — composite replacing single `(organizationId)`

### 4.5 Migrations (28 total)

Chronological (Jul–Sep 2026): Organization → User → Profile → User email unique → MedicalRecords → Departments → Positions → Staff → Services → Appointments → Queue → Schedule → Consultation → AuditLogs → Prescription → Notifications → ResetToken → QueueDateUnique → Multitenant Indexes → Ensure `shms_app` role → **RLS Enable** → **RLS Fix Functions** → **Route Context Function** → Harden Tenant Reproducibility → **Medical Record Numbering** (adds `MedicalRecordCounter` + per-org `/ORG{Y}/{MM}` counter) → Align Counter Seed → **AuditLog Append-Only** (20260925120000 + 20260925120001 — table/function/trigger contract, forbids UPDATE/DELETE on `AuditLog`)

---

## 5. Multi-Tenancy

### 5.1 Design
- **Tenant key:** `organizationId` (cuid) on every tenant-scoped table
- **Tenant root:** `Organization` (global, no org key)
- **Two ownership patterns:**
  - Direct: table has `organizationId` column (User, Schedule, Department, Position, Service, Appointment, Queue, AuditLog, Notification, MedicalRecordCounter)
  - Inherited: org reached through FK chain (Profile → User, MedicalRecord → Profile → User, Staff → User, Consultation → Queue, Prescription → Consultation → Queue, PrescriptionItem → Prescription → Consultation → Queue, NotificationPreference → User)

### 5.2 Enforcement Layers

| Layer | Mechanism | Scope |
|---|---|---|
| **Application** | `resolveOrganizationId()`, `resolveUserScope()`, `withTenant()`, explicit `org !== user.org` checks in services | Every request |
| **RLS (PostgreSQL)** | `shms_row_visible()` predicate, `ENABLE + FORCE ROW LEVEL SECURITY` on all 17 tables | Database layer |
| **Middleware** | `tenant.middleware.js` (defined but **not mounted** on any route; tenancy is enforced in the service layer and at the DB via RLS) | None |

### 5.3 RLS Policy Architecture

- **`shms_row_visible(p_org)`** — Returns true if `current_setting('app.organization_id')` matches `p_org`, OR if `app.bypass_rls = 'true'` and org context is empty
- **Direct-org policies:** `USING (shms_row_visible("organizationId"))` + `WITH CHECK ("organizationId" = current_setting('app.organization_id'))`
- **Inherited policies:** `EXISTS` subqueries following FK chains to reach the org column
- **FORCE RLS** on all 17 tables (applies to table owner too, but superuser bypass still works)
- **SECURITY DEFINER functions** for pre-auth flows (login, password reset, route context) — the only global doorways

### 5.4 Tenant Isolation Verification

Cross-tenant API tests confirmed:
- Covenant student → Redeemer departments: **403**
- Redeemer staff → Covenant staff list: **403**
- Covenant student → Redeemer dashboard: **403**
- Super-admin global + per-org reads: **200**

---

## 6. Authentication & Authorization

### 6.1 Authentication Flow

1. **Login** (`POST /api/v1/auth/login`):
   - `shms_auth_user(identifier)` SECURITY DEFINER resolves user across all orgs by email, matric number, or staff number
   - Password verified via `bcrypt.compare`
   - JWT generated: `{ userId, organizationId, role }`, expires in `JWT_EXPIRES_IN` (default 1h)
   - Full user + profile + organization returned

2. **Register** (`POST /api/v1/auth/register`):
   - Pre-auth global duplicate checks (email, matric number) via SECURITY DEFINER
   - User + Profile created inside `withTenant(organizationId)`
   - JWT returned

3. **Verify** (`GET /api/v1/auth/verify`):
   - JWT decoded → `shms_user_route(userId)` SECURITY DEFINER returns user + profile + org
   - Attached to `req.user`

4. **Password Reset**: Forgot → email with token → reset (both use SECURITY DEFINER for global lookup)

### 6.2 Authorization

- **Role middleware:** `authorize("student", "staff", ...)` checks `req.user.role` against allowed roles
- **Four roles:** `student`, `staff`, `admin`, `super_admin`
- **Route-level restrictions:**
  - Student-only: profile, my appointments, my queue, check-in, create medical record
  - Staff/Admin/SA: dashboard, queue management, appointments (org), consultations, medical records (org), prescriptions
  - Admin/SA only: staff CRUD, department/position/service CRUD, reports, audit logs, organization management
  - Super_admin only: global views, cross-org operations

### 6.3 Token Storage
- Frontend: `localStorage` (`shms_token`, `shms_user`)
- Sent as `Authorization: Bearer <token>` header
- Auto-redirect to login on 401

---

## 7. API Inventory

All routes under `/api/v1/`. `*` = see note below the table:

| Module | Endpoints | Methods | Auth |
|---|---|---|---|
| **Auth** | `/auth/register`, `/auth/login`, `/auth/verify`, `/auth/forgot-password`, `/auth/reset-password` | POST, POST, GET, POST, POST | Public (authLimiter 30 req/15 min on `/api/v1/auth`), Public (rate-limited), JWT, Public (+ passwordResetLimiter 5 req/h), Public (+ passwordResetLimiter 5 req/h) |
| **Organizations** | `/organizations`, `/organizations/active`, `/organizations/:id` | GET, GET, GET | Admin/SA, Public, Admin/SA |
| **Profiles** | `/profiles/me` (GET, PUT), `/profiles/password` | GET, PUT, PUT | Student, Student, All |
| **Medical Records** | `/medical-records/me` (POST, GET), `/medical-records/me/:id`, `/medical-records/` (GET), `/medical-records/:id` | POST, GET, GET/PATCH, GET, GET/PATCH | Student, Student, Staff/Admin/SA, Staff/Admin/SA |
| **Departments** | `/departments/organization/:orgId`, `/departments/:id` | GET, GET/PATCH/DELETE | All, Admin/SA |
| **Positions** | `/positions/organization/:orgId`, `/positions/:id` | GET, GET/PATCH/DELETE | All, Admin/SA |
| **Staff** | `/staff/` (POST), `/staff/organization/:orgId` (GET), `/staff/:id` | POST, GET, GET/PATCH/DELETE | Admin/SA, All, Admin/SA |
| **Services** | `/services/organization/:orgId`, `/services/:id` | GET, GET/PATCH/DELETE | All, Admin/SA |
| **Appointments** | `/appointments/` (POST), `/appointments/my`, `/appointments/organization/:orgId`, `/appointments/slots/:staffId/:date`, `/appointments/doctors/available`, `/appointments/:id/cancel`, `/appointments/:id/reschedule`, `/appointments/:id` | POST, GET, GET, GET, GET, POST, POST, GET/PATCH/DELETE | All, Student, Staff/Admin/SA, All, All, Student, Student, Staff/Admin/SA |
| **Queues** | `/queues/check-in`, `/queues/my`, `/queues/today/:orgId`, `/queues/:id`, `/queues/call-next/:orgId`, `/queues/skip/:orgId`, `/queues/:id/start`, `/queues/:id/complete` | POST, GET, GET, GET, POST, POST, PATCH, PATCH | Student, Student, Staff/Admin/SA, Staff/Admin/SA, Staff/Admin/SA, Staff/Admin/SA, Staff/Admin/SA, Staff/Admin/SA |
| **Schedules** | `/schedules/` (POST), `/schedules/organization/:orgId`, `/schedules/staff/:staffId`, `/schedules/:id` | POST, GET, GET, DELETE | Staff/Admin/SA, All, All, Staff/Admin/SA |
| **Consultations** | `/consultations/` (POST, GET), `/consultations/:id` | POST, GET, GET/PATCH/DELETE | Staff/Admin/SA, Staff/Admin/SA |
| **Audit** | `/audit/`, `/audit/:id`*, `/audit/organization/:orgId` | GET, GET/DELETE* (DELETE returns 403), GET | Admin/SA (global), Admin/SA, Admin/SA |
| **Prescriptions** | `/prescriptions/` (POST, GET), `/prescriptions/:id` | POST, GET, GET/PATCH/DELETE | Staff/Admin/SA, Staff/Admin/SA |
| **Notifications** | `/notifications/` (GET), `/notifications/send-test`, `/notifications/read-all`, `/notifications/:id/read`, `/notifications/preferences` | GET, POST, POST, PUT, GET/PUT | All, All, All, All, All |
| **Dashboard** | `/dashboard/` (GET), `/dashboard/appointments`, `/dashboard/queue`, `/dashboard/health` | GET, GET, GET, GET | Staff/Admin/SA, Staff/Admin/SA, Staff/Admin/SA, Staff/Admin/SA |
| **Reports** | `/reports/appointments`, `/reports/consultations`, `/reports/patients`, `/reports/staff` | GET, GET, GET, GET | Admin/SA, Admin/SA, Admin/SA, Admin/SA |

\* `AuditLog` is **append-only** (enforced by application `removeAuditLog` throwing 403 and by database trigger/contract from migrations `20260925120000`/`20260925120001`); the `DELETE /audit/:id` route exists but always fails.

---

## 8. User Flows

### 8.1 Student Registration & First Login
1. Student visits `register.html`, selects organization, fills personal info
2. `POST /auth/register` → User + Profile created in tenant context
3. Redirected to `login.html`, logs in with email/matric + password
4. First login detected (no faculty/department) → redirect to `complete-profile.html`
5. Profile completed → redirected to `dashboard.html`

### 8.2 Appointment Booking (Student)
1. Student opens `appointments.html`
2. `GET /services/organization/:orgId` → list of services
3. `GET /staff/organization/:orgId` → list of doctors
4. `GET /schedules/staff/:staffId` → available time slots (or `GET /appointments/doctors/available?date=&serviceId=` → staff with an active schedule for the requested day, for the "No preference" path)
5. `POST /appointments` → appointment created (status: scheduled)
6. Student can check in on appointment day → `POST /queues/check-in`

### 8.3 Queue Management (Staff)
1. Staff opens `staff/index.html`
2. `GET /queues/today/:orgId` → today's queue
3. `POST /queues/call-next/:orgId` → next patient called
4. `PATCH /queues/:id/start` → consultation started
5. Staff creates consultation → `POST /consultations`
6. Staff creates prescription → `POST /prescriptions`
7. `PATCH /queues/:id/complete` → consultation completed

### 8.4 Admin Dashboard
1. Admin opens `admin/index.html`
2. `GET /dashboard?organizationId=:orgId` → counts, status breakdowns
3. Tabs: Dashboard (stats), Doctors (CRUD), Students (list), Schedules, Reports
4. Reports: `GET /reports/appointments`, `/reports/patients`, `/reports/staff`

---

## 9. Environment & Deployment

### 9.1 Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `JWT_SECRET` — JWT signing secret (required)
- `JWT_EXPIRES_IN` — Token TTL (default: 1h)
- `PORT` — Server port (default: 5000)
- `NODE_ENV` — development/production
- `CORS_ORIGINS` — Allowed CORS origins
- `FRONTEND_URL` — Frontend URL (default: http://localhost:5500)
- `EMAIL_WEBHOOK_URL` — Email webhook (optional)

### 9.2 Deployment

- **Docker:** Single-service `docker-compose.yml` (API only). PostgreSQL runs on host, reached via `host.docker.internal`.
- **PM2:** `ecosystem.config.cjs` for process management
- **No CI/CD pipeline** configured
- **No Redis, no PgBouncer** — rate limiting is in-process, no external caching
- **Frontend:** Static files served by Live Server (dev) or any static server

### 9.3 Current Scale (Test Data)
- 3 organizations: Redeemer, Covenant, Babcock
- ~10,000 users per org (30,013 total)
- ~10,000 profiles per org (30,007 total)
- DB size: ~36 MB
- All test users: `loadtest_` prefix, `@shms-loadtest.test` domain

---

## 10. Testing

### 10.1 Current State
- **No automated test suite** (no `test/` directory, no test scripts in `package.json`)
- **No unit tests, integration tests, or E2E tests**
- **Manual testing only** via Postman collections and browser
- **Security testing:** API-level isolation tests documented in `SHMS_MULTI_TENANT_HARDENING_REPORT.md`
- **Load testing scripts** in `.tmp/loadtest/` (investigation-specific, not reusable)

### 10.2 Linting
- ESLint configured (`eslint.config.js`) with `@eslint/js` recommended rules, `globals.node`, and `no-unused-vars` set to allow `_`-prefixed args
- No type checking (no TypeScript)

---

## 11. Scalability Work Status

### 11.1 Dashboard Bottleneck Investigation (Completed)
- **Problem:** `countProfiles` in `dashboard.repository.js:6` used relation-filtered count (`{ user: { organizationId } }`) which triggered per-row `EXISTS(User_pkey)` subplan under RLS
- **Measured:** ~144ms / 70,363 buffers at 10k users/org
- **Tested 8 alternative query shapes:** All yielded ~70k buffer cost (70,363 for direct, 40,020 for anyarray variant)
- **Conclusion:** No safe optimization without schema change (`Profile.organizationId` denormalization). No code change made.
- **Files:** `.tmp/loadtest/repro-dashboard.mjs`, `phase3-alternatives.mjs`, `phase3-staff-cons.mjs`

### 11.2 Controlled Scalability Experiment (Interrupted at Phase 1)
- **Goal:** 10k → 50k → 100k users per org
- **Phase 0 completed:** DB inspection (36 MB, PG 18.4, 30k users across 3 orgs)
- **Phase 1 blocked:** Server background processes die between bash calls in msys
- **Not resumed** — user pivoted to architecture report task

---

## 12. Current Problems & Known Issues

### 12.1 Performance
1. **Dashboard `countProfiles`** — Relation-filtered count costs ~144ms/70k buffers under RLS. Fix requires `Profile.organizationId` denormalization (schema + RLS migration).
2. **Dashboard `countStaff`** — Same relation-filtered pattern via `{ user: { organizationId } }`.
3. **Dashboard `countConsultations`** — Same pattern via `{ queue: { organizationId } }`.
4. **No query result caching** — Every dashboard load re-executes all 10 count queries.
5. **No connection pooling** — Prisma connects directly; no PgBouncer.

### 12.2 Security
1. **Runtime DB role unverifiable from repo** — `.env.example` documents the `shms_app` role (non-superuser, RLS-safe), but the local `.env` is gitignored. RLS is FORCE'd; if a superuser connection were used, RLS bypass would be inherent. Operations must confirm the runtime `DATABASE_URL` connects as `shms_app`.
2. **`tenant.middleware.js` is dead code** — Defined but never imported or mounted on any route. Tenant validation happens in the service layer (`withTenant`/`resolveUserScope`). The middleware file is inert.
3. **In-process rate limiting only** — `apiLimiter` (200 req/15 min global), `authLimiter` (30 req/15 min on `/api/v1/auth`), `passwordResetLimiter` (5 req/h on forgot/reset). No distributed limiter (no Redis).
4. **JWT expiry default 1h** — no refresh token mechanism.
5. **Audit log deletion blocked (append-only)** — The `DELETE /audit/:id` route exists but `removeAuditLog` throws 403 ("Audit log is append-only and cannot be deleted."), reinforced by DB trigger/contract migrations `20260925120000`/`20260925120001`.

### 12.3 Architecture
1. **No automated tests** — Zero test coverage.
2. **No TypeScript** — No static type checking.
3. **Frontend is vanilla JS** — No framework, no build step, no component system.
4. **Several frontend pages are stubs** — AI, Lab, Pharmacy, Telemedicine, Records are placeholder UIs with no backend.
5. **No WebSocket/real-time** — Queue updates require manual refresh or 30s polling.
6. **No background job processing** — `jobs/` directory is empty. Notifications are synchronous.
7. **No email service** — `email.js` exists but `EMAIL_WEBHOOK_URL` is optional and likely unconfigured.

### 12.4 Operational
1. **No CI/CD pipeline**
2. **No monitoring/alerting**
3. **Backups are external/out-of-band** — no in-repo or scheduled backup job (the local `backups/` directory is empty); DB backup/restore is an operator responsibility outside the application.
4. **No environment separation** (dev/staging/production)

---

## 13. Architectural Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Runtime DB role unverified — superuser connection would bypass RLS | High | Confirm `.env` `DATABASE_URL` connects as `shms_app`; keep Prisma off superuser |
| No automated tests | High | Add test suite before any refactoring |
| No refresh tokens | Medium | Implement token rotation or refresh flow |
| Dashboard perf at scale (10k+ users/org) | Medium | Consider materialized counts, caching, or `Profile.organizationId` |
| Frontend stubs (AI, Lab, Pharmacy, Telecom) | Medium | Complete or remove before production |
| No real-time queue updates | Medium | Add WebSocket or SSE for live queue |
| In-process rate limiting only (not distributed, no Redis) | Medium | Add Redis-backed limiter if load grows past a single instance |
| Single-process deployment (no clustering) | Low | PM2 cluster mode or Kubernetes |

---

## 14. What to Preserve

### 14.1 Strong Patterns (Keep)
1. **Layered architecture** (Route → Controller → Service → Repository) — clean separation of concerns
2. **`withTenant`/`withSuperAdmin` transaction pattern** — correct GUC injection, transaction-local, no leakage
3. **SECURITY DEFINER functions** for pre-auth flows — properly scoped, revoked from PUBLIC
4. **RLS policies** on all 17 tables — correct inheritance chains, no recursion
5. **Audit logging** on every mutation — non-failing, org-scoped
6. **Retry loops on unique constraints** — prevents race condition failures
7. **Status machine for appointments** — explicit allowed transitions
8. **Frontend API shape transformation** — backend-agnostic display layer

### 14.2 Data to Retain
- All 28 migrations (schema history)
- RLS policies and SECURITY DEFINER functions
- Test data (~30k users across 3 orgs) for scalability testing
- Investigation scripts in `.tmp/loadtest/` for reference

---

## 15. Final Summary

SHMS is a multi-tenant Student Health Management System with a Node.js/Express backend, PostgreSQL database with Row-Level Security, and a static HTML/JS frontend. The architecture follows a clean layered pattern (Route → Controller → Service → Repository) with a robust tenant-context mechanism using transaction-local PostgreSQL GUCs.

**Strengths:**
- Well-enforced multi-tenancy (application + database layers)
- Clean separation of concerns across 4 backend layers
- Comprehensive RLS implementation with SECURITY DEFINER pre-auth functions
- Audit trail on every mutation
- 18 Prisma models with 30+ indexes covering real query patterns

**Weaknesses:**
- Zero automated test coverage
- No TypeScript or static analysis
- Dashboard performance bottleneck at scale (relation-filtered counts under RLS)
- Runtime DB role unverified from repo (`.env` gitignored; `.env.example` documents `shms_app`)
- In-process rate limiting only (no Redis-backed distributed limiter)
- Vanilla JS frontend with no framework or build system
- Several frontend pages are stubs with no backend implementation
- No real-time capabilities, no background jobs, no CI/CD

**Immediate priorities for production readiness:**
1. Verify runtime `DATABASE_URL` connects as `shms_app` (not superuser)
2. Add automated test suite
3. Implement refresh token mechanism
4. Complete or remove frontend stubs
5. Consider dashboard count optimization (materialized counts or denormalization)
