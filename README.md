# ZGP Commander

ZGP Commander is an endless squad-management and tactical-operations game built
around a remote sensor presentation. The player develops a persistent survivor
roster, runs order-based missions with automatic combat, and accepts clearly
declared risks in a campaign where favourites are earned through survival.

The repository contains a **playable campaign vertical slice**. It combines the
Ghostlink tactical presentation with a persistent roster, rolling deployments,
mission consequences and the living outpost command schematic.

## Current slice

- Persistent 12-person roster with tiers, roles, equipment and base jobs.
- Rotating mission board with explicit risk, rewards and expiry.
- Rolling squad deployment with ammunition and opportunity costs rather than a
  fixed mission or squad cap.
- WebGL2 Ghostlink mission view with a single readable operation floor,
  approximately 29,000 environment points, live contacts and two point-cloud
  draw calls. The replicated stress fixture remains available with
  `?benchmark=1`.
- Automatic combat, eight-direction routed movement, stationary reloads,
  multi-cache salvage, exterior breach and partial or full extraction.
- Mission resolution, injuries, MIA/death states, rescue offers and delayed
  field rewards.
- End-of-day base production, recovery and expandable support capacity.
- Versioned local browser save. `RESET CAMPAIGN` starts over.

No image assets or runtime generative systems are required by the slice.

## Run locally

Requires Node.js 22.

```bash
npm install
npm run dev
```

Use the local URL printed by Vite.

```bash
npm run check
```

`check` runs the campaign-rule tests, strict TypeScript check and production
Vite build used by continuous integration.

## Tactical controls

- Drag on the tactical map to box-select survivors. Shift-drag adds to the
  current selection.
- Click squad cards or press a survivor's number to select them. Shift-click
  cards for multi-selection, or press `A` to select everyone.
- Right-click the floor to move selected survivors in formation.
- Right-click the marked cache to assign the selected survivor with the best
  scavenging skill; everyone else moves close to cover them.
- Press `F` to breach the marked entrance, `H` to hold, `R` to reload in place,
  and `Space` to pause.
- Use `WASD`, the arrow keys, or middle-drag to pan. Number keys select a survivor
  and centre the camera on them; `Ctrl/Cmd+A` selects the squad.
- Use the mouse wheel, `+` / `-`, or the on-screen controls to zoom. Middle-drag
  or use the arrow keys to pan while zoomed in.
- Secure at least one marked cache, then choose whether to push for more or return
  every standing survivor to the landing zone and call extraction.

## Project documentation

- [Game foundations](docs/GAME_FOUNDATIONS.md) — authoritative product and
  presentation decisions.
- [Architecture](docs/ARCHITECTURE.md) — intended boundaries and data model.
- [Migration policy](docs/MIGRATION.md) — how ZGPython and ZGIII are used as
  behavioural references without inheriting their runtime architecture.
- [Open questions](docs/OPEN_QUESTIONS.md) — non-blocking tuning and content
  decisions that should be answered through prototypes and playtesting.

## Direction in one paragraph

Missions use the cold, incomplete Ghostlink feed. The base uses a warmer living
command schematic with persistent people, facilities and consequences. Each
survivor performs one principal action per operational day, but missions are
prepared and played through rolling deployment rather than a large up-front
assignment block. There is no fixed daily mission cap: roster availability,
ammunition, worthwhile opportunities and sacrificed base work create the
pressure. Ordinary food and water are abstracted into expandable support
capacity rather than maintained as daily resources.
