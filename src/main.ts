import "./style.css";
import "./base.css";
import { mountBaseScreen } from "./app/base-screen";
import { mountTacticalScreen } from "./app/tactical-screen";
import { CampaignStore } from "./campaign/store";
import type { Deployment, MissionOutcome } from "./campaign/types";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("App root missing");

const store = new CampaignStore();
let campaign = store.load();
let cleanupScreen: (() => void) | null = null;

const showBase = (): void => {
  cleanupScreen?.();
  cleanupScreen = null;
  mountBaseScreen(root, campaign, store, {
    onLaunch: showTactical,
    onResume: showTactical,
    onReset: () => {
      campaign = store.reset();
      showBase();
    },
  });
};

const showTactical = (deployment: Deployment): void => {
  cleanupScreen?.();
  cleanupScreen = mountTacticalScreen(root, deployment, {
    onResolve: (outcome: MissionOutcome) => {
      campaign.resolveOperation(deployment.operationId, outcome);
      store.save(campaign);
    },
    onReturn: showBase,
  });
};

showBase();
