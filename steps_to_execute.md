# AI Athlete Insights - Local Setup Guide

## Frontend Setup

Run the following commands in the VS Code terminal from the project root:
-- bash

cd "C:\Users\anany hanu vaishnav\Downloads\AI Athlete Insights (3)"
npm install
npm run dev

Vite will start the development server and print a local URL, typically:

```text
http://localhost:3000
```
Open the URL above in your browser.
---

## Backend Setup (FastAPI)

Open a **second VS Code terminal** and run:

```bash
cd "C:\Users\anany hanu vaishnav\Downloads\AI Athlete Insights (3)\backend"

python -m venv .venv

.venv\Scripts\Activate.ps1

pip install -r requirements.txt

Copy-Item .env.example .env

alembic upgrade head

python -m app.bootstrap

uvicorn app.main:app --host 0.0.0.0 --port 8080 --proxy-headers
```

The backend will be available at:

```text
http://localhost:8080
```
---

## Connect Frontend to Backend

Create a file named **`.env.local`** in the project root and add:

```env
VITE_ASSESSMENT_API_URL=http://localhost:8080
```

After creating the file, restart the frontend:

```bash
npm run dev
```

---
## Useful Commands

Run tests:

```bash
npm test
```

Create a production build:

```bash
npm run build
```
