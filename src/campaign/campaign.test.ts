import { describe, expect, it } from "vitest";
import { Campaign, createInitialCampaignState } from "./campaign";
import type { MissionOutcome } from "./types";

const successfulOutcome = (personIds: string[]): MissionOutcome => ({
  success: true,
  objectiveCompleted: true,
  extractedPersonIds: personIds,
  downPersonIds: [],
  healthByPersonId: Object.fromEntries(personIds.map((id) => [id, 100])),
  ammunitionRemaining: 10,
  contactsNeutralised: 12,
  cachesRecovered: 4,
  cacheCount: 4,
});

describe("Campaign operational day", () => {
  it("prevents a survivor acting in two missions on one day", () => {
    const campaign = new Campaign();
    const person = campaign.availablePeople()[0];
    const first = campaign.deploy(campaign.availableOffers()[0].id, [person.id]);
    campaign.resolveOperation(first.operationId, successfulOutcome([person.id]));

    expect(() => campaign.deploy(campaign.availableOffers()[0].id, [person.id])).toThrow(/not available/);
  });

  it("holds mission rewards in transit until end of day", () => {
    const campaign = new Campaign();
    const offer = campaign.availableOffers()[0];
    const person = campaign.availablePeople()[0];
    const initialMaterials = campaign.state.resources.materials;
    const deployment = campaign.deploy(offer.id, [person.id]);
    campaign.resolveOperation(deployment.operationId, successfulOutcome([person.id]));

    expect(campaign.state.resources.materials).toBe(initialMaterials);
    expect(campaign.state.transit.materials).toBe(offer.reward.materials);
    campaign.endDay();
    expect(campaign.state.resources.materials).toBeGreaterThan(initialMaterials);
    expect(campaign.state.transit.materials).toBe(0);
  });

  it("awards salvage in proportion to caches recovered", () => {
    const campaign = new Campaign();
    const offer = campaign.availableOffers()[0];
    const person = campaign.availablePeople()[0];
    const deployment = campaign.deploy(offer.id, [person.id]);
    campaign.resolveOperation(deployment.operationId, {
      ...successfulOutcome([person.id]),
      objectiveCompleted: false,
      cachesRecovered: 2,
      cacheCount: 4,
    });

    expect(campaign.state.transit.materials).toBe(Math.round(offer.reward.materials * 0.5));
  });

  it("resolves persistent base assignments for people who did not deploy", () => {
    const state = createInitialCampaignState();
    state.people.forEach((person) => { person.assignment = "general"; });
    state.people[0].assignment = "logistics";
    const campaign = new Campaign(state);
    const startingAmmo = campaign.state.resources.ammunition;

    campaign.endDay();

    expect(campaign.state.resources.ammunition).toBe(startingAmmo + 5);
  });

  it("returns the same persistent person when a rescue succeeds", () => {
    const state = createInitialCampaignState();
    const missing = state.people[0];
    missing.campaignStatus = "mia";
    missing.affiliation = "unknown";
    missing.miaExpiresAfterDay = 3;
    state.missionOffers = [];
    const campaign = new Campaign(state);
    campaign.endDay();
    const rescue = campaign.availableOffers().find((offer) => offer.kind === "rescue");
    expect(rescue).toBeDefined();
    const rescuer = campaign.availablePeople()[0];
    const deployment = campaign.deploy(rescue!.id, [rescuer.id]);
    campaign.resolveOperation(deployment.operationId, successfulOutcome([rescuer.id]));

    const returned = campaign.state.people.find((person) => person.id === missing.id)!;
    expect(returned.campaignStatus).toBe("active");
    expect(returned.injuries.some((injury) => injury.severity === "major")).toBe(true);
    expect(returned.career.returns).toBe(1);
  });

  it("makes support expansion an optional increasing capital cost", () => {
    const state = createInitialCampaignState();
    state.resources.materials = 500;
    const campaign = new Campaign(state);
    const firstCost = campaign.getSupportUpgradeCost();
    campaign.upgradeSupport();

    expect(campaign.state.supportCapacity).toBe(20);
    expect(campaign.getSupportUpgradeCost()).toBeGreaterThan(firstCost);
  });

  it("refills rather than accumulates the normal mission board", () => {
    const campaign = new Campaign();
    campaign.endDay();
    campaign.endDay();

    const normalOffers = campaign.availableOffers().filter((offer) => offer.kind !== "rescue");
    expect(normalOffers).toHaveLength(3);
    expect(new Set(normalOffers.map((offer) => offer.title)).size).toBe(3);
  });

  it("removes legacy readiness and migrates recommended squad saves to protocol strength", () => {
    const state = createInitialCampaignState();
    const legacyPerson = state.people[0] as typeof state.people[number] & { readiness?: number };
    legacyPerson.readiness = 88;
    const legacyOffer = state.missionOffers[0] as typeof state.missionOffers[number] & { recommendedSquad?: number };
    legacyOffer.recommendedSquad = legacyOffer.protocolSquad;
    delete (legacyOffer as Partial<typeof legacyOffer>).protocolSquad;

    const campaign = new Campaign(state);

    expect("readiness" in campaign.state.people[0]).toBe(false);
    expect(campaign.state.missionOffers[0].protocolSquad).toBe(4);
    expect("recommendedSquad" in campaign.state.missionOffers[0]).toBe(false);
  });
});
