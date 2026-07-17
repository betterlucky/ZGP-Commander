import "./style.css";
import "./base.css";
import { mountBaseScreen } from "./app/base-screen";
import { mountTacticalScreen } from "./app/tactical-screen";
import { CampaignStore } from "./campaign/store";
import type { Deployment, MissionOutcome } from "./campaign/types";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("App root missing");

const demoMode = new URLSearchParams(window.location.search).get("demo") === "1";
const store = new CampaignStore(demoMode ? "zgp-commander-build-week-demo-v1" : undefined);
let campaign = demoMode ? store.reset() : store.load();
let cleanupScreen: (() => void) | null = null;
let demoIntroPending = demoMode;

const showBase = (): void => {
  cleanupScreen?.();
  cleanupScreen = null;
  mountBaseScreen(root, campaign, store, {
    onLaunch: showTactical,
    onResume: showTactical,
    onReset: () => {
      campaign = store.reset();
      demoIntroPending = demoMode;
      showBase();
    },
  }, {
    demoMode,
    showDemoIntro: demoIntroPending,
    onDemoStarted: () => { demoIntroPending = false; },
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
  }, { demoMode });
};

showBase();
