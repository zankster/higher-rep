# Trainer app (fork of openGym): plan

Mike (a certified personal trainer) needs a coaching app to replace Everfit, Trainerize, FitPros, QuickCoach, Hevy Coach, Kahunas and CoachRx. Clients install it from the App Store and Play Store, and his developer accounts are approved. It has to look professional. Features: `SPEC.md`.

## Status
- **Phase 0 (fork and run): done.**
  - Cloned from `github.com/DuarteSantos8/openGym` (upstream `main` at `b6cfe2bb`).
  - It runs locally on Docker at http://localhost:8080.
- **Next: Phase 1 (design).** Inline mock-ups of the trainer dashboard, client home, program builder and check-in. Then pick the app name and brand. Nothing is built until Mike says "build".

## Decisions so far
- **Base:** openGym (React 19 + Vite, Node API, JSON files, Capacitor apps). See the repo's own `CLAUDE.md` and `docs/ARCHITECTURE.md`.
- **License:** AGPL-3.0. `NOTICE.md` grants an app-store exception as long as the source stays public. So the fork has to be public on GitHub, with a link to it in Settings.
- **Exercise media:** Gym visual's animations may **not** be used outside openGym itself. Before store release, remove `catalogue/media` and use Mike's own videos instead. openGym already supports photo and video uploads for custom exercises (`api/media.js`). Exercise text is fine to keep (check the catalogue's license in `NOTICE.md`).
- **Storage:** keep JSON files. New shared stores go behind one module in `api/`: `coaching.json` for trainer↔client links and assigned programs, and `messages/` for chat.
- **Reuse:** openGym already has invites (`/api/admin/invites`), roles (`/api/admin/user/role`), web push, measurements (`lib/measurements.js`) and media uploads.
- **Hosting:** Mike's PC (Docker) while it's only him. Pick a host before clients join (a small VPS at about $5/mo, or a free tier). Ask Mike before paying.

## Phases (one per session)
0. Fork and run ✅
1. Design: mock-ups, name and brand
2. Trainer and clients: trainer role, invite link, permissions
3. Programs: builder (weeks → days → exercises), templates, assign to a client with a start date
4. Logging and review: client logs with openGym's workout runner; Mike gets a feed of completed workouts, comments, PRs and compliance
5. Chat: thread per client, photos, push
6. Progress: measurements, photos, check-in forms, habits, charts
7. Ship: rename, icon, remove licensed media, privacy policy, TestFlight / Play internal, release

Later: nutrition, Stripe payments, automations, group programs, AI-drafted programs.

## Commands
- Run: `docker compose up -d` (prebuilt images). From source: `docker compose up -d --build`.
- Dev with hot reload: `cd frontend && npm install && npm run dev` (proxies `/api` to :3000).
- Tests: `cd frontend && npm test`, `cd api && npm test`.
