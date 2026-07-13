# Architecture

Status: **forward architecture with a playable campaign vertical slice**

Last updated: 2026-07-13

## Runtime direction

ZGP Commander is a TypeScript application using WebGL2 for the tactical sensor
presentation and ordinary web UI where it improves clarity. Canvas remains a
compatible tactical fallback. The discarded thermal prototype is not a fallback.

ZGPython is a behavioural reference, not a production backend. The project will
not maintain a live Python-to-browser bridge.

## Primary boundaries

```text
Campaign state
    │
    ├── creates MissionDefinition + Deployment
    ▼
Tactical simulation ◄──────────── GameCommand
    │
    ├── emits events and MissionResult
    └── publishes PresentationSnapshot
                         │
                         ▼
                   Ghostlink renderer

Campaign state ── publishes BaseSnapshot ──► Base command schematic
```

### Commands

Input becomes explicit commands addressed by stable IDs, for example:

- select entities;
- move or hold;
- interact, scavenge or administer first aid;
- reload;
- use an ability;
- extract.

The renderer and DOM UI do not mutate simulation objects directly.

### Presentation snapshots

Renderers consume plain, serialisable presentation data:

- map geometry and discovered state;
- entity ID, classification, position, facing and visible pose;
- friendly identity, role, condition and equipment telemetry;
- contact confidence and identification;
- objective, extraction and interaction markers;
- transient effects and incident messages.

Snapshots deliberately exclude pathfinder instances, campaign services,
persistence objects and renderer-owned caches.

## Campaign model

### Person registry

People remain in a campaign-wide registry after leaving the active roster.
Conceptually:

```ts
interface PersonRecord {
  id: string;
  identity: PersonIdentity;
  campaignStatus: "active" | "transferred" | "mia" | "dead";
  affiliationId: string | null;
  injuries: InjuryRecord[];
  career: CareerRecord;
  history: PersonEvent[];
}
```

Assignment and mission participation are operational records, not campaign
status values. `npc` is a role in a particular scene, not a permanent kind of
person.

### Operational day ledger

The day ledger records:

- persistent provisional base assignments;
- survivors whose principal action has been consumed;
- launched and resolved operations;
- loadouts and resources reserved by each operation;
- loot and rewards held in same-day transit;
- pending end-of-day recovery, work and project progress.

This makes rolling deployment possible without allowing a survivor or recovered
weapon to be reused during the same day.

### Mission offers

Mission offers have stable IDs and explicit availability:

```ts
interface MissionOffer {
  id: string;
  source: "routine" | "faction" | "distress" | "mia";
  createdDay: number;
  expiresAfterDay: number | null;
  declaredRisk: MissionRisk;
  definition: MissionDefinition;
  subjects: string[];
}
```

Generation policies ensure a readable mix of opportunities without coupling
offer count to roster size. Urgent offers do not silently consume an unrelated
routine slot.

### Crisis snapshots

Live-distress rescues do not require continuously simulating other tactical maps.
A crisis snapshot stores the people, condition, ammunition, location, threat and
remaining window. Loading the rescue creates a mission already in that crisis.

## Simulation principles

- Fixed or bounded simulation steps where they improve determinism.
- Seeded map and encounter generation.
- Explicit events for consequences needed by campaign resolution.
- No gameplay rules in WebGL shaders or renderer classes.
- No hidden enemy scaling based on squad size.
- Encounter fixtures clearly separated from production campaign data.
- Save data is versioned and migrated rather than coupled to runtime class shape.

Determinism is valuable for tests, reproducible balance reports, replay capture
and a possible future asynchronous competitive mode. It does not require exact
cross-device floating-point lockstep until a feature actually needs it.

## Intended source layout

The current `src/` directory is a compact vertical slice. Campaign state and
application flow have begun moving into responsibility-based modules; tactical
simulation and rendering remain compact while their production interfaces are
still being proven:

```text
src/
  app/             application composition and screen flow
  campaign/        registry, roster, day ledger, offers, results, saves
  content/         validated definitions and balance configuration
  simulation/      tactical state, systems, commands and events
  presentation/    snapshot builders and presentation-only models
  rendering/       WebGL/Canvas tactical renderers and shared transforms
  base/            living command schematic and facility views
  ui/              reusable DOM components and interaction adapters
  testing/         deterministic fixtures and scenario builders
```

This remains a direction, not a request to move files mechanically before their
production boundaries are understood.

## Data and content

- Content definitions should be plain data with runtime validation at load time.
- IDs are stable and referenced across saves; display text is not an identifier.
- Gameplay values live in configuration once they require tuning across scenarios.
- Lore-specific names and faction text remain content rather than control flow.
- Imported ZGPython JSON is reviewed and adapted to a new schema before use.

## Verification strategy

Current minimum:

```bash
npm run check
```

The campaign rule suite currently covers action consumption, rewards in transit,
base output, rescue identity, support expansion cost and mission-board rotation.
As production systems arrive, add:

- broader unit tests for tactical rules and campaign edge cases;
- seeded scenario tests for combat, extraction and injury outcomes;
- save/load round trips and schema migrations;
- performance fixtures for representative maps, contacts and roster UI;
- snapshot or screenshot checks for critical presentation states where stable.

The current 100-contact performance mode remains a rendering benchmark. It is
not evidence that 100 fully simulated AI agents meet the same performance target.
