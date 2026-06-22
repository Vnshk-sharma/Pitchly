# Cold DM Generator ✦

AI-powered cold outreach message generator. Built with Node.js + Express, Google Gemini AI (free), and Firebase Firestore (free) for persistent history. Deploy to Vercel in minutes.

> **Live demo:** _add your deployed Vercel URL here once deployed_
>
> ![Cold DM Generator screenshot](docs/screenshot.png)
> _(Add a screenshot or short GIF of the app here — this is the first thing people look at.)_

## Tech Stack
- Frontend: HTML, CSS, Vanilla JS
- Backend: Node.js + Express
- Auth: Email/password with bcrypt hashing + JWT sessions in an httpOnly cookie
- AI: Google Gemini 2.5 Flash Lite (Free)
- Database: Firebase Firestore (Free "Spark" tier)
- Deploy: Vercel (Free)

## Features
- **Authentication** — email/password signup & login, passwords hashed with bcrypt, sessions managed via a signed JWT stored in an httpOnly cookie (not accessible to client-side JS). All AI generation and history endpoints require a valid session.
- Multi-platform cold DM generation (LinkedIn, Twitter/X, Instagram, Email, Discord)
- Tone selection and up to 3 A/B variants per generation
- **Message history** — every generated DM is saved to Firestore, scoped to the logged-in user, and viewable in the History tab, with per-item delete and clear-all
- **Follow-up generator** — generate a short, polite follow-up for any DM (from the Generate panel or directly from a History card) when the recipient hasn't replied

History is stored in Firebase Firestore rather than a local file, so it persists correctly on Vercel's serverless, ephemeral filesystem — and works the same way whether you run this locally or deploy it.

---

## 1. Get a free Gemini API key

Visit https://aistudio.google.com/app/apikey, sign in with Google, click **Create API Key**, and copy it.

---

## 2. Create a free Firebase project + Firestore database

This takes about 5 minutes.

1. **Create a project.** Go to https://console.firebase.google.com, click **Add project**, give it a name, and finish the wizard (you can decline Google Analytics — it's not needed here).
2. **Create a Firestore database.** In the left sidebar, go to **Build → Firestore Database** → **Create database**. Choose **Start in production mode** (the app authenticates with an admin service account, which bypasses security rules entirely, so the default locked-down rules are fine). Pick any location.
3. **Generate a service account key.** Go to **Project settings** (gear icon) → **Service accounts** tab → click **Generate new private key**. This downloads a JSON file — keep it secret, it grants full admin access to your Firestore data. **Never commit this file to git.**
4. **Turn that file into env vars** (pick ONE option):
   - **Option A (recommended, especially for Vercel):** open the downloaded JSON file, copy its entire contents, and paste it as a single-line string into `FIREBASE_SERVICE_ACCOUNT_KEY`.
   - **Option B:** copy the `project_id`, `client_email`, and `private_key` fields out of the JSON individually into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.

You don't need to manually create any collections — the app creates them automatically on first use.

> **One-time setup note:** the history list query (`getAll`) filters by user and sorts by date, which needs a Firestore composite index. The **first time** that query runs against a brand-new project, Firestore will reject it with an error in your server logs containing a link like `https://console.firebase.google.com/.../firestore/indexes?create_composite=...` — open that link, click **Create index**, wait ~1 minute, and it'll work from then on. (A `firestore.indexes.json` is also included in this repo if you prefer deploying indexes via the Firebase CLI: `firebase deploy --only firestore:indexes`.)

---

## 3. Generate a JWT secret

Sessions are signed JWTs stored in an httpOnly cookie. Generate a long random secret for `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the output — you'll use it as `JWT_SECRET` below. Treat it like a password: never commit it, and use a different value in each environment (local vs. production). Anyone who has it can forge a valid login session.

---

## 4. Run Locally

```bash
# Install dependencies
npm install

# Create your .env file
cp .env.example .env
```

Open `.env` and fill in:
```
GEMINI_API_KEY=your_gemini_key_here
JWT_SECRET=the_long_random_string_you_generated_above
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...", ...}
```
(or the three split `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` vars instead of `FIREBASE_SERVICE_ACCOUNT_KEY` — see `.env.example`.)

Then start the server:
```bash
npm start
```
Open http://localhost:3000 — you'll land on the login/sign-up screen first. Create an account, and you're in.

For auto-reload during development:
```bash
npm run dev
```

You can sanity-check the database connection anytime at http://localhost:3000/health — it reports `"db": "connected"` once your Firebase credentials are working.

---

## 5. Deploy to Vercel (Free)

### Option A — Vercel Dashboard (Easiest)
1. Push this project to GitHub
2. Go to https://vercel.com and sign in
3. Click "Add New Project" → Import your repo
4. In **Environment Variables**, add:
   - Key: `GEMINI_API_KEY` → Value: your Gemini API key
   - Key: `JWT_SECRET` → Value: a long random string (generate a **separate** one for production — don't reuse your local `.env` value)
   - Key: `FIREBASE_SERVICE_ACCOUNT_KEY` → Value: the full JSON from your downloaded service account file, pasted as one line
5. Click **Deploy** → Done!

### Option B — Vercel CLI
```bash
npm install -g vercel
vercel

