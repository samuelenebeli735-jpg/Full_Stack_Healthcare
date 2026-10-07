# SHMS Mobile

Android-first Expo (React Native, TypeScript) client for the SHMS API. It uses the
same backend and database as the web frontend; it adds no endpoints of its own.

- Students: sign in, appointments, check-in, queue status, notifications, profile.
- Clinic staff: sign in, today's queue, consultations, prescriptions.
- Admin and Super Admin use the web dashboard (the app shows a notice).

## Development

1. Start the SHMS API so the phone can reach it: listen on all interfaces
   (`HOST=0.0.0.0`) and allow the port through the firewall (Private network).
2. Point the app at it in `.env.local` (git-ignored):

   ```
   EXPO_PUBLIC_API_URL=http://<this-PC-LAN-IP>:5000/api/v1
   ```

3. Install and start:

   ```bash
   npm install
   npx expo start --lan
   ```

4. Open the project in Expo Go on an Android phone on the same Wi-Fi
   (`exp://<this-PC-LAN-IP>:8081`).

Use `npx expo install <package>` to add dependencies (SDK-compatible versions).
Check the code with `npx tsc --noEmit`.

## Structure

- `src/app/` — screens (Expo Router): `login`, `student/*`, `staff/*`, `web-only`
- `src/api/` — typed API calls; `client.ts` unwraps `{ success, data }` and raises `ApiError`
- `src/auth/AuthContext.tsx` — session (token in SecureStore, verified at launch)
- `src/components/` — shared UI
