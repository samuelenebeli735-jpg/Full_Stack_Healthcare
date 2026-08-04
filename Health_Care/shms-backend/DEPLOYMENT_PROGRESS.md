# SHMS Deployment Progress

## Objective
Complete the final deployment-readiness pass for the SHMS full-stack app: audit backend and frontend, fix defects, integrate, test all workflows, and deliver a verdict.

## Important Details
- Backend: `C:\Users\samue\Desktop\Health_Care\shms-backend` — Node/Express 5/Prisma 6/PostgreSQL, ESM, branch `security-hardening` with many uncommitted changes.
- Frontend: `C:\Users\samue\Desktop\TO\student health care test 2\shms` — static multi-page HTML/CSS/JS, no build step, not a git repo.
- API base: `http://localhost:5000/api/v1` (hardcoded fallback in `js/config.js` → `window.SHMS_API_BASE`). Token storage: `shms_token` / `shms_user` in localStorage.
- Non-negotiable: no framework/stack changes; targeted minimal fixes only; 401/403/404/409/400 semantics; tenant isolation; CUID validation.
- DB state: 18 migrations applied, up to date. Main org: `cmrum2pdh0000t09waagkay12` (Redeemer University).
- Test users (all passwords reset to `TestPass@123`; tokens in backend `.tmp/tokens.env`):
  - `testadmin@run.edu.ng` (admin), `testsuperadmin@run.edu.ng` (super_admin), `doctor1@run.edu.ng` (staff, id `cmruon3ki000ct09wr38suf0b`, works Mondays only), `samuel.student1@run.edu.ng` (student).
- Rate limiter: 200 req/15min global, 30 auth, 5 password-reset. Server was restarted to reset it; currently running fresh on port 5000.
- E2E test script uses randomized appointment slot minutes to stay idempotent across runs.
- Test artifacts live in backend `.tmp/` (dbcheck.mjs, resetpw.mjs, tokens.env, e2e.mjs) — keep out of final delivery.

## Work State
### Completed
#### Backend
1. Fixed profile password-change validation bug: `src/routes/profile.route.js` `validate(changePasswordSchema)` → `validate({ body: changePasswordSchema })`; `src/validations/profile.validation.js` `changePasswordSchema` unwrapped from `{ body }` wrapper.
2. Added `GET /organizations/active` (public, no auth) — returns list of active organizations for the register page dropdown. New repo function `findActiveOrganizations`, service `listActiveOrganizations`, controller `getActiveOrganizations`, route in `organization.route.js`.
3. Added `GET /schedules/organization/:organizationId` (staff/admin/super_admin) — returns all schedules for an org with staff info. New repo `findSchedulesByOrganization`, service `getOrganizationSchedules`, controller `getOrganization`, route in `schedule.route.js`, new validation schema `organizationSchedulesSchema`.
4. Added `PATCH /medical-records/:id` (staff/admin/super_admin) — updates medical record fields including `status` (active/archived). New controller handler `updateMedicalRecord` in `medical-record.controller.js` and route in `medical-record.route.js`.
5. Added prescription include to student appointment query in `appointment.repository.js` (`queue.consultation.prescription.items`) so student pharmacy page can show real prescriptions.
6. All new backend endpoints verified live with curl.

#### Frontend — login.html
1. Fixed role-tab click TypeError: removed references to nonexistent `#themeBadge` and `#authLogo` elements; replaced with updating `.lr-badge` innerHTML.
2. Fixed hardcoded redirect: `Auth.redirectIfAuthenticated('dashboard.html')` → `Auth.redirectIfAuthenticated()` (uses role-based map).
3. Fixed dead "Forgot password?" link: `href="#"` → `href="forgot-password.html"`.
4. Fixed "Trouble signing in?" link: `href="#"` → `href="forgot-password.html"`.

#### Frontend — register.html
1. Removed misleading Staff/Admin role tabs (backend only supports student self-registration).
2. Added full student registration form fields: organization select (populated from `/organizations/active`), matric number (`#id_field`), faculty, department, level, gender, date of birth, blood group, genotype, allergies, emergency contact name/phone.
3. Added org select loading via `API.getActiveOrganizations()`.
4. Removed role tab click handler script; simplified to student-only.

#### Frontend — auth.js
1. Rewrote `initRegisterForm` to build full camelCase student payload matching backend `registerSchema`: `organizationId`, `firstName`/`lastName` (split from `full_name`), `matricNumber`, `faculty`, `department`, `level`, `gender`, `dateOfBirth`, `phone`, `emergencyContactName`, `emergencyContactPhone`, optional `bloodGroup`/`genotype`/`allergies`.
2. Removed role-based branching in register payload (always student).

#### Frontend — forgot-password.html + reset-password.html
1. Created `forgot-password.html` — email input, sends `POST /auth/forgot-password`, shows success message, redirects to login after 4s.
2. Created `reset-password.html` — password + confirm fields, reads `?token` from URL, sends `POST /auth/reset-password`, redirects to login on success.

