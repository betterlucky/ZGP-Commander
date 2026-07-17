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

Codex with GPT-5.6 was both implementation partner and visual-design
collaborator throughout the eligible build. It translated product constraints
into architecture documents, built the campaign and tactical systems,
implemented the WebGL2 presentation, added tests, debugged the interactive flow
and used browser-driven checks to complete the judge route. The human supplied
the product thesis and acceptance decisions: insisting on persistent people and
declared risk, rejecting hidden squad-size scaling, comparing and rejecting
several graphical prototypes—including a thermal direction—and cutting broad
feature expansion in favour of a coherent vertical slice.

## Challenges and decisions

The point-cloud presentation was not our first answer. Several earlier
graphical approaches were technically viable but failed to make the game
readable or distinctive. Working iteratively with Codex and GPT-5.6 let us turn
those failed prototypes into design evidence and arrive at Ghostlink: a new way
to visualise the game in which an incomplete remote sensor reconstruction
communicates the rules rather than merely applying a visual filter. Friendly
telemetry is reliable; environment and hostile-contact data are deliberately
uncertain.

The largest production challenge was connecting a tactical mission to
meaningful campaign consequences without building a backend or a sprawling
content pipeline. A strict separation between campaign state, simulation and
rendering kept that tractable and testable.

## What we learned

Rapid implementation is only useful when paired with deliberate product cuts.
Codex did more than accelerate implementation: after several visual attempts
failed, it helped explore, compare and synthesise a graphical system that
neither of us had started with. Human judgement decided which prototypes failed
and which direction served the game. The strongest outcome came from treating
the point cloud as an information contract and persistent people as the source
of stakes.

## What comes next

The next step is breadth earned through the same core loop: more operation
layouts and factions, richer survivor careers and rescue chains, deeper base
projects, and playtesting-driven balance. Multiplayer, accounts and a large art
pipeline are intentionally outside this slice.

## Judge links

- Submission: <https://devpost.com/software/zgp-commander>
- Demo: <https://betterlucky.github.io/ZGP-Commander/?demo=1>
- Full campaign: <https://betterlucky.github.io/ZGP-Commander/>
- Repository: <https://github.com/betterlucky/ZGP-Commander>
- Evidence: <https://github.com/betterlucky/ZGP-Commander/blob/main/BUILD_WEEK.md>
- Codex session ID: `019f5be1-6f19-7213-b7e1-84fe4766a697`
- Video: <https://youtu.be/0hmdHQcRuaY>

## Video publishing

- Final master: `zgp-commander-build-week-2026.mp4` (1920×1080, 2:52, H.264/AAC)
- YouTube title:
  `ZGP Commander — OpenAI Build Week 2026 | Voice generated with 11.ai`
- YouTube description credit:
  `Voice generated with ElevenLabs — https://11.ai`
- Include the same credit legibly on the final title card.