# When prompted, add environment variables:
# GEMINI_API_KEY = your_key_here
# JWT_SECRET = a_separate_long_random_string_for_production
# FIREBASE_SERVICE_ACCOUNT_KEY = the_full_service_account_json_as_one_line
```

After deploying, visit `https://your-app.vercel.app/health` to confirm `"db": "connected"`.

> **Why this works on Vercel now:** Vercel's serverless functions run on a read-only, ephemeral filesystem, so anything written to disk (like the old `data/history.json` approach) disappears on the next cold start or deploy. Firestore is a real hosted database reachable over the network, so history now persists permanently regardless of how many times your function cold-starts or redeploys. `db.js` also reuses a single Firebase Admin app / Firestore instance across invocations (cached at the module level) instead of reinitializing on every request, which keeps things fast.

---

## Authentication

- **Passwords** are hashed with `bcryptjs` (12 salt rounds) before being stored — the plaintext password is never persisted, and login compares hashes, not strings.
- **Sessions** are JSON Web Tokens (`jsonwebtoken`), signed with `JWT_SECRET` and valid for 7 days. The token is set as an **httpOnly** cookie (`colddm_token`), so it's never exposed to — or readable by — client-side JavaScript, which closes off a common XSS attack vector. It's also `secure` (HTTPS-only) in production and `sameSite=lax`.
- **Route protection**: `middleware/auth.js` exports `requireAuth`, applied to `/api/generate`, `/api/follow-up`, and `/api/history` in `app.js`. Any request without a valid session gets a `401` before it ever reaches a route handler (or touches Gemini/Firestore).
- **Per-user data isolation**: every history document is tagged with the owning `userId`, and every store method (`getAll`, `getById`, `deleteById`, `clearAll`, `addFollowUp`) takes the authenticated user's id and filters by it — one user can never read, modify, or delete another user's history, even if they somehow obtained a valid history entry id.
- **Unique emails**: `userStore.js` enforces one account per email using a dedicated `userEmails` Firestore collection (doc id = the normalized email) written inside the same transaction as the user record, so two concurrent signups for the same email can never both succeed.
- **Generic auth errors**: login failures always return the same `"Invalid email or password"` message, regardless of whether the email exists — this avoids leaking which emails have registered accounts (a common privacy/security oversight).
- **Brute-force mitigation**: `/api/auth/signup` and `/api/auth/login` are rate-limited separately from the AI-generation routes (`AUTH_RATE_LIMIT_MAX`, default 20 requests / 15 min).
- **Frontend**: `public/js/auth.js` handles the login/signup form, checks for an existing session on page load (`GET /api/auth/me`), and gates the rest of the app (`#app-shell`) behind a successful login. If a session expires mid-use, any `401` from the API bounces the user back to the login screen with a clear message rather than leaving a broken UI.

---

## Project Structure
```
cold-dm-fullstack/
├── server.js              Entry point: validates env, starts the HTTP server
├── app.js                  Express app setup (middleware, routes, error handler)
├── db.js                    Shared Firebase Admin / Firestore connection (used by every store)
├── historyStore.js         Firestore-backed history store, scoped per user
├── userStore.js             Firestore-backed user accounts (bcrypt password hashing)
├── config/
│   └── env.js              Fails fast at startup if required env vars are missing
├── services/
│   └── geminiService.js    Gemini API client (with request timeout)
├── middleware/
│   ├── auth.js              JWT signing/verification, session cookie, requireAuth
│   ├── validate.js         Zod request-validation schemas + middleware
│   └── errorHandler.js     Centralized error handling + async route wrapper
├── routes/
│   ├── health.js           GET /health
│   ├── auth.js               POST /api/auth/signup, /login, /logout, GET /me
│   ├── generate.js         POST /api/generate (requires auth)
│   ├── followUp.js         POST /api/follow-up (requires auth)
│   └── history.js          /api/history CRUD (requires auth)
├── tests/                   Jest + Supertest test suite (mocks Gemini + Firestore)
├── package.json             Dependencies + scripts
├── vercel.json              Vercel deployment config
├── firestore.indexes.json  Composite index needed by historyStore.getAll
├── .env.example             Environment variable template
├── .eslintrc.js / .prettierrc
├── .gitignore
└── public/
    ├── index.html           Frontend UI (Auth + Generate + History views)
    ├── css/style.css        Dark theme styles
    └── js/
        ├── auth.js          Login/signup form, session check, logout
        └── app.js           Generate/history app logic
```

### Architecture

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│   Browser    │ ───▶ │  Express server  │ ───▶ │  Google Gemini API  │
│ (public/js)  │ ◀─── │  (app.js/routes) │      │  (DM generation)    │
└──────────────┘      └────────┬─────────┘      └─────────────────────┘
                                │
                  requireAuth checks the
                  JWT httpOnly cookie first
                                │
                                ▼
                       ┌──────────────────┐
                       │ Firebase Firestore│
                       │  users + history  │
                       │  (per-user scope) │
                       └──────────────────┘
