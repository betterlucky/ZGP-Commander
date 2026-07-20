import { angleTo, clamp, distance, moveTowards, mulberry32 } from "./math";
import { createFacilityMap, findPath, hasLineOfSight, nearestWalkable } from "./map";
import type { Contact, ContactKind, EventEntry, SimulationState, TacticalOutcome, TacticalSetup, TacticalUnitSetup, Unit, Vec2 } from "./types";

const defaultUnitSetup: TacticalUnitSetup[] = [
  { personId: "person-01", name: "MAYA", role: "MEDIC", color: "#66e9ff", weapon: "smg", health: 94, scavengeSkill: 34 },
  { personId: "person-02", name: "HOLT", role: "SCAVENGER", color: "#8bdcff", weapon: "shotgun", health: 82, scavengeSkill: 88 },
  { personId: "person-03", name: "REYES", role: "RANGER", color: "#55d5ff", weapon: "rifle", health: 88, scavengeSkill: 44 },
  { personId: "person-04", name: "FINCH", role: "ENGINEER", color: "#9eeaff", weapon: "carbine", health: 76, scavengeSkill: 58 },
];

const defaultSetup: TacticalSetup = {
  missionTitle: "Clinic Supply Run",
  objectiveLabel: "Secure the medical cache and extract",
  riskLabel: "RECOVERABLE",
  threat: 0.52,
  units: defaultUnitSetup,
};

const weaponMagazine: Record<Unit["weapon"], number> = { rifle: 24, shotgun: 8, smg: 30, carbine: 24 };
const weaponReloadTime: Record<Unit["weapon"], number> = { rifle: 2.4, shotgun: 3.2, smg: 2.1, carbine: 2.3 };
const weaponRange: Record<Unit["weapon"], number> = { rifle: 9, shotgun: 5.8, smg: 7.2, carbine: 7.2 };
const roleSpeed: Record<Unit["role"], number> = { MEDIC: 3.45, SCAVENGER: 3.3, RANGER: 3.55, ENGINEER: 3.35 };
const safeSpawnDistance = 16;
const runnerRushWarningDuration = 4;
const runnerRushDuration = 15;
const maximumRunnerRushes = 2;

export class Simulation {
  public state: SimulationState;
  private readonly setup: TacticalSetup;
  private nextContactId = 1;
  private spawnTimer = 1.5;
  private runnerRushCheckTimer = 18;
  private runnerWaveTimer = 0;
  private random = mulberry32(423771);
  private cacheAnnounced = new Set<string>();

  constructor(setup: TacticalSetup = defaultSetup) {
    this.setup = structuredClone(setup);
    this.state = this.createState();
  }

