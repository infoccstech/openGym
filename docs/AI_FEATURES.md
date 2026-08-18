# Suggestions, AI plans & cloud backup

Three additions that keep openGym's promise — **your data stays on your device, no model is
called, nothing leaves the box** — while making planning smarter. All three work in every
flavor (self-hosted PWA and the standalone mobile app).

## 1. Exercise alternatives — "no machine" / "sore muscle"

When a machine is taken (or you don't own it), or a muscle is sore and you want to train
around it, openGym suggests alternatives that train the **same primary muscle**.

- **Where:** a 🔀 button on each exercise in a running workout ("Swap exercise"), and a
  **Find alternatives** action in any exercise's detail sheet (so it works from the Library
  and the plan too).
- **Two filters:** *Equipment you can use* (multi-select — deselect the barbell/machines,
  keep dumbbells/bodyweight) and *Sore muscle? Leave it out* (drops candidates that load a
  muscle you flag).
- **How it ranks:** pure, offline cosine similarity over the same 18-muscle vocabulary the
  body map uses (`lib/substitute.js` → `substitutesFor`). No model, no network.
- Swapping mid-workout keeps the slot's place and superset link and reseeds its sets from the
  new exercise's own history, like a freestyle pick.

## 2. Build a routine with AI (bring your own AI)

openGym never calls a model. Instead it hands you a prompt for **any** chat AI (ChatGPT,
Claude, …) and reads the plan back.

- **Where:** `Plan → Share/plan tools → Build a routine with AI`.
- **Get an AI prompt:** copies (or, on mobile, shares) a self-contained brief — the equipment
  vocabulary the catalogue understands, a strict JSON output contract, and blanks for your
  goal, days and injuries.
- **Import from AI:** paste the reply. Exercise names resolve to the library through the same
  matcher the FitNotes/Strong/Hevy importers use (`matchExercise`); anything unrecognised
  becomes one of *your own* exercises rather than being dropped, and the weekly schedule maps
  day names to the new routines. It's added as **new** routines — nothing you have is
  overwritten (`lib/ai-plan.js`, reusing `plan-share.js`'s `mergePlan`).

## 3. Cloud backup

### Level 1 — through the share sheet (shipped)

On the mobile app, **Settings → Data → Back up to cloud** exports your data and opens the OS
share sheet, where **Google Drive**, Files and email are all targets. No account to connect,
no OAuth, no configuration. The web build keeps its plain JSON download.

### Level 2 — connect a Google account + auto-backup (not shipped — needs your credentials)

A one-tap/automatic upload to your Drive needs an OAuth client that only the app owner can
create. It is intentionally **not** in this change: it would add a native dependency and a
network call that can't be tested without your own credentials. To add it later:

1. **Google Cloud Console** → new project → enable the **Google Drive API**.
2. **OAuth credentials:** an *Android* client ID (the app's **package name** + the **SHA-1**
   of your release keystore) and a *Web* client ID (the plugin needs it for the token flow).
3. **OAuth consent screen:** add the **`drive.file`** scope — the least-privilege choice, so
   the app can only ever see files it created.
4. Note the trade-off: while the consent screen is in *testing*, Google expires the refresh
   token after 7 days; publishing to *production* removes that but a Drive scope triggers
   Google's verification.
5. Wire a Capacitor Google-auth plugin to get an access token, then `PUT` the backup JSON to
   `https://www.googleapis.com/upload/drive/v3/files` (multipart). The backup payload is the
   same `JSON.stringify(S)` the Level-1 export already produces.

Because it's opt-in and points at *your own* Drive, it stays within openGym's "your data,
your box" spirit — but it is a real cloud dependency, so it belongs behind an explicit toggle
that's off by default.

## Tests

`lib/substitute.test.js` (14) and `lib/ai-plan.test.js` (8) cover the pure logic — ranking,
both constraints, name resolution, week mapping, custom fallback, fenced/prose-wrapped JSON,
cardio/timed shapes, clamping and error paths. Run with `npm test` in `frontend/`.
