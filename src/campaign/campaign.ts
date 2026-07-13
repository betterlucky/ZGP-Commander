import { createInitialPeople, createMissionOffers } from "./content";
import type {
  BaseAssignment,
  CampaignEvent,
  CampaignResources,
  CampaignState,
  Deployment,
  EndDayReport,
  InjuryRecord,
  MissionOffer,
  MissionOutcome,
  OperationRecord,
  PersonRecord,
  SurvivorTier,
} from "./types";

const emptyResources = (): CampaignResources => ({ ammunition: 0, medical: 0, materials: 0, comforts: 0 });

const addResources = (target: CampaignResources, source: CampaignResources): void => {
  target.ammunition += source.ammunition;
  target.medical += source.medical;
  target.materials += source.materials;
  target.comforts += source.comforts;
};

const scaledReward = (reward: CampaignResources, scale: number): CampaignResources => ({
  ammunition: Math.round(reward.ammunition * scale),
  medical: Math.round(reward.medical * scale),
  materials: Math.round(reward.materials * scale),
  comforts: Math.round(reward.comforts * scale),
});

const assignmentProduction: Partial<Record<BaseAssignment, CampaignResources>> = {
  workshop: { ammunition: 0, medical: 0, materials: 3, comforts: 0 },
  logistics: { ammunition: 5, medical: 0, materials: 0, comforts: 0 },
  medical: { ammunition: 0, medical: 1, materials: 0, comforts: 0 },
};

const clone = <T>(value: T): T => structuredClone(value);

export const createInitialCampaignState = (): CampaignState => ({
  schemaVersion: 1,
  day: 1,
  supportCapacity: 16,
  supportUpgrades: 0,
  people: createInitialPeople(),
  resources: { ammunition: 220, medical: 14, materials: 42, comforts: 0 },
  missionOffers: createMissionOffers(1),
  operations: [],
  actedPersonIds: [],
  transit: emptyResources(),
  events: [{ id: "event-1", day: 1, tone: "normal", message: "Operational cycle opened. Three opportunities are available." }],
  nextSequence: 2,
});

export class Campaign {
  public readonly state: CampaignState;

  constructor(state: CampaignState = createInitialCampaignState()) {
    this.state = clone(state);
  }

  public snapshot(): CampaignState {
    return clone(this.state);
  }

  public activePeople(): PersonRecord[] {
    return this.state.people.filter((person) => person.campaignStatus === "active");
  }

  public availablePeople(): PersonRecord[] {
    const acted = new Set(this.state.actedPersonIds);
    return this.activePeople().filter((person) => !acted.has(person.id) && !this.hasBlockingInjury(person));
  }

  public availableOffers(): MissionOffer[] {
    const used = new Set(this.state.operations.map((operation) => operation.offer.id));
    return this.state.missionOffers.filter((offer) => offer.expiresAfterDay >= this.state.day && !used.has(offer.id));
  }

  public unresolvedOperations(): OperationRecord[] {
    return this.state.operations.filter((operation) => operation.status === "deployed");
  }

  public getSupportUpgradeCost(): number {
    return 60 + this.state.supportUpgrades * 55;
  }

  public upgradeSupport(): void {
    const cost = this.getSupportUpgradeCost();
    if (this.state.resources.materials < cost) throw new Error(`Support expansion requires ${cost} materials.`);
    this.state.resources.materials -= cost;
    this.state.supportCapacity += 4;
    this.state.supportUpgrades += 1;
    this.addEvent("good", `Support infrastructure expanded to ${this.state.supportCapacity}.`);
  }

  public setTier(personId: string, tier: SurvivorTier): void {
    const person = this.requirePerson(personId);
    if (person.campaignStatus !== "active") throw new Error("Only active survivors can be reorganised.");
    person.tier = tier;
    this.addEvent("normal", `${person.name} assigned to ${tier.toUpperCase()}.`);
  }

  public setAssignment(personId: string, assignment: BaseAssignment): void {
    const person = this.requirePerson(personId);
    if (person.campaignStatus !== "active") throw new Error("Only active survivors can receive base assignments.");
    if (this.state.actedPersonIds.includes(personId)) throw new Error(`${person.name} has already acted today.`);
    person.assignment = assignment;
  }

