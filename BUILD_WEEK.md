# OpenAI Build Week 2026 evidence

ZGP Commander is a playable TypeScript/WebGL2 squad-tactics vertical slice made
with Codex and GPT-5.6 during OpenAI Build Week 2026. This record distinguishes
the eligible implementation from earlier visual exploration and makes the
human/agent collaboration inspectable.

## Entry

- **Project:** ZGP Commander
- **Category:** Apps for Your Life
- **Live showcase:** <https://betterlucky.github.io/ZGP-Commander/?demo=1>
- **Devpost submission:** <https://devpost.com/software/zgp-commander>
- **Demonstration video:** <https://youtu.be/0hmdHQcRuaY>
- **Repository:** <https://github.com/betterlucky/ZGP-Commander>
- **Primary Codex session ID:** `019f5be1-6f19-7213-b7e1-84fe4766a697`
- **Model:** GPT-5.6 in Codex
- **Submission build:** immutable tag `build-week-2026-submission`; this tag is
  created only after the final deployed build passes automated and browser checks

## Eligibility timeline

The official build window opened on 13 July 2026 at 9:00 a.m. PDT / 5:00 p.m.
BST. A visual exploration task began about 90 minutes earlier and produced
throwaway style mock-ups and prototype comparisons. Those pre-window artefacts
are not part of the eligible work claimed here.

After the window opened, the human chose the point-cloud Ghostlink direction,
discarded the thermal alternative and defined the campaign constraints. Codex
then created the production repository and implemented the playable slice. The
repository history begins after the opening time:

| Commit | Timestamp (BST) | Eligible work |
| --- | --- | --- |
| `ea229d3` | 13 Jul, 9:09 p.m. | Production foundation, product documents and first Ghostlink implementation |
| `0c58801` | 13 Jul, 9:42 p.m. | Playable campaign vertical slice with roster, deployment and consequences |
| `45862e0` | 13 Jul, 10:29 p.m. | Tactical controls and operation-map overhaul |
| `c0f4c62` | 14 Jul, 3:23 p.m. | Multi-cache salvage missions and expanded tactical flow |
| `5e7935f` | 17 Jul, 9:42 p.m. | Isolated judge route, save-isolation tests, screenshots, deployment and submission package |
| `8296a59` | 17 Jul, 9:45 p.m. | Public Build Week deployment and live judge links |
| `17bd8ff` | 20 Jul, 5:53 p.m. | Guided onboarding, extraction consequences and first-time-player polish |
| `96408a1` | 20 Jul, 7:21 p.m. | Squad telemetry, reload readability and runner-rush pressure system |
| `1ae06d3` | 20 Jul, 10:10 p.m. | Final runner balance and klaxon fade after full demo playtesting |

The Build Week submission polish added the isolated `?demo=1` route, guided
sensor and operation sequence, judge-friendly reset, screenshots, deployment,
runner-rush encounter and submission documentation. The final correction pass
and exact deployed revision are identified by the immutable submission tag; the
original commit timestamps remain intact.

## Human and Codex decision ledger

### Human direction and acceptance

- Chose a fresh TypeScript browser build rather than porting the older Python or
  Unity architectures.
- Selected the incomplete point-cloud sensor feed and rejected the thermal
  prototype after comparing working variants.
- Defined the product thesis: persistent people, rolling deployments, declared
  risk, automatic combat and no arbitrary mission/squad cap.
- Required wide, readable spaces and rejected hidden enemy scaling based on
  squad size.
- Reframed ordinary food and water as expandable support capacity so logistics
  pressure came from people, ammunition, time and opportunity cost.
- Set the Build Week cut line: polish a deterministic vertical slice rather than
  expand into new factions, multiplayer, backend services or a large art
  pipeline.

### Codex/GPT-5.6 contribution

- Turned the product constraints into game-foundation, architecture, migration
  and open-question documents before implementation expanded.
- Built the TypeScript/Vite application, campaign store, mission board,
  deployment flow, deterministic simulation and consequence resolution.
- Implemented the WebGL2 point-cloud renderer, Canvas fallback, tactical input,
  movement, automatic combat, breach, salvage and extraction flow.
- Added automated campaign/simulation tests and repeatedly ran strict TypeScript
  and production-build verification while iterating.
- Used browser-driven testing to complete the submission route as a fresh user,
  checking the intro, preselected squad, breach guidance, best-scavenger
  assignment, extraction readiness and returned-squad consequences.
- Helped explore and compare several graphical systems, then synthesised the
  failed attempts into Ghostlink's rule-bearing point-cloud presentation after
  the human rejected directions that were readable but generic or distinctive
  but unclear.
- Produced the evidence, deployment workflow, README and video/submission plan
  from the working build rather than describing speculative features.

The most important collaboration pattern was rapid implementation followed by
human redirection. Codex could generate and compare several viable visual and
systems approaches quickly; the human supplied the durable product constraints
and made the cuts that kept the result coherent.

## Technical implementation

- TypeScript 5.9, Vite 7 and Vitest 4.
- WebGL2 point-cloud renderer with a Canvas tactical fallback.
- Explicit boundary between campaign state, tactical simulation and
  presentation snapshots.
- Seeded mission/map fixtures and versioned browser persistence.
- Static deployment: no account, server or runtime AI dependency.
- Separate Build Week save key so repeated judge runs cannot damage a normal
  campaign save.

## Verification

Run from a clean checkout with Node.js 22 or newer:

```bash
npm ci
npm run check
```

At the time this evidence was finalised, `npm run check` passed all 29 tests,
strict TypeScript validation and the production Vite build. The guided route was
also completed in a fresh browser: four survivors deployed, one cache was
recovered, all four extracted, rewards entered transit and the base log recorded
the outcome. The Canvas route was also opened explicitly with
`?demo=1&canvas=1` to verify that the guided flow remains available when WebGL2
cannot be initialised.

## Known limitations

- The slice is desktop-first and requires keyboard/mouse for the intended
  interaction; mobile/touch is not a submission target.
- The campaign is deliberately compact: three initial operation offers, one
  representative warehouse layout and a 12-person starting roster.
- Saves are local to one browser. There are no accounts, cloud saves or backend.
- The normal showcase is representative of production rendering, but the
  separate `?benchmark=1` fixture measures renderer stress rather than 100 fully
  simulated AI agents.
- WebGL2 provides the intended visual fidelity; the Canvas fallback favours
  compatibility over identical appearance.
- Audio begins only after user interaction and remains subject to browser
  autoplay policy. The runner alarm is a credited, licensed external sound;
  weapon, impact and interface effects are synthesised in code.
