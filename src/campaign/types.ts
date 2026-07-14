export type CampaignStatus = "active" | "transferred" | "mia" | "dead";
export type Affiliation = "outpost" | "independent" | `faction:${string}` | "unknown";
export type SurvivorTier = "vanguard" | "line" | "reserve";
export type SurvivorRole = "MEDIC" | "SCAVENGER" | "RANGER" | "ENGINEER";
export type WeaponId = "rifle" | "shotgun" | "smg" | "carbine";
export type InjurySeverity = "minor" | "major";
export type BaseAssignment = "general" | "workshop" | "logistics" | "medical" | "training" | "recovery";

export interface InjuryRecord {
  id: string;
  name: string;
  severity: InjurySeverity;
  acquiredDay: number;
  recoveryDays: number;
  stat: "health" | "speed" | "accuracy";
  modifier: number;
}

export interface CareerRecord {
  missions: number;
  kills: number;
  rescues: number;
  lethalOperations: number;
  returns: number;
}

export interface PersonRecord {
  id: string;
  name: string;
  callsign: string;
  role: SurvivorRole;
  tier: SurvivorTier;
  color: string;
  campaignStatus: CampaignStatus;
  affiliation: Affiliation;
  injuries: InjuryRecord[];
  assignment: BaseAssignment;
  weapon: WeaponId;
  miaExpiresAfterDay: number | null;
  career: CareerRecord;
  history: string[];
}

export interface CampaignResources {
  ammunition: number;
  medical: number;
  materials: number;
  comforts: number;
}

export type MissionKind = "routine" | "faction" | "defence" | "rescue";
export type MissionRisk = "RECOVERABLE" | "DANGEROUS" | "LETHAL";

export interface MissionReward {
  ammunition: number;
  medical: number;
  materials: number;
  comforts: number;
}

export interface MissionOffer {
  id: string;
  kind: MissionKind;
  title: string;
  location: string;
  brief: string;
  objective: string;
  risk: MissionRisk;
  permadeath: boolean;
  createdDay: number;
  expiresAfterDay: number;
  ammoCostPerSurvivor: number;
  protocolSquad: number;
  threat: number;
  reward: MissionReward;
  subjectIds: string[];
}

export type OperationStatus = "deployed" | "resolved";

export interface OperationRecord {
  id: string;
  offer: MissionOffer;
  personIds: string[];
  status: OperationStatus;
  ammoCommitted: number;
  launchedDay: number;
  result: MissionOutcome | null;
}

export interface MissionOutcome {
  success: boolean;
  objectiveCompleted: boolean;
  extractedPersonIds: string[];
  downPersonIds: string[];
  healthByPersonId: Record<string, number>;
  ammunitionRemaining: number;
  contactsNeutralised: number;
  cachesRecovered: number;
  cacheCount: number;
}

export interface CampaignEvent {
  id: string;
  day: number;
  tone: "normal" | "good" | "warning";
  message: string;
}

export interface CampaignState {
  schemaVersion: 1;
  day: number;
  supportCapacity: number;
  supportUpgrades: number;
  people: PersonRecord[];
  resources: CampaignResources;
  missionOffers: MissionOffer[];
  operations: OperationRecord[];
  actedPersonIds: string[];
  transit: CampaignResources;
  events: CampaignEvent[];
  nextSequence: number;
}

export interface Deployment {
  operationId: string;
  offer: MissionOffer;
  people: PersonRecord[];
}

export interface EndDayReport {
  completedDay: number;
  produced: CampaignResources;
  received: CampaignResources;
  recoveredPeople: string[];
  expiredMia: string[];
  newDay: number;
}