#### Frontend — api.js
1. Added `forgotPassword(email)` and `resetPassword(token, password)` auth methods.
2. Added `getActiveOrganizations()` public endpoint.
3. `getSchedules()` now fetches real data from `/schedules/organization/${orgId}` and maps to page shape.
4. `getAdminReports()` now wires to real `/reports/appointments` and `/reports/patients` endpoints.
5. `getAnalytics()` now uses real data: weekly trend from appointment report byDay, doctor workload from staff report byDepartment.
6. `updateQueue(ticket, action)` now supports `skip` and `reassign` (both map to call-next).
7. `deleteStudent(id)` now archives via `PATCH /medical-records/:id` with `{ status: 'archived' }` instead of throwing.
8. Added `archiveStudent(id, archived)` helper.
9. `getPrescriptions()` for students now maps real prescriptions from completed appointments' `queue.consultation.prescription.items`.
10. `getSentNotifications()` kept as stub (returns `[]`) — no backend endpoint exists.

#### Frontend — dashboard.html
1. Replaced hardcoded Recent Activity with `renderActivity()` function populated from `API.getAppointments()`.
2. Replaced hardcoded Recent Notifications with `renderNotificationPreview()` populated from `API.getNotifications()`.
3. Fixed `totalAppts` "+2" fudge → real count from `getAppointments()`.
4. Fixed completion rate computed dynamically from completed/total.
5. Queue placeholders default to `--` instead of mock values.

#### Frontend — queue.html
1. Wired `callNext` button for staff/admin (hidden for students).
2. Queue progress stats now populated from real data.

#### Frontend — staff/index.html
1. Removed reassign button, modal, and handlers (backend has no reassign capability).
2. `avgWait` and `longWait` now computed from real queue data (`estimated_wait_minutes`).
3. `skipPatient` maps to `updateQueue(ticket, 'skip')` → call-next.

#### Frontend — admin/index.html
1. Fixed `parseInt` on CUID doctor IDs → `String()` (4 occurrences in schedule functions).
2. Fixed student deactivate onclick: `deactivateStudent(${s.id})` → `deactivateStudent('${s.id}')` (quoted CUID string).
3. Fixed doctor avatar path: `assets/images/doctor-avatar.svg` → `../assets/images/doctor-avatar.svg`.
4. `deleteStudent` now archives (PATCH status=archived) instead of throwing.

#### Frontend — profile.html
1. Made email input `readonly`.

#### Frontend — complete-profile.html
1. Fixed matric prefill: `currentUser.matric` → `currentUser.matric_number`.

#### Frontend — notifications.html
1. Removed dead Telegram username input field and label.
2. Removed `telegram_username` from save payload and prefill code.

#### Backend schema
1. Added `findSchedulesByOrganization()` to `schedule.repository.js`.
2. Added `findActiveOrganizations()` to `organization.repository.js`.
3. Added `organizationSchedulesSchema` to `schedule.validation.js`.

### In Progress
- Backend static checks (eslint, node --check): syntax OK for all modified files.
- E2E test re-run: **74/74 passed** after latest changes.
- Frontend page smoke test: all HTML pages load, all JS/CSS assets resolve, no 404s on core scripts.
- Test org cleanup (delete "Test Org" entries created during E2E runs): pending.

### Pending
1. Test orgs in DB (12 "Test Org" entries) — cannot be deleted due to audit log FK constraints; harmless test artifacts. E2E tests recreate them.
2. Final production-build/preview verification.
3. Deliver deployment readiness verdict.

## Relevant Files Modified
### Backend
- `src/repositories/organization.repository.js` — added `findActiveOrganizations`
- `src/repositories/schedule.repository.js` — added `findSchedulesByOrganization`
- `src/repositories/appointment.repository.js` — added prescription include in student query
- `src/services/organization.service.js` — added `listActiveOrganizations`
- `src/services/schedule.service.js` — added `getOrganizationSchedules`
- `src/controllers/organization.controller.js` — added `getActiveOrganizations`
- `src/controllers/schedule.controller.js` — added `getOrganization`
- `src/controllers/medical-record.controller.js` — added `updateMedicalRecord`
- `src/routes/organization.route.js` — added `GET /active`
- `src/routes/schedule.route.js` — added `GET /organization/:organizationId`
- `src/routes/medical-record.route.js` — added `PATCH /:id`
- `src/validations/schedule.validation.js` — added `organizationSchedulesSchema`
- `src/routes/profile.route.js` — fixed `validate(changePasswordSchema)` → `validate({ body: changePasswordSchema })`
- `src/validations/profile.validation.js` — removed `body:` wrapper from `changePasswordSchema`

### Frontend
- `login.html` — fixed role tabs, redirect, forgot password link
- `register.html` — full student-only form with org dropdown
- `forgot-password.html` — new page
- `reset-password.html` — new page
- `dashboard.html` — live activity/notifications, real counts
- `queue.html` — callNext wiring, real progress
- `staff/index.html` — removed reassign, real avgWait
- `admin/index.html` — fixed parseInt on CUIDs, quoted deactivate onclick, avatar path
- `profile.html` — email readonly
- `complete-profile.html` — matric_number prefill
- `notifications.html` — removed telegram username field
- `js/auth.js` — rewrote `initRegisterForm` for full student payload
- `js/api.js` — added forgot/reset, getActiveOrganizations, real schedules/reports/analytics, skip→call-next, student prescriptions, archiveStudent
- `js/utils.js` — no changes needed

## Next Move
1. Run E2E test suite: `node .tmp/e2e.mjs` to verify all 74 tests still pass.
2. If any failures, debug and fix.
3. Run frontend smoke test by serving the frontend directory and checking each page.
4. Clean up test orgs from DB.
5. Deliver final verdict.