import { angleTo, clamp, distance, moveTowards, mulberry32 } from "./math";
import { createFacilityMap, findPath, nearestWalkable } from "./map";
import type { Contact, EventEntry, SimulationState, TacticalOutcome, TacticalSetup, TacticalUnitSetup, Unit, Vec2 } from "./types";

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
const weaponReserve: Record<Unit["weapon"], number> = { rifle: 48, shotgun: 24, smg: 60, carbine: 48 };
const weaponReloadTime: Record<Unit["weapon"], number> = { rifle: 2.4, shotgun: 3.2, smg: 2.1, carbine: 2.3 };
const roleSpeed: Record<Unit["role"], number> = { MEDIC: 2.35, SCAVENGER: 2.2, RANGER: 2.4, ENGINEER: 2.25 };

const contactSpawns: Vec2[] = [
  { x: 56.5, y: 4.5 }, { x: 53.5, y: 7.5 }, { x: 56.2, y: 12.4 },
  { x: 55.2, y: 19.5 }, { x: 51.4, y: 28.8 }, { x: 47.3, y: 34.4 },
  { x: 34.4, y: 4.2 }, { x: 20.1, y: 4.4 },
];

export class Simulation {
  public state: SimulationState;
  private readonly setup: TacticalSetup;
  private nextContactId = 1;
  private spawnTimer = 1.5;
  private random = mulberry32(423771);
  private cacheAnnounced = false;

  constructor(setup: TacticalSetup = defaultSetup) {
    this.setup = structuredClone(setup);
    this.state = this.createState();
  }

