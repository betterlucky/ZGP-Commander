# Build Week submission copy

## Title

ZGP Commander

## Tagline

Command persistent survivors through an incomplete remote sensor feed—take what
you can, decide when to leave, and live with who returns.

## One-sentence hook

ZGP Commander turns a cold point-cloud sensor reconstruction into a
consequential squad-tactics game where combat is automatic and the player's real
skill is deciding who to risk, how far to push and when to leave.

## Description

Many squad tactics games bury consequential decisions beneath twitch execution
or sprawling management. ZGP Commander is for strategy players who want
readable high-level orders, explicit risk and attachment that emerges from
persistent outcomes.

At a living outpost, the player manages a 12-person survivor roster, base jobs,
ammunition and rotating opportunities. A chosen squad enters Ghostlink: an
incomplete remote sensor reconstruction of the operation. Friendly telemetry is
authoritative, but the environment and hostile contacts arrive as uncertain
point-cloud data. The player selects positions, breaches, assigns a scavenger
and decides whether another cache is worth the rising pressure. Combat executes
automatically; judgement and extraction timing are the verbs that matter.

Returning home does not erase the operation. Ammunition is spent, salvage
travels in transit and survivors may return injured, become missing or die.
Their history makes them valuable without relying on scripted biography.

The Build Week demo isolates this loop into a deterministic 3–4 minute route
with a balanced squad, in-game guidance and a clean replay button. It uses the
same campaign, simulation and renderer as the full slice.

## How it was built

ZGP Commander is a static TypeScript/Vite application. Its tactical presentation
uses a WebGL2 point-cloud renderer with a Canvas fallback. Campaign state creates
mission definitions and deployments; the tactical simulation accepts explicit
commands and publishes plain presentation snapshots; renderers consume those
snapshots without owning gameplay rules. Seeded fixtures make the showcase and
tests reproducible, while a versioned browser save supports the full campaign.

Codex with GPT-5.6 was the implementation partner throughout the eligible build.
It translated product constraints into architecture documents, built the
campaign and tactical systems, implemented the WebGL2 presentation, added tests,
debugged the interactive flow and used browser-driven checks to complete the
judge route. The human supplied the product thesis and acceptance decisions:
choosing Ghostlink over a thermal variant, insisting on persistent people and
declared risk, rejecting hidden squad-size scaling, and cutting broad feature
expansion in favour of a coherent vertical slice.

## Challenges and decisions

The largest design challenge was making the visual identity serve the rules
rather than behave as a filter. Ghostlink therefore has an information contract:
friendly telemetry is reliable; environment and contact data are incomplete.
The largest production challenge was connecting a tactical mission to meaningful
campaign consequences without building a backend or a sprawling content
pipeline. A strict separation between campaign state, simulation and rendering
kept that tractable and testable.

## What comes next

The next step is breadth earned through the same core loop: more operation
layouts and factions, richer survivor careers and rescue chains, deeper base
projects, and playtesting-driven balance. Multiplayer, accounts and a large art
pipeline are intentionally outside this slice.

## Judge links

- Demo: <https://betterlucky.github.io/ZGP-Commander/?demo=1>
- Full campaign: <https://betterlucky.github.io/ZGP-Commander/>
- Repository: <https://github.com/betterlucky/ZGP-Commander>
- Evidence: <https://github.com/betterlucky/ZGP-Commander/blob/main/BUILD_WEEK.md>
- Codex session ID: `019f5be1-6f19-7213-b7e1-84fe4766a697`
- Video: add public YouTube URL after upload
