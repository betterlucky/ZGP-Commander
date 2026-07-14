import { deploymentAmmoCost, type Campaign } from "../campaign/campaign";
import type { CampaignStore } from "../campaign/store";
import type { BaseAssignment, Deployment, EndDayReport, MissionOffer, PersonRecord } from "../campaign/types";

interface BaseScreenHandlers {
  onLaunch(deployment: Deployment): void;
  onResume(deployment: Deployment): void;
  onReset(): void;
}

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

export const mountBaseScreen = (
  root: HTMLElement,
  campaign: Campaign,
  store: CampaignStore,
  handlers: BaseScreenHandlers,
): void => {
  let selectedOfferId: string | null = null;
  const selectedPeople = new Set<string>();
  let notice = "Select an operation when you are ready. Base assignments remain provisional until the day ends.";

  const render = (): void => {
    const state = campaign.state;
    const active = campaign.activePeople();
    const available = campaign.availablePeople();
    const acted = new Set(state.actedPersonIds);
    const offers = campaign.availableOffers();
    const selectedOffer = offers.find((offer) => offer.id === selectedOfferId) ?? null;
    const injured = active.filter((person) => person.injuries.length > 0);
    const missing = state.people.filter((person) => person.campaignStatus === "mia");
    const dead = state.people.filter((person) => person.campaignStatus === "dead");
    const assignmentCount = (assignment: BaseAssignment): number => active.filter((person) => !acted.has(person.id) && person.assignment === assignment).length;

    root.innerHTML = `
      <main class="base-shell">
        <header class="base-topbar">
          <div class="base-brand"><span>HOLDFAST</span><small>OUTPOST COMMAND</small></div>
          <div class="cycle-readout"><small>OPERATIONAL CYCLE</small><strong>DAY ${state.day}</strong></div>
          <div class="resource-strip">
            <span><small>AMMUNITION</small><b>${state.resources.ammunition}${state.transit.ammunition ? `<i>+${state.transit.ammunition} TRANSIT</i>` : ""}</b></span>
            <span><small>MEDICAL</small><b>${state.resources.medical}${state.transit.medical ? `<i>+${state.transit.medical} TRANSIT</i>` : ""}</b></span>
            <span><small>MATERIALS</small><b>${state.resources.materials}${state.transit.materials ? `<i>+${state.transit.materials} TRANSIT</i>` : ""}</b></span>
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
              <article class="facility operations-room live"><span class="facility-code">OPS</span><strong>OPERATIONS</strong><small>${offers.length} opportunities · ${campaign.unresolvedOperations().length} live link</small><div class="signal-rings"></div></article>
              <article class="facility medical-room ${injured.length ? "attention" : ""}"><span class="facility-code">MED</span><strong>MEDICAL</strong><small>${injured.length} injured · ${assignmentCount("medical")} assigned</small><div class="bed-grid"><i></i><i></i><i></i></div></article>
              <article class="facility workshop-room"><span class="facility-code">WRK</span><strong>WORKSHOP</strong><small>${assignmentCount("workshop")} assigned · +${assignmentCount("workshop") * 3} materials</small><div class="work-sparks"></div></article>
              <article class="facility logistics-room"><span class="facility-code">LOG</span><strong>LOGISTICS</strong><small>${assignmentCount("logistics")} assigned · +${assignmentCount("logistics") * 5} ammo</small><div class="crate-stack"><i></i><i></i><i></i></div></article>
              <article class="facility quarters-room"><span class="facility-code">QTR</span><strong>QUARTERS</strong><small>${active.length} active · ${available.length} available</small><div class="person-dots">${active.slice(0, 16).map((person) => `<i class="tier-${person.tier}" title="${escapeHtml(person.name)}"></i>`).join("")}</div></article>
              <article class="facility memorial-room ${missing.length ? "attention" : ""}"><span class="facility-code">REC</span><strong>RECORDS</strong><small>${missing.length} MIA · ${dead.length} memorialised</small><div class="record-lines"></div></article>
              <svg class="base-connections" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><path d="M190 165 L500 150 L810 175 M500 150 L500 430 M190 430 L500 430 L810 420 M190 165 L190 430 M810 175 L810 420" /></svg>
            </div>
            <div class="command-footer">
              <p>${escapeHtml(notice)}</p>
              <div>
                <button class="quiet-button" id="upgrade-support" type="button" ${state.resources.materials < campaign.getSupportUpgradeCost() ? "disabled" : ""}>EXPAND SUPPORT +4 · ${campaign.getSupportUpgradeCost()} MAT</button>
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

        ${selectedOffer ? renderDeploymentPlanner(selectedOffer, available, selectedPeople, state.resources.ammunition) : ""}
      </main>
    `;

    bindEvents(selectedOffer);
  };

  const bindEvents = (selectedOffer: MissionOffer | null): void => {
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
    root.querySelector<HTMLButtonElement>("#launch-operation")?.addEventListener("click", () => {
      if (!selectedOffer) return;
      try {
        const deployment = campaign.deploy(selectedOffer.id, [...selectedPeople]);
        store.save(campaign);
        handlers.onLaunch(deployment);
      } catch (error) {
        notice = error instanceof Error ? error.message : "Deployment failed.";
        render();
      }
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
  };

  render();
};

const renderDeploymentPlanner = (
  offer: MissionOffer,
  available: PersonRecord[],
  selectedPeople: Set<string>,
  availableAmmo: number,
): string => {
  const selected = available.filter((person) => selectedPeople.has(person.id));
  const ammoCost = selected.reduce((total, person) => total + deploymentAmmoCost(offer, person), 0);
  const missionProtocol = offer.kind === "rescue" ? "rescue" : offer.kind;
  const difference = selected.length - offer.protocolSquad;
  const squadProtocol = `Standard protocol suggests a team of ${offer.protocolSquad} for ${missionProtocol} missions. ${difference === 0 ? "Protocol strength selected." : difference < 0 ? `${Math.abs(difference)} fewer currently selected.` : `${difference} additional currently selected.`}`;
  return `
    <section class="deployment-overlay">
      <div class="deployment-dialog">
        <header><span><small>ROLLING DEPLOYMENT</small><strong>${escapeHtml(offer.title)}</strong></span><button id="close-planner" type="button">×</button></header>
        <div class="deployment-brief">
          <span><small>LOCATION</small><b>${escapeHtml(offer.location)}</b></span>
          <span><small>OBJECTIVE</small><b>${escapeHtml(offer.objective)}</b></span>
          <span><small>RISK</small><b class="risk-text-${offer.risk.toLowerCase()}">${offer.risk}${offer.permadeath ? " · PERMANENT LOSS POSSIBLE" : ""}</b></span>
          <p>${escapeHtml(offer.brief)}</p>
        </div>
        <div class="deployment-roster">
          ${available.map((person) => `
            <button class="deployment-person ${selectedPeople.has(person.id) ? "selected" : ""}" data-person="${person.id}" type="button">
              <span class="deployment-avatar">${person.callsign.slice(0, 1)}</span>
              <span><b>${escapeHtml(person.name)}</b><small>${person.tier.toUpperCase()} · ${person.role}</small><i>${person.weapon.toUpperCase()} · ${assignmentLabels[person.assignment]}</i></span>
              <span class="deployment-status ${person.injuries.length ? "injured" : ""}"><b>${conditionLabel(person)}</b><small>${deploymentAmmoCost(offer, person)} AMMO</small></span>
            </button>
          `).join("")}
        </div>
        <footer>
          <div><small>DEPLOYMENT PROTOCOL</small><b>${squadProtocol}</b></div>
          <div><small>DEPLOYMENT AMMUNITION</small><b class="${ammoCost > availableAmmo ? "insufficient" : ""}">${ammoCost} / ${availableAmmo}</b></div>
          <button class="warm-button" id="launch-operation" type="button" ${selected.length === 0 || ammoCost > availableAmmo ? "disabled" : ""}>ESTABLISH GHOSTLINK</button>
        </footer>
      </div>
    </section>
  `;
};
