import type { BaseAssignment, MissionOffer, PersonRecord, SurvivorRole, SurvivorTier, WeaponId } from "./types";

interface PersonSeed {
  name: string;
  callsign: string;
  role: SurvivorRole;
  tier: SurvivorTier;
  weapon: WeaponId;
  assignment: BaseAssignment;
  color: string;
}

const people: PersonSeed[] = [
  { name: "Maya Chen", callsign: "MAYA", role: "MEDIC", tier: "vanguard", weapon: "smg", assignment: "medical", color: "#6fe8ff" },
  { name: "Elias Holt", callsign: "HOLT", role: "SCAVENGER", tier: "vanguard", weapon: "shotgun", assignment: "general", color: "#8bdcff" },
  { name: "Ana Reyes", callsign: "REYES", role: "RANGER", tier: "vanguard", weapon: "rifle", assignment: "training", color: "#55d5ff" },
  { name: "Noah Finch", callsign: "FINCH", role: "ENGINEER", tier: "vanguard", weapon: "carbine", assignment: "workshop", color: "#9eeaff" },
  { name: "Imani Brooks", callsign: "BROOKS", role: "RANGER", tier: "line", weapon: "carbine", assignment: "training", color: "#74cadf" },
  { name: "Tomas Varga", callsign: "VARGA", role: "SCAVENGER", tier: "line", weapon: "shotgun", assignment: "logistics", color: "#79d8e7" },
  { name: "Leah Morgan", callsign: "MORGAN", role: "ENGINEER", tier: "line", weapon: "rifle", assignment: "workshop", color: "#84c9dc" },
  { name: "Samir Patel", callsign: "PATEL", role: "MEDIC", tier: "line", weapon: "smg", assignment: "medical", color: "#72d9e9" },
  { name: "June Okafor", callsign: "OKAFOR", role: "RANGER", tier: "reserve", weapon: "carbine", assignment: "general", color: "#769eaa" },
  { name: "Cal Ward", callsign: "WARD", role: "SCAVENGER", tier: "reserve", weapon: "shotgun", assignment: "logistics", color: "#7fa5ad" },
  { name: "Priya Shaw", callsign: "SHAW", role: "MEDIC", tier: "reserve", weapon: "smg", assignment: "training", color: "#759da8" },
  { name: "Micah Cole", callsign: "COLE", role: "ENGINEER", tier: "reserve", weapon: "carbine", assignment: "general", color: "#7899a2" },
];

export const createInitialPeople = (): PersonRecord[] => people.map((seed, index) => ({
  id: `person-${String(index + 1).padStart(2, "0")}`,
  ...seed,
  campaignStatus: "active",
  affiliation: "outpost",
  injuries: [],
  readiness: seed.tier === "vanguard" ? 88 : seed.tier === "line" ? 76 : 64,
  miaExpiresAfterDay: null,
  career: { missions: seed.tier === "vanguard" ? 6 - index : 0, kills: seed.tier === "vanguard" ? 20 - index * 2 : 0, rescues: 0, lethalOperations: 0, returns: 0 },
  history: [seed.tier === "vanguard" ? "Founding outpost member." : seed.tier === "line" ? "Proven on local operations." : "Awaiting first field assignment."],
}));

const offer = (
  day: number,
  index: number,
  values: Omit<MissionOffer, "id" | "createdDay" | "expiresAfterDay" | "subjectIds"> & { lifetime: number },
): MissionOffer => {
  const { lifetime, ...definition } = values;
  return {
    ...definition,
    id: `day-${day}-offer-${index}`,
    createdDay: day,
    expiresAfterDay: day + Math.max(0, lifetime - 1),
    subjectIds: [],
  };
};

export const createMissionOffers = (day: number): MissionOffer[] => [
  offer(day, 1, {
    kind: "routine",
    title: "Clinic Supply Run",
    location: "Southbank Medical Annex",
    brief: "The pharmacy wing is open and the loading entrance gives a clean withdrawal route. Secure the marked cache before contact pressure becomes expensive.",
    objective: "Secure the medical cache and extract",
    risk: "RECOVERABLE",
    permadeath: false,
    lifetime: 2,
    ammoCostPerSurvivor: 8,
    recommendedSquad: 4,
    threat: 0.45,
    reward: { ammunition: 6, medical: 8, materials: 12, comforts: 0 },
  }),
  offer(day, 2, {
    kind: "routine",
    title: "Department Store Sweep",
    location: "Mercer & Rowe",
    brief: "A broad sales floor with useful sight lines. The stock cage is valuable, but every minute spent transferring goods increases the pressure on the holding team.",
    objective: "Secure the stock cage and extract",
    risk: "DANGEROUS",
    permadeath: false,
    lifetime: 3,
    ammoCostPerSurvivor: 10,
    recommendedSquad: 5,
    threat: 0.62,
    reward: { ammunition: 12, medical: 2, materials: 22, comforts: day % 3 === 0 ? 1 : 0 },
  }),
  offer(day, 3, {
    kind: "faction",
    title: "Distribution Hub Hold",
    location: "North Freight Warehouse",
    brief: "An allied recovery crew needs the central floor held while they restart the freight lift. The approach is readable; the duration is not forgiving.",
    objective: "Hold the recovery floor, secure the cache and extract",
    risk: "LETHAL",
    permadeath: true,
    lifetime: 1,
    ammoCostPerSurvivor: 14,
    recommendedSquad: 6,
    threat: 0.82,
    reward: { ammunition: 18, medical: 5, materials: 38, comforts: 1 },
  }),
];
