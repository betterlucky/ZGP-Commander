export interface Vec2 {
  x: number;
  y: number;
}

export type UnitState = "moving" | "holding" | "collecting" | "reloading" | "down";
export type Role = "MEDIC" | "SCAVENGER" | "RANGER" | "ENGINEER";

export interface Unit {
  id: number;
  personId: string;
  name: string;
  role: Role;
  color: string;
  pos: Vec2;
  prev: Vec2;
  target: Vec2;
  path: Vec2[];
  facing: number;
  speed: number;
  moveSpeed: number;
  scavengeSkill: number;
  health: number;
  ammo: number;
  maxAmmo: number;
  reserveAmmo: number;
  reloadTimer: number;
  stress: number;
  phase: number;
  selected: boolean;
  state: UnitState;
  interaction: "cache" | null;
  weapon: "rifle" | "shotgun" | "smg" | "carbine";
  shotFlash: number;
  shotCooldown: number;
}

export interface Contact {
  id: number;
  pos: Vec2;
  prev: Vec2;
  target: number;
  path: Vec2[];
  repath: number;
  facing: number;
  speed: number;
  phase: number;
  heat: number;
  confidence: number;
  health: number;
  alive: boolean;
  hitFlash: number;
  attackCooldown: number;
}

export interface Room {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  explored: boolean;
}

export interface WallSegment {
  a: Vec2;
  b: Vec2;
  door?: boolean;
  locked?: boolean;
}

export interface Prop {
  kind: "desk" | "bed" | "shelf" | "chair" | "crate" | "terminal";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface FacilityMap {
  width: number;
  height: number;
  rooms: Room[];
  walls: WallSegment[];
  props: Prop[];
  cache: Vec2;
  extraction: Vec2;
  walkable: Set<string>;
}

export interface EventEntry {
  time: number;
  who: string;
  message: string;
  tone: "normal" | "warning" | "good";
}

export interface SimulationState {
  paused: boolean;
  elapsed: number;
  threat: number;
  cacheProgress: number;
  cacheSecured: boolean;
  scanAngle: number;
  signalPulse: number;
  missionTitle: string;
  objectiveLabel: string;
  riskLabel: string;
  missionStatus: "active" | "success" | "failure";
  contactsNeutralised: number;
  units: Unit[];
  contacts: Contact[];
  map: FacilityMap;
  events: EventEntry[];
}

export interface TacticalUnitSetup {
  personId: string;
  name: string;
  role: Role;
  color: string;
  weapon: Unit["weapon"];
  health: number;
  scavengeSkill: number;
}

export interface TacticalSetup {
  missionTitle: string;
  objectiveLabel: string;
  riskLabel: string;
  threat: number;
  units: TacticalUnitSetup[];
}

export interface TacticalOutcome {
  success: boolean;
  objectiveCompleted: boolean;
  extractedPersonIds: string[];
  downPersonIds: string[];
  healthByPersonId: Record<string, number>;
  ammunitionRemaining: number;
  contactsNeutralised: number;
}

export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}
