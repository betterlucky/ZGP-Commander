import { angleTo, clamp, distance, moveTowards, mulberry32 } from "./math";
import { createFacilityMap, findPath, nearestWalkable } from "./map";
import type { Contact, EventEntry, SimulationState, Unit, Vec2 } from "./types";

const unitTemplates: Omit<Unit, "path" | "prev" | "target" | "pos">[] = [
  { id: 1, name: "MAYA", role: "MEDIC", color: "#66e9ff", facing: 0, speed: 2.45, health: 94, ammo: 28, maxAmmo: 36, stress: 18, phase: 0.2, selected: true, state: "moving", weapon: "smg", shotFlash: 0, shotCooldown: 0 },
  { id: 2, name: "HOLT", role: "SCAVENGER", color: "#8bdcff", facing: 0, speed: 2.15, health: 82, ammo: 7, maxAmmo: 12, stress: 28, phase: 1.7, selected: false, state: "moving", weapon: "shotgun", shotFlash: 0, shotCooldown: 0.4 },
  { id: 3, name: "REYES", role: "RANGER", color: "#55d5ff", facing: 0, speed: 2.35, health: 88, ammo: 24, maxAmmo: 30, stress: 42, phase: 3.1, selected: false, state: "holding", weapon: "rifle", shotFlash: 0, shotCooldown: 0.2 },
  { id: 4, name: "FINCH", role: "ENGINEER", color: "#9eeaff", facing: 0, speed: 2.25, health: 76, ammo: 31, maxAmmo: 40, stress: 37, phase: 4.8, selected: false, state: "holding", weapon: "carbine", shotFlash: 0, shotCooldown: 0.65 },
];

const starts: Vec2[] = [
  { x: 13.2, y: 6.2 },
  { x: 12.7, y: 7.4 },
  { x: 33.8, y: 15.6 },
  { x: 34.8, y: 19.8 },
];

const initialTargets: Vec2[] = [
  { x: 9.4, y: 6.5 },
  { x: 10.6, y: 7.4 },
  { x: 34.3, y: 11.8 },
  { x: 34.6, y: 18.6 },
];

const contactSpawns: Vec2[] = [
  { x: 48.5, y: 4.5 }, { x: 46.5, y: 6.5 }, { x: 49.2, y: 8.4 },
  { x: 48.2, y: 15.5 }, { x: 45.4, y: 18.8 }, { x: 48.3, y: 23.4 },
  { x: 42.4, y: 24.2 }, { x: 36.1, y: 8.4 },
];

export class Simulation {
  public state: SimulationState;
  private nextContactId = 1;
  private spawnTimer = 1.5;
  private random = mulberry32(423771);
  private cacheAnnounced = false;

  constructor() {
    this.state = this.createState();
  }

