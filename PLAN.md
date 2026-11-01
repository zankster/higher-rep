# Trainer app (fork of openGym): plan

Mike (a certified personal trainer) needs a coaching app to replace Everfit, Trainerize, FitPros, QuickCoach, Hevy Coach, Kahunas and CoachRx. Clients install it from the App Store and Play Store, and his developer accounts are approved. It has to look professional. Features: `SPEC.md`.

## Status
- **Phase 0 (fork and run): done.**
  - Cloned from `github.com/DuarteSantos8/openGym` (upstream `main` at `b6cfe2bb`).
  - It runs locally on Docker at http://localhost:8080.
- **Phase 1 (design): done (2026-10-31).** Palette, name (Higher Rep), hostnames and every screen below are approved. Mock-ups were inline in chat only (not saved in the repo). Next: Phase 2. Nothing is built until Mike says "build".
- **Issue #119 read (2026-11-01).** It is still a proposal: no MR on GitHub, milestone v1.4.10 (due 2027-02-07), and two competing shapes. The role is named **trainer**, stored as a flag on the user like `admin`. Links and pending plans are kept out of `state-<uid>.json`, because `/api/data` is last-write-wins. Upstream says "student" or "athlete"; we say "client" in the UI only. hcke's "send a plan, client taps Apply or Discard" is an option to weigh in Phase 3.
- **Phase 2 plan:** proposed 2026-11-01, waiting for Mike's OK.
- **Open before release:**
  - **Lawyer review of the waiver text** (Mike arranges it). Until then the waiver is marked DRAFT and never shown to real clients.
  - **Health questionnaire source (decided 2026-11-01):** Each trainer adds their own documents (see "Ready for more trainers"). Mike will add the PAR-Q his ACE certification provides, or later his own template. Before release, check the copyright line on the ACE form. If it says "PAR-Q+ Collaboration", putting it in an app still needs their written permission (eparmedx@gmail.com, possibly a fee). The questionnaire step is built from data, so any of these versions drops in.
  - **Waiver copy (decided 2026-11-01):** kept in the app with "Download PDF", plus an automatic email copy to the client (waiver only, never health answers). Set up the email service in Phase 2 for this, invites, password resets and guardian links. Provider: **Resend** (chosen 2026-11-01; free tier about 3,000 emails a month, 100 a day; called with plain `fetch`, no new dependency). Mike creates the account; DNS records for higherrep.com go in at Porkbun.

