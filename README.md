# ZGP Commander

ZGP Commander is an endless squad-management and tactical-operations game built
around a remote sensor presentation. The player develops a persistent survivor
roster, runs order-based missions with automatic combat, and accepts clearly
declared risks in a campaign where favourites are earned through survival.

The repository currently contains the **Ghostlink performance prototype**. It
proves the WebGL2 presentation at useful map and contact density; it is not yet
the production simulation or campaign architecture.

## Current prototype

- WebGL2 point-cloud renderer with a compatible Canvas fallback.
- Four-sector facility benchmark.
- Approximately 122,000 static environment points.
- 100 animated contacts and four articulated survivor signatures.
- Two WebGL draw calls for the point-cloud scene.
- Routed movement, selection, collection state and incident reporting.

No image assets or runtime generative systems are required by the prototype.

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

`check` performs the strict TypeScript check and production Vite build used by
continuous integration.

## Prototype controls

- Click the tactical map to move selected survivors.
- Click squad cards or press `1`–`4` to select a survivor.
- Shift-click squad cards for multi-selection, or press `A` to select everyone.
- Press `H` to hold, `Space` to pause, and `R` to reset.
- Use the mouse wheel or on-screen controls to zoom.

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
