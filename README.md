# MCQ Hub – plain HTML/CSS/JS + Firebase

No framework, no build step, no server code. Static files on Firebase Hosting, data in Firestore, logins with Firebase Auth. Works on the free **Spark** plan.

```
public/
  index.html   login + register (shows "registration closed" when locked)
  app.html     student app: browse, practice, custom test, history, bookmarks, mistakes
  admin.html   admin/teacher panel: syllabus, question bank, Excel import, users, registration lock
  css/style.css
  js/firebase.js  <- paste your Firebase config here
  js/common.js, auth.js, app.js, admin.js
firestore.rules, firestore.indexes.json, firebase.json
```

## One-time setup (about 10 minutes)

1. **Create the project:** https://console.firebase.google.com → Add project.
2. **Authentication** → Get started → enable **Email/Password**.
3. **Firestore Database** → Create database → **Production mode**. Location: **asia-south1 (Mumbai)** (closest to Pakistan; cannot be changed later).
4. **Project settings → Your apps → Web (</>)** → register an app → copy the `firebaseConfig` into `public/js/firebase.js`.
5. **Install the CLI and deploy:**
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add          # pick your project
   firebase deploy             # hosting + rules + indexes
   ```
   Indexes take a few minutes to build. Until then custom tests / history may show an "index" error.
6. **Create the settings document** (Firestore → Start collection):
   - Collection `settings`, Document ID `app`
   - Fields: `registrationOpen` (boolean) = `true`, `syllabusVersion` (number) = `1`
7. **Make yourself admin:** open your site, register an account, then in Firestore open `users/<your uid>` and change `role` from `student` to `admin`. Log out and in again – you land on the admin panel.

Local testing: `firebase emulators:start --only hosting` or `npx serve public`. Add `localhost` under Authentication → Settings → Authorized domains if it is not there.

## How it works

**Syllabus:** one `nodes` collection holds Board → Class → Subject → Chapter → Topic. Every node stores its ancestor ids in `path`, so "all questions under this chapter" is a single query.

**Questions:** each question stores `path` (all ancestors), `status` (`active` / `archived` / `draft`), `version`, `hash` (duplicate detection), `rand` (random selection) and `importBatchId`.

**Registration lock:** the admin toggle sets `settings/app.registrationOpen`. The Firestore rules refuse creating a student profile while it is `false`, and the app is unusable without a profile, so it cannot be bypassed from the browser console.

**Excel import:** admin picks a topic → uploads `.xlsx`/`.csv` → preview with per-row errors and duplicates → import. Columns: `question, A, B, C, D, E(optional), correct (A-E), explanation, difficulty`. Every import is one batch and can be rolled back with one click.

**Keeping the bank clean:** archive old questions (they vanish from new tests but past results keep their own copy), edit bumps `version`, "Mark reviewed" stamps a review date, and the filter "Not reviewed in 12 months" lists stale ones.

**Speed:** syllabus is cached in the browser and re-downloaded only when an admin changes it; tests are built from at most two indexed queries; results are saved in one batch; Firestore offline cache is on.

## Good to know

- Answers are checked in the browser, so a technically skilled student could read them from the network tab. Fine for practice; for high-stakes exams move grading into a Cloud Function later.
- Teachers (role `teacher`) can manage content but not users or the registration lock.
- Each question list in the admin bank loads up to 500 questions per topic.
- Keep Firestore, and later your Android app, in the same project – the Android app can use the same collections and rules unchanged.