  public deploy(offerId: string, personIds: string[]): Deployment {
    const offer = this.availableOffers().find((candidate) => candidate.id === offerId);
    if (!offer) throw new Error("That operation is no longer available.");
    const uniqueIds = [...new Set(personIds)];
    if (!uniqueIds.length) throw new Error("Select at least one survivor.");
    const available = new Set(this.availablePeople().map((person) => person.id));
    for (const personId of uniqueIds) {
      if (!available.has(personId)) throw new Error(`${this.requirePerson(personId).name} is not available.`);
    }
    const ammunition = uniqueIds.length * offer.ammoCostPerSurvivor;
    if (this.state.resources.ammunition < ammunition) throw new Error(`Deployment requires ${ammunition} ammunition.`);
    this.state.resources.ammunition -= ammunition;
    this.state.actedPersonIds.push(...uniqueIds);
    const operation: OperationRecord = {
      id: `operation-${this.state.nextSequence++}`,
      offer: clone(offer),
      personIds: uniqueIds,
      status: "deployed",
      ammoCommitted: ammunition,
      launchedDay: this.state.day,
      result: null,
    };
    this.state.operations.push(operation);
    this.addEvent("normal", `${offer.title} launched with ${uniqueIds.length} survivor${uniqueIds.length === 1 ? "" : "s"}.`);
    return { operationId: operation.id, offer: clone(offer), people: uniqueIds.map((id) => clone(this.requirePerson(id))) };
  }

  public resumeDeployment(operationId: string): Deployment {
    const operation = this.state.operations.find((candidate) => candidate.id === operationId && candidate.status === "deployed");
    if (!operation) throw new Error("That operation is no longer active.");
    return {
      operationId: operation.id,
      offer: clone(operation.offer),
      people: operation.personIds.map((id) => clone(this.requirePerson(id))),
    };
  }

  public resolveOperation(operationId: string, outcome: MissionOutcome): void {
    const operation = this.state.operations.find((candidate) => candidate.id === operationId);
    if (!operation || operation.status !== "deployed") throw new Error("Operation is not awaiting resolution.");
    operation.status = "resolved";
    operation.result = clone(outcome);
    const rewardScale = outcome.objectiveCompleted ? 1 : outcome.success ? 0.45 : 0;
    const reward = scaledReward(operation.offer.reward, rewardScale);
    addResources(this.state.transit, reward);

    for (const personId of operation.personIds) {
      const person = this.requirePerson(personId);
      person.career.missions += 1;
      person.career.kills += Math.floor(outcome.contactsNeutralised / Math.max(1, operation.personIds.length));
      if (operation.offer.permadeath) person.career.lethalOperations += 1;
      const health = outcome.healthByPersonId[personId] ?? 100;
      if (outcome.downPersonIds.includes(personId)) this.resolveDownedPerson(person, operation);
      else if (health < 58) this.addInjury(person, "minor", "Concussion", "accuracy", -0.08, 2);
      person.readiness = Math.max(0, person.readiness - (operation.offer.permadeath ? 18 : 10));
    }

    if (outcome.objectiveCompleted && operation.offer.kind === "rescue") {
      for (const subjectId of operation.offer.subjectIds) this.returnMia(subjectId);
    }

    this.addEvent(
      outcome.success ? "good" : "warning",
      `${operation.offer.title} ${outcome.success ? "resolved" : "failed"}. ${outcome.extractedPersonIds.length} returned; ${outcome.downPersonIds.length} down.`,
    );
  }

  public endDay(): EndDayReport {
    if (this.unresolvedOperations().length) throw new Error("Resolve active operations before ending the day.");
    const completedDay = this.state.day;
    const acted = new Set(this.state.actedPersonIds);
    const produced = emptyResources();
    const recoveredPeople: string[] = [];
    for (const person of this.activePeople()) {
      if (acted.has(person.id)) continue;
      const production = assignmentProduction[person.assignment];
      if (production) addResources(produced, production);
      if (person.assignment === "training") person.readiness = Math.min(100, person.readiness + 8);
      if (person.assignment === "general") person.readiness = Math.min(100, person.readiness + 3);
      if (person.assignment === "recovery" && person.injuries.length) {
        for (const injury of person.injuries) injury.recoveryDays -= 1;
        const before = person.injuries.length;
        person.injuries = person.injuries.filter((injury) => injury.recoveryDays > 0);
        person.readiness = Math.min(100, person.readiness + 12);
        if (person.injuries.length < before) recoveredPeople.push(person.name);
      }
    }
    addResources(this.state.resources, produced);
    const received = clone(this.state.transit);
    addResources(this.state.resources, received);
    this.state.transit = emptyResources();
    this.state.actedPersonIds = [];
    this.state.day += 1;
    const expiredMia: string[] = [];
    for (const person of this.state.people) {
      if (person.campaignStatus === "mia" && person.miaExpiresAfterDay !== null && this.state.day > person.miaExpiresAfterDay) {
        person.campaignStatus = "dead";
        person.affiliation = "unknown";
        person.history.push(`Confirmed lost after rescue window expired on Day ${this.state.day}.`);
        expiredMia.push(person.name);
      }
    }
    this.rotateOffers();
    this.addEvent("normal", `Day ${completedDay} closed. Operational cycle ${this.state.day} opened.`);
    return { completedDay, produced, received, recoveredPeople, expiredMia, newDay: this.state.day };
  }

