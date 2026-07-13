# ZGP Commander repository guidance

## Sources of truth

Read these before making product or architectural changes:

1. `docs/GAME_FOUNDATIONS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/MIGRATION.md`
4. `docs/OPEN_QUESTIONS.md`

Firm decisions in `GAME_FOUNDATIONS.md` take precedence over older ZGPython or
ZGIII documentation. Open tuning values must not be silently promoted into firm
rules.

## Architecture guardrails

- Keep campaign state, tactical simulation, presentation snapshots and rendering
  separate.
- Renderers consume plain presentation data and must not own gameplay rules.
- Tactical input is expressed as commands using stable entity IDs.
- Keep people in a persistent campaign registry when they leave the active
  roster; transfer and MIA are not deletion.
- Model injury, assignment and affiliation separately from campaign status.
- Prefer deterministic simulation and seeded generation where practical.
- Do not add a live Python-to-browser bridge. Port selected behaviour and data
  into the TypeScript codebase.
- Do not reintroduce the discarded thermal presentation as a fallback.

## Design guardrails

- Tactical spaces favour readable sight lines and defensible positions.
- Danger should arise from compromised readiness, greed and movement decisions,
  not unavoidable close-range surprise attacks.
- Do not add a fixed mission cap or daily food/water maintenance without a new,
  explicit design decision.
- Do not add hidden enemy scaling that invalidates oversized squads.
- Extra roster capacity is optional resilience, not a completion requirement.

## Verification

Run this before handing off code changes:

```bash
npm run check
```

Add proportionate automated tests when production simulation or campaign logic
is introduced. Clearly label performance fixtures and prototype-only shortcuts.
