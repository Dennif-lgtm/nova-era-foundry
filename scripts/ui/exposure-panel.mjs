import { EXPOSURE_MAX, MODULE_ID } from "../constants.mjs";
import { ExposureStore } from "../exposure/exposure-store.mjs";
import {
  requestSneakAttack,
  hasTechnicalExploitation,
  sneakAttackDice,
  sneakAttackUsedThisTurn
} from "../exposure/sneak-attack.mjs";

function isNovaEraRogue(actor) {
  return actor?.items?.some(item => item.type === "class" && item.system.identifier === "ladino-nova-era");
}

function selectedTarget() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0].actor : null;
}

function activityFor(actor) {
  const exposure = actor.items.find(item => item.getFlag(MODULE_ID, "contentKey") === "exposicao");
  return exposure?.system.activities?.find(activity => activity.name === "Analisar") ?? null;
}

function sheetRoot(app, html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (app.element instanceof HTMLElement) return app.element;
  if (app.element?.[0] instanceof HTMLElement) return app.element[0];
  return null;
}

function panelState(actor) {
  const target = selectedTarget();
  const value = target ? ExposureStore.get(target, actor) : 0;
  return {
    target,
    value,
    pips: `${"●".repeat(value)}${"○".repeat(EXPOSURE_MAX - value)}`
  };
}

function refreshPanel(panel, actor) {
  const { target, value, pips } = panelState(actor);
  const targetLabel = panel.querySelector("[data-role='target']");
  const pipLabel = panel.querySelector("[data-role='pips']");
  const analyzeButton = panel.querySelector("[data-action='analyze']");
  const sneakButton = panel.querySelector("[data-action='sneak-attack']");
  const sneakDice = panel.querySelector("[data-role='sneak-dice']");
  const techniqueControls = panel.querySelector("[data-role='technique-controls']");
  const techniqueButton = panel.querySelector("[data-action='technical-exploitation']");
  const sneakUsed = sneakAttackUsedThisTurn(actor);
  targetLabel.textContent = target?.name ?? "Selecione exatamente um alvo";
  pipLabel.textContent = pips;
  pipLabel.setAttribute("aria-label", `${value} de ${EXPOSURE_MAX} Exposições`);
  analyzeButton.disabled = !target;
  sneakDice.textContent = `${sneakAttackDice(actor)}d6`;
  sneakButton.disabled = !target || value < 1 || sneakUsed;
  sneakButton.title = sneakUsed
    ? "Ataque Furtivo já usado neste turno"
    : value < 1 ? "O alvo precisa possuir ao menos 1 Exposição" : "Consome 1 Exposição";
  techniqueControls.hidden = !hasTechnicalExploitation(actor);
  techniqueButton.disabled = !target || value < 2 || sneakUsed;
  techniqueButton.title = sneakUsed
    ? "Ataque Furtivo já usado neste turno"
    : value < 2 ? "O alvo precisa possuir ao menos 2 Exposições" : "Consome 2 Exposições";
}

function createPanel(actor) {
  const panel = document.createElement("section");
  panel.className = "nova-era exposure-panel";
  panel.dataset.actorUuid = actor.uuid;
  panel.innerHTML = `
    <div class="exposure-panel-heading">
      <strong>Nova Era — Exposição</strong>
      <span data-role="pips" class="exposure-pips" aria-live="polite">○○○</span>
    </div>
    <div class="exposure-panel-controls">
      <span class="exposure-target"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i> <span data-role="target"></span></span>
      <button type="button" data-action="analyze"><i class="fa-solid fa-eye" aria-hidden="true"></i> Analisar</button>
      <button type="button" data-action="sneak-attack" class="sneak-attack-button">
        <i class="fa-solid fa-burst" aria-hidden="true"></i>
        <span>Ataque Furtivo</span>
        <small><span data-role="sneak-dice">1d6</span> · −1 Exposição</small>
      </button>
      <div data-role="technique-controls" class="technique-controls" hidden>
        <label for="nova-era-technique-${actor.id}">Exploração Técnica</label>
        <select id="nova-era-technique-${actor.id}" data-role="technique">
          <option value="perfuracao-precisa">Perfuração Precisa</option>
          <option value="quebra-ritmo">Quebra de Ritmo</option>
          <option value="corte-passo">Corte de Passo</option>
        </select>
        <button type="button" data-action="technical-exploitation">
          <i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i> Usar Técnica · −2
        </button>
      </div>
    </div>`;

  panel.querySelector("[data-action='analyze']").addEventListener("click", async event => {
    event.preventDefault();
    const activity = activityFor(actor);
    if (!activity) {
      ui.notifications.warn("Nova Era: a atividade Analisar não foi encontrada na habilidade Exposição.");
      return;
    }
    await activity.use();
  });
  panel.querySelector("[data-action='sneak-attack']").addEventListener("click", async event => {
    event.preventDefault();
    await requestSneakAttack(actor, selectedTarget());
  });
  panel.querySelector("[data-action='technical-exploitation']").addEventListener("click", async event => {
    event.preventDefault();
    const techniqueId = panel.querySelector("[data-role='technique']").value;
    await requestSneakAttack(actor, selectedTarget(), techniqueId);
  });
  refreshPanel(panel, actor);
  return panel;
}

function expandSheet(app, root) {
  const windowElement = root.closest(".application, .window-app") ?? root;
  if (windowElement.dataset.novaEraExpanded === "true") return;
  windowElement.dataset.novaEraExpanded = "true";
  const currentWidth = windowElement.getBoundingClientRect().width;
  const maximumWidth = Math.max(currentWidth, window.innerWidth - 24);
  const width = Math.min(currentWidth + 190, maximumWidth);
  if (width <= currentWidth + 10 || typeof app.setPosition !== "function") return;
  const currentLeft = app.position?.left ?? windowElement.getBoundingClientRect().left;
  const left = Math.max(12, currentLeft - ((width - currentWidth) / 2));
  app.setPosition({ width, left });
}

function renderExposurePanel(app, html) {
  const actor = app.actor ?? app.document;
  if (!isNovaEraRogue(actor)) return;
  const root = sheetRoot(app, html);
  if (!root || root.querySelector(".nova-era.exposure-panel")) return;
  const panel = createPanel(actor);
  const mainContent = root.querySelector(".sheet-body .main-content");
  if (mainContent) {
    mainContent.classList.add("nova-era-has-exposure-panel");
    mainContent.prepend(panel);
    expandSheet(app, root);
  } else {
    const anchor = root.querySelector(".sheet-body, [data-application-part='body'], .tab-body");
    if (anchor) anchor.before(panel);
    else root.prepend(panel);
  }
}

export function refreshExposurePanels() {
  for (const panel of document.querySelectorAll(".nova-era.exposure-panel")) {
    const actor = fromUuidSync(panel.dataset.actorUuid);
    if (actor) refreshPanel(panel, actor);
  }
}

export function registerExposurePanel() {
  const hooks = [
    "renderActorSheet",
    "renderActorSheetV2",
    "renderActorSheet5eCharacter",
    "renderActorSheet5eCharacter2"
  ];
  for (const hook of hooks) Hooks.on(hook, renderExposurePanel);
  Hooks.on("targetToken", refreshExposurePanels);
  Hooks.on("novaEraExposureChanged", refreshExposurePanels);
  Hooks.on("novaEraSneakAttackUsed", refreshExposurePanels);
  Hooks.on("updateActor", refreshExposurePanels);
  Hooks.on("updateCombat", refreshExposurePanels);
}