  private rotateOffers(): void {
    const stillAvailable = this.state.missionOffers.filter((offer) => offer.expiresAfterDay >= this.state.day && !this.state.operations.some((operation) => operation.offer.id === offer.id));
    const generated = createMissionOffers(this.state.day);
    const rescueOffers = this.state.people
      .filter((person) => person.campaignStatus === "mia" && person.miaExpiresAfterDay !== null)
      .map((person, index): MissionOffer => ({
        id: `day-${this.state.day}-rescue-${person.id}`,
        kind: "rescue",
        title: `Search & Rescue: ${person.name}`,
        location: "Last Known Telemetry",
        brief: `${person.callsign}'s relay has surfaced beyond the normal search line. Reach the signal, secure the survivor and extract before the trail disappears.`,
        objective: `Recover ${person.name} and extract`,
        risk: "LETHAL",
        permadeath: true,
        createdDay: this.state.day,
        expiresAfterDay: person.miaExpiresAfterDay ?? this.state.day,
        ammoCostPerSurvivor: 14,
        recommendedSquad: 6,
        threat: 0.86 + index * 0.02,
        reward: emptyResources(),
        subjectIds: [person.id],
      }));
    const normalOffers = stillAvailable.filter((offer) => offer.kind !== "rescue");
    const existingTitles = new Set(normalOffers.map((offer) => offer.title));
    const replacements = generated
      .filter((offer) => !existingTitles.has(offer.title))
      .slice(0, Math.max(0, 3 - normalOffers.length));
    this.state.missionOffers = [...rescueOffers, ...normalOffers, ...replacements];
  }

  private resolveDownedPerson(person: PersonRecord, operation: OperationRecord): void {
    if (!operation.offer.permadeath) {
      this.addInjury(person, "major", "Severe trauma", "health", -0.18, 4);
      person.assignment = "recovery";
      return;
    }
    const fate = this.deterministicFate(person.id, operation.id);
    if (fate === "dead") {
      person.campaignStatus = "dead";
      person.affiliation = "unknown";
      person.history.push(`Killed during ${operation.offer.title} on Day ${this.state.day}.`);
      return;
    }
    person.campaignStatus = "mia";
    person.affiliation = "unknown";
    person.miaExpiresAfterDay = this.state.day + 3;
    person.history.push(`Missing after ${operation.offer.title} on Day ${this.state.day}.`);
  }

  private deterministicFate(personId: string, operationId: string): "mia" | "dead" {
    let hash = 2166136261;
    for (const character of `${personId}:${operationId}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return (hash >>> 0) % 100 < 58 ? "mia" : "dead";
  }

  private returnMia(personId: string): void {
    const person = this.requirePerson(personId);
    if (person.campaignStatus !== "mia") return;
    person.campaignStatus = "active";
    person.affiliation = "outpost";
    person.miaExpiresAfterDay = null;
    person.career.rescues += 1;
    person.career.returns += 1;
    person.assignment = "recovery";
    this.addInjury(person, "major", "Exposure and trauma", "health", -0.15, 4);
    person.history.push(`Recovered alive on Day ${this.state.day}.`);
  }

  private addInjury(person: PersonRecord, severity: InjuryRecord["severity"], name: string, stat: InjuryRecord["stat"], modifier: number, recoveryDays: number): void {
    person.injuries.push({ id: `injury-${this.state.nextSequence++}`, name, severity, acquiredDay: this.state.day, recoveryDays, stat, modifier });
  }

  private hasBlockingInjury(person: PersonRecord): boolean {
    return person.injuries.some((injury) => injury.severity === "major");
  }

  private requirePerson(personId: string): PersonRecord {
    const person = this.state.people.find((candidate) => candidate.id === personId);
    if (!person) throw new Error(`Unknown survivor ${personId}.`);
    return person;
  }

  private addEvent(tone: CampaignEvent["tone"], message: string): void {
    this.state.events.unshift({ id: `event-${this.state.nextSequence++}`, day: this.state.day, tone, message });
    this.state.events = this.state.events.slice(0, 30);
  }
}
