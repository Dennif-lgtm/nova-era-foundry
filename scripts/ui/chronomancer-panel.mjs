import { MODULE_ID } from "../constants.mjs";

const LAWS = ["Precedência", "Atraso", "Repetição", "Continuidade", "Ruptura"];
const CATEGORIES = ["Fundamento", "Disciplina", "Grande Teoria", "Paradoxo"];
const ICONS = ["fa-bolt", "fa-hourglass-half", "fa-repeat", "fa-shield-halved", "fa-burst"];

function isNovaEraChronomancer(actor) {
  return actor?.items?.some(item => item.type === "class" && item.system.identifier === "cronomante-nova-era");
}

function sheetRoot(app, html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (app.element instanceof HTMLElement) return app.element;
  if (app.element?.[0] instanceof HTMLElement) return app.element[0];
  return null;
}

function temporalMaximum(actor) {
  const proficiency = Number(actor.system?.attributes?.prof ?? 0);
  const intelligence = Number(actor.system?.abilities?.int?.mod ?? 0);
  return Math.max(1, proficiency + intelligence);
}

function interventionData(item) {
  const description = item.system?.description?.value ?? "";
  const heading = description.match(/<strong>(.*?)<\/strong>/i)?.[1] ?? "";
  const fields = heading.split("•").map(part => part.trim());
  const cost = Number(fields.find(part => /\d+\s*PT/i.test(part))?.match(/\d+/)?.[0] ?? 0);
  const category = CATEGORIES.find(value => fields.some(part => part.includes(value))) ?? "Fundamento";
  const laws = LAWS.filter(value => fields.some(part => part.includes(value)));
  const execution = fields.find(part => /Ação|Reação|Sem ação/i.test(part)) ?? "Intervenção";
  return { cost, category, laws, execution };
}

function actorInterventions(actor) {
  return actor.items
    .filter(item => String(item.getFlag(MODULE_ID, "contentKey") ?? "").startsWith("crono-intervencao-"))
    .map(item => ({ item, ...interventionData(item) }));
}

function treatiseName(actor) {
  return actor.items.find(item => item.type === "subclass" && item.system.classIdentifier === "cronomante-nova-era")?.name
    ?? "Tratado não escolhido";
}

function state(actor) {
  const maximum = temporalMaximum(actor);
  const stored = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
  return {
    maximum,
    points: Math.clamp(Number(stored.points ?? maximum), 0, maximum),
    trail: LAWS.includes(stored.trail) ? stored.trail : "",
    confluences: Math.max(0, Number(stored.confluences ?? 0)),
    reaction: stored.reaction !== false
  };
}

async function updateState(actor, changes) {
  if (!actor.isOwner) return ui.notifications.warn("Nova Era: você não pode alterar os recursos desta ficha.");
  const current = state(actor);
  const next = { ...current, ...changes };
  next.points = Math.max(0, Math.min(current.maximum, Number(next.points)));
  next.confluences = Math.max(0, Number(next.confluences));
  await actor.setFlag(MODULE_ID, "chronomancerState", next);
  Hooks.callAll("novaEraChronomancerChanged", actor);
}

