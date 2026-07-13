# Game Foundations

Status: **authoritative direction, with tuning values intentionally provisional**

Last updated: 2026-07-13

## High-level pitch

An endless squad-management and tactical-operations game in which the player
commands persistent survivors through a remote sensor link. Combat execution is
largely automatic; the player chooses people, equipment, position, movement,
objectives and acceptable risk.

Survivors enter as manpower. Some die, transfer or disappear. A few accumulate
history, survive exceptional operations and become people the player is no
longer willing to risk.

## Core pillars

- Order-based tactical control with automatic combat execution.
- Attachment earned through persistent outcomes rather than imposed biography.
- Explicit mission risk, extraction rules and consequences.
- Fair tactical information and enough reaction time to make loss understandable.
- A large optional roster supporting a smaller number of genuinely operational
  squads.
- Stories produced by deployment, injury, disappearance, rescue, transfer and
  return.

## Presentation contract

The player commands an independent survivor outpost. Deployed squads carry a
Ghostlink relay system that combines local mapping, short-range scanning and
personal telemetry into a reconstructed tactical display. The commander issues
intent-level orders while survivors handle moment-to-moment execution.

The link is a presentation device, not a random control-failure mechanic.

### Tactical presentation

- Cold, incomplete and transient point-cloud reconstruction.
- Friendly identity, condition and equipment are authoritative telemetry.
- Enemy information is observational and may progress from unknown contact to
  identified threat.
- Fog and missing geometry represent incomplete sensing.
- Names, radio acknowledgements, vital signs and incident history carry much of
  the human connection.
- `Incapacitated`, `no vital signs` and `telemetry lost` are different states.

### Base presentation

The base is a warmer **living command schematic**, not an explorable character
space and not a text-only terminal.

- Facilities occupy stable spatial positions and visibly develop.
- Survivor markers move between operations, medical, workshop and accommodation.
- Facility activity, returning squads, routed loot, injuries and memorial changes
  provide ambient life without requiring a second full character renderer.
- Selecting a person reveals the detailed portrait, equipment, injuries, career
  and history that the tactical signature deliberately abstracts.
- The tactical and base modes share typography and iconography, but not fidelity:
  the local base system has complete geometry and stable telemetry.

## Tactical encounter doctrine

Maps favour warehouse, department-store and broad commercial or industrial
spaces. A prepared, adequately equipped squad occupying good sight lines should
normally be able to defend itself.

Danger comes from voluntarily compromising that readiness:

- A survivor scavenging is not contributing fully to defence.
- First aid compromises the medic and patient.
- Reloading is stationary.
- Survivors cannot move and shoot effectively.
- Splitting the squad, chasing contacts, advancing with depleted magazines or
  staying too long can turn a stable position into an overwhelmed one.

Tight sections may exist as local hazards, shortcuts or high-value areas, but
they are not the default encounter geometry. Threats should not routinely appear
inside the player's reasonable reaction envelope.

Oversized squads remain legal and powerful. An eight-person revenge deployment
can be fun and effective. Its cost is ammunition, exposed people and sacrificed
opportunities—not hidden enemy health or count scaling.

## Operational day

Each survivor performs one principal action per operational day.

Deployment uses a rolling flow:

1. Survivors begin with persistent, provisional base assignments.
2. The player selects one mission and prepares its squad and loadouts in context.
3. The mission is launched and played.
4. Those survivors are marked as having acted.
5. The player may prepare another operation from the remaining roster.
6. Ending the day resolves base work, recovery, construction and returns.

Several operations can occur within the same strategic day without claiming
they happen in the same minute. Same-day loot remains in transit until day end
and cannot equip a later operation. Base output and long-term projects resolve
once per day.

There is no fixed daily mission count. The player may end the day without using
every available survivor.

## Mission board

The board contains rotating opportunities with declared lifetimes. It is not a
checklist and has no reward for being emptied.

- Routine operations provide dependable tactical opportunities.
- Faction requests rotate rather than accumulating indefinitely.
- MIA and live-distress rescues occupy a visibly urgent lane.
- Expiration is measured in campaign days, not missions played.
- Missing a normal opportunity has no concealed punishment.
- Any consequence for ignoring an urgent operation is stated explicitly.

Mission supply is driven by the world and available intelligence, not roster
size. A larger roster does not cause the world to generate proportionally more
valuable sites.

