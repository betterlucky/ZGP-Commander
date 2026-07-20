import { deploymentAmmoCost, type Campaign } from "../campaign/campaign";
import type { CampaignStore } from "../campaign/store";
import type { BaseAssignment, Deployment, EndDayReport, MissionOffer, PersonRecord } from "../campaign/types";

interface BaseScreenHandlers {
  onLaunch(deployment: Deployment): void;
  onResume(deployment: Deployment): void;
  onReset(): void;
}

interface BaseScreenOptions {
  demoMode?: boolean;
  showDemoIntro?: boolean;
  onDemoStarted?(): void;
}

type DemoDeploymentStage = "idle" | "roster" | "selecting" | "linking";
type FacilityId = "operations" | "medical" | "workshop" | "logistics" | "quarters" | "records";
const demoRosterHoldMs = 975;
const demoSelectionHoldMs = 1725;
const demoFinalSelectionHoldMs = 3000;

const facilityDetails: Record<Exclude<FacilityId, "quarters">, { code: string; title: string; summary: string; features: string[] }> = {
  operations: {
    code: "OPS",
    title: "OPERATIONS",
    summary: "Operations turns incomplete field intelligence into choices: which opportunities matter, who should be sent and which risks the outpost can afford.",
    features: ["Compare expiring opportunities and faction consequences", "Build squads around mission protocol and available ammunition", "Resume live Ghostlinks and review completed deployments"],
  },
  medical: {
    code: "MED",
    title: "MEDICAL",
    summary: "Medical stabilises returned survivors and turns scarce supplies, staff time and difficult triage decisions into a path back to active duty.",
    features: ["Diagnose persistent minor and major injuries", "Assign treatment priorities and recovery time", "Spend medical stores when waiting is too dangerous"],
  },
  workshop: {
    code: "WRK",
    title: "WORKSHOP",
    summary: "The Workshop will maintain recovered equipment and adapt weapons to the strengths, injuries and preferred tactics of individual survivors.",
    features: ["Repair and modify field equipment", "Turn salvage into weapons, armour and tools", "Balance reliable standard kit against specialised builds"],
  },
  logistics: {
    code: "LOG",
    title: "LOGISTICS",
    summary: "Logistics controls what each squad can carry and how quickly the outpost can turn people, ammunition and salvage into another viable mission.",
    features: ["Prepare mission loadouts and reserve ammunition", "Track consumables recovered or lost in transit", "Improve supply output through survivor assignments"],
  },
  records: {
    code: "REC",
    title: "RECORDS",
    summary: "Records preserves the human cost of command: careers, injuries, rescues, missing survivors and the names that never return.",
    features: ["Review individual mission histories and career totals", "Track missing survivors and rescue windows", "Memorialise permanent losses without erasing their story"],
  },
};

