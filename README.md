# ZGP Commander

**Command persistent survivors through an incomplete remote sensor feed—take
what you can, decide when to leave, and live with who returns.**

[Play the 3–4 minute Build Week demo](https://betterlucky.github.io/ZGP-Commander/?demo=1)
· [Open the full campaign](https://betterlucky.github.io/ZGP-Commander/)
· [Build Week evidence](BUILD_WEEK.md)

[![CI](https://github.com/betterlucky/ZGP-Commander/actions/workflows/ci.yml/badge.svg)](https://github.com/betterlucky/ZGP-Commander/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/betterlucky/ZGP-Commander/actions/workflows/pages.yml/badge.svg)](https://github.com/betterlucky/ZGP-Commander/actions/workflows/pages.yml)

![The Build Week demo introduction](docs/screenshots/demo-intro.jpg)

ZGP Commander is an order-based squad tactics and campaign game. You prepare a
persistent survivor roster at a living outpost, deploy through the reconstructed
Ghostlink feed, and issue high-level orders while combat resolves automatically.
The important decisions are who to risk, where to hold, how much to recover and
when to leave.

The repository contains a playable campaign vertical slice built with Codex and
GPT-5.6 for [OpenAI Build Week 2026](https://openai.com/build-week/).

## Judge quick start

The hosted demo needs a desktop browser, keyboard and mouse. It uses a separate,
fresh save on every page load and cannot overwrite an ordinary campaign.

1. Open the [guided demo](https://betterlucky.github.io/ZGP-Commander/?demo=1).
2. Choose **Begin 3–4 minute demo**, then **Establish Ghostlink**. A balanced
   four-person squad is already selected.
3. Press `F` to breach. Right-click a numbered cache to assign the best
   scavenger while the other survivors cover them.
4. Secure at least one cache, return every standing survivor to the marked
   landing zone, and call extraction—or push deeper first.
5. Review the returned squad, resources in transit and command log at base.

No account, download or prior save is required. **Restart demo** gives the
showcase a clean state at any time.

![A four-person squad operating through the Ghostlink feed](docs/screenshots/ghostlink-tactical.jpg)

## What is in the slice

- Persistent 12-person roster with tiers, roles, equipment and base jobs.
- Rotating mission board with explicit risk, rewards and expiry.
- Rolling squad deployment with ammunition and opportunity costs rather than a
  fixed mission or squad cap.
- WebGL2 Ghostlink mission view with one readable operation floor, roughly
  33,000 environment points, live contacts and two point-cloud draw calls. A
  Canvas fallback is available when WebGL2 is unavailable.
- Automatic combat, eight-direction routed movement, stationary reloads,
  multi-cache salvage, exterior breach and partial or full extraction.
- Mission resolution, injuries, MIA/death states, rescue offers and delayed
  field rewards.
- End-of-day base production, recovery and expandable support capacity.
- Versioned local browser save. `RESET CAMPAIGN` starts over.
- An isolated deterministic Build Week route at `?demo=1`; the 100-contact
  rendering stress fixture remains available at `?benchmark=1`.

No image assets or runtime generative systems are required by the game. The UI,
point-cloud environment and tactical effects are rendered from code.

![The living base after a four-survivor extraction](docs/screenshots/base-consequences.jpg)

## Run locally

Requires Node.js 22 or newer and a current desktop browser. Chrome/Chromium,
Edge, Firefox and Safari are the intended targets; WebGL2 gives the full
presentation and Canvas provides a compatible tactical fallback.

```bash
npm ci
npm run dev
```

Use the local URL printed by Vite. Add `?demo=1` for the guided showcase.

```bash
npm run check
```

`check` runs 17 campaign/simulation tests, strict TypeScript validation and the
production Vite build used by continuous integration.

## Tactical controls

- Drag on the tactical map to box-select survivors. Shift-drag adds to the
  current selection.
- Click squad cards or press a survivor's number to select them. Shift-click
  cards for multi-selection, or press `A` to select everyone.
- Right-click the floor to move selected survivors in formation.
- Right-click a marked cache to assign the selected survivor with the best
  scavenging skill; everyone else moves close to cover them.
- Press `F` to breach the marked entrance, `H` to hold, `R` to reload in place,
  and `Space` to pause.
- Use `WASD`, the arrow keys, or middle-drag to pan. Number keys select a
  survivor and centre the camera on them; `Ctrl/Cmd+A` selects the squad.
- Use the mouse wheel, `+` / `-`, or the on-screen controls to zoom.
- Secure at least one marked cache, then decide whether to push for more or
  return every standing survivor to the landing zone and call extraction.

## Architecture

Campaign state creates mission definitions and deployments. The tactical
simulation accepts explicit commands and emits events/results plus plain
presentation snapshots. Ghostlink renderers consume those snapshots; they do
not own gameplay rules. Campaign resolution then applies persistent personnel
and resource consequences.

This separation keeps campaign rules testable, prevents renderer state from
becoming authoritative and leaves room for deterministic scenario fixtures.
See [Architecture](docs/ARCHITECTURE.md) for the boundaries and data model.

Project documentation:

- [Build Week evidence](BUILD_WEEK.md) — eligible timeline, Codex/GPT-5.6
  collaboration, verification and limitations.
- [Game foundations](docs/GAME_FOUNDATIONS.md) — authoritative product and
  presentation decisions.
- [Architecture](docs/ARCHITECTURE.md) — runtime boundaries and data model.
- [Migration policy](docs/MIGRATION.md) — how older ZGP projects are used as
  behavioural references without inheriting their runtime architecture.
- [Open questions](docs/OPEN_QUESTIONS.md) — tuning and content questions that
  should be answered through prototypes and playtesting.

## Licence

The source code is available under the [MIT License](LICENSE). The licence does
not grant rights to the ZGP Commander name or branding.