  private createState(): SimulationState {
    const map = createFacilityMap();
    const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(this.setup.units.length))));
    const units = this.setup.units.map((template, index): Unit => {
      const pos = {
        x: map.extraction.x + (index % columns) * 0.95,
        y: map.extraction.y - Math.floor(index / columns) * 0.95,
      };
      const target = { ...pos };
      const maxAmmo = weaponMagazine[template.weapon];
      return {
        ...template,
        id: index + 1,
        facing: -Math.PI / 2,
        speed: roleSpeed[template.role],
        moveSpeed: roleSpeed[template.role],
        ammo: maxAmmo,
        maxAmmo,
        reserveAmmo: weaponReserve[template.weapon],
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
      cacheProgress: 0,
      cacheSecured: false,
      scanAngle: 0,
      signalPulse: 0,
      missionTitle: this.setup.missionTitle,
      objectiveLabel: this.setup.objectiveLabel,
      riskLabel: this.setup.riskLabel,
      missionStatus: "active",
      contactsNeutralised: 0,
      units,
      contacts: [],
      map,
      events,
    };
    const initialContacts = 9 + Math.round(this.setup.threat * 10);
    for (let i = 0; i < initialContacts; i += 1) state.contacts.push(this.makeContact(i));
    return state;
  }

  private makeContact(index = 0): Contact {
    const spawn = contactSpawns[index % contactSpawns.length];
    const jitter = () => (this.random() - 0.5) * 1.4;
    const pos = nearestWalkable(this.state?.map ?? createFacilityMap(), { x: spawn.x + jitter(), y: spawn.y + jitter() });
    return {
      id: this.nextContactId++,
      pos,
      prev: { ...pos },
      target: 3,
      path: [],
      repath: this.random() * 0.8,
      facing: Math.PI,
      speed: 0.72 + this.random() * 0.52,
      phase: this.random() * Math.PI * 2,
      heat: 0.7 + this.random() * 0.3,
      confidence: 0.45 + this.random() * 0.55,
      health: this.random() > 0.82 ? 2 : 1,
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
    this.cacheAnnounced = false;
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

  public issueScavenge(): Unit | null {
    if (this.state.missionStatus !== "active" || this.state.cacheSecured) return null;
    const selected = this.state.units.filter((unit) => unit.selected && unit.state !== "down");
    if (!selected.length) return null;
    const operator = [...selected].sort((a, b) => b.scavengeSkill - a.scavengeSkill || a.id - b.id)[0];
    const cacheTarget = nearestWalkable(this.state.map, this.state.map.cache);
    operator.target = cacheTarget;
    operator.path = findPath(this.state.map, operator.pos, cacheTarget);
    operator.state = operator.path.length ? "moving" : "collecting";
    operator.interaction = "cache";
    operator.moveSpeed = operator.speed;
    operator.reloadTimer = 0;

    const defenders = selected.filter((unit) => unit !== operator);
    defenders.forEach((unit, index) => {
      const angle = -Math.PI * 0.7 + (index / Math.max(1, defenders.length - 1)) * Math.PI * 1.4;
      const defendTarget = nearestWalkable(this.state.map, {
        x: this.state.map.cache.x + Math.cos(angle) * 2.7,
        y: this.state.map.cache.y + Math.sin(angle) * 2.7,
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
    const selected = this.state.units.filter((unit) => unit.selected && unit.state !== "down" && unit.ammo < unit.maxAmmo && unit.reserveAmmo > 0);
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
    this.updateCache(dt);

    this.spawnTimer -= dt;
    const living = state.contacts.filter((contact) => contact.alive).length;
    const contactLimit = 16 + Math.round(this.setup.threat * 18);
    if (this.spawnTimer <= 0 && living < contactLimit) {
      const newcomer = this.makeContact(Math.floor(this.random() * contactSpawns.length));
      state.contacts.push(newcomer);
      this.spawnTimer = 2.1 + this.random() * (4.8 - this.setup.threat * 2.4);
      if (this.random() > 0.58) this.pushEvent("SENSOR", "New contact entering the east sector.", "warning");
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
    if (!this.state.cacheSecured || this.state.missionStatus !== "active") return false;
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
      objectiveCompleted: this.state.cacheSecured,
      extractedPersonIds: this.state.missionStatus === "success" ? standing.map((unit) => unit.personId) : [],
      downPersonIds: down.map((unit) => unit.personId),
      healthByPersonId: Object.fromEntries(this.state.units.map((unit) => [unit.personId, Math.round(unit.health)])),
      ammunitionRemaining: this.state.units.reduce((sum, unit) => sum + unit.ammo + unit.reserveAmmo, 0),
      contactsNeutralised: this.state.contactsNeutralised,
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
          const loaded = Math.min(unit.maxAmmo - unit.ammo, unit.reserveAmmo);
          unit.ammo += loaded;
          unit.reserveAmmo -= loaded;
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
      } else if (unit.interaction === "cache" && distance(unit.pos, this.state.map.cache) < 2.1 && !this.state.cacheSecured) {
        unit.state = "collecting";
        unit.facing = angleTo(unit.pos, this.state.map.cache);
      } else if (unit.state === "moving") unit.state = "holding";

      if (unit.state === "holding" && unit.shotCooldown <= 0 && unit.ammo > 0) {
        const range = unit.weapon === "rifle" ? 9 : unit.weapon === "shotgun" ? 5.8 : 7.2;
        let closest: Contact | undefined;
        let closestDistance = range;
        for (const contact of contacts) {
          if (!contact.alive) continue;
          const candidateDistance = distance(unit.pos, contact.pos);
          if (candidateDistance < closestDistance) {
            closest = contact;
            closestDistance = candidateDistance;
          }
        }
        if (closest) {
          unit.facing = angleTo(unit.pos, closest.pos);
          unit.shotFlash = 1;
          unit.ammo -= 1;
          unit.shotCooldown = unit.weapon === "shotgun" ? 1.25 : unit.weapon === "rifle" ? 0.72 : 0.42;
          closest.health -= unit.weapon === "shotgun" && closestDistance < 3.8 ? 2 : 1;
          closest.hitFlash = 1;
          if (closest.health <= 0) {
            closest.alive = false;
            this.state.contactsNeutralised += 1;
          }
        }
      }

      if (unit.state === "holding" && unit.ammo === 0 && unit.reserveAmmo > 0) this.startReload(unit);

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
    for (const contact of contacts) {
      contact.hitFlash = Math.max(0, contact.hitFlash - dt * 3.5);
      if (!contact.alive) continue;
      contact.prev = { ...contact.pos };
      contact.repath -= dt;
      contact.attackCooldown -= dt;
      const target = units.reduce((closest, unit) =>
        distance(contact.pos, unit.pos) < distance(contact.pos, closest.pos) ? unit : closest,
      units[0]);
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

  private updateCache(dt: number): void {
    if (this.state.cacheSecured) return;
    const collector = this.state.units.find((unit) =>
      unit.state === "collecting"
      && unit.interaction === "cache"
      && distance(unit.pos, this.state.map.cache) < 2.1,
    );
    if (collector) this.state.cacheProgress = clamp(this.state.cacheProgress + dt * (0.026 + collector.scavengeSkill * 0.00042), 0, 1);
    if (this.state.cacheProgress >= 1) {
      this.state.cacheSecured = true;
      for (const unit of this.state.units) {
        if (unit.state === "collecting") unit.state = "holding";
        if (unit.interaction === "cache") unit.interaction = null;
      }
      this.pushEvent("SQUAD", "Objective secured. Return to extraction.", "good");
    } else if (this.state.cacheProgress > 0.45 && !this.cacheAnnounced) {
      this.cacheAnnounced = true;
      this.pushEvent(collector?.name ?? "SQUAD", "Cache transfer at fifty percent.", "good");
    }
  }

  private startReload(unit: Unit): void {
    unit.path = [];
    unit.target = { ...unit.pos };
    unit.state = "reloading";
    unit.interaction = null;
    unit.moveSpeed = unit.speed;
    unit.reloadTimer = weaponReloadTime[unit.weapon];
  }
}
