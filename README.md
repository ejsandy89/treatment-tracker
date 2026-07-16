# Treatment Tracker

A treatment calendar, appointments log, and test-results tracker — built to
run as an installable app on your phone, deployed on your own Netlify
account, with **live, shared data** so everyone using the app sees the same
up-to-date information.

This started life as a Claude artifact. This version is a real, standalone
web app: it builds with Vite, stores its data in Netlify Blobs (via a small
Netlify Function), and can be "installed" to a phone's home screen as a
Progressive Web App (PWA).

---

## 1. How the data works

- **Everyone who opens the site's URL shares the same data.** There's no
  per-person login — it's one live record. If you add a treatment on your
  phone, it's there next time anyone else loads or refreshes the app on
  theirs.
- **There's no per-user login, so the URL is the access boundary.** Anyone
  with the link can see and edit everything, including patient details. See
  step 7 before sharing it with more than just close family.
- **Because it's shared data, this needs the Netlify CLI (or a connected Git
  repo) to deploy — plain drag-and-drop won't work.** Drag-and-drop only
  uploads static files; it can't run the Netlify Function this app needs to
  read and write shared data. See step 5.

## 2. What you're getting

- **Installable on a phone.** Once deployed, opening the URL in Safari
  (iOS) or Chrome (Android) and choosing "Add to Home Screen" gives you an
  app icon and a full-screen window. It isn't in the App Store — that's
  normal for this kind of app and doesn't affect how it works.
- **AI note summaries are optional.** Without any setup, appointment notes
  still get turned into bullet points using a simple built-in fallback. If
  you later want genuinely AI-generated summaries, see step 8.

## 3. Before you start

You'll need:
- Node.js installed on your computer (v18+) — https://nodejs.org
- A Netlify account (you said you already have one)
- The Netlify CLI: `npm install -g netlify-cli`

## 4. Try it locally first

```bash
npm install
netlify dev
```

`netlify dev` runs the app *and* the Netlify Function together (with a local
sandbox version of the data store), at `http://localhost:8888`. Running
`npm run dev` on its own will start the app, but saving will fail with
network errors, since the function isn't running — always use `netlify dev`
for local testing.

## 5. Deploy to Netlify

From inside this project folder:

```bash
netlify login
netlify init
```

`netlify init` asks whether to create a new site or link an existing one —
either is fine — and detects the build command and publish folder
automatically from `netlify.toml`. Then:

```bash
netlify deploy --prod
```

That deploys the app and the function together, and gives you a
`https://your-site-name.netlify.app` URL.

**Alternative:** push this folder to a GitHub repo and connect it in the
Netlify dashboard ("Add new site → Import an existing project"). Netlify
picks up `netlify.toml` and redeploys automatically every time you push —
better long-term if you plan to keep tweaking things.

**Making changes later:** `netlify deploy --prod` again, or just push to
GitHub if you connected a repo.

## 6. Back up, export & restore

Under **Settings → Backup, export & sharing** in the app itself:

- **Export** creates a single file with everything in the app (treatments,
  appointments, test results, patient details), encrypted with a passphrase
  you choose. Since data is shared live already, this is mainly useful as an
  offline backup, or to seed a *separate* deployment with the same starting
  data. The file is safe to send by email or messaging apps — without the
  passphrase, it's unreadable. Send the passphrase a different way (e.g. a
  text message, not the same email).
- **Import** decrypts a backup file and loads it in, **replacing** what's
  currently in the (shared) app for everyone. Use this for restoring a
  backup, not for day-to-day updates — those just happen live.

## 7. Protect the link before sharing it

Netlify's built-in password screen needs a paid Pro plan. On the free plan,
there's a workaround that still works:

1. Rename `public/_headers.example` to `public/_headers`
2. Uncomment the lines inside it and set your own username/password (you can
   give different people different logins)
3. Redeploy (`netlify deploy --prod`)

Visitors get a plain browser username/password prompt before seeing
anything. It's not fancy, but given this holds dates of birth and addresses,
it's worth the two minutes.

## 8. (Optional) Turn on real AI note summaries

In the Netlify dashboard: **Site configuration → Environment variables →
Add a variable**, name it `ANTHROPIC_API_KEY`, and paste in an API key from
[console.anthropic.com](https://console.anthropic.com). Redeploy afterwards.
Without this, note summaries still work — they just use a simpler built-in
sentence-split instead of a genuine AI summary.

## 9. Install it on a phone

- **iPhone:** open the site in Safari → Share icon → "Add to Home Screen"
- **Android:** open the site in Chrome → menu (⋮) → "Install app" (or "Add
  to Home Screen")

## Project structure

```
├── src/
│   ├── App.jsx           — the whole app (tabs, calendar, charts, etc.)
│   ├── main.jsx           — React entry point
│   └── lib/
│       ├── storage.js     — talks to the Netlify Function-backed shared data store
│       └── crypto.js      — encryption for backup export/import
├── netlify/functions/
│   ├── blob.js            — shared key/value data API (Netlify Blobs) — required
│   └── summarise.js       — optional AI note summariser
├── public/
│   ├── icon-192.png, icon-512.png  — app icons
│   └── _headers.example   — rename to _headers to password-protect the site
├── netlify.toml           — build settings Netlify reads automatically
└── vite.config.js         — build + PWA configuration
```
