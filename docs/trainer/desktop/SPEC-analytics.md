# Client analytics and progress screens (spec)

Approved by Mike on 2026-11-01 (Phase 1b). Nothing here is built yet. Ideas taken from Hevy's
feature pages (workout logging and progress tracking), adapted for coaching.
Mock-ups: [`mockups/client-analytics.html`](mockups/client-analytics.html) (trainer, desktop) and
[`mockups/phone-progress.html`](mockups/phone-progress.html) (client phone screens). Shared look:
[`SPEC-calendars.md`](SPEC-calendars.md).

## Counting rules (everywhere in the app)

- **Hard set:** every completed set that isn't marked warm-up. No RPE threshold.
- **Training amount is counted in hard sets.** Compliance, "% of plan", the muscle table and the
  body map always use sets.
- **Volume in kg** (weight × reps, warm-ups left out) is always available, because athletes care
  about it, but it's **only compared like for like**: the same workout or the same lift.
  It never decides compliance or compares muscles.
- **RPE vs plan** is logged RPE per set compared with the RPE the trainer set. **Session effort** is
  the 1–10 rating after a workout. They are two different numbers with different names.
- **PRs:** heaviest weight, best estimated 1RM, best set volume, best session volume, and the best
  weight for each rep count, per exercise.
- **Change arrows** compare with the previous equal period. On "Program so far" they compare the
  current block with the previous block, week for week, and the screen says so.

## Where kg volume appears

- **Client phone:**
  - the runner header (tap to show kg before sets);
  - the finish screen Volume tile, compared with the same workout last time;
  - workout history (time, kg and sets on every workout);
  - exercise detail ("Session vol." chip, "Best session volume" record);
  - the weekly progress report ("Total volume this week" with the change).
- **Trainer:**
  - the analytics volume chart (**Hard sets | kg** switch, Hard sets by default);
  - a "≈ N kg / week" line under the Hard sets tile;
  - the workout feed and workout detail.
- **Not shown in kg:** compliance, % of plan, the muscle table and body map, the All clients grid
  and the dashboard.

## 1. Trainer: client Analytics tab (desktop)

- A tab on the client page: Overview, Calendar, **Analytics**, Settings, Notes.
- **Period switch:** 4 weeks, Program so far, Block 2 (the current block), 12 weeks. Export CSV.
- **Tiles**, each with a change arrow:
  - Compliance ("23 of 28 done");
  - Hard sets / week, with "≈ kg / week" underneath;
  - RPE vs plan ("8.1 logged vs 7.8 set"), plus session effort;
  - PRs.
- **Volume by week:** bars of hard sets done with the planned sets as an outline, or kg with the
  switch. A dot per week shows compliance (green, or red below 70%), block labels along the bottom,
  the deload week marked, and a line under the chart for any week that fell short.
- **Estimated 1RM** for the main lifts, with dots on PRs. Each lift name links to its exercise
  detail.
- **Sets per muscle group** this week against the planned range. The status is always an icon and a
  word: In range, Planned · day, Behind · reason. Days still to come never count as behind.
- **<Client>'s changes:** swaps (with the most common one), moved days, skips and extra sessions,
  from the autonomy events in `SPEC-client-settings.md`, and a "Message <client> about swaps"
  button.
- **On the trainer's phone:** the same panels in one column. Tiles 2 × 2; the 1RM card becomes
  exercise detail with chips to switch lifts; the muscle table becomes the body map screen.

## 2. Client: workout runner (phone; Live session uses the same grid)

- **Header:** workout name, Finish, then Time, Sets ("7 of 14") and Volume (kg) with a progress bar
  for sets. Tapping the header puts kg before sets.
- **Set grid columns: Last time · Target · Done.**
  - "Last time" is the same program day's last session by default (Lower A's squat, not Lower B's),
    falling back to the last time the exercise was done anywhere. A note says which session it
    came from ("last time Oct 28, week 5").
  - Done sets get a check icon and a light green tint. Colour is never the only sign.
- **Live PR:** an amber banner drops in at the top ("New PR · Back squat, Heaviest weight · 105 kg ×
  5"), and a medal replaces that set's number.
- **Rest timer:** starts when a set is ticked; a bar at the bottom with −15, +15 and Skip.
- Set types from the set number (warm-up, drop, failure) were seen in Hevy; not decided.

## 3. Client: exercise detail

- Tabs: **Summary · History · How to**.
- Summary: one chart for one lift with a period dropdown and block lines. Chips switch the measure:
  Heaviest, Est. 1RM, Best set, Session vol. (kg).
- **Records** list; each opens the workout where it happened.
- **Best weight for each rep count** table, with "new" on today's records.
- The client's loads follow their visibility setting (kg, % and RPE, or RPE only).

## 4. Client: muscles this week

- Front and back figures shaded by hard sets this week, a "Fewer → More sets" scale, and week
  navigation ("Nov 9–15 · 3 of 4 workouts").
- Under it, the table of sets against the planned range with the same status words as the trainer's
  table. The figure reuses the pain report's body map drawing.

## 5. Client: finish screen

- Tiles at the top: **Sets** ("14 of 14 · 100% of plan"), **Volume** ("6,180 kg · ▲ 240 vs last
  Lower A"), **Duration** (against plan), **PRs**.
- Then the approved effort rating: 1–10 with Easy / Max, a note, "Something hurt?", Send to Mike,
  Skip for now. The date and time can be edited.

## 6. Client: workout history

- Newest first. Each workout: name, status (icon and word), date and block week, "Live with Mike"
  when the trainer logged it, then time, kg and sets, then PRs and effort.
- Extra sessions are marked "Extra" and show "–" for anything they don't have.

## Data the screens need (for Phases 2 to 4)

- Every logged set: exercise, weight, reps, RPE, set type (warm-up or not), done time, and a link to
  the scheduled workout and program slot, so "Last time" can find the same program day.
- Planned sets per muscle per week, worked out from the program (each exercise's muscles), with a
  range the trainer can edit.
- PR records per client and exercise, including the best weight for each rep count, worked out when
  a workout is saved and kept so the screens don't recompute history.
- Weekly summaries per client on the server: hard sets, kg, compliance, RPE vs plan, session effort,
  PRs, and autonomy events. The trainer screens read summaries, never every set.
