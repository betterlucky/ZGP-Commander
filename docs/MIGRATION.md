# Selective Migration from Earlier ZG Projects

Status: **policy**

Last updated: 2026-07-13

## Decision

ZGP Commander is the canonical implementation. Earlier projects are executable
design references and test or data sources. We will port behaviour in vertical
slices rather than bolt the Ghostlink renderer onto ZGPython or translate its
class hierarchy wholesale.

## Sources

### ZGPython

Local reference: `/Users/daveharris/dev/ZGPython`

Particularly useful material:

- order-based movement and automatic combat behaviour;
- map, fog, extraction, scavenging and objective rules;
- weapons, equipment, enemy and progression data;
- declared mission risk and extraction semantics;
- deterministic campaign and system tests;
- expected edge cases encoded in the test suite.

Do not import as architecture:

- Pygame rendering, camera or UI code;
- live Python entity graphs as presentation models;
- mission renderer access to global game services;
- input handlers retaining direct entity references;
- lore, factions or meta systems not reaffirmed in this repository.

### ZGIII

Local reference: `/Users/daveharris/dev/ZGIII`

Particularly useful material:

- one principal survivor action per day;
- accumulated minor and major injuries;
- high-churn roster intent;
- MIA survivability based on the circumstances of loss;
- time-limited rescue offers for a specific persistent person;
- restoring the same career record after rescue;
- squad and ammunition opportunity costs.

`src/meta.ts` and `src/rescue.ts` are behavioural references for MIA and rescue.
The new system extends them to support faction recovery, transfer, NPC return and
live-distress crisis snapshots.

Do not import automatically:

- localStorage persistence shape;
- prototype UI and rendering code;
- exact injury, MIA chance, resource or roster-cap values;
- operation-count deadlines where campaign-day deadlines are intended.

## Migration ledger

| Area | Source value | ZGP Commander treatment |
|---|---|---|
| Ghostlink rendering | Current prototype | Retain and evolve behind snapshots |
| Thermal rendering | Earlier prototype | Drop |
| Automatic combat | ZGPython/ZGIII | Port behaviour, then tune |
| Movement/pathfinding | Both | Reimplement behind commands |
| Map generation | Both | Port useful algorithms and fixtures |
| Mission risk/extraction | ZGPython | Adapt as explicit definitions |
| Injury accumulation | ZGIII | Rebuild as persistent injury records |
| MIA/rescue | ZGIII | Rebuild and extend through person IDs |
| Base jobs | Both | Rework as persistent assignments with saturation |
| Food/water stockpiles | Earlier designs | Drop; use support capacity |
| Factions/contracts | ZGPython | Reconsider as content, not assumed canon |
| Pygame UI/rendering | ZGPython | Drop |
| Campaign tests | ZGPython | Use as specifications; port relevant cases |
| Existing JSON | ZGPython | Review, rename and validate before import |

## Vertical-slice method

For each mechanic:

1. State the player-visible rule in this repository.
2. Locate relevant old implementation and tests.
3. Extract representative deterministic scenarios and balance values.
4. Define the new command, state and result contracts.
5. Implement in TypeScript without importing renderer concerns.
6. Verify the old behavioural cases that are still intentional.
7. Record deliberate divergences rather than preserving accidental behaviour.

The old games remain useful as mechanics oracles while a slice is being ported.
They do not remain runtime dependencies.
