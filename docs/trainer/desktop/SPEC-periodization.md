# Trainer desktop: periodization view (spec)

Approved by Mike on 2026-11-01 (Phase 1b). Nothing here is built yet.
Mock-up: [`mockups/periodization.html`](mockups/periodization.html). Shared look:
[`SPEC-calendars.md`](SPEC-calendars.md). Same example as the other mock-ups: Ava's Strength 2026,
13 weeks from Oct 5, 2026 to Jan 3, 2027, today in week 6.

## Where it lives

- A **Periodization** tab on a program, beside Builder and Calendar.
- Top bar: program and client, the date range, "+ Block", "Save as template" and
  "Publish to <client>". Unpublished changes wait for Publish, as in the program builder.
- Wide grids scroll sideways inside their card at phone width.

## The timeline

One column per week (W1 with its start date; the current week is tinted blue and says "Today").
Rows:

- **Blocks:** one bar per block, spanning its weeks, with its number and name ("2 · Strength ·
  now"). The current block is filled blue, as in the program builder's blocks bar.
- **Week type:** Build, Deload, Peak, Taper or Test, always as a word (with an icon for deload and
  test).
- **Hard sets / week:** the planned weekly hard sets, shaded from fewer to more.
- **Intensity:** a line of the average planned load. Filled dots are done weeks, hollow dots are
  planned.
- **Avg % 1RM · RIR:** the numbers behind the line. RIR, to match what clients see.
- **Main lifts:** one row per pinned lift with that week's prescription (4×10 … 5×3 … 1RM).
- **Done vs plan:** compliance for finished weeks, with an icon and a word (a week under 70% shows
  a warning), "1 of 4" for this week, "–" for later weeks.
- **Events:** assessment or retest, client away, holiday week, and the goal at the end ("Goal:
  squat 135 kg"). A legend under the grid explains the icons.

## Block panel

- Clicking a block opens a panel under the timeline: name, weeks and dates, status ("Done · 92% of
  workouts", "Now in week 6", "Planned · not published to <client> yet").
- Plain sentences for **Goal**, **Progression** (for example "+2.5% a week on main lifts, rule"),
  **Deload** ("Week 9: half the sets, about 65%, RIR 4") and **Volume**.
- Buttons: Open in builder, Insert deload…, Shift from here….
- **Changing a block's length:** drag its edge. Later weeks move with it, and the new dates are shown
  for review before anything is saved (the same rule as moving workouts on the calendar).

## Data the screen needs (for Phases 2 and 3)

- Blocks with name, goal, order, weeks, and a progression and deload description (rule or by hand).
- A type per week (build, deload, peak, taper, test).
- Planned hard sets, average % 1RM and RIR per week, worked out from the program's week targets
  (nothing stored twice).
- Pinned lifts per program.
- Events per client: kind (assessment, away, holiday, goal, …), date or week, and a note. Assessments
  link to the retest reminders in SPEC.md.
- Done vs plan reads the weekly summaries from `SPEC-analytics.md`.

## Open

- **v1 or later:** SPEC.md lists the periodization view after v1. Most of its data (blocks, week
  targets, compliance) is needed in v1 anyway. Mike decides when v1 is picked.
- **Pinned lifts:** suggested two or three per program, picked by the trainer.
- **Event kinds:** the four above; competitions or a "phase review" check-in may be added.