## Roster progression and scale

The campaign supports a top tier backed by line survivors and a larger reserve.
These are organisational categories, not stat classes:

- **Vanguard:** trusted people and best equipment.
- **Line:** dependable operational squads and replacements.
- **Reserve:** recruits, base workers and likely lethal-defence manpower.

The player controls promotion and may override deployment protections. Reserve
survivors do not receive artificial penalties; survival and performance can make
them valuable.

The code and interface should tolerate a roster of 100 or more, but balance must
not imply that such a roster is required. Additional survivors first unlock
capability, then provide resilience, and eventually provide optional depth only.

### Natural demand saturation

- Strategic projects advance per day, not per mission.
- Facilities have a finite number of meaningful specialist positions.
- Mission opportunities do not scale linearly with roster size.
- Equipment, ammunition, injury and experience determine operational strength.
- Recruiting additional people is voluntary.
- The UI reports when operational coverage, base staffing and replacement depth
  are already sufficient.

Progress is communicated through squad quality, operational coverage, equipment,
facilities, survivor careers and regional accomplishments—not roster headcount
or maximum infrastructure.

## Support capacity and resources

Ordinary food and water are abstracted into **support capacity**, covering
accommodation, provisioning, sanitation and water infrastructure.

- Capacity expansion is an increasingly expensive capital project.
- It does not create daily food or water maintenance.
- No progression requires maximum capacity.
- Temporary overcapacity is allowed for rescues and exceptional returns.
- At capacity, ordinary recruitment pauses until space is created.
- Voluntary permanent transfers can create space and faction relationships.

Food and water do not appear as ordinary loot. Rare coffee, fresh produce,
chocolate or similar finds may be classified as **comforts** or **luxuries** and
provide a temporary recovery or readiness benefit.

The provisional independent resource vocabulary is:

- Equipment and weapons.
- Ammunition.
- Medical supplies.
- Construction and fabrication materials.
- Support capacity.

This list may be reduced or renamed during campaign prototyping.

## Character lifecycle

Every person has a stable campaign identity even when they leave the active
roster. Transfer and MIA are not deletion.

Campaign status, physical condition, assignment and affiliation are separate
dimensions:

```text
Campaign status: Active | Transferred | MIA | Dead
Condition:       Fit | one or more persistent injuries
Assignment:      Available | Base job | Deployed | Recovering
Affiliation:     Player outpost | faction | independent | unknown
```

`Dead` is terminal. Other states may change through visible campaign outcomes.

Transferred survivors may appear later as faction NPCs, allied squad members,
distress subjects, mission contacts or candidates asking to return. Their identity
and history remain intact.

MIA survivors may be found by the player, recovered by another group, become
transferred, return independently, or be confirmed dead when an explicitly
declared rescue window expires.

### Injuries

Injuries are persistent records rather than a single injured flag.

- Minor injuries allow deployment but modify relevant statistics.
- Major injuries can prevent deployment or require treatment.
- Multiple injuries may accumulate during remote runs.
- Rescued and returning survivors may re-enter with existing and new injuries.
- Exact stacking, treatment and recovery values are tuning concerns.

## Base work

Assignments persist until changed. Routine labour does not require daily
individual confirmation.

- Named specialists can materially improve a finite facility function.
- Pulling a specialist into a mission clearly shows the lost base output.
- General duty has strongly diminishing returns after routine needs are met.
- Permanent mandatory farming assignments are not part of the base game.
- Unassigned people default to useful routine duty, readiness or recovery rather
  than wasting an action silently.

## Campaign and endgame

The campaign is endless. Its history is the outpost, its people and their
outcomes rather than a required final boss.

Synchronous PvP is out of scope. A future nonlethal asynchronous mode remains
possible if squad, loadout, doctrine and scenario state are serialisable and
deterministic. It must not distort the base game's simulation or require a city
builder-style base layout.

## Explicit non-goals for the base game

- A conventional city-builder production economy.
- Daily food and water meter maintenance.
- An explorable animated base.
- Text-only base management.
- Hidden difficulty scaling based on deployed squad size.
- A hard daily mission-slot cap added only for pacing.
- Random control latency or signal failure.
- Synchronous PvP or PvPvE.
- Directly embedding the Python runtime beneath the new renderer.
