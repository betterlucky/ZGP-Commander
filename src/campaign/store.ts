import { Campaign, createInitialCampaignState } from "./campaign";
import type { CampaignState } from "./types";

const DEFAULT_STORAGE_KEY = "zgp-commander-campaign-v1";

export class CampaignStore {
  constructor(private readonly storageKey = DEFAULT_STORAGE_KEY) {}

  public load(): Campaign {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return new Campaign();
      const state = JSON.parse(raw) as CampaignState;
      if (state.schemaVersion !== 1) throw new Error("Unsupported campaign schema.");
      return new Campaign(state);
    } catch (error) {
      console.warn("Campaign save could not be loaded; starting a fresh campaign.", error);
      return new Campaign(createInitialCampaignState());
    }
  }

  public save(campaign: Campaign): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(campaign.snapshot()));
    } catch (error) {
      console.warn("Campaign progress could not be saved; continuing in memory.", error);
    }
  }

  public reset(): Campaign {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn("Campaign save could not be cleared; starting a fresh in-memory campaign.", error);
    }
    return new Campaign(createInitialCampaignState());
  }
}