const assignmentLabels: Record<BaseAssignment, string> = {
  general: "General duty",
  workshop: "Workshop",
  logistics: "Logistics",
  medical: "Medical",
  training: "Training",
  recovery: "Recovery",
};

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const rewardText = (offer: MissionOffer): string => {
  const values = [
    offer.reward.materials ? `${offer.reward.materials} MAT` : "",
    offer.reward.ammunition ? `${offer.reward.ammunition} AMMO` : "",
    offer.reward.medical ? `${offer.reward.medical} MED` : "",
    offer.reward.comforts ? `${offer.reward.comforts} COMFORT` : "",
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "PERSONNEL RECOVERY";
};

const reportText = (report: EndDayReport): string => {
  const produced = report.produced.materials + report.produced.ammunition + report.produced.medical;
  const received = report.received.materials + report.received.ammunition + report.received.medical + report.received.comforts;
  return `Day ${report.completedDay} resolved: ${produced} base output, ${received} field resources received${report.recoveredPeople.length ? `, ${report.recoveredPeople.join(", ")} recovered` : ""}.`;
};

const conditionLabel = (person: PersonRecord): string => {
  const major = person.injuries.filter((injury) => injury.severity === "major").length;
  if (major) return major > 1 ? `${major} MAJOR INJURIES` : "MAJOR INJURY";
  if (person.injuries.length) return person.injuries.length > 1 ? `${person.injuries.length} INJURIES` : "INJURED";
  return "HEALTHY";
};

const renderFacilityModal = (
  facilityId: FacilityId,
  active: PersonRecord[],
  returnedToday: Set<string>,
  status: string,
): string => {
  if (facilityId === "quarters") {
    return `
      <section class="facility-overlay" id="facility-overlay" role="dialog" aria-modal="true" aria-labelledby="facility-title">
        <div class="facility-dialog quarters-dialog">
          <header><span><small>QTR · PERSONNEL OVERVIEW</small><strong id="facility-title">QUARTERS</strong></span><button id="close-facility" type="button" aria-label="Close Quarters">×</button></header>
          <p>Every survivor persists between operations with their own role, equipment, condition, assignment and history. Returned personnel are highlighted below.</p>
          <div class="facility-roster">
            ${active.map((person) => `
              <article class="facility-person tier-${person.tier} ${returnedToday.has(person.id) ? "returned" : ""}">
                <span class="deployment-avatar">${person.callsign.slice(0, 1)}</span>
                <span class="facility-person-identity"><b>${escapeHtml(person.name)}</b><small>${person.tier.toUpperCase()} · ${person.role}</small><i>${person.weapon.toUpperCase()} · ${assignmentLabels[person.assignment]}</i></span>
                <span class="facility-person-state ${person.injuries.length ? "injured" : ""}"><b>${returnedToday.has(person.id) ? "RETURNED TODAY" : conditionLabel(person)}</b><small>${person.career.missions} MISSIONS · ${person.career.kills} NEUTRALISED</small></span>
              </article>
            `).join("")}
          </div>
        </div>
      </section>
    `;
  }
  const detail = facilityDetails[facilityId];
  return `
    <section class="facility-overlay" id="facility-overlay" role="dialog" aria-modal="true" aria-labelledby="facility-title">
      <div class="facility-dialog">
        <header><span><small>${detail.code} · OUTPOST FACILITY</small><strong id="facility-title">${detail.title}</strong></span><button id="close-facility" type="button" aria-label="Close ${detail.title}">×</button></header>
        <div class="facility-briefing"><small>CURRENT STATUS</small><b>${escapeHtml(status)}</b><p>${detail.summary}</p><ul>${detail.features.map((feature) => `<li>${feature}</li>`).join("")}</ul><span>CAMPAIGN SYSTEM · FURTHER DEVELOPMENT PLANNED</span></div>
      </div>
    </section>
  `;
};

export const mountBaseScreen = (
  root: HTMLElement,
  campaign: Campaign,
  store: CampaignStore,
  handlers: BaseScreenHandlers,
  options: BaseScreenOptions = {},
): void => {
  let selectedOfferId: string | null = null;
  const selectedPeople = new Set<string>();
  let demoIntroVisible = options.showDemoIntro ?? false;
  let demoDeploymentStage: DemoDeploymentStage = "idle";
  let demoSelectedPersonId: string | null = null;
  let demoContinueReady = false;
  let demoSequenceVersion = 0;
  let openFacility: FacilityId | null = null;
  let notice = options.demoMode && campaign.state.operations.some((operation) => operation.status === "resolved")
    ? "Demo operation complete. Review the returned squad, field resources in transit and command log—or restart the showcase."
    : "Select an operation when you are ready. Base assignments remain provisional until the day ends.";

  const render = (): void => {
    const state = campaign.state;
    const active = campaign.activePeople();
    const available = campaign.availablePeople();
    const acted = new Set(state.actedPersonIds);
    const returnedToday = new Set(state.operations
      .filter((operation) => operation.launchedDay === state.day && operation.status === "resolved")
      .flatMap((operation) => operation.result?.extractedPersonIds ?? []));
    const offers = campaign.availableOffers();
    const selectedOffer = offers.find((offer) => offer.id === selectedOfferId) ?? null;
    const injured = active.filter((person) => person.injuries.length > 0);
    const missing = state.people.filter((person) => person.campaignStatus === "mia");
    const dead = state.people.filter((person) => person.campaignStatus === "dead");
    const assignmentCount = (assignment: BaseAssignment): number => active.filter((person) => !acted.has(person.id) && person.assignment === assignment).length;
    const facilityStatus: Record<FacilityId, string> = {
      operations: `${offers.length} opportunities · ${campaign.unresolvedOperations().length} live link`,
      medical: `${injured.length} injured · ${assignmentCount("medical")} assigned`,
      workshop: `${assignmentCount("workshop")} assigned · +${assignmentCount("workshop") * 3} materials`,
      logistics: `${assignmentCount("logistics")} assigned · +${assignmentCount("logistics") * 5} ammunition`,
      quarters: `${active.length} active · ${available.length} available`,
      records: `${missing.length} MIA · ${dead.length} memorialised`,
    };

    root.innerHTML = `
      <main class="base-shell">
        <header class="base-topbar">
          <div class="base-brand"><span>HOLDFAST</span><small>${options.demoMode ? "BUILD WEEK DEMO" : "OUTPOST COMMAND"}</small></div>
          <div class="cycle-readout"><small>OPERATIONAL CYCLE</small><strong>DAY ${state.day}</strong></div>
          <div class="resource-strip">
            <span><small>AMMUNITION</small><b>${state.resources.ammunition}${state.transit.ammunition ? `<i>IN TRANSIT +${state.transit.ammunition}</i>` : ""}</b></span>
            <span><small>MEDICAL</small><b>${state.resources.medical}${state.transit.medical ? `<i>IN TRANSIT +${state.transit.medical}</i>` : ""}</b></span>
            <span><small>MATERIALS</small><b>${state.resources.materials}${state.transit.materials ? `<i>IN TRANSIT +${state.transit.materials}</i>` : ""}</b></span>
            <span><small>SUPPORT</small><b>${active.length} / ${state.supportCapacity}</b></span>
          </div>
          <button class="warm-button" id="end-day" type="button">END DAY ${state.day}</button>
        </header>

        <section class="base-workarea">
          <aside class="operations-column base-panel">
            <div class="base-section-heading"><span>OPPORTUNITIES</span><small>${offers.length} AVAILABLE</small></div>
            <div class="mission-board">
              ${offers.map((offer) => `
                <button class="mission-card risk-${offer.risk.toLowerCase()} ${offer.id === selectedOfferId ? "selected" : ""}" data-offer="${offer.id}" type="button">
                  <span class="mission-kind">${offer.kind === "rescue" ? "URGENT RESCUE" : offer.kind.toUpperCase()}</span>
                  <strong>${escapeHtml(offer.title)}</strong>
                  <small>${escapeHtml(offer.location)}</small>
                  <span class="mission-details"><b>${offer.risk}</b><i>${offer.expiresAfterDay === state.day ? "LAST DAY" : `${offer.expiresAfterDay - state.day + 1} DAYS`}</i></span>
                  <span class="mission-reward">${rewardText(offer)}</span>
                </button>
              `).join("")}
            </div>
            <div class="today-operations">
              <div class="base-section-heading"><span>TODAY</span><small>${state.operations.filter((operation) => operation.launchedDay === state.day).length} LAUNCHED</small></div>
              ${state.operations.filter((operation) => operation.launchedDay === state.day).map((operation) => `
                <div class="operation-row ${operation.status}">
                  <span><b>${escapeHtml(operation.offer.title)}</b><small>${operation.personIds.length} deployed · ${operation.ammoCommitted} ammo</small></span>
                  ${operation.status === "deployed" ? `<button data-resume="${operation.id}" type="button">RESUME LINK</button>` : `<strong>${operation.result?.success ? "RETURNED" : "FAILED"}</strong>`}
                </div>
              `).join("") || `<p class="empty-copy">No squads deployed this cycle.</p>`}
            </div>
          </aside>

          <section class="command-floor">
            <div class="command-heading">
              <span><small>LOCAL SYSTEM</small><strong>LIVING COMMAND SCHEMATIC</strong></span>
              <span class="base-condition"><i></i> STABLE TELEMETRY</span>
            </div>
            <div class="base-map" aria-label="Outpost facility schematic">
              <button class="facility operations-room live" data-facility="operations" type="button"><span class="facility-code">OPS</span><strong>OPERATIONS</strong><small>${facilityStatus.operations}</small><span class="facility-open">OPEN FACILITY</span><span class="signal-rings"></span></button>
              <button class="facility medical-room ${injured.length ? "attention" : ""}" data-facility="medical" type="button"><span class="facility-code">MED</span><strong>MEDICAL</strong><small>${facilityStatus.medical}</small><span class="facility-open">OPEN FACILITY</span><span class="bed-grid"><i></i><i></i><i></i></span></button>
              <button class="facility workshop-room" data-facility="workshop" type="button"><span class="facility-code">WRK</span><strong>WORKSHOP</strong><small>${facilityStatus.workshop}</small><span class="facility-open">OPEN FACILITY</span><span class="work-sparks"></span></button>
              <button class="facility logistics-room" data-facility="logistics" type="button"><span class="facility-code">LOG</span><strong>LOGISTICS</strong><small>${facilityStatus.logistics}</small><span class="facility-open">OPEN FACILITY</span><span class="crate-stack"><i></i><i></i><i></i></span></button>
              <button class="facility quarters-room" data-facility="quarters" type="button"><span class="facility-code">QTR</span><strong>QUARTERS</strong><small>${facilityStatus.quarters}</small><span class="facility-open">VIEW ROSTER</span><span class="person-dots">${active.slice(0, 16).map((person) => `<i class="tier-${person.tier}" title="${escapeHtml(person.name)}"></i>`).join("")}</span></button>
              <button class="facility memorial-room ${missing.length ? "attention" : ""}" data-facility="records" type="button"><span class="facility-code">REC</span><strong>RECORDS</strong><small>${facilityStatus.records}</small><span class="facility-open">OPEN FACILITY</span><span class="record-lines"></span></button>
              <svg class="base-connections" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><path d="M190 165 L500 150 L810 175 M500 150 L500 430 M190 430 L500 430 L810 420 M190 165 L190 430 M810 175 L810 420" /></svg>
            </div>
            <div class="command-footer">
              <p>${escapeHtml(notice)}</p>
              <div>
                <button class="quiet-button" id="upgrade-support" type="button" ${state.resources.materials < campaign.getSupportUpgradeCost() ? "disabled" : ""}>EXPAND SUPPORT +4 · ${campaign.getSupportUpgradeCost()} MAT</button>
                ${options.demoMode ? `<button class="quiet-button" id="restart-demo" type="button">RESTART DEMO</button>` : ""}
                <button class="text-button" id="reset-campaign" type="button">RESET CAMPAIGN</button>
              </div>
            </div>
          </section>

          <aside class="roster-column base-panel">
            <div class="base-section-heading"><span>PERSONNEL</span><small>${active.length} ACTIVE</small></div>
            <div class="coverage-strip">
              <span><small>VANGUARD</small><b>${active.filter((person) => person.tier === "vanguard").length}</b></span>
              <span><small>LINE</small><b>${active.filter((person) => person.tier === "line").length}</b></span>
              <span><small>RESERVE</small><b>${active.filter((person) => person.tier === "reserve").length}</b></span>
            </div>
            <div class="roster-list">
              ${active.map((person) => `
                <article class="roster-row tier-${person.tier} ${acted.has(person.id) ? "acted" : ""}">
                  <span class="roster-mark">${person.callsign.slice(0, 1)}</span>
                  <span class="roster-identity"><b>${escapeHtml(person.name)}</b><small>${person.tier.toUpperCase()} · ${person.role} · ${person.weapon.toUpperCase()}</small></span>
                  <span class="roster-state ${person.injuries.length ? "injured" : ""}">${acted.has(person.id) ? "DEPLOYED" : conditionLabel(person)}</span>
                  <select data-assignment="${person.id}" aria-label="${escapeHtml(person.name)} assignment" ${acted.has(person.id) ? "disabled" : ""}>
                    ${(Object.keys(assignmentLabels) as BaseAssignment[]).map((assignment) => `<option value="${assignment}" ${person.assignment === assignment ? "selected" : ""}>${assignmentLabels[assignment]}</option>`).join("")}
                  </select>
                </article>
              `).join("")}
            </div>
          </aside>
        </section>

        <footer class="base-eventbar">
          <span>COMMAND LOG</span>
          ${state.events.slice(0, 4).map((event) => `<p class="${event.tone}"><b>DAY ${event.day}</b>${escapeHtml(event.message)}</p>`).join("")}
        </footer>

        ${selectedOffer ? renderDeploymentPlanner(
          selectedOffer,
          available,
          selectedPeople,
          state.resources.ammunition,
          demoDeploymentStage,
          demoSelectedPersonId,
          demoContinueReady,
          active.length,
        ) : ""}
        ${demoIntroVisible ? renderDemoIntro() : ""}
        ${openFacility ? renderFacilityModal(openFacility, active, returnedToday, facilityStatus[openFacility]) : ""}
      </main>
    `;

    bindEvents(selectedOffer);
    if (demoDeploymentStage !== "idle") root.querySelector<HTMLElement>(".deployment-overlay")?.focus({ preventScroll: true });
  };

  const launchOperation = (offer: MissionOffer): void => {
    try {
      const deployment = campaign.deploy(offer.id, [...selectedPeople]);
      store.save(campaign);
      handlers.onLaunch(deployment);
    } catch (error) {
      demoDeploymentStage = "idle";
      notice = error instanceof Error ? error.message : "Deployment failed.";
      render();
    }
  };

  const runDemoDeploymentSequence = (): void => {
    demoSequenceVersion += 1;
    demoDeploymentStage = "roster";
    demoSelectedPersonId = null;
    demoContinueReady = false;
    selectedPeople.clear();
    render();
    const sequenceVersion = demoSequenceVersion;
    window.setTimeout(() => {
      if (sequenceVersion !== demoSequenceVersion || demoDeploymentStage !== "roster") return;
      demoContinueReady = true;
      render();
    }, demoRosterHoldMs);
  };

  const advanceDemoDeployment = (offer: MissionOffer): void => {
    if (!demoContinueReady || demoDeploymentStage === "linking") return;
    const team = campaign.availablePeople().slice(0, offer.protocolSquad);
    const person = team.find((candidate) => !selectedPeople.has(candidate.id));
    if (!person) return;
    const sequenceVersion = demoSequenceVersion;
    demoContinueReady = false;
    demoDeploymentStage = "selecting";
    demoSelectedPersonId = person.id;
    selectedPeople.add(person.id);
    render();
    const finalSelection = selectedPeople.size >= team.length;
    window.setTimeout(() => {
      if (sequenceVersion !== demoSequenceVersion || demoDeploymentStage !== "selecting") return;
      if (finalSelection) {
        demoDeploymentStage = "linking";
        demoSelectedPersonId = null;
      } else demoContinueReady = true;
      render();
    }, finalSelection ? demoFinalSelectionHoldMs : demoSelectionHoldMs);
  };

  const bindEvents = (selectedOffer: MissionOffer | null): void => {
    const continueDemo = (): void => {
      if (selectedOffer) advanceDemoDeployment(selectedOffer);
    };
    root.querySelector<HTMLButtonElement>("#demo-continue")?.addEventListener("click", continueDemo);
    root.querySelector<HTMLElement>(".deployment-overlay")?.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || !demoContinueReady || demoDeploymentStage === "linking") return;
      event.preventDefault();
      continueDemo();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-offer]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedOfferId = button.dataset.offer ?? null;
        selectedPeople.clear();
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-person]").forEach((button) => {
      button.addEventListener("click", () => {
        const personId = button.dataset.person;
        if (!personId) return;
        if (selectedPeople.has(personId)) selectedPeople.delete(personId);
        else selectedPeople.add(personId);
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-facility]").forEach((button) => {
      button.addEventListener("click", () => {
        openFacility = button.dataset.facility as FacilityId;
        render();
      });
    });
    const closeFacility = (): void => {
      openFacility = null;
      render();
    };
    root.querySelector<HTMLButtonElement>("#close-facility")?.addEventListener("click", closeFacility);
    root.querySelector<HTMLElement>("#facility-overlay")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeFacility();
    });
    root.querySelectorAll<HTMLSelectElement>("[data-assignment]").forEach((select) => {
      select.addEventListener("change", () => {
        campaign.setAssignment(select.dataset.assignment ?? "", select.value as BaseAssignment);
        store.save(campaign);
        notice = "Assignment updated. It remains provisional until this day resolves.";
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-resume]").forEach((button) => {
      button.addEventListener("click", () => handlers.onResume(campaign.resumeDeployment(button.dataset.resume ?? "")));
    });
    root.querySelector<HTMLButtonElement>("#close-planner")?.addEventListener("click", () => {
      selectedOfferId = null;
      selectedPeople.clear();
      render();
    });
    root.querySelector<HTMLButtonElement>("#start-demo")?.addEventListener("click", () => {
      const offer = campaign.availableOffers().find((candidate) => candidate.title === "Clinic Supply Run") ?? campaign.availableOffers()[0];
      if (!offer) return;
      demoIntroVisible = false;
      options.onDemoStarted?.();
      selectedOfferId = offer.id;
      runDemoDeploymentSequence();
    });
    root.querySelector<HTMLButtonElement>("#launch-operation")?.addEventListener("click", () => {
      if (!selectedOffer) return;
      launchOperation(selectedOffer);
    });
    root.querySelector<HTMLButtonElement>("#end-day")?.addEventListener("click", () => {
      try {
        const report = campaign.endDay();
        store.save(campaign);
        selectedOfferId = null;
        selectedPeople.clear();
        notice = reportText(report);
      } catch (error) {
        notice = error instanceof Error ? error.message : "The day could not be resolved.";
      }
      render();
    });
    root.querySelector<HTMLButtonElement>("#upgrade-support")?.addEventListener("click", () => {
      try {
        campaign.upgradeSupport();
        store.save(campaign);
        notice = `Support capacity expanded to ${campaign.state.supportCapacity}. Further expansion is optional.`;
      } catch (error) {
        notice = error instanceof Error ? error.message : "Expansion failed.";
      }
      render();
    });
    root.querySelector<HTMLButtonElement>("#reset-campaign")?.addEventListener("click", () => {
      if (window.confirm("Reset the local campaign and discard its history?")) handlers.onReset();
    });
    root.querySelector<HTMLButtonElement>("#restart-demo")?.addEventListener("click", handlers.onReset);
  };

  render();
};