async function postIntervention(actor, item, data) {
  if (typeof item.use === "function") {
    try {
      await item.use();
      return;
    } catch (error) {
      console.debug(`${MODULE_ID} | Item.use indisponível para ${item.name}`, error);
    }
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<section class="nova-era chronomancer-chat"><h2>${item.name}</h2><p><strong>${data.cost} PT • ${data.execution}</strong></p>${item.system?.description?.value ?? ""}</section>`
  });
}

async function activateIntervention(actor, entry) {
  const current = state(actor);
  if (current.points < entry.cost) {
    ui.notifications.warn(`Nova Era: ${entry.item.name} exige ${entry.cost} PT.`);
    return;
  }
  const law = entry.laws[0] ?? "";
  const confluence = Boolean(current.trail && law && current.trail !== law);
  await updateState(actor, {
    points: current.points - entry.cost,
    trail: law || current.trail,
    confluences: current.confluences + (confluence ? 1 : 0),
    reaction: /Reação/i.test(entry.execution) ? false : current.reaction
  });
  if (confluence) ui.notifications.info(`Nova Era: Confluência entre ${current.trail} e ${law}.`);
  await postIntervention(actor, entry.item, entry);
}

function interventionButtons(entries) {
  return entries.slice(0, 12).map((entry, index) => {
    const angle = index * (360 / Math.max(entries.length, 1));
    return `<button type="button" class="ne-crono-intervention" style="--angle:${angle}deg" data-item-id="${entry.item.id}" title="${entry.item.name} — ${entry.cost} PT">
      <i class="fa-solid ${ICONS[index % ICONS.length]}"></i><span>${entry.item.name}</span><small>${entry.cost} PT</small>
    </button>`;
  }).join("");
}

function createPanel(actor) {
  const entries = actorInterventions(actor);
  const panel = document.createElement("section");
  panel.className = "nova-era chronomancer-panel";
  panel.dataset.actorUuid = actor.uuid;
  panel.innerHTML = `
    <div class="ne-crono-clock">
      <header class="ne-crono-title"><i class="fa-solid fa-clock"></i><strong>Nova Era — Cronomante</strong></header>
      <div class="ne-crono-category-ring" aria-hidden="true">
        <span>Fundamentos</span><span>Disciplinas</span><span>Grandes Teorias</span><span>Paradoxos</span>
      </div>
      <div class="ne-crono-intervention-ring">${interventionButtons(entries)}</div>
      <div class="ne-crono-resource-ring">
        <button type="button" data-action="points-minus" aria-label="Gastar um Ponto Temporal"><i class="fa-solid fa-minus"></i></button>
        <div class="ne-crono-core"><small>Pontos Temporais</small><strong data-role="points">0 / 0</strong></div>
        <button type="button" data-action="points-plus" aria-label="Recuperar um Ponto Temporal"><i class="fa-solid fa-plus"></i></button>
      </div>
      <div class="ne-crono-trail">
        <span>Rastro</span>
        <div>${LAWS.map((law, index) => `<button type="button" data-action="trail" data-law="${law}" title="${law}"><i class="fa-solid ${ICONS[index]}"></i></button>`).join("")}</div>
        <button type="button" data-action="trail-clear" class="ne-crono-clear" title="Limpar Rastro"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="ne-crono-confluence"><small>Confluências</small><strong data-role="confluences">0</strong><button type="button" data-action="confluence-clear" title="Zerar Confluências"><i class="fa-solid fa-rotate-left"></i></button></div>
      <footer>
        <button type="button" data-action="open-treatise"><i class="fa-solid fa-book-open"></i><span data-role="treatise"></span></button>
        <button type="button" data-action="reaction" class="ne-crono-reaction"><i class="fa-solid fa-hourglass"></i><span data-role="reaction"></span></button>
      </footer>
    </div>
    <p class="ne-crono-empty" ${entries.length ? "hidden" : ""}>Arraste suas Intervenções da pasta Nova Era — Cronomante para esta ficha.</p>`;

  panel.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;
    event.preventDefault();
    const current = state(actor);
    const action = button.dataset.action;
    if (button.dataset.itemId) {
      const entry = entries.find(value => value.item.id === button.dataset.itemId);
      if (entry) await activateIntervention(actor, entry);
    } else if (action === "points-minus") await updateState(actor, { points: current.points - 1 });
    else if (action === "points-plus") await updateState(actor, { points: current.points + 1 });
    else if (action === "trail") {
      const confluence = Boolean(current.trail && current.trail !== button.dataset.law);
      await updateState(actor, { trail: button.dataset.law, confluences: current.confluences + (confluence ? 1 : 0) });
    } else if (action === "trail-clear") await updateState(actor, { trail: "" });
    else if (action === "confluence-clear") await updateState(actor, { confluences: 0 });
    else if (action === "reaction") await updateState(actor, { reaction: !current.reaction });
    else if (action === "open-treatise") {
      actor.items.find(item => item.type === "subclass" && item.system.classIdentifier === "cronomante-nova-era")?.sheet?.render(true);
    }
  });
  refreshPanel(panel, actor);
  return panel;
}

function refreshPanel(panel, actor) {
  const current = state(actor);
  panel.querySelector("[data-role='points']").textContent = `${current.points} / ${current.maximum}`;
  panel.querySelector("[data-role='confluences']").textContent = current.confluences;
  panel.querySelector("[data-role='treatise']").textContent = treatiseName(actor);
  panel.querySelector("[data-role='reaction']").textContent = current.reaction ? "Reação Temporal disponível" : "Reação Temporal utilizada";
  panel.querySelector("[data-action='reaction']").classList.toggle("active", current.reaction);
  panel.querySelector("[data-action='points-minus']").disabled = current.points <= 0;
  panel.querySelector("[data-action='points-plus']").disabled = current.points >= current.maximum;
  for (const button of panel.querySelectorAll("[data-action='trail']")) button.classList.toggle("active", button.dataset.law === current.trail);
}

function expandSheet(app, root) {
  const windowElement = root.closest(".application, .window-app") ?? root;
  if (windowElement.dataset.novaEraChronomancerExpanded === "true") return;
  windowElement.dataset.novaEraChronomancerExpanded = "true";
  const currentWidth = windowElement.getBoundingClientRect().width;
  const width = Math.min(currentWidth + 540, Math.max(currentWidth, window.innerWidth - 24));
  if (width <= currentWidth + 10 || typeof app.setPosition !== "function") return;
  const left = Math.max(12, (app.position?.left ?? windowElement.getBoundingClientRect().left) - ((width - currentWidth) / 2));
  app.setPosition({ width, left });
}

function renderChronomancerPanel(app, html) {
  const actor = app.actor ?? app.document;
  if (!isNovaEraChronomancer(actor)) return;
  const root = sheetRoot(app, html);
  if (!root || root.querySelector(".nova-era.chronomancer-panel")) return;
  const windowElement = root.closest(".application, .window-app") ?? root;
  windowElement.classList.add("nova-era-chronomancer-sheet");
  const panel = createPanel(actor);
  const mainContent = root.querySelector(".sheet-body .main-content");
  if (mainContent) {
    mainContent.classList.add("nova-era-has-chronomancer-panel");
    mainContent.prepend(panel);
    expandSheet(app, root);
  } else root.querySelector(".sheet-body, [data-application-part='body'], .tab-body")?.prepend(panel);
}

export function refreshChronomancerPanels() {
  for (const panel of document.querySelectorAll(".nova-era.chronomancer-panel")) {
    const actor = fromUuidSync(panel.dataset.actorUuid);
    if (actor) refreshPanel(panel, actor);
  }
}

export function registerChronomancerPanel() {
  for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderActorSheet5eCharacter", "renderActorSheet5eCharacter2"]) {
    Hooks.on(hook, renderChronomancerPanel);
  }
  Hooks.on("novaEraChronomancerChanged", refreshChronomancerPanels);
  Hooks.on("updateActor", refreshChronomancerPanels);
  Hooks.on("createItem", refreshChronomancerPanels);
  Hooks.on("deleteItem", refreshChronomancerPanels);
  Hooks.on("updateCombat", refreshChronomancerPanels);
}
