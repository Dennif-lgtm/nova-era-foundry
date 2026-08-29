import { EXPOSURE_MAX, MODULE_ID } from "../constants.mjs";
import { ExposureStore } from "../exposure/exposure-store.mjs";
import {
  requestSneakAttack,
  hasTechnicalExploitation,
  sneakAttackDice,
  sneakAttackUsedThisTurn
} from "../exposure/sneak-attack.mjs";
import {
  canUseBlindSpot,
  canUseDecipheredStrike,
  hasCalculatedEvasion,
  hasCompleteReading,
  hasDecipheredStrike,
  pendingTestBlade,
  requestTestBlade,
  useBlindSpot,
  useDecipheredStrike
} from "../features/base-features.mjs";
import {
  canNoticeError,
  canUseAnticipation,
  canUseCalculatedEvasion,
  canUseFatalFlaw,
  canUseFirstImpression,
  completeReadingState,
  useAnticipation,
  useCalculatedEvasion,
  useFatalFlaw,
  useFirstImpression,
  useNoticedError
} from "../features/advanced-base-features.mjs";
import {
  prepareAnticipationArmor,
  prepareAnticipationSave,
  prepareReadingAttack,
  prepareReadingSave
} from "../features/secondary-effects.mjs";
import {
  abandonPrey,
  choosePrey,
  maintainPressure,
  prepareMortalPatience,
  recycleExposure,
  trackerState,
  toggleGhostForm,
  useFade,
  useMortalBreach,
  usePersistentHunt,
  usePressureDamage,
  useUnreachablePresence
} from "../features/subclass-features.mjs";

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
  const testBladeButton = panel.querySelector("[data-action='test-blade']");
  const blindSpotButtons = [...panel.querySelectorAll("[data-action^='blind-spot-']")];
  const decipheredButton = panel.querySelector("[data-action='deciphered-strike']");
  const evasionStatus = panel.querySelector("[data-role='calculated-evasion']");
  const readingStatus = panel.querySelector("[data-role='complete-reading']");
  const evasionButton = panel.querySelector("[data-action='calculated-evasion']");
  const readingControls = panel.querySelector("[data-role='reading-controls']");
  const anticipationControls = panel.querySelector("[data-role='anticipation-controls']");
  const firstImpressionButton = panel.querySelector("[data-action='first-impression']");
  const noticedErrorButton = panel.querySelector("[data-action='noticed-error']");
  const fatalFlawButton = panel.querySelector("[data-action='fatal-flaw']");
  const ghostControls = panel.querySelector("[data-role='ghost-controls']");
  const assassinControls = panel.querySelector("[data-role='assassin-controls']");
  const trackerControls = panel.querySelector("[data-role='tracker-controls']");
  targetLabel.textContent = target?.name ?? "Selecione exatamente um alvo";
  pipLabel.textContent = pips;
  pipLabel.setAttribute("aria-label", `${value} de ${EXPOSURE_MAX} Exposições`);
  analyzeButton.disabled = !target;
  sneakDice.textContent = `${sneakAttackDice(actor)}d6`;
  sneakButton.disabled = !target || value < 1 || sneakUsed;
  sneakButton.title = sneakUsed
    ? "Ataque Furtivo já usado neste turno"
    : value < 1 ? "O alvo precisa possuir ao menos 1 Exposição" : "Passivo: não consome Exposição";
  techniqueControls.hidden = !hasTechnicalExploitation(actor);
  techniqueButton.disabled = !target || value < 2 || sneakUsed;
  techniqueButton.title = sneakUsed
    ? "Ataque Furtivo já usado neste turno"
    : value < 2 ? "O alvo precisa possuir ao menos 2 Exposições" : "Consome 2 Exposições";
  testBladeButton.hidden = !pendingTestBlade(actor, target);
  const hasBlindSpot = actor.items.some(item => item.getFlag(MODULE_ID, "contentKey") === "ponto-cego");
  for (const button of blindSpotButtons) {
    button.hidden = !hasBlindSpot;
    button.disabled = !canUseBlindSpot(actor);
  }
  decipheredButton.hidden = !hasDecipheredStrike(actor);
  decipheredButton.disabled = !canUseDecipheredStrike(actor, target);
  evasionStatus.hidden = !hasCalculatedEvasion(actor);
  evasionStatus.classList.toggle("active", hasCalculatedEvasion(actor));
  readingStatus.hidden = !hasCompleteReading(actor);
  readingStatus.classList.toggle("active", completeReadingState(actor, target));
  evasionButton.hidden = !hasCalculatedEvasion(actor);
  evasionButton.disabled = !canUseCalculatedEvasion(actor, target);
  readingControls.hidden = !completeReadingState(actor, target);
  anticipationControls.hidden = !actor.items.some(item => item.getFlag(MODULE_ID, "contentKey") === "antecipacao");
  for (const button of anticipationControls.querySelectorAll("button")) button.disabled = !canUseAnticipation(actor, target);
  const hasPredator = actor.items.some(item => item.getFlag(MODULE_ID, "contentKey") === "olhar-predador");
  firstImpressionButton.hidden = !hasPredator;
  firstImpressionButton.disabled = !canUseFirstImpression(actor, target);
  noticedErrorButton.hidden = !hasPredator;
  noticedErrorButton.disabled = !canNoticeError(actor, target);
  fatalFlawButton.hidden = !hasPredator;
  fatalFlawButton.disabled = !canUseFatalFlaw(actor, target);
  ghostControls.hidden = !actor.items.some(item => item.getFlag(MODULE_ID, "contentKey") === "entre-olhares");
  assassinControls.hidden = !actor.items.some(item => item.getFlag(MODULE_ID, "contentKey") === "brecha-mortal");
  trackerControls.hidden = !actor.items.some(item => item.getFlag(MODULE_ID, "contentKey") === "instinto-caca");
  const hunt = trackerState(actor, target);
  panel.querySelector("[data-role='pressure']").textContent = `Pressão ${hunt.pressure}`;
  panel.querySelector("[data-action='choose-prey']").disabled = !target || value < 1;
  panel.querySelector("[data-action='pressure-damage']").disabled = !hunt.isPrey || hunt.pressure < 1;
  panel.querySelector("[data-action='persistent-hunt']").disabled = !hunt.isPrey;
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
      <button type="button" data-action="test-blade" class="feature-button" hidden>
        <i class="fa-solid fa-khanda" aria-hidden="true"></i> Lâmina de Teste · +1
      </button>
      <button type="button" data-action="sneak-attack" class="sneak-attack-button">
        <i class="fa-solid fa-burst" aria-hidden="true"></i>
        <span>Ataque Furtivo</span>
        <small><span data-role="sneak-dice">1d6</span> · passivo · 0 Exposição</small>
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
      <button type="button" data-action="blind-spot-hide" class="feature-button" hidden>
        <i class="fa-solid fa-user-ninja" aria-hidden="true"></i> Ponto Cego · Hide
      </button>
      <button type="button" data-action="blind-spot-disengage" class="feature-button" hidden>
        <i class="fa-solid fa-person-walking-arrow-right" aria-hidden="true"></i> Ponto Cego · Disengage
      </button>
      <button type="button" data-action="deciphered-strike" class="feature-button" hidden>
        <i class="fa-solid fa-crosshairs" aria-hidden="true"></i> Golpe Decifrado · +2d6
      </button>
      <button type="button" data-action="calculated-evasion" class="feature-button" hidden>
        <i class="fa-solid fa-person-running" aria-hidden="true"></i> Resolver Evasão
      </button>
      <div data-role="reading-controls" class="rule-reminder" hidden>
        <strong>Leitura Completa ativa</strong>
        <small>Primeiro ataque do turno: +2 · Resistências provocadas pelo alvo: +2 · O alvo não recebe Vantagem contra você.</small>
        <button type="button" data-action="reading-attack">Preparar ataque · +2</button>
        <button type="button" data-action="reading-save">Preparar resistência · +2</button>
      </div>
      <div data-role="anticipation-controls" class="advanced-controls" hidden>
        <strong>Antecipação · Reação</strong>
        <button type="button" data-action="anticipate-attack">Golpe · +4 CA</button>
        <button type="button" data-action="anticipate-movement">Movimento · metade</button>
        <button type="button" data-action="anticipate-technique">Técnica · +4 resistência</button>
      </div>
      <button type="button" data-action="first-impression" class="feature-button" hidden>Primeira Impressão · Analisar</button>
      <button type="button" data-action="noticed-error" class="feature-button" hidden>Nenhum Erro Passa Despercebido · +1</button>
      <button type="button" data-action="fatal-flaw" class="feature-button danger" hidden>Falha Fatal · −3</button>
      <div data-role="ghost-controls" class="advanced-controls" hidden>
        <strong>Fantasma</strong>
        <button type="button" data-action="unreachable-presence">Presença Inalcançável</button>
        <button type="button" data-action="fade">Desvanecer</button>
        <button type="button" data-action="ghost-form">Forma Fantasma</button>
      </div>
      <div data-role="assassin-controls" class="advanced-controls" hidden>
        <strong>Assassino</strong>
        <button type="button" data-action="mortal-breach-1">Brecha Mortal · −1</button>
        <button type="button" data-action="mortal-breach-2">Brecha Mortal · −2</button>
        <button type="button" data-action="mortal-patience">Paciência Mortal</button>
      </div>
      <div data-role="tracker-controls" class="advanced-controls" hidden>
        <strong>Rastreador · <span data-role="pressure">Pressão 0</span></strong>
        <button type="button" data-action="choose-prey">Escolher Presa</button>
        <button type="button" data-action="pressure-damage">Dano de Pressão</button>
        <button type="button" data-action="persistent-hunt">Caçada Persistente</button>
        <button type="button" data-action="maintain-pressure">Manter Pressão</button>
        <button type="button" data-action="recycle-exposure">Leitura Incansável</button>
        <button type="button" data-action="abandon-prey">Abandonar Presa</button>
      </div>
      <div class="passive-statuses">
        <span data-role="calculated-evasion" hidden><i class="fa-solid fa-person-running"></i> Evasão</span>
        <span data-role="complete-reading" hidden><i class="fa-solid fa-eye"></i> Leitura Completa</span>
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
  panel.querySelector("[data-action='test-blade']").addEventListener("click", async event => {
    event.preventDefault();
    await requestTestBlade(actor, selectedTarget());
  });
  panel.querySelector("[data-action='blind-spot-hide']").addEventListener("click", async event => {
    event.preventDefault();
    await useBlindSpot(actor, "hide");
  });
  panel.querySelector("[data-action='blind-spot-disengage']").addEventListener("click", async event => {
    event.preventDefault();
    await useBlindSpot(actor, "disengage");
  });
  panel.querySelector("[data-action='deciphered-strike']").addEventListener("click", async event => {
    event.preventDefault();
    await useDecipheredStrike(actor, selectedTarget());
  });
  panel.querySelector("[data-action='calculated-evasion']").addEventListener("click", async event => {
    event.preventDefault();
    await useCalculatedEvasion(actor, selectedTarget());
  });
  panel.querySelector("[data-action='reading-attack']").addEventListener("click", async event => {
    event.preventDefault();
    await prepareReadingAttack(actor, selectedTarget());
  });
  panel.querySelector("[data-action='reading-save']").addEventListener("click", async event => {
    event.preventDefault();
    await prepareReadingSave(actor, selectedTarget());
  });
  panel.querySelector("[data-action='anticipate-attack']").addEventListener("click", async event => {
    event.preventDefault();
    const target = selectedTarget();
    if (await useAnticipation(actor, target, "attack")) await prepareAnticipationArmor(actor, target);
  });
  panel.querySelector("[data-action='anticipate-movement']").addEventListener("click", async event => {
    event.preventDefault();
    await useAnticipation(actor, selectedTarget(), "movement");
  });
  panel.querySelector("[data-action='anticipate-technique']").addEventListener("click", async event => {
    event.preventDefault();
    const target = selectedTarget();
    if (await useAnticipation(actor, target, "technique")) await prepareAnticipationSave(actor, target);
  });
  panel.querySelector("[data-action='first-impression']").addEventListener("click", async event => {
    event.preventDefault();
    await useFirstImpression(actor, selectedTarget());
  });
  panel.querySelector("[data-action='noticed-error']").addEventListener("click", async event => {
    event.preventDefault();
    await useNoticedError(actor, selectedTarget());
  });
  panel.querySelector("[data-action='fatal-flaw']").addEventListener("click", async event => {
    event.preventDefault();
    await useFatalFlaw(actor, selectedTarget());
  });
  panel.querySelector("[data-action='unreachable-presence']").addEventListener("click", async event => {
    event.preventDefault();
    await useUnreachablePresence(actor, selectedTarget());
  });
  panel.querySelector("[data-action='fade']").addEventListener("click", async event => {
    event.preventDefault();
    await useFade(actor, selectedTarget());
  });
  panel.querySelector("[data-action='ghost-form']").addEventListener("click", async event => {
    event.preventDefault();
    await toggleGhostForm(actor);
  });
  panel.querySelector("[data-action='mortal-breach-1']").addEventListener("click", async event => {
    event.preventDefault();
    await useMortalBreach(actor, selectedTarget(), 1);
  });
  panel.querySelector("[data-action='mortal-breach-2']").addEventListener("click", async event => {
    event.preventDefault();
    await useMortalBreach(actor, selectedTarget(), 2);
  });
  panel.querySelector("[data-action='mortal-patience']").addEventListener("click", async event => {
    event.preventDefault();
    await prepareMortalPatience(actor, selectedTarget());
  });
  panel.querySelector("[data-action='choose-prey']").addEventListener("click", async event => {
    event.preventDefault();
    await choosePrey(actor, selectedTarget());
  });
  panel.querySelector("[data-action='pressure-damage']").addEventListener("click", async event => {
    event.preventDefault();
    await usePressureDamage(actor, selectedTarget());
  });
  panel.querySelector("[data-action='persistent-hunt']").addEventListener("click", async event => {
    event.preventDefault();
    await usePersistentHunt(actor, selectedTarget());
  });
  panel.querySelector("[data-action='maintain-pressure']").addEventListener("click", async event => {
    event.preventDefault();
    await maintainPressure(actor, selectedTarget());
  });
  panel.querySelector("[data-action='recycle-exposure']").addEventListener("click", async event => {
    event.preventDefault();
    await recycleExposure(actor, selectedTarget());
  });
  panel.querySelector("[data-action='abandon-prey']").addEventListener("click", async event => {
    event.preventDefault();
    await abandonPrey(actor);
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
  const windowElement = root.closest(".application, .window-app") ?? root;
  windowElement.classList.add("nova-era-rogue-sheet");
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
  Hooks.on("novaEraBaseFeatureChanged", refreshExposurePanels);
  Hooks.on("novaEraSubclassChanged", refreshExposurePanels);
}
