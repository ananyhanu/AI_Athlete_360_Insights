# AI Athlete 360

AI Athlete 360 is a local-first athlete assessment application built with TanStack Start, React, and TypeScript. Athlete profiles, captured videos, and assessment attempts are encrypted in IndexedDB with AES-256-GCM. A companion FastAPI service provides authenticated, encrypted cloud replication for athlete profiles and assessment attempts. The current assessment catalogue contains all ten prescribed workflows, but scores, benchmarks, and report content remain explicitly provisional until protocols and models are validated.

## Assessment Lifecycle

- Manual measurements and video captures are encrypted on-device before results are shown.
- Captured or uploaded videos are analyzed locally with MediaPipe Pose Landmarker Lite for body visibility and landmark quality. Invalid evidence is marked for retest; usable pose evidence remains subject to coach review and is never converted into an official performance score.
- The assessment summary, history, dashboard, and PDF report derive from encrypted attempts. The final provisional report unlocks only when all ten current attempts have been coach accepted.
- A local encrypted audit trail records creation, prototype evaluation, coach review, and every synchronization attempt or outcome.

## Authentication, Roles, and Sync

Without an API origin, login intentionally remains a local prototype coach session for offline UI development. When `VITE_ASSESSMENT_API_URL` is configured, login exchanges credentials with the secure API and retains its short-lived bearer token only in browser `sessionStorage`. A `401` clears that server-authenticated session and returns the user to login. Browser role filtering is an ergonomic guard; the API separately enforces authorization.

The sync workflow replicates pending athlete profiles first, then their dependent assessment attempts. Both use the local UUID plus version as an idempotency key. The API persists the JSON payloads encrypted with a deployment-provided Fernet key and scopes athlete records and assessment writes to the authenticated coach.

## Secure API Service

The service in [backend](backend) includes FastAPI, PostgreSQL support, Alembic migrations, Argon2id password hashes, JWT bearer authorization, security headers, restricted CORS/trusted-host configuration, encrypted athlete and assessment payloads, idempotency/version conflicts, and immutable audit events. It provides:

- `POST /v1/auth/token` for password sign-in.
- `POST`, `GET`, `PATCH`, and replication `PUT` endpoints for owner-scoped athlete records.
- `POST /v1/assessment-attempts` and athlete-scoped assessment reads.

For a deployment, configure secrets in `backend/.env` from `backend/.env.example`, apply migrations, bootstrap the first administrator, then run the API:

```sh
cd backend
alembic upgrade head
python -m app.bootstrap
uvicorn app.main:app --host 0.0.0.0 --port 8080 --proxy-headers
```

The Docker image runs `alembic upgrade head` before starting Uvicorn. Production environments must use PostgreSQL, HTTPS, a managed secret store for `AA360_JWT_SECRET` and `AA360_DATA_ENCRYPTION_KEY`, a narrowly configured `AA360_CORS_ORIGINS`, and a user-provisioning process that does not expose bootstrap credentials.

To enable authenticated browser sync, configure the client at build time with an absolute HTTPS API origin:

```sh
VITE_ASSESSMENT_API_URL=https://assessments.example.in
```

For local development only, a loopback HTTP origin such as `http://localhost:8080` is accepted.

## Remaining Production Gates

MediaPipe currently supplies real pose-quality evidence only. It does not provide validated test measurements, standardized scoring, talent identification, benchmark comparison, clinical advice, or injury-risk decisions. Its fixture values must not be used as official assessment results.

Video blobs currently remain encrypted on the device and are not uploaded. Before cloud video retention is enabled, add encrypted object storage with short-lived, owner-scoped upload/download URLs, malware scanning, retention/deletion policies, and an explicit consent flow. The API also still needs operational user provisioning/password reset, token revocation or refresh, login rate limiting, monitoring, backups, incident response, and a privacy review before any public deployment.

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Run the available checks before a release:

```sh
npm test
npm run build
```

## Mobile PWA

The application is installable as an app on both supported mobile platforms when hosted over HTTPS (or on `localhost` for development).

- Android: open the site in Chrome and choose **Install app**.
- iOS: open the site in Safari, use **Share**, then choose **Add to Home Screen**.

The PWA includes a web manifest, Android/maskable and Apple touch icons, safe-area viewport support, and a service worker that caches only public shell assets. Rendered athlete routes and API responses are intentionally not cached by the worker, preventing future server-rendered personal data from entering the public cache.

## Native Packaging

This repository currently builds an SSR/Nitro deployment bundle. Its `.output/public` output does not contain a root `index.html`, so it is not a valid Capacitor `webDir`. Do not add Android or iOS Capacitor projects against that output: the resulting native app would not have a reliable offline entry point.

Before generating Capacitor projects, create and test a dedicated static mobile build that emits a root `index.html` and supports every required route without a server. Android packaging can be prepared on Windows after that build exists. Final iOS archive/signing requires macOS with Xcode and an Apple Developer signing setup.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