  private createState(): SimulationState {
    const map = createFacilityMap();
    const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(this.setup.units.length))));
    const units = this.setup.units.map((template, index): Unit => {
      const pos = {
        x: map.insertion.x + (index % columns) * 0.95,
        y: map.insertion.y + Math.floor(index / columns) * 0.82,
      };
      const target = { ...pos };
      const maxAmmo = weaponMagazine[template.weapon];
      return {
        ...template,
        id: index + 1,
        facing: -Math.PI / 2,
        speed: roleSpeed[template.role],
        moveSpeed: roleSpeed[template.role],
        attackRange: weaponRange[template.weapon],
        reloadDuration: weaponReloadTime[template.weapon],
        ammo: maxAmmo,
        maxAmmo,
        reloadTimer: 0,
        stress: 10 + index * 2,
        phase: index * 1.17,
        selected: index === 0,
        state: "holding",
        interaction: null,
        shotFlash: 0,
        shotCooldown: index * 0.12,
        pos,
        prev: { ...pos },
        target,
        path: [],
      };
    });
    const events: EventEntry[] = [
      { time: 0, who: "SYSTEM", message: "Sensor link established. Facility map resolving.", tone: "normal" },
      { time: 0.7, who: "SENSOR", message: "Objective position resolved. Approach routes are open.", tone: "good" },
      { time: 1.2, who: "CONTACT", message: "Movement registering beyond the holding floor.", tone: "warning" },
    ];
    const state: SimulationState = {
      paused: false,
      elapsed: 0,
      threat: this.setup.threat,
      caches: map.caches.slice(0, this.setup.cacheCount ?? map.caches.length).map((cache) => ({ ...cache, pos: { ...cache.pos }, progress: 0, secured: false })),
      breachOpen: false,
      scanAngle: 0,
      signalPulse: 0,
      missionTitle: this.setup.missionTitle,
      objectiveLabel: this.setup.objectiveLabel,
      riskLabel: this.setup.riskLabel,
      missionStatus: "active",
      contactsNeutralised: 0,
      shotSequence: 0,
      killSequence: 0,
      hitSequence: 0,
      breachSequence: 0,
      cacheSequence: 0,
      runnerRushStatus: "idle",
      runnerRushWarning: 0,
      runnerRushRemaining: 0,
      runnerRushSequence: 0,
      runnerRushesTriggered: 0,
      units,
      contacts: [],
      map,
      events,
    };
    const initialContacts = 9 + Math.round(this.setup.threat * 10);
    for (let i = 0; i < initialContacts; i += 1) {
      const contact = this.makeContact(i, map, units);
      if (contact) state.contacts.push(contact);
    }
    return state;
  }

  private makeContact(index = 0, map = this.state.map, units = this.state.units, requireSafe = false, forcedKind: ContactKind | null = null): Contact | null {
    const standingUnits = units.filter((unit) => unit.state !== "down");
    if (requireSafe && !standingUnits.length) return null;
    const rankedSpawns = map.contactSpawns
      .map((spawn) => ({ spawn, clearance: standingUnits.length ? Math.min(...standingUnits.map((unit) => distance(spawn, unit.pos))) : Infinity }))
      .sort((a, b) => b.clearance - a.clearance);
    const safeSpawns = rankedSpawns.filter((candidate) => candidate.clearance >= safeSpawnDistance);
    if (requireSafe && !safeSpawns.length) return null;
    const spawnPool = safeSpawns.length ? safeSpawns : rankedSpawns.slice(0, 2);
    const spawn = spawnPool[index % spawnPool.length].spawn;
    const kind = forcedKind ?? "walker";
    const jitter = () => (this.random() - 0.5) * 1.4;
    const pos = nearestWalkable(map, { x: spawn.x + jitter(), y: spawn.y + jitter() });
    return {
      id: this.nextContactId++,
      kind,
      pos,
      prev: { ...pos },
      target: 3,
      path: [],
      repath: this.random() * 0.8,
      facing: Math.PI,
      speed: kind === "runner" ? 5.8 + this.random() * 1.1 : 0.72 + this.random() * 0.52,
      phase: this.random() * Math.PI * 2,
      heat: 0.7 + this.random() * 0.3,
      confidence: 0.45 + this.random() * 0.55,
      health: kind === "runner" ? 2 : this.random() > 0.82 ? 2 : 1,
      alive: true,
      hitFlash: 0,
      attackCooldown: this.random(),
    };
  }

  public togglePause(): void {
    if (this.state.missionStatus !== "active") return;
    this.state.paused = !this.state.paused;
  }

  public reset(): void {
    this.nextContactId = 1;
    this.spawnTimer = 1.5;
    this.runnerRushCheckTimer = 18;
    this.runnerWaveTimer = 0;
    this.cacheAnnounced.clear();
    this.random = mulberry32(423771);
    this.state = this.createState();
  }

  public selectUnit(id: number, additive = false): void {
    for (const unit of this.state.units) {
      if (additive) {
        if (unit.id === id) unit.selected = !unit.selected;
      } else unit.selected = unit.id === id;
    }
  }

  public selectAll(): void {
    for (const unit of this.state.units) unit.selected = true;
  }

  public selectUnits(ids: number[], additive = false): void {
    const selectedIds = new Set(ids);
    for (const unit of this.state.units) {
      if (additive) {
        if (selectedIds.has(unit.id)) unit.selected = true;
      } else unit.selected = selectedIds.has(unit.id);
    }
  }

  public issueMove(requestedTarget: Vec2): void {
    if (this.state.missionStatus !== "active") return;
    const selected = this.state.units.filter((unit) => unit.selected && unit.state !== "down");
    if (!selected.length) return;
    const centroid = selected.reduce((sum, unit) => ({ x: sum.x + unit.pos.x, y: sum.y + unit.pos.y }), { x: 0, y: 0 });
    centroid.x /= selected.length;
    centroid.y /= selected.length;
    const target = nearestWalkable(this.state.map, requestedTarget);
    const length = Math.max(0.001, distance(centroid, target));
    const forward = { x: (target.x - centroid.x) / length, y: (target.y - centroid.y) / length };
    const right = { x: -forward.y, y: forward.x };
    const columns = Math.ceil(Math.sqrt(selected.length));
    const rows = Math.ceil(selected.length / columns);
    const formationSpeed = Math.min(...selected.map((unit) => unit.speed));
    selected.forEach((unit, index) => {
      const row = Math.floor(index / columns);
      const membersInRow = Math.min(columns, selected.length - row * columns);
      const lateral = (index % columns) - (membersInRow - 1) / 2;
      const depth = row - (rows - 1) / 2;
      const slot = nearestWalkable(this.state.map, {
        x: target.x + right.x * lateral * 1.2 - forward.x * depth * 1.05,
        y: target.y + right.y * lateral * 1.2 - forward.y * depth * 1.05,
      });
      unit.target = slot;
      unit.path = findPath(this.state.map, unit.pos, slot);
      unit.state = unit.path.length ? "moving" : "holding";
      unit.interaction = null;
      unit.moveSpeed = selected.length > 1 ? formationSpeed : unit.speed;
      unit.reloadTimer = 0;
    });
    this.pushEvent("COMMAND", `${selected.length > 1 ? "Squad" : selected[0].name} retasked to waypoint.`, "normal");
  }

  public issueScavenge(cacheId: string): Unit | null {
    const cache = this.state.caches.find((candidate) => candidate.id === cacheId);
    if (this.state.missionStatus !== "active" || !this.state.breachOpen || !cache || cache.secured) return null;
    const selected = this.state.units.filter((unit) => unit.selected && unit.state !== "down");
    if (!selected.length) return null;
    const operator = [...selected].sort((a, b) => b.scavengeSkill - a.scavengeSkill || a.id - b.id)[0];
    const cacheTarget = nearestWalkable(this.state.map, cache.pos);
    operator.target = cacheTarget;
    operator.path = findPath(this.state.map, operator.pos, cacheTarget);
    operator.state = operator.path.length ? "moving" : "collecting";
    operator.interaction = cache.id;
    operator.moveSpeed = operator.speed;
    operator.reloadTimer = 0;

    const defenders = selected.filter((unit) => unit !== operator);
    defenders.forEach((unit, index) => {
      const angle = -Math.PI * 0.7 + (index / Math.max(1, defenders.length - 1)) * Math.PI * 1.4;
      const defendTarget = nearestWalkable(this.state.map, {
        x: cache.pos.x + Math.cos(angle) * 2.7,
        y: cache.pos.y + Math.sin(angle) * 2.7,
      });
      unit.target = defendTarget;
      unit.path = findPath(this.state.map, unit.pos, defendTarget);
      unit.state = unit.path.length ? "moving" : "holding";
      unit.interaction = null;
      unit.moveSpeed = Math.min(...selected.map((member) => member.speed));
      unit.reloadTimer = 0;
    });
    this.pushEvent("COMMAND", `${operator.name} assigned to scavenge; ${defenders.length || "no"} defender${defenders.length === 1 ? "" : "s"} covering.`, "good");
    return operator;
  }

  public issueBreach(): boolean {
    if (this.state.missionStatus !== "active" || this.state.breachOpen) return false;
    const operator = this.state.units.find((unit) => unit.selected && unit.state !== "down" && distance(unit.pos, this.state.map.breach.pos) <= 5.2);
    if (!operator) return false;
    this.state.breachOpen = true;
    this.state.map.breach.open = true;
    const doorWall = this.state.map.walls.find((wall) => wall.door);
    if (doorWall) doorWall.locked = false;
    this.state.breachSequence += 1;
    this.pushEvent(operator.name, "Entry breach open. Interior approach authorised.", "good");
    return true;
  }

  public issueHold(): void {
    if (this.state.missionStatus !== "active") return;
    const selected = this.state.units.filter((unit) => unit.selected);
    for (const unit of selected) {
      unit.path = [];
      unit.target = { ...unit.pos };
      unit.state = "holding";
      unit.interaction = null;
      unit.moveSpeed = unit.speed;
    }
    if (selected.length) this.pushEvent("COMMAND", `${selected.length > 1 ? "Squad" : selected[0].name} holding position.`, "normal");
  }

  public issueReload(): void {
    if (this.state.missionStatus !== "active") return;
    const selected = this.state.units.filter((unit) => unit.selected && unit.state !== "down" && unit.ammo < unit.maxAmmo);
    for (const unit of selected) this.startReload(unit);
    if (selected.length) {
      this.pushEvent("SQUAD", `${selected.length > 1 ? "Selected survivors are" : `${selected[0].name} is`} reloading in place.`, "warning");
    }
  }

  private pushEvent(who: string, message: string, tone: EventEntry["tone"]): void {
    this.state.events.unshift({ time: this.state.elapsed, who, message, tone });
    this.state.events.length = Math.min(this.state.events.length, 8);
  }

  public update(dt: number): void {
    const state = this.state;
    state.scanAngle = (state.scanAngle + dt * 0.22) % (Math.PI * 2);
    state.signalPulse += dt;
    if (state.paused || state.missionStatus !== "active") return;
    state.elapsed += dt;

    this.updateUnits(dt);
    this.updateContacts(dt);
    this.updateCaches(dt);
    this.updateRunnerRush(dt);

    if (state.breachOpen) this.spawnTimer -= dt;
    const living = state.contacts.filter((contact) => contact.alive).length;
    const livingWalkers = state.contacts.filter((contact) => contact.alive && contact.kind === "walker").length;
    const contactLimit = 16 + Math.round(state.threat * 18);
    if (state.breachOpen && this.spawnTimer <= 0 && livingWalkers < contactLimit) {
      const newcomer = this.makeContact(Math.floor(this.random() * state.map.contactSpawns.length), state.map, state.units, true);
      if (newcomer) {
        state.contacts.push(newcomer);
        const lowPressure = 1 - state.threat;
        this.spawnTimer = 1.6 + lowPressure * 3.8 + this.random() * (0.7 + lowPressure * 1.1);
        if (this.random() > 0.58) this.pushEvent("SENSOR", "New contact crossing an external wall entry.", "warning");
      } else this.spawnTimer = 1;
    }
    state.contacts = state.contacts.filter((contact) => contact.alive || contact.hitFlash > 0);
    state.threat = clamp(this.setup.threat * 0.55 + living / 40 + state.elapsed / 520, 0, 1);
    if (state.units.every((unit) => unit.state === "down")) {
      state.missionStatus = "failure";
      state.paused = true;
      this.pushEvent("SYSTEM", "All squad telemetry is down. Operation failed.", "warning");
    }
  }

  public updateBenchmark(dt: number): void {
    const state = this.state;
    state.scanAngle = (state.scanAngle + dt * 0.22) % (Math.PI * 2);
    state.signalPulse += dt;
    if (state.paused) return;
    state.elapsed += dt;
    for (const unit of state.units) {
      unit.phase += dt * (unit.state === "moving" ? unit.speed * 4.8 : 1.2);
      unit.shotFlash = Math.max(0, unit.shotFlash - dt * 8);
    }
  }

  public canExtract(): boolean {
    if (!this.state.caches.some((cache) => cache.secured) || this.state.missionStatus !== "active") return false;
    const active = this.state.units.filter((unit) => unit.state !== "down");
    return active.length > 0 && active.every((unit) => distance(unit.pos, this.state.map.extraction) <= 3.2);
  }

  public extract(): TacticalOutcome {
    if (!this.canExtract()) throw new Error("Move every standing survivor into the extraction zone first.");
    this.state.missionStatus = "success";
    this.state.paused = true;
    this.pushEvent("SYSTEM", "Extraction confirmed. Ghostlink handoff complete.", "good");
    return this.outcome();
  }

  public outcome(): TacticalOutcome {
    const down = this.state.units.filter((unit) => unit.state === "down");
    const standing = this.state.units.filter((unit) => unit.state !== "down");
    return {
      success: this.state.missionStatus === "success",
      objectiveCompleted: this.state.caches.every((cache) => cache.secured),
      extractedPersonIds: this.state.missionStatus === "success" ? standing.map((unit) => unit.personId) : [],
      downPersonIds: down.map((unit) => unit.personId),
      healthByPersonId: Object.fromEntries(this.state.units.map((unit) => [unit.personId, Math.round(unit.health)])),
      loadedRounds: this.state.units.reduce((sum, unit) => sum + unit.ammo, 0),
      contactsNeutralised: this.state.contactsNeutralised,
      cachesRecovered: this.state.caches.filter((cache) => cache.secured).length,
      cacheCount: this.state.caches.length,
    };
  }

  private updateUnits(dt: number): void {
    const { units, contacts } = this.state;
    for (const unit of units) {
      unit.prev = { ...unit.pos };
      unit.shotFlash = Math.max(0, unit.shotFlash - dt * 8);
      unit.shotCooldown -= dt;
      if (unit.state === "down") continue;

      if (unit.state === "reloading") {
        unit.reloadTimer -= dt;
        if (unit.reloadTimer <= 0) {
          unit.ammo = unit.maxAmmo;
          unit.state = "holding";
        }
        continue;
      }

      if (unit.path.length) {
        const waypoint = unit.path[0];
        unit.facing = angleTo(unit.pos, waypoint);
        unit.pos = moveTowards(unit.pos, waypoint, unit.moveSpeed * dt);
        unit.phase += dt * unit.moveSpeed * 4.8;
        unit.state = "moving";
        if (distance(unit.pos, waypoint) < 0.06) unit.path.shift();
      } else if (unit.interaction) {
        const cache = this.state.caches.find((candidate) => candidate.id === unit.interaction);
        if (cache && !cache.secured && distance(unit.pos, cache.pos) < 2.1) {
          unit.state = "collecting";
          unit.facing = angleTo(unit.pos, cache.pos);
        } else if (unit.state === "moving") unit.state = "holding";
      } else if (unit.state === "moving") unit.state = "holding";

      if (unit.state === "holding" && unit.shotCooldown <= 0 && unit.ammo > 0) {
        const range = unit.attackRange;
        let closest: Contact | undefined;
        let closestDistance = range;
        for (const contact of contacts) {
          if (!contact.alive || !hasLineOfSight(this.state.map, unit.pos, contact.pos)) continue;
          const candidateDistance = distance(unit.pos, contact.pos);
          if (candidateDistance < closestDistance) {
            closest = contact;
            closestDistance = candidateDistance;
          }
        }
        if (closest) {
          unit.facing = angleTo(unit.pos, closest.pos);
          unit.shotFlash = 1;
          this.state.shotSequence += 1;
          unit.ammo -= 1;
          unit.shotCooldown = unit.weapon === "shotgun" ? 1.25 : unit.weapon === "rifle" ? 0.72 : 0.42;
          closest.health -= unit.weapon === "shotgun" && closestDistance < 3.8 ? 2 : 1;
          closest.hitFlash = 1;
          if (closest.health <= 0) {
            closest.alive = false;
            this.state.contactsNeutralised += 1;
            this.state.killSequence += 1;
          }
        }
      }

      if (unit.state === "holding" && unit.ammo === 0) this.startReload(unit);

      const nearestContact = contacts.reduce<Contact | null>((nearest, contact) => {
        if (!contact.alive) return nearest;
        if (!nearest || distance(unit.pos, contact.pos) < distance(unit.pos, nearest.pos)) return contact;
        return nearest;
      }, null);
      const proximity = nearestContact ? clamp(1 - distance(unit.pos, nearestContact.pos) / 8, 0, 1) : 0;
      unit.stress = clamp(unit.stress + proximity * dt * 4 - dt * 0.3, 0, 100);
    }
  }

  private updateContacts(dt: number): void {
    const { contacts, units, map } = this.state;
    if (!this.state.breachOpen) return;
    const standingUnits = units.filter((unit) => unit.state !== "down");
    if (!standingUnits.length) return;
    for (const contact of contacts) {
      contact.hitFlash = Math.max(0, contact.hitFlash - dt * 3.5);
      if (!contact.alive) continue;
      contact.prev = { ...contact.pos };
      contact.repath -= dt;
      contact.attackCooldown -= dt;
      const target = standingUnits.reduce((closest, unit) =>
        distance(contact.pos, unit.pos) < distance(contact.pos, closest.pos) ? unit : closest,
      standingUnits[0]);
      contact.target = target.id;
      if (contact.repath <= 0 || !contact.path.length) {
        contact.path = findPath(map, contact.pos, target.pos);
        contact.repath = 0.75 + this.random() * 0.65;
      }
      const waypoint = contact.path[0];
      if (waypoint) {
        contact.facing = angleTo(contact.pos, waypoint);
        const stagger = 0.72 + Math.sin(contact.phase + this.state.elapsed * 4.3) * 0.17;
        contact.pos = moveTowards(contact.pos, waypoint, contact.speed * stagger * dt);
        contact.phase += dt * contact.speed * 5;
        if (distance(contact.pos, waypoint) < 0.08) contact.path.shift();
      }
      if (distance(contact.pos, target.pos) < 0.72 && contact.attackCooldown <= 0) {
        target.health = clamp(target.health - 4 - this.random() * 3, 0, 100);
        target.stress = clamp(target.stress + 12, 0, 100);
        this.state.hitSequence += 1;
        contact.attackCooldown = 1.15;
        if (target.health <= 0 && target.state !== "down") {
          target.state = "down";
          target.path = [];
          target.interaction = null;
          this.pushEvent(target.name, "Unit down. Signal remains active.", "warning");
        }
      }
    }
  }

  private updateCaches(dt: number): void {
    for (const cache of this.state.caches) {
      if (cache.secured) continue;
      const collector = this.state.units.find((unit) =>
        unit.state === "collecting"
        && unit.interaction === cache.id
        && distance(unit.pos, cache.pos) < 2.1,
      );
      if (collector) cache.progress = clamp(cache.progress + dt * (0.065 + collector.scavengeSkill * 0.00055), 0, 1);
      if (cache.progress >= 1) {
        cache.secured = true;
        this.state.cacheSequence += 1;
        for (const unit of this.state.units) {
          if (unit.interaction !== cache.id) continue;
          if (unit.state === "collecting") unit.state = "holding";
          unit.interaction = null;
        }
        const recovered = this.state.caches.filter((candidate) => candidate.secured).length;
        this.pushEvent("SQUAD", `Cache ${recovered} of ${this.state.caches.length} secured. Extract now or continue.`, "good");
        if (this.setup.guidedDemo && recovered === 1 && this.state.runnerRushesTriggered === 0) this.beginRunnerRush();
      } else if (cache.progress > 0.45 && !this.cacheAnnounced.has(cache.id)) {
        this.cacheAnnounced.add(cache.id);
        this.pushEvent(collector?.name ?? "SQUAD", "Cache transfer at fifty percent.", "good");
      }
    }
  }

  private beginRunnerRush(): void {
    if (this.state.runnerRushStatus !== "idle" || this.state.runnerRushesTriggered >= maximumRunnerRushes) return;
    this.state.runnerRushStatus = "warning";
    this.state.runnerRushWarning = runnerRushWarningDuration;
    this.state.runnerRushRemaining = 0;
    this.state.runnerRushSequence += 1;
    this.state.runnerRushesTriggered += 1;
    this.pushEvent("SENSOR", "RUNNER RUSH INCOMING. Brace and hold.", "warning");
  }

  private spawnRunnerWave(opening: boolean): number {
    const state = this.state;
    const waveSize = this.setup.guidedDemo
      ? opening ? 10 : 4
      : opening ? 8 + Math.floor(this.random() * 4) : 3 + Math.floor(this.random() * 3);
    let spawned = 0;
    for (let index = 0; index < waveSize; index += 1) {
      const runner = this.makeContact(index + state.contacts.length, state.map, state.units, true, "runner");
      if (!runner) continue;
      state.contacts.push(runner);
      spawned += 1;
    }
    return spawned;
  }

  private updateRunnerRush(dt: number): void {
    const state = this.state;
    if (!state.breachOpen) return;
    if (state.runnerRushStatus === "warning") {
      state.runnerRushWarning = Math.max(0, state.runnerRushWarning - dt);
      if (state.runnerRushWarning > 0) return;
      const spawned = this.spawnRunnerWave(true);
      state.runnerRushStatus = spawned ? "active" : "idle";
      state.runnerRushRemaining = spawned ? runnerRushDuration : 0;
      this.runnerWaveTimer = 3 + this.random() * 2;
      this.runnerRushCheckTimer = 30 + this.random() * 20;
      this.pushEvent("SENSOR", spawned ? `${spawned} runners entering at speed. Fresh contacts expected for fifteen seconds.` : "Runner approach lost beyond sensor range.", "warning");
      return;
    }
    if (state.runnerRushStatus === "active") {
      state.runnerRushRemaining = Math.max(0, state.runnerRushRemaining - dt);
      if (state.runnerRushRemaining > 0) {
        this.runnerWaveTimer -= dt;
        if (this.runnerWaveTimer <= 0) {
          const spawned = this.spawnRunnerWave(false);
          this.runnerWaveTimer = spawned ? 3 + this.random() * 2 : 1;
          if (spawned) this.pushEvent("SENSOR", `${spawned} fresh runners crossing the perimeter.`, "warning");
        }
        return;
      }
      if (state.contacts.some((contact) => contact.alive && contact.kind === "runner")) return;
      state.runnerRushStatus = "idle";
      state.runnerRushRemaining = 0;
      this.pushEvent("SENSOR", "Runner rush broken. Normal contact pattern resuming.", "good");
      return;
    }
    if (this.setup.guidedDemo || state.runnerRushesTriggered >= maximumRunnerRushes || state.elapsed < 28) return;
    this.runnerRushCheckTimer -= dt;
    if (this.runnerRushCheckTimer > 0) return;
    const rushChance = 0.22 + state.threat * 0.38;
    if (this.random() < rushChance) this.beginRunnerRush();
    else this.runnerRushCheckTimer = 15 + this.random() * 16;
  }

  private startReload(unit: Unit): void {
    unit.path = [];
    unit.target = { ...unit.pos };
    unit.state = "reloading";
    unit.interaction = null;
    unit.moveSpeed = unit.speed;
    unit.reloadTimer = unit.reloadDuration;
  }
}
