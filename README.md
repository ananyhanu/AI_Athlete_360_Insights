# AI Athlete 360 Insights

AI Athlete 360 Insights is a local-first, coach-reviewed athlete assessment prototype. It supports a ten-test fitness battery, encrypted device storage, browser-based video capture or upload, local pose analysis, provisional AI estimates, coach validation, downloadable PDF reports, and optional encrypted API synchronization.

The application is deliberately designed to distinguish an observed AI estimate from an official assessment result. A coach must review every captured result before it becomes accepted, and unusable videos require a retake instead of receiving a fabricated score.

## Contents

- [What the prototype does](#what-the-prototype-does)
- [Assessment battery](#assessment-battery)
- [Assessment workflow](#assessment-workflow)
- [AI measurement and validation](#ai-measurement-and-validation)
- [Architecture](#architecture)
- [Local data, privacy, and security](#local-data-privacy-and-security)
- [Frontend setup](#frontend-setup)
- [Backend API setup](#backend-api-setup)
- [API reference](#api-reference)
- [Testing and build](#testing-and-build)
- [PWA and native status](#pwa-and-native-status)
- [Production readiness boundaries](#production-readiness-boundaries)
- [Repository map](#repository-map)

## What the prototype does

- Registers athletes and maintains their assessment history.
- Runs a configurable battery of ten fitness-test workflows.
- Captures a new video in the browser or accepts an uploaded video for movement tests.
- Runs MediaPipe Pose Landmarker Lite locally in the browser to inspect pose visibility, framing, and movement evidence.
- Produces a provisional movement-based estimate for each supported video workflow when analysis is usable.
- Range-checks estimates, derives a provisional range-normalized score, and flags out-of-range results for coach intervention.
- Accepts calibrated manual Height and Weight entries with allowed-range validation.
- Requires coach validation and acceptance before an attempt is treated as completed.
- Stores athlete profiles, captures, attempts, and audit events in encrypted IndexedDB.
- Generates provisional PDF reports from the accepted assessment data.
- Optionally synchronizes athletes and assessment attempts to a secure FastAPI service when an API origin is configured.

## Assessment battery

All records are provisional. The measurement ranges below are plausibility and workflow-validation bounds; they are not sport-, age-, sex-, or federation-specific performance benchmarks.

| Test | Method | Output | Configured allowed range | Current result source |
| --- | --- | --- | --- | --- |
| Height | Manual | cm | 80-250 cm | Coach entry from a calibrated device |
| Weight | Manual | kg | 15-300 kg | Coach entry from a calibrated scale |
| Sit & Reach | Video | cm | 0-100 cm | Wrist-travel pose estimate |
| Standing Vertical Jump | Video | cm | 5-150 cm | Vertical pose-displacement estimate |
| Standing Broad Jump | Video | m | 0.5-5 m | Horizontal pose-displacement estimate |
| Medicine Ball Throw | Video | m | 0.5-30 m | Wrist-trajectory pose estimate |
| 30m Sprint | Video | s | 3-20 s | Observed video movement duration |
| 4x10m Shuttle Run | Video | s | 5-60 s | Observed video movement duration |
| Sit-Ups | Video | reps | 0-150 reps | Torso-cycle estimate extrapolated to 60 seconds |
| Endurance Run | Video | m | 100-20,000 m | Pose-travel proxy estimate |

### Capture guidance

For video workflows, place the device on a stable surface approximately three metres from the athlete. Use adequate light, a plain background, and keep one athlete fully visible throughout the movement. Built-in recordings use browser-supported WebM and flush media chunks before saving to improve decode reliability.

Three sample videos are included under [sample_video](sample_video) for the 30m Sprint, Medicine Ball Throw, and Standing Vertical Jump workflows.

## Assessment workflow

1. A coach signs in or starts the offline prototype session and selects an athlete.
2. The coach chooses a test from the battery.
3. For Height and Weight, the coach records a value from a calibrated measurement device.
4. For movement tests, the coach uploads a video or records one in the browser.
5. The application encrypts and saves the capture locally, then samples frames with MediaPipe Pose.
6. Pose quality is checked using detected frames, landmark visibility, and body-in-frame rate.
7. A usable timeline is converted into a provisional test-specific metric and range-normalized score.
8. The result remains in `awaiting coach review`; the coach may confirm or replace the metric and assign the final provisional rating and score.
9. The coach accepts the validated attempt or requests a retest.
10. Dashboards, history, summary, synchronization, and PDF reports use the persisted attempt state.

### Capture outcomes

| Outcome | Meaning | Next action |
| --- | --- | --- |
| Usable provisional estimate | Pose quality and a test-specific movement signal were available. | Coach reviews, validates, and accepts or requests a retest. |
| Out-of-range provisional estimate | A movement signal was available, but the result fell outside the configured allowed range. | Coach intervention is required before the result can be used. |
| Invalid capture | The file is not a usable video, is too short, cannot be decoded, or fails pose-quality requirements. | Retake the video. No score is fabricated. |
| Saved retryable capture | A saved, unaccepted capture has no usable AI metric. | Use **Run AI Analysis Again** after correcting the analysis environment or capture conditions. |

Accepted or rejected attempts cannot be silently reanalyzed. This preserves the audit trail and prevents an accepted coach decision from being overwritten by a later automated run.

## AI measurement and validation

### What is implemented

MediaPipe Pose Landmarker Lite runs in the client using local model and WASM assets. The analyzer samples video frames and records compact evidence including:

- Number of analyzed and detected frames
- Mean landmark visibility
- Body-in-frame rate
- Observed movement duration
- Normalized horizontal and vertical displacement/travel
- Wrist travel
- Optional torso movement cycles

The estimator maps that evidence to a test-specific provisional value. Timing tests use the observed movement timeline. Other movement tests use body-height-normalized pose signals, with the athlete height used as an optional reference where appropriate. Sit-Ups uses torso cycles extrapolated to 60 seconds.

Each estimate is rounded to the test entry step, compared with the configured minimum and maximum, and assigned a provisional score from `15` to `100` when in range. Sprint and shuttle timing use lower-is-better normalization. A result outside the allowed range remains visible but receives score `0` and requires coach intervention.

### Height and Weight

Height and Weight do not use a generic video estimate. The app requires a coach-entered value from a calibrated stadiometer, scale, or other approved device. A valid entry shows an `Allowed-range validation` score of `100`; this confirms that the value is plausible within the configured range, not that it is an athletic-performance benchmark.

### Important limitations

- Pose-derived distances, counts, and durations are not calibrated official measurements.
- The app does not currently use reference rulers, court/track markers, timing gates, ball tracking, GPS, or dense frame-by-frame repetition classification.
- The range-normalized score is provisional and must not be treated as a clinical result, injury-risk prediction, talent-selection decision, or official benchmark.
- A pose model cannot safely infer Height or Weight from ordinary video without a validated calibration protocol.
- Coaches remain responsible for applying the approved assessment protocol and assigning the final accepted value, score, and rating.

## Architecture

```mermaid
flowchart LR
	Coach[Coach] --> App[React and TanStack Start application]
	App --> Capture[Browser camera or video upload]
	Capture --> Crypto[AES-256-GCM encrypted IndexedDB capture]
	Capture --> Pose[Local MediaPipe Pose analysis]
	Pose --> Evaluation[Provisional evaluator and range validation]
	Evaluation --> Review[Coach validation and acceptance]
	Review --> Attempts[AES-256-GCM encrypted assessment attempts and audit trail]
	Attempts --> Report[Provisional PDF report]
	Attempts --> Sync[Optional sync service]
	Sync --> API[FastAPI authenticated API]
	API --> Database[PostgreSQL encrypted payload storage]
```

### Frontend

- React 19 and TypeScript
- TanStack Router and TanStack Start / Nitro SSR build
- Vite 8
- Tailwind CSS and Radix UI primitives
- Dexie for IndexedDB access
- Web Crypto AES-256-GCM for local encrypted records
- MediaPipe Tasks Vision Pose Landmarker Lite for in-browser pose analysis
- jsPDF for downloadable provisional reports
- Vitest for unit and workflow tests

### Backend

The optional service in [backend](backend) uses FastAPI, SQLAlchemy, Alembic, PostgreSQL, Argon2id password hashes, JWT bearer authentication, and Fernet-encrypted payload storage. The browser can run without it for offline prototype work.

The sync order is intentionally dependency-aware: pending athlete profiles synchronize before dependent assessment attempts. Local UUIDs and versions support idempotent writes and conflict detection. Video blobs stay encrypted on the device and are not uploaded by the current API.

## Local data, privacy, and security

### Local persistence

The browser stores the following records separately in IndexedDB:

- Athlete profiles
- Video-capture metadata and encrypted blobs
- Assessment attempts and evaluations
- Audit events
- Sync state and optimistic-concurrency versions

Payloads are encrypted with AES-256-GCM through the Web Crypto API before they are persisted. This is local-at-rest protection, not a replacement for operating-system, device, browser-profile, or institutional security controls.

### Authentication and authorization

Without `VITE_ASSESSMENT_API_URL`, login is an intentionally local prototype coach session for offline UI development. With an API origin configured, the client signs in against the backend and retains the short-lived bearer token only in `sessionStorage`. A `401` clears the session and returns the user to the login screen.

Client-side role checks improve the user experience but are not a security boundary. The backend independently enforces authenticated permissions and owner-scoped athlete/assessment access.

### API security measures

- Argon2id password hashing
- JWT bearer tokens
- Encrypted persisted athlete and assessment payloads using a deployment-provided Fernet key
- Restricted CORS and trusted-host configuration
- HTTPS redirect and HSTS in production
- `Cache-Control: no-store`, `X-Content-Type-Options`, and `Referrer-Policy` response headers
- Request correlation IDs
- Idempotency keys and version-conflict handling
- Immutable assessment audit events

## Frontend setup

### Prerequisites

- Node.js 20 or later
- npm 10 or later
- A modern browser with camera permission for browser recording

### Install and run

```sh
git clone https://github.com/ananyhanu/AI_Athlete_360_Insights.git
cd AI_Athlete_360_Insights
npm install
npm run dev
```

The `predev` script copies the MediaPipe model and WASM assets into `public/mediapipe` and `public/models`. Open the local URL Vite prints, normally `http://localhost:3000` or the next available port.

### Optional frontend environment

Create a local environment file only when connecting to the backend:

```sh
VITE_ASSESSMENT_API_URL=http://localhost:8080
```

Use an absolute HTTPS URL outside local development, for example:

```sh
VITE_ASSESSMENT_API_URL=https://assessments.example.in
```

Do not commit environment files containing deployment values or secrets.

## Backend API setup

### Prerequisites

- Python 3.12 or later
- PostgreSQL for production-like use
- A virtual environment

### Configure and start

```sh
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
python -m app.bootstrap
uvicorn app.main:app --host 0.0.0.0 --port 8080 --proxy-headers
```

On macOS or Linux, activate the environment with:

```sh
source .venv/bin/activate
```

Configure `backend/.env` from [backend/.env.example](backend/.env.example). The required settings are:

| Variable | Purpose |
| --- | --- |
| `AA360_ENVIRONMENT` | `production` enables production-only HTTPS behavior. |
| `AA360_DATABASE_URL` | PostgreSQL SQLAlchemy connection URL. |
| `AA360_JWT_SECRET` | At least a 32-character JWT signing secret from a secret manager. |
| `AA360_DATA_ENCRYPTION_KEY` | Fernet payload-encryption key from a KMS or secret manager. |
| `AA360_CORS_ORIGINS` | Comma-separated allowed application origins. |
| `AA360_TRUSTED_HOSTS` | Comma-separated accepted API hosts. |

The Docker image applies Alembic migrations before starting Uvicorn. For an API health check, call `GET /healthz`; a healthy response is `{ "status": "ok" }`.

## API reference

All protected endpoints require a bearer token and enforce permissions on the server. State-changing requests use `Idempotency-Key`; updates also use `If-Match` for the expected version where applicable.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Service health check. |
| `POST` | `/v1/auth/token` | Password sign-in and token issuance. |
| `POST` | `/v1/athletes` | Create an owner-scoped athlete record. |
| `GET` | `/v1/athletes` | List athletes owned by or assigned to the authenticated coach. |
| `GET` | `/v1/athletes/{athlete_id}` | Read one authorized athlete record. |
| `PATCH` | `/v1/athletes/{athlete_id}` | Update an athlete with optimistic concurrency. |
| `PUT` | `/v1/athletes/{athlete_id}/sync` | Idempotently synchronize a local athlete record. |
| `POST` | `/v1/assessment-attempts` | Create or idempotently upsert an assessment attempt. |
| `GET` | `/v1/athletes/{athlete_id}/assessment-attempts` | List authorized attempts for an athlete. |

Example sign-in request:

```sh
curl -X POST http://localhost:8080/v1/auth/token \
	-H "Content-Type: application/json" \
	-d '{"email":"coach@example.in","password":"replace-with-your-password"}'
```

Error responses use a stable envelope such as:

```json
{
	"code": "validation_failed",
	"message": "Request validation failed."
}
```

## Testing and build

Run the frontend suite and production build before publishing a change:

```sh
npm test
npm run build
```

Focused examples:

```sh
npm test -- --run src/lib/ai-measurement.test.ts
npm test -- --run src/lib/provisional-evaluator.test.ts
./node_modules/.bin/tsc.cmd --noEmit
```

On Windows, use `./node_modules/.bin/tsc.cmd --noEmit`; on macOS or Linux, use `./node_modules/.bin/tsc --noEmit`.

The frontend test suite covers encrypted persistence, authentication/session behavior, coach scoring, battery configuration, pose-motion summaries, provisional evaluation, range validation, reporting, local workflow, and synchronization services. Backend API tests live in [backend/tests](backend/tests).

## PWA and native status

The application is installable as a Progressive Web App when served over HTTPS, or on `localhost` during development.

- Android: open the hosted app in Chrome and choose **Install app**.
- iOS: open the hosted app in Safari, choose **Share**, then **Add to Home Screen**.

The PWA includes a web manifest, Android and Apple icons, safe-area support, and a service worker that caches public shell assets. Athlete routes and API responses are intentionally excluded from the public cache.

This repository builds an SSR/Nitro bundle. `.output/public` does not contain a root `index.html`, so it is not a valid Capacitor `webDir`. Do not create Android or iOS Capacitor projects from this output. A separately tested static mobile build with an offline route entry point is required first; iOS signing and final archive creation additionally require macOS, Xcode, and an Apple Developer signing setup.

## Production readiness boundaries

This is a working prototype, not an official sports-assessment system. Before a public, institutional, or high-stakes deployment, complete the following work:

- Validate each measurement model against approved protocols, calibrated devices, and representative real-world data.
- Define approved age-, sex-, sport-, and program-specific benchmarks with domain experts.
- Add marker/ruler calibration, timing-gate validation, line detection, ball tracking, lap or GPS measurement, and validated repetition classification as appropriate.
- Run model performance, bias, reliability, and drift evaluations.
- Implement encrypted object storage for videos with owner-scoped short-lived access URLs, malware scanning, retention/deletion policies, and explicit consent.
- Establish production identity management, password reset, token rotation or revocation, rate limiting, monitoring, backups, incident response, and audit operations.
- Use HTTPS, PostgreSQL, managed secret storage, restricted CORS/trusted hosts, privacy review, data retention policies, and applicable legal/compliance review.
- Conduct accessibility, mobile-device, performance, security, and disaster-recovery testing.

## Repository map

```text
src/
	routes/                 TanStack application routes and assessment screens
	components/             Application shell, report/share UI, and design primitives
	hooks/                  React hooks, including assessment auto-sync
	lib/                    Domain models, encrypted repositories, AI analysis, PDF, and sync logic
	test/                   Shared Vitest setup
backend/
	app/                    FastAPI routes, security, services, schemas, and models
	alembic/                Database migrations
	tests/                  Backend API tests
public/
	mediapipe/              Local MediaPipe WASM runtime assets
	models/                 Local Pose Landmarker model
	manifest.webmanifest    PWA manifest
sample_video/             Included assessment-video samples
scripts/
	copy-mediapipe-assets.mjs  Copies runtime model/WASM assets before dev and build
```

## Project status

The current source supports a complete demonstrable assessment workflow with encrypted local persistence, provisional local AI estimates for all eight video tests, calibrated manual Height/Weight entry, coach review, retake/reanalysis behavior, reporting, and optional secure record synchronization. It does not claim official automated measurement or official performance scoring.

## Lovable integration

This project is connected to [Lovable](https://lovable.dev). Avoid rewriting published Git history with force pushes, rebases, amendments, or squashes. Normal commits pushed to the connected branch synchronize back to the Lovable editor.