## Decisions so far
- **Base:** openGym (React 19 + Vite, Node API, JSON files, Capacitor apps). See the repo's own `CLAUDE.md` and `docs/ARCHITECTURE.md`.
- **License:** AGPL-3.0. `NOTICE.md` grants an app-store exception as long as the source stays public. So the fork has to be public on GitHub, with a link to it in Settings.
- **Exercise media:** Gym visual's animations may **not** be used outside openGym itself. Before store release, remove `catalogue/media` and use Mike's own videos instead. openGym already supports photo and video uploads for custom exercises (`api/media.js`). Exercise text is fine to keep (check the catalogue's license in `NOTICE.md`).
- **Architecture:** see "Architecture" below. Keep openGym and add a coaching module; no rewrite.
- **Reuse:** openGym already has invites (`/api/admin/invites`), roles (`/api/admin/user/role`), web push, measurements (`lib/measurements.js`), media uploads, the offline queue (`lib/queue.js`) and the sync merge (`api/sync-stamps.js`).
- **Hosting:** Mike's PC (Docker) while it's only him. Before clients join: a small VPS (about $5/mo) on higherrep.com (registered), with HTTPS and encrypted nightly backups of `data/`. Ask Mike before paying.
- **Hostnames (chosen 2026-10-31, permanent):**
  - **`app.higherrep.com`** is the server. `.env`: `RP_ID=app.higherrep.com`, `ORIGIN=https://app.higherrep.com`. It's built into the store apps, and browser passkeys and phone sign-ins are tied to it, so never change it after clients join. DNS: an `A` record for `app` → VPS, added only when the VPS exists.
  - **`higherrep.com` + `www`** is the public site: home, privacy policy, terms, support email, link to the source. Free static hosting (GitHub Pages or Cloudflare Pages). Policy pages come near release, once the features are built.
  - **`support@higherrep.com`:** Porkbun email forwarding to Mike's Gmail (set up 2026-10-31). Auto-renew, domain lock and WHOIS privacy are on. SPF/DKIM are added with the invite-email service.

## Architecture (reviewed and approved)
- **One app everywhere.** openGym's React app is the website, the iPhone app and the Android app (Capacitor). The screens Mike and clients see depend on their role. Mike can build programs in a desktop browser. The store builds point at Mike's server, so clients never enter a server address.
- **Clients' own data stays in openGym.** Each user's synced document (`state-<uid>.json`) and the sync code are unchanged.
- **Coaching module** in new files under `api/` (e.g. `api/coaching/`), the only code that touches coaching data, with its own routes in `openapi.yaml`.
  - **SQLite** via `node:sqlite` (built into Node 22.23, the API image's version): trainer↔client links, programs and assignments, notes and tags, intake / PAR-Q+ / waivers, check-ins, assessments, chat messages, scheduled jobs, and per-client summaries. One file under `data/`, backed up with the rest.
  - **Permission checks on the server** for every route. A trainer reads a client's data through the API, never by syncing it.
  - **Per-client summaries:** when a client syncs, store last workout, compliance and PRs in SQLite. The dashboard reads only summaries.
- **Writing into a client's data** (assigned program, live-session workout) goes through openGym's merge and stamps (`api/sync-stamps.js`), like the MCP `log_workout` tool. Each such write is tested with the client's phone syncing right after it, and the data must survive.
- **Coaching media** (chat photos, voice notes, form-check videos, shared progress photos) gets its own store, separate from openGym's per-user uploads, which are owner-only (`GET /api/media/{hash}`) and get swept when unreferenced (`api/media.js`). Each file records who may see it, checked on every request, and it's never swept by openGym's cleanup. Size limits per type. Later, Cloudflare R2 if disk fills.
- **Chat delivery:** server-sent events while the app is open, with a polling fallback. Push notifications when it's closed.
- **Push:** keep web push. Native push for both phones goes through Firebase Cloud Messaging (FCM handles APNs for iPhone) with the Capacitor push plugin. The phone apps only have local notifications today, so this is a native change: batch it with others and rebuild the apps.
- **Sign-in for clients:** email and password (openGym's `PASSWORD_LOGIN`) plus Mike's invite link. Passkeys optional. Resend (free tier) sends invites and password resets, since openGym sends no email.
- **Scheduler** inside the API for weekly reports, scheduled messages, reminders and "program ending" alerts. Each job stores its next run in SQLite, catches up after a restart, and runs in each client's time zone.
- **Live session offline:** the workout queues on Mike's phone (`lib/queue.js`) and sends when back online.
- **Waivers:** stored unchanged with the time, the exact waiver text that was signed, and the device. Never editable.
- **Tests:** a permission test for every coaching route (client A can't read client B; a trainer can't read a non-client), plus the sync-survival tests above.
- **Ready for more trainers (decided 2026-11-01).** v1 has one trainer (Mike), but later other trainers may sign up, each with their own clients, documents and branding. So from Phase 2:
  - Every coaching row carries `trainer_id`, and every permission check is "this trainer's own clients", never "the admin".
  - A trainer is a role on any user, separate from server admin.
  - Documents (waivers, questionnaires, intake forms, policies) belong to a trainer: a per-trainer library, versioned. Higher Rep ships no third-party forms; each trainer uploads or builds their own and confirms they have the right to use them.
  - Branding (name, logo, accent colour, contact details, the email "from" name) is per-trainer settings, read through one helper, with Higher Rep's look as the default.
  - Invite links, emails and the client's sign-up flow all name the trainer they come from.
  - Not in v1: trainer self-sign-up, trainer billing, one client with several trainers, and a trainer directory.
- **Revisit** if past a few hundred clients, or when upstream ships its trainer role (v1.4.10, about February).

### Design (Phase 1)
- **Look:** keep openGym's iOS-style base (black / #f2f2f7 backgrounds, grouped cards, system font, `index.css` radii). Only the accent changes.
- **Palette: Coach blue.** Accent fill #2457E6 in light and #2F6BEF in dark, with white text on it (5.9:1 and 4.7:1). #3D7BFF was dropped because white on it is only 3.8:1. Accent text is #2457E6 in light and #6E9BFF in dark. Status colours are openGym's, except light-mode green, which becomes #1E7B34 (5.3:1) because #248A3D is only 4.4:1.
- **Contrast (WCAG AA, measured):** all text that carries meaning must reach 4.5:1 on its actual surface.
  - Light secondary text: rgba(60,60,67,.82), 5.6 to 6.3:1. The old .62 measured 3.5 to 3.6:1.
  - Dark secondary text: rgba(235,235,245,.72), 6.9 to 8:1.
  - Inactive tab labels use the secondary text colour. The old tertiary measured 1.7:1 in light and 2.5:1 in dark.
  - The tertiary colour (.30) is for decoration and dividers only, never for text.
  - Recheck on real devices before release.
- **Name: Higher Rep. Chosen 2026-10-31.** Store listing: "Higher Rep: Fitness Coaching".
  - Web searches found no app, gym, business or trademark using it. The nearest names are different (Reps Health, Better Reps, 12REPS, Repply, FITHERO).
  - **higherrep.com registered at Porkbun (2026-10-31).** .app and .co looked unregistered (not bought). higherreps.com looks taken.
  - "Higher rep" is a common training phrase, so the logo and subtitle carry the brand.
  - Before release: claim the Instagram and TikTok handles, search both stores, and have a trademark attorney clear classes 9, 41 and 44. Ask Mike before paying for any of it.
- **Trainer dashboard:** the "Needs you first" layout (B), revised. **Approved (v3).**
  - Small date and greeting line, then "Search clients" under the header.
  - Three metrics, each with its period: compliance (last 7 days, = scheduled workouts completed), workouts done today (x of y scheduled), unread messages.
  - "Needs attention" action cards, each with one action, in this order: missed workouts (Message), check-ins to review (Review), programs ending within 7 days (Plan next). The program-ending alert is approved.
  - A separate, smaller "Wins" list (PRs, perfect weeks).
  - Compact client rows with a 7-day compliance ring, then "All clients" to the full roster.
  - The roster screen holds search, the filter chips (All, Needs attention, Unread, Paused) and sorting. The dashboard stays free of filters.
- **Client home:** layout A ("big today card"), revised. **Approved (v3).**
  - Week strip with distinct states (done, missed, rest, today) and a legend.
  - The workout card is titled "Today · Upper A" and shows a short coach-note preview before the exercises. It lists three exercises, then a "View all 6 exercises" link styled as a link with a chevron.
  - Coach message card with a Reply button. Only add "Got it" where an acknowledgment is needed.
  - Check-in card says when it's due and how long it takes ("Due tomorrow · 2 min").
- **Program builder:** layout B (a grid of sets on each exercise card), revised. **Approved (v3).**
  - Two distinct copy actions:
    - Each set's ⋮ menu has "Copy entire set to remaining sets".
    - The keypad bar has a copy-down key named for the field being edited, for example "Copy RPE down".
  - Collapsed summaries must not hide differences between sets. They show ranges ("RPE 7–8", "75–77%") and add a "varies by set" tag where sets differ.
  - Cards stay open while editing. "Collapse all" switches to a one-line-per-exercise review, with superset bars and drag to reorder.
  - "Next" on the keypad moves in a fixed order: reps, load, RPE, then the next set.
  - Tempo, rest, notes and video are chips on the card, editable in place.
  - Workout blocks (approved): "Add block" offers straight sets, superset, circuit, AMRAP (time cap, scored as rounds + reps), EMOM (alternating minutes allowed) and intervals (work / rest × rounds). In the collapsed view each block is its own card with its type and settings in the header.
  - Alternate exercise per slot (approved): shown under the exercise as "Alt: DB bench press, 3 × 8". How freely a client may swap is a per-client setting (SPEC.md).
  - Edits save automatically, and the header shows "All changes saved". Done only closes the editor and never needs a save. "Assign to a client…" is a separate button that opens a confirm step (client, start date, Assign). Nothing reaches a client until it is assigned.
- **Weekly check-in:** the form as mocked (weight and waist with change since last week, 1 to 5 scales, a multiple-choice question, front/side/back photos, a free-text note, "Send to Mike").
- **Progress photos are private by default** (see SPEC.md, Permissions):
  - The client's compare screen shows "Only you can see these photos" and a "Share with Mike" button.
  - The share sheet has a switch for each view (front, side, back) and one for weight and waist. It also takes an optional note. Sharing posts the comparison to the client's chat with the trainer.
  - The trainer sees only shared photos, marked "Shared by Ava · date". Unshared check-ins appear as locked tiles.
  - The check-in's photo step gets a "Share these with Mike" switch (off by default).
  - Settings › Privacy lists what is shared and offers "Stop sharing" and an optional "Always share check-in photos".
- **Chat thread v2. Approved.**
  - Client view: the workout card carries comment threads ("2 comments · Reply"), form-check videos are tagged with exercise and set, and voice notes show a waveform and length.
  - Composer: + for photo or video, hold the mic to record.
  - Trainer view: long-press send opens "Send later" (quick times, or pick a date and time, in the client's time zone). Scheduled messages show in the thread with Edit, Send now and Cancel.
- **Photo screens v2. Approved.** (Follows SPEC.md "Safety and appropriate content".)
  - The camera shows a dashed pose outline for front, side and back, the clothing guide, a 5 s timer, and "Only you can see these".
  - "Before sharing" offers "Blur my face" and "Crop at the neck". The originals stay unedited and private, and Mike sees only the edited copies.
  - Photo privacy screen: what is shared, each with "Stop sharing", and a "Viewed by Mike" log with dates and times.
  - Mike's view is labelled "View only. Ava can see when you view." It has Comment. "Download" and "Export or share" stay in the list as greyed-out "not available" rows that can't be used, kept in case Mike wants them later. Turning either on would need a SPEC.md permission change first.
- **Chat safety additions. Approved.**
  - Edited messages show "edited · see original", and the original is kept.
  - The message menu has Reply, Copy, Show original and Report message. Edit appears only on your own messages.
  - The thread menu has Report pain or injury, Export chat, Notifications, Report a message, and (for the client) End coaching.
  - Lock-screen notifications say only "New message from Mike", with no text or media preview.
- **Approved 2026-10-31:**
  - **Live session:** Mike's phone. The client's warning tags sit at the top, and the set grid shows target vs done (a different weight can be typed). Alternate and Swap sit under the card; rest timer with +30 s and Skip. An offline note explains that sets save on the phone and send later. "Finish session" saves to the client's history as "Logged by Mike".
  - **Effort rating:** after every workout. Summary (sets, PRs, % of plan), then 1–10 with Easy / Max labels, an optional note, "Something hurt?" (opens the pain report), "Send to Mike" and "Skip for now". In a live session it shows on Mike's phone.
  - **Pain report:** body map (front/back, more than one spot), pain 0–10, type chips (sharp, dull, tight, swelling), when chips (during lifts, after, at rest, all the time), and since when. Warning signs show the amber "Please see a doctor or physio before training this area" banner. Saved to the injury log, shown in the profile and program builder.
  - **Sign-up in 4 steps:** About you (date of birth, with the 13+ gate), Goals and history (intake), PAR-Q+, Waiver; with a progress bar.
    - PAR-Q+: yes/no rows; any yes leads to the official follow-up questions. **Use the chosen form's wording unchanged (ACE's PAR-Q, or Mike's own template later; see "Open before release"). Build the step from data so the text drops in.**
    - Waiver: versioned text (lawyer's wording), "I've read the waiver and agree", typed full name, finger signature. The record keeps the text, version, time and device. The client gets the copy in the app (PDF download) and by automatic email.
    - Ages 13 to 17: "A parent or guardian signs next", with name, email and relationship. It sends a signing link, or the guardian can sign on the same phone. The screen spells out what the guardian can do (sign, read the chat; photos off, fully clothed only).
  - **Client profile (Mike):** avatar, age, start date, program; tags (warnings in amber) and "+ tag"; private notes with "Only you"; injury log; assessments with first → latest and the next retest; Records (waiver version, PAR-Q+ with its yes count, intake) with "Export record (ZIP)".
- **Document library. Approved 2026-11-01** (mock-ups inline in chat only):
  - **Library (Settings › Documents):** each trainer's own documents. The "Sign-up packet" holds the documents a new client completes, in the order the trainer drags them into; others sit under "Not in the packet". A trainer can add any number of documents at any time.
  - **Three kinds:** document to sign (pasted text, or an uploaded PDF), form to answer (built in the app), PDF to fill and return. Each new document needs "I wrote this document or have permission to use it" ticked.
  - **Drafts and versions:** Drafts are never shown to clients. Publishing makes a new version, and each signed record keeps the exact version.
  - **Form builder:** question types yes/no, short text, long text, choice, date, number and signature. A question can flag a "yes" and can have an "if yes" follow-up question. Wording is kept exactly as typed. Autosaves, with Preview and Publish.
  - **Client side:** a step bar with "from <trainer>". After a "yes" on a flagged question, a notice says the trainer will see it before the first session. Signing: "I've read and agree", full name and finger signature. On "You're all set": a waiver copy is emailed, there's a PDF download, and everything is listed in Settings › My documents. Health answers are never emailed.
  - **Later documents:** sending one to existing clients puts it on their home as a to-do. Publishing a new version of a signed document lets the trainer ask current clients to sign again. Not mocked yet; show it before building.

## Staying in sync with upstream openGym
openGym ships fixes often. Keep merges cheap:
- Remotes: `origin` is our public fork (github.com/zankster/higher-rep, AGPL source), `upstream` is openGym (push disabled).
- `main` mirrors upstream untouched. Our work lives on `trainer`. To update: `git fetch upstream`, `git switch main`, `git merge --ff-only upstream/main`, `git switch trainer`, `git merge main`, run the tests, then push both to `origin` (Mike's OK).
- **New features go in new files** (views, components, `lib/` helpers, API modules). Add only small hooks into upstream files: a route, a menu entry, a `routes[...]` key.
- **Don't rewrite upstream files.** Wrap or extend them. If an upstream file needs changing, keep the edit small and mark it `// trainer-fork:` so it's easy to find during a merge.
- **Name from one config file.** Don't find-and-replace "openGym" across the code. Rename only what users see: title, icon, splash, store listing, Capacitor `appId` / `appName`.
- **Brand colors in our own theme file** that loads after `frontend/src/index.css` and overrides its tokens. Don't edit their CSS.
- **Licensed media:** the release build strips `catalogue/media` (and any media an update adds) every time.
- **Upstream trainer role:** their roadmap lists one for v1.4.10 (about February). When it lands, compare it with ours and decide whether to adopt, keep ours, or merge the two.

## Phases (one per session)
0. Fork and run ✅
1. Design: mock-ups, name and brand
2. Trainer and clients: trainer role, invite link, permissions, trainer document library (waivers, PAR-Q, intake and other forms, uploaded or built in the app) and the sign-up packet that uses it, email service (invites, resets, guardian links, signed copies), private notes and tags, date of birth and guardian link for under-18s, end-coaching (block)
3. Programs: builder (weeks → days → exercises), circuits / AMRAP / EMOM / intervals, alternate exercises and swap limits, templates, assign to a client with a start date
4. Logging and review: client logs with openGym's workout runner, effort rating; live session mode (Mike logs for a client); feed of completed workouts, comments, PRs and compliance
5. Chat: thread per client, photos, voice notes, form-check videos, push, scheduled messages, dashboard alerts, kept edit history and export, report a message, private notification previews, "Report pain or injury" form
6. Progress: measurements, photos (photo guide and pose outline, face blur, no camera roll, screenshot block or alert, view log, no photos for under-18s unless fully clothed), check-in forms, assessments and retests, habits, charts, weekly progress report to each client
7. Ship: rename, icon, remove licensed media, privacy policy, terms of use and conduct, App Review notes on chat safety, TestFlight / Play internal, release

After v1 (order to decide): booking and session packages, habit streaks and badges, wearables, periodization view, resource library, groups, import from other apps. Later: nutrition, Stripe payments, automations, AI-drafted programs. Details: `SPEC.md`.

## Commands
- Run: `docker compose up -d` (prebuilt images). From source: `docker compose up -d --build`.
- Dev with hot reload: `cd frontend && npm install && npm run dev` (proxies `/api` to :3000).
- Tests: `cd frontend && npm test`, `cd api && npm test`.
