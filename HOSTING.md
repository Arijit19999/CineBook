# CineBook — Hosting the backend + building a demo APK

A free, reviewer-friendly setup: host the API, then ship an APK that points at it
(no local setup, no `adb` tunnel for the reviewer).

## 1. Provision free infrastructure

| Need | Service | What you get |
|---|---|---|
| Postgres | **Neon** (neon.tech) | A `DATABASE_URL` (looks like `postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require`) |
| Redis | **Upstash** (upstash.com) | A `REDIS_URL` (`rediss://default:pass@xxx.upstash.io:6379`) |
| API host | **Render** (render.com) | Runs the Docker container, gives an HTTPS URL |
| AI | **Groq** (console.groq.com) | `GROQ_API_KEY` (free tier) |

> Upstash uses TLS (`rediss://`). `ioredis` handles it from the URL automatically.

## 2. Deploy the backend on Render (Docker)

1. Push this repo to GitHub.
2. Render → **New → Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Docker (Render auto-detects `backend/Dockerfile`)
   - **Instance type:** Free
4. **Environment variables** (Render dashboard → Environment):
   ```
   DATABASE_URL = <your Neon URL>
   REDIS_URL    = <your Upstash rediss:// URL>
   JWT_SECRET   = <any long random string>
   GROQ_API_KEY = <your Groq key>
   GROQ_MODEL   = openai/gpt-oss-20b
   NODE_ENV     = production
   ```
   (Don't set `PORT` — Render injects it; the server reads it.)
5. Deploy. On first boot the container runs `prisma migrate deploy`, seeds demo data
   **once** (seed-if-empty guard), then starts. You'll get a URL like
   `https://cinebook-api.onrender.com` — check `…/health`.

**Notes**
- Free Render **spins down after ~15 min idle** → first request after a nap cold-starts (~30s). Hit `/health` once to wake it before demoing.
- **Uploaded posters** (admin image upload) live on the container's local disk and are
  **wiped on redeploy** (free tier has no persistent disk). Demo-only; for permanence use
  Cloudinary/S3. Seeded movies use external poster URLs, so they always show.
- The `GROQ_API_KEY` stays **server-side** — it is never in the APK.

## 3. Build the demo APK (points at the hosted API)

```bash
cd mobile
flutter build apk --release --dart-define=API_BASE=https://<your-render-url>
```
- Output: `mobile/build/app/outputs/flutter-apk/app-release.apk`
- The APK is debug-signed (fine for a demo); installing it requires enabling
  "Install unknown apps" on the phone.
- Share it via a **GitHub Release** asset or Google Drive link.
- No `adb reverse` needed — the app talks to the public HTTPS backend directly.

## 4. What to tell the reviewer
- Install the APK, open it, log in:
  - Customer `+910000000001` · Manager `+910000000002` · Admin `+910000000003`
  - OTP is always **`123456`**
- Test cards: `4111111111111111` succeeds · `4000000000000002` fails.
- Promo codes: `WELCOME10`, `FLAT50`, `CINE20`, `WEEKEND15`.
- If the first action is slow, the API was asleep (free tier) — retry once.
- The AI chat uses a free Groq tier; heavy prompts may rate-limit briefly.

## 5. Other hosts (same idea)
- **Railway / Fly.io:** also use `backend/Dockerfile`; set the same env vars. Add a
  Neon Postgres + Upstash Redis (or the platform's managed addons).
- **Flutter Web instead of APK:** `flutter build web --dart-define=API_BASE=https://<url>`
  then deploy `build/web` to Netlify/Vercel/Firebase. CORS is already enabled
  (`origin: true`). Reviewer just opens a URL.
