# Client analytics and progress screens (spec)

Approved by Mike on 2026-11-01 (Phase 1b). Nothing here is built yet. Ideas taken from Hevy's
feature pages (workout logging and progress tracking), adapted for coaching.
Mock-ups: [`mockups/client-analytics.html`](mockups/client-analytics.html) (trainer, desktop) and
[`mockups/phone-coaching.html`](mockups/phone-coaching.html) (client phone screens: openGym's
screens with the coaching additions). Shared look:
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
- **Planned sets per muscle (decided 2026-11-01):** worked out from the trainer's program, openGym's
  way. Each set counts 1 for its main muscle and a part of a set for helping muscles (openGym uses
  0.4), so plans read "Quads 9 / 13.2". Tapping a muscle lists where its planned sets come from.
  The program builder shows the weekly total per muscle as exercises are added. Target ranges set by
  the trainer (for example "Quads 12–14") are a possible later extra, not v1.
- **Set types** come from openGym: warm-up, failure, drop set, rest-pause. Its set counts already
  leave warm-ups out, which is our hard-set rule.
- **Week streak for coached clients:** a week counts only when every planned workout was done, so
  the streak matches compliance. Self-coached users keep openGym's rule (any workout that week).
- **Change arrows** compare with the previous equal period. On "Program so far" they compare the
  current block with the previous block, week for week, and the screen says so.

## Where kg volume appears

- **Client phone** (openGym already shows kg in most of these):
  - the runner header;
  - the finish Volume tile, plus the change since the same workout last time;
  - recent workouts and history;
  - exercise progress;
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
- **Estimated 1RM** for the main lifts, with dots on PRs. Each lift name opens that lift's exercise
  progress.
- **Sets per muscle group:** openGym's body map on the left, and on the right the done / planned bars
  for this week ("Quads 9 / 13.2") with week navigation. Clicking a muscle on the figure highlights
  its row. A line under the bars names the workouts left this week and any missed ones, with an
  icon and a word. Days still to come never count as behind.
- **<Client>'s changes:** swaps (with the most common one), moved days, skips and extra sessions,
  from the autonomy events in `SPEC-client-settings.md`, and a "Message <client> about swaps"
  button.
- **On the trainer's phone:** the same panels in one column. Tiles 2 × 2; the 1RM card becomes
  openGym's exercise progress with a lift picker; the muscle table gets the body map, as in Stats.

## 2. Client phone screens: openGym's own, plus coaching

openGym already shows the client most of this, so **we don't build new client screens**. We keep
openGym's runner, finish sheet and Stats, and add the coaching parts as small hooks (PLAN.md,
"Staying in sync with upstream"). Mock-up: `mockups/phone-coaching.html` (additions marked purple).

**Already in openGym (keep as is):**
- Runner header: time, "7/14 sets", kg total and progress bar, set bubbles, and the mini body map
  that lights up as sets are ticked (`SessionMuscles`).
- Per exercise: muscle and equipment chips, Best, "Last time (n days ago): 100×5 (RIR 2), …", the
  WEIGHT / REPS / RIR steppers, plate maths, the rest timer (−15s, +15s, pause, Skip).
- Finish ("Workout complete!"): Duration, Volume, Sets and PRs tiles, the PR list, "What you just
  trained" body map, last and next workout, add a photo or clip.
- Stats: Muscle balance with the real body map (Week / 30d / 90d / All, done/planned bars, "Not
  trained in this period"), weekly muscle volume, exercise progress (Top set, Per set, Est. 1RM,
  Effort), recent workouts with time, sets, kg and PRs, activity heatmap, streak, effort (RIR).
- **Body map:** openGym's `BodyMap` (real muscle outlines, five shades of the accent colour). The
  trainer's desktop analytics uses the same component, so client and trainer see the same figure.

**Coaching additions:**
- **Runner:**
  - a live PR banner at the top ("New PR · Back squat, Heaviest weight · 105 kg × 5"). openGym
    only works out PRs when a workout is finished, so this needs a small marked hook in its
    Workout screen;
  - the trainer's cue, the alternate exercise and Swap (within the client's swap setting);
  - "Plan from Mike: 4 × 5 · 102.5 kg · RIR 2". The set rows are pre-filled with the target;
  - "Last time" uses the same program day by default (Lower A's last squat);
  - the block and week ("Block 2 · Strength · week 6 of 9");
  - under a set that differs from the target: "Target 102.5 × 5 · you went heavier".
- **Finish:**
  - "14 of 14 · 100% of plan" under Sets;
  - "▲ 240 vs last Lower A" under Volume;
  - the effort card: 1–10 (Easy / Max), a note, "Something hurt?", Send to Mike.
- **Stats › Muscle balance:** the plan is the trainer's program, with a line naming the workouts
  left this week and any missed ones.
- **Stats › Exercise progress:** a "Best weight for each rep count" table.
- **Recent workouts / History:** "effort 8 · 100% of plan", "Live with Mike", and "Extra" for the
  client's own sessions.

**Effort scale:** the client sees openGym's RIR everywhere, including the plan line. The trainer
can write targets as RPE or RIR in the program builder, and the app converts (RPE 8 = RIR 2).
The trainer's analytics tile "RPE vs plan" follows the trainer's choice.

## Data the screens need (for Phases 2 to 4)

- Every logged set: exercise, weight, reps, RPE, set type (warm-up or not), done time, and a link to
  the scheduled workout and program slot, so "Last time" can find the same program day.
- Planned sets per muscle per week, worked out from the program the same way openGym does (helping
  muscles count part of a set). No stored targets in v1.
- PR records per client and exercise, including the best weight for each rep count, worked out when
  a workout is saved and kept so the screens don't recompute history.
- Weekly summaries per client on the server: hard sets, kg, compliance, RPE vs plan, session effort,
  PRs, and autonomy events. The trainer screens read summaries, never every set.
