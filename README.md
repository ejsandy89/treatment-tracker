# Treatment Tracker

A treatment calendar, appointments log, and test-results tracker with real
accounts: an **owner** can sign up and add their own data, and invite others
as an **admin** (same as the owner, including managing invites), an
**editor** (same data access, but can't manage invites/household), or a
**viewer** (read-only, plus the ability to add messages of support).

Built to run as an installable app on a phone, deployed on your own Netlify
account, with Supabase providing accounts, the database, and — importantly —
database-enforced permissions, so what each role can and can't do is
guaranteed by the database itself, not just hidden in the app's own code.

---

## 1. How it works

- **You (the owner)** sign up, create your household, and add data as
  normal. You're the only one who can never be removed from the household.
- **Anyone you invite** gets a link, and you choose their access level when
  you create it:
  - **Admin** — everything you can do, including managing invites and other
    members. Useful for a co-parent or partner you trust with full control.
  - **Editor** — can add, edit, and delete treatments, appointments, and
    results, same as you. Can't manage invites or the household itself.
  - **Viewer** — can see everything and add messages of support, but can't
    change any treatment, appointment, or result data.
- **Changes are live** — Supabase pushes updates instantly to everyone
  looking at the app, rather than needing a refresh.
- This needs two services working together: **Netlify** (hosts the app) and
  **Supabase** (accounts, database, permissions) — both free for this use.

## 2. Before you start

You'll need:
- Node.js (v18+) — https://nodejs.org
- A Netlify account
- A Supabase account — https://supabase.com (free, no credit card needed)
- The Netlify CLI: `npm install -g netlify-cli`

## 3. Set up Supabase

1. Go to **supabase.com**, sign in, and click **New project**. Pick any name
   and a database password (you won't need this password day-to-day — just
   store it somewhere safe).
2. Once it's finished provisioning (a minute or two), go to the **SQL
   Editor** in the left sidebar → **New query**.
3. Open **`sql/schema.sql`** from this project, copy the whole file, paste it
   into the SQL Editor, and click **Run**. This sets up every table and all
   the permission rules in one go.

   **Already set this up before and just want the new roles, or hit "new row
   violates row-level security policy for table households" when creating
   your household?** You don't need to redo everything:
   - Adding the "editor" role → run **`sql/migration_editor_role.sql`**
   - Adding the "admin" role → run **`sql/migration_admin_role.sql`**
     (safe to run either way, whether or not you've run the editor migration)
   - Fixing the household-creation error above → run
     **`sql/migration_fix_household_creation.sql`**
   - Adding push notifications → run **`sql/migration_push_notifications.sql`**

   All of these only add what's new and don't touch your existing data.
4. Go to **Project Settings → API** (or **Project Settings → Data API**).
   You'll need three values from this page:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon / public key** (a long string starting with `eyJ...`)
   - **service_role key** — only needed if you're setting up push
     notifications (step 8 below); skip it otherwise. Treat this one very
     differently from the anon key: it bypasses every permission rule in the
     database, so it only ever goes into Netlify's environment variables
     (server-side), never into a `VITE_`-prefixed variable, never committed
     to the repo, never pasted anywhere else.

   Keep this tab open — you'll paste these into Netlify next.

5. **Turn off email confirmation** (recommended for a small private app so
   you and viewers can sign in immediately without a confirmation email
   getting lost or delayed): **Authentication → Sign In / Providers → Email**
   → turn off "Confirm email". You can leave it on if you'd prefer the extra
   verification step — just know signup will show a "check your email"
   message first.

## 4. Set up the project locally

```bash
npm install
```

Create a file called `.env` in the project root (same folder as
`package.json`) with the two values from Supabase:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Then try it locally:

```bash
netlify dev
```

Sign up as yourself, create your household, and try adding a treatment —
this confirms Supabase is wired up correctly before deploying.

## 5. Deploy to Netlify

```bash
netlify login
netlify init
```

Then add the same two values as environment variables **on Netlify** (they
need to be set there separately from your local `.env` file):

**Site configuration → Environment variables → Add a variable**
- `VITE_SUPABASE_URL` = your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

Then deploy:

```bash
netlify deploy --prod
```

**Alternative:** push this folder to a GitHub repo and connect it in the
Netlify dashboard ("Add new site → Import an existing project") — Netlify
picks up `netlify.toml` automatically and redeploys on every push. Add the
same two environment variables there too (Site configuration → Environment
variables), since a Git-connected site doesn't read your local `.env` file.

## 6. Using it

- **First time:** open your site's URL, sign up, and you'll be prompted to
  create your household (just a name — anything works, e.g. "Kate's
  Tracker").
- **Inviting someone:** go to **Settings → Household & invites**, choose
  **Viewer**, **Editor**, or **Admin** from the access level dropdown, click
  **Create invite link**, then **Copy link** and send it however you like
  (text, WhatsApp, email). Whoever opens it signs up and is automatically
  added at the access level you chose. Links expire after 30 days; you can
  revoke one early if needed.
- **Logging in on another device:** just open the site and log in with the
  same email/password — no invite link needed for yourself.
- **Notifications:** turned off until you opt in — see **Settings →
  Notifications** on each device you want them on, and step 8 below to set
  up the sending side.

## 7. (Optional) Turn on real AI features

In the Netlify dashboard: **Site configuration → Environment variables →
Add a variable**, name it `ANTHROPIC_API_KEY`, and paste in a key from
[console.anthropic.com](https://console.anthropic.com). Redeploy afterwards.

This one key powers two optional features:
- Genuine AI note summaries (appointment notes, messages of support) —
  without it, these fall back to a simpler built-in sentence-split instead.
- The "Ask AI to explain" button on the Insights tab, which turns the
  statistical patterns it finds into a plain-English summary — without it,
  the raw findings still show, just without that extra narrative.

Since these are the only Netlify Functions the app uses (and both are
optional), deploying without any of this is simpler than before — but you
still need the CLI or a Git-connected deploy for environment variables to
apply correctly; plain drag-and-drop won't pick up the Supabase keys either.

## 8. (Optional) Turn on push notifications

Lets everyone get a notification when new data is added, and a reminder 24
hours before an appointment or treatment. This is the most involved optional
feature to set up — it needs a few more pieces than the AI features above —
but works fine without it if you'd rather skip it for now; the rest of the
app is unaffected either way.

**What you'll need, all as environment variables in the Netlify dashboard
(Site configuration → Environment variables → Add a variable):**

| Variable | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | `BDN8wxpDrWKa1bXayS3cGc4wIjWbCySXwfziGIg2t7E6k-zIG2RQGEwpUgIFtoSOexkyKuo-A-vnYneZ1H2pIpk` |
| `VAPID_PRIVATE_KEY` | `BTskLiS7m-S_9n0sqLbulwHzH7yvRrUT8mTf7VUJYsU` |
| `VITE_SUPABASE_URL`ᵃ | *(you already have this)* |
| `VITE_VAPID_PUBLIC_KEY` | same value as `VAPID_PUBLIC_KEY` above |
| `SUPABASE_URL` | same value as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Project Settings → API (see the warning in step 3) |

ᵃ already set from earlier — listed here just so the full picture of what
the notification functions need is in one place.

The VAPID key pair above is a real, working, freshly generated pair — safe
to use as-is, or generate your own any time with:
```bash
npx web-push generate-vapid-keys
```
(If you ever change these, everyone's existing subscriptions stop working
and each device needs to turn notifications on again.)

**Steps:**
1. Run **`sql/migration_push_notifications.sql`** in Supabase's SQL Editor
   (skip this if you're setting up fresh — it's already in `sql/schema.sql`).
2. Add all the environment variables in the table above.
3. Redeploy (push to GitHub, or `netlify deploy --prod`).
4. On each device you want notifications on: **Settings → Notifications →
   Turn on notifications on this device**, then use the two toggles to
   choose "new data added" and/or "24-hour reminders."

**Important limitation on iPhone:** push notifications only work once the
app has been added to the Home Screen (Share → Add to Home Screen) — a
regular Safari tab can't receive them at all, no matter what's toggled on.
Android and desktop browsers work either way (installed or just open in a
tab).

**How it actually works, if you're curious:** adding a new treatment,
appointment, blood result, measurement, or support message calls
`send-notification.js`, which pushes to everyone in the household except
whoever just made the change. Separately, `appointment-reminders.mjs` runs
once an hour (a Netlify Scheduled Function) checking every household for
anything happening in roughly 24 hours, so a reminder always goes out
somewhere between 23 and 25 hours ahead rather than at one exact moment.

## 9. Back up, export & restore

Owner-only, under **Settings → Backup, export & sharing**:

- **Export** creates a single encrypted file with everything (treatments,
  appointments, results, patient details) — useful as an offline backup.
  The file is unreadable without the passphrase you set, so it's safe to
  send by email or messaging apps; share the passphrase a different way.
- **Import** decrypts a backup file and loads it in, replacing what's
  currently there. Support messages import as new entries rather than
  replacing existing ones.

## 10. Install it on a phone

- **iPhone:** open the site in Safari → Share icon → "Add to Home Screen"
- **Android:** open the site in Chrome → menu (⋮) → "Install app"

## Project structure

```
├── src/
│   ├── App.jsx              — the whole app (auth, tabs, calendar, charts…)
│   ├── main.jsx               — React entry point
│   ├── sw.js                  — custom service worker (caching + push notifications)
│   └── lib/
│       ├── supabaseClient.js  — Supabase client setup
│       ├── db.js              — auth, household, data-access, and push notification functions
│       └── crypto.js          — encryption for backup export/import
├── sql/
│   ├── schema.sql               — run once in Supabase's SQL Editor (fresh installs)
│   ├── migration_editor_role.sql — run instead if upgrading an existing project
│   ├── migration_admin_role.sql  — run for the admin role on an existing project
│   ├── migration_fix_household_creation.sql — fixes the household-creation RLS error
│   └── migration_push_notifications.sql — run for push notifications on an existing project
├── netlify/functions/
│   ├── summarise.js           — optional AI note summariser
│   ├── analyse-patterns.js    — optional AI explanation for the Insights tab
│   ├── send-notification.js   — sends a push notification when new data is added
│   └── appointment-reminders.mjs — scheduled (hourly) 24-hour-ahead reminders
├── public/
│   ├── icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
│   ├── favicon.svg, favicon-16.png, favicon-32.png
│   └── _headers.example       — rename to _headers to password-protect the site further
├── netlify.toml
└── vite.config.js
```

## A note on security

Row Level Security (the rules in `sql/schema.sql`) is what actually enforces
"viewers can't edit" — it's checked by the database on every request, not by
the app's own code. That means even if there were a bug in the frontend, a
viewer genuinely cannot write to anything except support messages; the
database refuses it. The Supabase anon key in your environment variables is
safe to expose in frontend code for exactly this reason — it only grants
what these policies allow.

The **service_role key** (only needed for push notifications) is the
opposite: it bypasses Row Level Security entirely, for every table. That's
necessary for the notification functions, since they need to check every
household's subscriptions and preferences, not just one person's own — but
it also means this key must never end up in a `VITE_`-prefixed variable
(which ships to the browser), never get committed to the repo, and never get
pasted anywhere other than Netlify's own environment variables screen.