const renderDemoIntro = (): string => `
  <section class="demo-intro" aria-labelledby="demo-title">
    <div class="demo-intro-card">
      <small>OPENAI BUILD WEEK · PLAYABLE SHOWCASE</small>
      <h1 id="demo-title">COMMAND THE LINK.<br><span>LIVE WITH THE CONSEQUENCES.</span></h1>
      <p>ZGP Commander is a squad tactics game played through an incomplete remote sensor reconstruction. You give the orders but the team do the fighting. You decide who to risk, where to hold and how much loot you really need. Make sure you know when to leave before your team have to pay too high a price.</p>
      <ol>
        <li><b>Deploy</b><span>A balanced four-person squad is ready.</span></li>
        <li><b>Recover</b><span>Breach the site and secure at least one cache.</span></li>
        <li><b>Decide</b><span>Bank partial salvage or push deeper as contact pressure rises.</span></li>
      </ol>
      <div class="demo-intro-actions">
        <button class="warm-button" id="start-demo" type="button">BEGIN 3–4 MINUTE DEMO</button>
        <a href="./">OPEN FULL CAMPAIGN</a>
      </div>
      <span class="demo-note">Desktop · keyboard and mouse · no account required</span>
    </div>
  </section>
`;

const renderDeploymentPlanner = (
  offer: MissionOffer,
  available: PersonRecord[],
  selectedPeople: Set<string>,
  availableAmmo: number,
  demoStage: DemoDeploymentStage = "idle",
  demoSelectedPersonId: string | null = null,
  demoContinueReady = false,
  rosterSize = available.length,
): string => {
  const selected = available.filter((person) => selectedPeople.has(person.id));
  const demoFocus = available.find((person) => person.id === demoSelectedPersonId) ?? null;
  const demoRoleReason: Record<PersonRecord["role"], string> = {
    MEDIC: "medical support keeps the team standing",
    SCAVENGER: "specialist recovery gets the cache transferred faster",
    RANGER: "long-range cover controls the approach",
    ENGINEER: "technical skill and a carbine round out the team",
  };
  const continuePrompt = demoContinueReady && demoStage !== "linking"
    ? `<button class="demo-continue" id="demo-continue" type="button">CLICK OR PRESS SPACE TO CONTINUE</button>`
    : "";
  const ammoCost = selected.reduce((total, person) => total + deploymentAmmoCost(offer, person), 0);
  const missionProtocol = offer.kind === "rescue" ? "rescue" : offer.kind;
  const difference = selected.length - offer.protocolSquad;
  const squadProtocol = `Standard protocol suggests a team of ${offer.protocolSquad} for ${missionProtocol} missions. ${difference === 0 ? "Protocol strength selected." : difference < 0 ? `${Math.abs(difference)} fewer currently selected.` : `${difference} additional currently selected.`}`;
  const demoGuide = demoStage === "roster"
    ? `<div class="deployment-demo-guide" role="status" aria-live="polite"><small>YOUR ROSTER</small><b>This is your roster. You currently have ${rosterSize} survivors, but for this mission we're taking out a team of ${offer.protocolSquad}.</b>${continuePrompt}</div>`
    : demoStage === "selecting"
      ? `<div class="deployment-demo-guide" role="status" aria-live="polite"><small>SELECTING TEAM · ${selected.length}/${offer.protocolSquad}</small><b>${demoFocus ? `${escapeHtml(demoFocus.callsign)}: ${demoRoleReason[demoFocus.role]}.` : "A balanced team is being assigned to the mission."}</b>${continuePrompt}</div>`
      : demoStage === "linking"
        ? `<div class="deployment-demo-guide" role="status" aria-live="polite"><small>TEAM READY</small><b>${selected.length} survivors selected. Review the team, then click Establish Link.</b></div>`
        : "";
  return `
    <section class="deployment-overlay" tabindex="-1">
      <div class="deployment-dialog ${demoStage !== "idle" ? `demo-auto-deploy stage-${demoStage}` : ""}">
        <header><span><small>ROLLING DEPLOYMENT</small><strong>${escapeHtml(offer.title)}</strong></span>${demoGuide}<button id="close-planner" type="button" ${demoStage !== "idle" ? "disabled" : ""}>×</button></header>
        <div class="deployment-brief">
          <span><small>LOCATION</small><b>${escapeHtml(offer.location)}</b></span>
          <span><small>OBJECTIVE</small><b>${escapeHtml(offer.objective)}</b></span>
          <span><small>RISK</small><b class="risk-text-${offer.risk.toLowerCase()}">${offer.risk}${offer.permadeath ? " · PERMANENT LOSS POSSIBLE" : ""}</b></span>
          <p>${escapeHtml(offer.brief)}</p>
        </div>
        <div class="deployment-roster">
          ${available.map((person) => `
            <button class="deployment-person ${selectedPeople.has(person.id) ? "selected" : ""} ${person.id === demoSelectedPersonId ? "demo-selected-now" : ""}" data-person="${person.id}" type="button" aria-pressed="${selectedPeople.has(person.id)}" ${demoStage !== "idle" ? "disabled" : ""}>
              <span class="deployment-avatar">${person.callsign.slice(0, 1)}</span>
              <span><b>${escapeHtml(person.name)}</b><small>${person.tier.toUpperCase()} · ${person.role}</small><i>${person.weapon.toUpperCase()} · ${assignmentLabels[person.assignment]}</i></span>
              <span class="deployment-status ${person.injuries.length ? "injured" : ""}"><b>${selectedPeople.has(person.id) ? "SELECTED · " : ""}${conditionLabel(person)}</b><small>${deploymentAmmoCost(offer, person)} AMMO</small></span>
            </button>
          `).join("")}
        </div>
        <footer>
          <div><small>DEPLOYMENT PROTOCOL</small><b>${squadProtocol}</b></div>
          <div><small>DEPLOYMENT AMMUNITION</small><b class="${ammoCost > availableAmmo ? "insufficient" : ""}">${ammoCost} / ${availableAmmo}</b></div>
          <button class="warm-button" id="launch-operation" type="button" ${selected.length === 0 || ammoCost > availableAmmo || (demoStage !== "idle" && demoStage !== "linking") ? "disabled" : ""}>ESTABLISH LINK</button>
        </footer>
      </div>
    </section>
  `;
};