  private createState(): SimulationState {
    const map = createFacilityMap();
    const units = unitTemplates.map((template, index): Unit => {
      const pos = { ...starts[index] };
      const target = { ...initialTargets[index] };
      return { ...template, pos, prev: { ...pos }, target, path: findPath(map, pos, target) };
    });
    const events: EventEntry[] = [
      { time: 0, who: "SYSTEM", message: "Sensor link established. Facility map resolving.", tone: "normal" },
      { time: 0.7, who: "MAYA", message: "Medical cache located in pharmacy.", tone: "good" },
      { time: 1.2, who: "REYES", message: "Movement east. Taking the corridor.", tone: "warning" },
    ];
    const state: SimulationState = {
      paused: false,
      elapsed: 0,
      threat: 0.52,
      cacheProgress: 0,
      cacheSecured: false,
      scanAngle: 0,
      signalPulse: 0,
      units,
      contacts: [],
      map,
      events,
    };
    for (let i = 0; i < 15; i += 1) state.contacts.push(this.makeContact(i));
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

  public issueMove(requestedTarget: Vec2): void {
    const selected = this.state.units.filter((unit) => unit.selected && unit.state !== "down");
    if (!selected.length) return;
    const columns = Math.ceil(Math.sqrt(selected.length));
    selected.forEach((unit, index) => {
      const offset = {
        x: ((index % columns) - (columns - 1) / 2) * 0.85,
        y: (Math.floor(index / columns) - 0.35) * 0.85,
      };
      const target = nearestWalkable(this.state.map, { x: requestedTarget.x + offset.x, y: requestedTarget.y + offset.y });
      unit.target = target;
      unit.path = findPath(this.state.map, unit.pos, target);
      unit.state = "moving";
    });
    this.pushEvent("COMMAND", `${selected.length > 1 ? "Squad" : selected[0].name} retasked to waypoint.`, "normal");
  }

  public issueHold(): void {
    const selected = this.state.units.filter((unit) => unit.selected);
    for (const unit of selected) {
      unit.path = [];
      unit.target = { ...unit.pos };
      unit.state = "holding";
    }
    if (selected.length) this.pushEvent("COMMAND", `${selected.length > 1 ? "Squad" : selected[0].name} holding position.`, "normal");
  }

  private pushEvent(who: string, message: string, tone: EventEntry["tone"]): void {
    this.state.events.unshift({ time: this.state.elapsed, who, message, tone });
    this.state.events.length = Math.min(this.state.events.length, 8);
  }

  public update(dt: number): void {
    const state = this.state;
    state.scanAngle = (state.scanAngle + dt * 0.22) % (Math.PI * 2);
    state.signalPulse += dt;
    if (state.paused) return;
    state.elapsed += dt;

    this.updateUnits(dt);
    this.updateContacts(dt);
    this.updateCache(dt);

    this.spawnTimer -= dt;
    const living = state.contacts.filter((contact) => contact.alive).length;
    if (this.spawnTimer <= 0 && living < 25) {
      const newcomer = this.makeContact(Math.floor(this.random() * contactSpawns.length));
      state.contacts.push(newcomer);
      this.spawnTimer = 2.4 + this.random() * 3.2;
      if (this.random() > 0.58) this.pushEvent("SENSOR", "New contact entering the east sector.", "warning");
    }
    state.contacts = state.contacts.filter((contact) => contact.alive || contact.hitFlash > 0);
    state.threat = clamp(0.26 + living / 34 + state.elapsed / 420, 0, 1);
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

  private updateUnits(dt: number): void {
    const { units, contacts } = this.state;
    for (const unit of units) {
      unit.prev = { ...unit.pos };
      unit.shotFlash = Math.max(0, unit.shotFlash - dt * 8);
      unit.shotCooldown -= dt;
      if (unit.state === "down") continue;

      if (unit.path.length) {
        const waypoint = unit.path[0];
        unit.facing = angleTo(unit.pos, waypoint);
        unit.pos = moveTowards(unit.pos, waypoint, unit.speed * dt);
        unit.phase += dt * unit.speed * 4.8;
        unit.state = "moving";
        if (distance(unit.pos, waypoint) < 0.06) unit.path.shift();
      } else if (distance(unit.pos, this.state.map.cache) < 2.1 && !this.state.cacheSecured) {
        unit.state = "collecting";
        unit.facing = angleTo(unit.pos, this.state.map.cache);
      } else if (unit.state === "moving") unit.state = "holding";

      if (unit.state !== "collecting" && unit.shotCooldown <= 0 && unit.ammo > 0) {
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
          if (closest.health <= 0) closest.alive = false;
        }
      }

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
          this.pushEvent(target.name, "Unit down. Signal remains active.", "warning");
        }
      }
    }
  }

  private updateCache(dt: number): void {
    if (this.state.cacheSecured) return;
    const collectors = this.state.units.filter((unit) => unit.state === "collecting").length;
    if (collectors > 0) this.state.cacheProgress = clamp(this.state.cacheProgress + dt * (0.028 + collectors * 0.017), 0, 1);
    if (this.state.cacheProgress >= 1) {
      this.state.cacheSecured = true;
      for (const unit of this.state.units) if (unit.state === "collecting") unit.state = "holding";
      this.pushEvent("MAYA", "Medical cache secured. Ready to extract.", "good");
    } else if (this.state.cacheProgress > 0.45 && !this.cacheAnnounced) {
      this.cacheAnnounced = true;
      this.pushEvent("HOLT", "Cache transfer at fifty percent.", "good");
    }
  }
}