```

Requests to `/api/generate`, `/api/follow-up`, and `/api/history` first pass
through `requireAuth` (valid session required), then rate limiting and Zod
validation, before any Gemini or Firestore call is made. All errors flow through
a single centralized error-handling middleware for consistent JSON responses.

---

## Testing & CI

```bash
npm test              # run the test suite once
npm run test:watch    # re-run on file changes
npm run test:coverage # run with coverage report
npm run lint           # ESLint
```

Tests use **Jest** + **Supertest** and mock both the Gemini API client and
the data stores (`historyStore`, `userStore`/`db`), so the suite runs fully
offline with no real API key, Firebase project, or network access needed.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Your Google Gemini API key |
| `JWT_SECRET` | Yes | Long random string used to sign session tokens. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes* | Full service-account JSON (as one line). *Required unless the three split vars below are all set. |
| `FIREBASE_PROJECT_ID` | Yes* | Firebase project id. *Alternative to `FIREBASE_SERVICE_ACCOUNT_KEY`; must be set together with the two below. |
| `FIREBASE_CLIENT_EMAIL` | Yes* | Service account client email. |
| `FIREBASE_PRIVATE_KEY` | Yes* | Service account private key (keep the `\n` escapes as downloaded). |
| `PORT` | No | Local server port (default: `3000`). Vercel sets this automatically. |
| `CORS_ORIGIN` | No | Restrict CORS to a specific origin in production (default: `*`) |
| `AI_RATE_LIMIT_MAX` | No | Max requests per 15-min window for `/api/generate` and `/api/follow-up` (default: `30`) |
| `AUTH_RATE_LIMIT_MAX` | No | Max requests per 15-min window for `/api/auth/signup` and `/api/auth/login` (default: `20`) |

> The server validates required env vars on startup (`config/env.js`) and exits
> immediately with a clear message if `GEMINI_API_KEY`, `JWT_SECRET`, or a
> complete set of Firebase credentials is missing, instead of failing
> confusingly on the first request.

---

## Troubleshooting

- **`/health` shows `"db": "not configured"`** — no Firebase credentials are set. Check your `.env` file locally, or your Vercel project's Environment Variables.
- **`/health` shows a `db` error mentioning `FAILED_PRECONDITION` and a link** — the composite index Firestore needs for history queries hasn't been created yet. Open the link from the error (or your server logs) and click **Create index** — see step 2 above.
- **`Failed to parse private key`** — your `FIREBASE_PRIVATE_KEY` lost its newlines when pasted into `.env` or your platform's env var UI. Make sure it's wrapped in quotes with literal `\n` sequences (not real line breaks), exactly as it appears in the downloaded JSON file — or switch to `FIREBASE_SERVICE_ACCOUNT_KEY` instead, which sidesteps this entirely.
- **History "disappears" after redeploying on Vercel but worked locally** — this would only happen if your Firebase env vars weren't set in Vercel's environment variables (they're separate from your local `.env`, which never gets uploaded). Re-add them under Project Settings → Environment Variables and redeploy.
- **`"Invalid request: ...`" (400 response)** — request body failed schema validation (e.g. unsupported `platform` value, or `reason`/`about` missing/too long). The error message names the offending field.
- **`"Too many requests..."` (429 response)** — you've hit the rate limit on `/api/generate` or `/api/follow-up` (default: 30 requests / 15 min per IP). Adjust via `AI_RATE_LIMIT_MAX`.
- **`"Not authenticated. Please log in."` (401 response)** — you're hitting a protected route (`/api/generate`, `/api/follow-up`, `/api/history`) without a valid session cookie. Log in via the UI, or via `POST /api/auth/login`, first.
- **Stuck on the login screen even after logging in** — usually means the session cookie isn't being set or sent. Check that `JWT_SECRET` is set on the server, and that you're not mixing `http://` and `https://` between requests in production (the cookie is marked `secure` in production, so it requires HTTPS).
- **Server exits immediately on `npm start`** — `config/env.js` validates required env vars on boot and exits with a clear message if `GEMINI_API_KEY`, `JWT_SECRET`, or your Firebase credentials are missing. Check your `.env` file.

---

## Resume Description
> Cold DM Generator — Full-stack AI SaaS tool that generates personalized outreach messages using Google Gemini API, with user authentication, persistent per-user message history, and AI-generated follow-ups backed by Firebase Firestore. Implemented secure email/password authentication from scratch: bcrypt password hashing, JWT sessions delivered via httpOnly cookies, and per-user data isolation enforced at the data-access layer. Built with Node.js, Express, and vanilla JS, with a layered architecture (routes/services/middleware/stores), Zod request validation, separate rate limits for AI and auth endpoints, and centralized error handling. Includes a Jest/Supertest test suite (34+ tests covering auth, generation, and history). Deployed on Vercel with secure server-side API handling and a serverless-safe Firestore connection strategy.

---

## License
MIT — free to use, modify, and distribute.
