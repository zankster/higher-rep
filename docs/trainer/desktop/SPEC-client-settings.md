# Trainer desktop: client settings (spec)

Approved by Mike on 2026-11-01 (Phase 1b, trainer desktop design). Nothing here is built yet.
Mock-up: [`mockups/client-settings.html`](mockups/client-settings.html). It uses the shared look from
[`SPEC-calendars.md`](SPEC-calendars.md).

## Where it lives

- A **Settings** tab on the client's page: Overview, Calendar, Analytics, Settings, Notes.
- Two cards on the left, "What <client> sees" and "What <client> can change". On the right is a
  **phone preview** of the client's today screen that updates as each setting changes.
- Each setting is a segmented switch, with the selected part filled blue.

## Presets

- **Hands-on**, **Balanced** and **Independent** fill in every setting at once. Changing any one
  setting turns the preset into **Custom**.
- "Make <preset> my default" sets what new clients start with. "Copy to other clients…" applies
  this client's settings to the clients the trainer picks.

## What the client sees

| Setting | Choices | Mock-up default |
|---|---|---|
| Plan ahead | Next workout · This week · Whole block · Everything | This week |
| Loads | Weight in kg (from their 1RM) · % and RPE · RPE only | Weight in kg |
| Your exercise notes (coaching cues) | Show · Hide | Show |
| Block names and deloads | Show · Hide | Show |

- Private trainer notes and tags are never shown, whatever these settings say (SPEC.md,
  Permissions).
- "Next workout" shows the next one only after the current one is done.

## What the client can change

| Setting | Choices | Mock-up default |
|---|---|---|
| Swap exercises | No swaps · Listed alternates · Any exercise | Listed alternates |
| Move workouts | Not allowed · Within the week · Any date | Within the week |
| Extra sessions | Not allowed · Allowed | Allowed |
| Change targets | Not allowed · Sets and reps · Anything | Not allowed |

- The client can always log what they really did. "Change targets" is about editing the plan
  itself.
- Extra sessions are logged as "Extra" and never count against compliance.
- **Tell me when they:** swaps, moves a day, adds a session, skips (checkboxes). These feed the
  trainer's tasks and dashboard alerts.
- Clients under 18 get the same settings, with no special rules.

## Data the screen needs (for Phases 2 and 3)

- Per client: `visibility` (ahead, loads, notes, blocks) and `autonomy` (swap, move, extra,
  edit), the preset name or "custom", and the notify flags. They belong to the trainer–client link
  (with `trainer_id`), not to the client's state file.
- Per trainer: the default preset for new clients.
- The server enforces the autonomy settings (a move outside the allowed range is refused), and the
  client app hides what visibility hides. Hidden loads and future weeks are not sent to the client
  at all.
- Swaps, moves, extra sessions and skips are stored as events, so the trainer can see them and the
  analytics can count them.
