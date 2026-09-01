import { MODULE_ID } from "../constants.mjs";

const LAWS = ["Precedência", "Atraso", "Repetição", "Continuidade", "Ruptura"];
const CATEGORIES = ["Fundamento", "Disciplina", "Grande Teoria", "Paradoxo"];
const CATEGORY_LABELS = ["Fundamentos", "Disciplinas", "Grandes Teorias", "Paradoxos"];
const LAW_ICONS = ["fa-bolt", "fa-hourglass-half", "fa-repeat", "fa-shield-halved", "fa-burst"];
const CATEGORY_ICONS = ["fa-compass", "fa-gem", "fa-star", "fa-infinity"];
const TEMPORAL_VERSES = {
  "Precedência": [
    "Antes do gesto, a intenção. Antes do instante, minha vontade.",
    "O futuro ainda não chegou, mas já conhece o meu nome.",
    "Dou ao próximo segundo a ordem de nascer primeiro."
  ],
  "Atraso": [
    "Que o instante hesite e a consequência perca o caminho.",
    "Entre a causa e o efeito, imponho um horizonte sem fim.",
    "O tempo avança para todos — menos para aquilo que eu detenho."
  ],
  "Repetição": [
    "Se o destino falou uma vez, que responda novamente.",
    "Nenhum momento desaparece; alguns apenas esperam ser chamados.",
    "O eco recorda a possibilidade que o mundo tentou esquecer."
  ],
  "Continuidade": [
    "Permaneça. Ainda não concedi ao fim o direito de chegar.",
    "Enquanto minha memória sustentar o instante, nada se desfaz.",
    "A linha não se rompe onde minha vontade a mantém inteira."
  ],
  "Ruptura": [
    "Toda sequência possui uma fratura; eu apenas escolho onde tocar.",
    "Quebre-se o elo, e que a consequência jamais encontre sua causa.",
    "O inevitável é somente aquilo que ninguém ousou interromper."
  ],
  "Paradoxo": [
    "Hoje recordarei o amanhã que nunca aconteceu.",
    "Sou a testemunha de um instante que o próprio tempo negou.",
    "Quando todas as possibilidades são impossíveis, escolho a que permanece."
  ]
};

const openChronomancerClocks = new Map();

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
  return Math.max(1, Number(actor.system?.attributes?.prof ?? 0) + Number(actor.system?.abilities?.int?.mod ?? 0));
}

export function chronomancerInterventionData(item) {
  const description = item.system?.description?.value ?? item.description ?? "";
  const heading = description.match(/<strong>(.*?)<\/strong>/i)?.[1] ?? "";
  const fields = heading.split("•").map(part => part.trim());
  const cost = Number(fields.find(part => /\d+\s*PT/i.test(part))?.match(/\d+/)?.[0] ?? 0);
  const category = CATEGORIES.find(value => fields.some(part => part.includes(value))) ?? "Fundamento";
  const laws = LAWS.filter(value => fields.some(part => part.includes(value)));
  const execution = fields.find(part => /Ação|Reação|Sem ação/i.test(part)) ?? "Intervenção";
  const range = fields.find(part => part !== category && part !== execution && !/\d+\s*PT/i.test(part) && !LAWS.some(law => part.includes(law))) ?? "";
  return { cost, category, laws, execution, range };
}

function actorInterventions(actor) {
  return actor.items
    .filter(item => String(item.getFlag(MODULE_ID, "contentKey") ?? "").startsWith("crono-intervencao-"))
    .map(item => ({ item, ...chronomancerInterventionData(item) }))
    .sort((left, right) => left.item.name.localeCompare(right.item.name, "pt-BR"));
}

function treatise(actor) {
  return actor.items.find(item => item.type === "subclass" && item.system.classIdentifier === "cronomante-nova-era") ?? null;
}

export function chronomancerState(actor) {
  const maximum = temporalMaximum(actor);
  const stored = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
  return {
    maximum,
    points: Math.max(0, Math.min(maximum, Number(stored.points ?? maximum))),
    trail: LAWS.includes(stored.trail) ? stored.trail : "",
    confluences: Math.max(0, Number(stored.confluences ?? 0)),
    reaction: stored.reaction !== false
  };
}

export async function updateChronomancerState(actor, changes) {
  if (!actor.isOwner) return ui.notifications.warn("Nova Era: você não pode alterar os recursos desta ficha.");
  const current = chronomancerState(actor);
  const next = { ...current, ...changes };
  next.points = Math.max(0, Math.min(current.maximum, Number(next.points)));
  next.confluences = Math.max(0, Number(next.confluences));
  await actor.setFlag(MODULE_ID, "chronomancerState", next);
  Hooks.callAll("novaEraChronomancerChanged", actor);
}

function stripHtml(value) {
  const temporary = document.createElement("div");
  temporary.innerHTML = value ?? "";
  return temporary.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function generatedLaw(entry, currentTrail) {
  return entry?.laws?.find(law => law !== currentTrail) ?? entry?.laws?.[0] ?? "";
}

function willConverge(entry, currentTrail) {
  const law = generatedLaw(entry, currentTrail);
  return Boolean(currentTrail && law && law !== currentTrail);
}

function temporalVerse(item, data) {
  const theme = data.category === "Paradoxo" ? "Paradoxo" : data.laws?.[0] ?? "Continuidade";
  const verses = TEMPORAL_VERSES[theme] ?? TEMPORAL_VERSES.Continuidade;
  const seed = [...String(item.id ?? item.name ?? "tempo")].reduce((total, character) => total + character.charCodeAt(0), 0);
  return verses[seed % verses.length];
}

async function postIntervention(actor, item, data) {
  const verse = temporalVerse(item, data);
  if (typeof item.use === "function") {
    try {
      await item.use();
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<section class="nova-era chronomancer-chat ne-temporal-verse"><i class="fa-solid fa-hourglass-half"></i><blockquote>“${verse}”</blockquote><small>— ${actor.name}, ao fraturar o instante</small></section>`
      });
      return;
    } catch (error) {
      console.debug(`${MODULE_ID} | Item.use indisponível para ${item.name}`, error);
    }
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<section class="nova-era chronomancer-chat"><h2>${item.name}</h2><blockquote class="ne-chronomancy-verse">“${verse}”</blockquote><p><strong>${data.cost} PT • ${data.execution}</strong></p>${item.system?.description?.value ?? ""}</section>`
  });
}

export async function activateChronomancerIntervention(actor, entry) {
  const current = chronomancerState(actor);
  if (!entry) return;
  if (current.points < entry.cost) return ui.notifications.warn(`Nova Era: ${entry.item.name} exige ${entry.cost} PT.`);
  if (/Reação/i.test(entry.execution) && !current.reaction) return ui.notifications.warn("Nova Era: sua Reação Temporal já foi utilizada.");
  const law = generatedLaw(entry, current.trail);
  const confluence = willConverge(entry, current.trail);
  await updateChronomancerState(actor, {
    points: current.points - entry.cost,
    trail: law || current.trail,
    confluences: current.confluences + (confluence ? 1 : 0),
    reaction: /Reação/i.test(entry.execution) ? false : current.reaction
  });
  if (confluence) ui.notifications.info(`Nova Era: Confluência entre ${current.trail} e ${law}.`);
  await postIntervention(actor, entry.item, entry);
}

function selectedCategory(panel) {
  return Math.max(0, Math.min(CATEGORIES.length - 1, Number(panel.dataset.categoryIndex ?? 0)));
}

function entriesInCategory(actor, panel) {
  return actorInterventions(actor).filter(entry => entry.category === CATEGORIES[selectedCategory(panel)]);
}

function selectedEntry(actor, panel) {
  const entries = entriesInCategory(actor, panel);
  return entries.find(entry => entry.item.id === panel.dataset.selectedItemId) ?? entries[0] ?? null;
}

function categoryButtons() {
  return CATEGORIES.map((category, index) => `<button type="button" data-action="category" data-category-index="${index}" style="--category-angle:${index * 90}deg" title="${CATEGORY_LABELS[index]}"><span><i class="fa-solid ${CATEGORY_ICONS[index]}"></i>${CATEGORY_LABELS[index]}</span></button>`).join("");
}

function interventionButtons(entries, selected) {
  const count = Math.max(entries.length, 1);
  return entries.map((entry, index) => {
    const angle = index * (360 / count);
    const icon = LAW_ICONS[Math.max(0, LAWS.indexOf(entry.laws[0]))] ?? "fa-clock";
    return `<button type="button" class="ne-crono-intervention ${entry.item.id === selected?.item.id ? "active" : ""}" style="--slot-angle:${angle}deg" data-action="select-intervention" data-item-id="${entry.item.id}" title="${entry.item.name}"><span><i class="fa-solid ${icon}"></i><small>${entry.cost} PT</small></span></button>`;
  }).join("");
}

function lawBadges(entry) {
  if (!entry?.laws?.length) return '<span class="ne-crono-law neutral">Sem Lei</span>';
  return entry.laws.map(law => `<span class="ne-crono-law" data-law="${law}">${law}</span>`).join("");
}

function temporalCrystals(current) {
  return Array.from({ length: current.maximum }, (_, index) => `<span class="${index < current.points ? "available" : "spent"}" title="${index < current.points ? "Ponto Temporal disponível" : "Ponto Temporal gasto"}"></span>`).join("");
}

function affinity(actor) {
  return actor.items.find(item => String(item.getFlag(MODULE_ID, "contentKey") ?? "").includes("afinidade"))?.name ?? "Afinidade não definida";
}

function combatTimeline() {
  const turns = game.combat?.turns ?? [];
  const active = game.combat?.combatant?.id;
  return turns.slice(0, 8).map(combatant => `<span class="${combatant.id === active ? "active" : ""}" data-combatant-id="${combatant.id}"><i class="fa-solid ${combatant.id === active ? "fa-location-arrow" : "fa-circle"}"></i><small></small></span>`).join("");
}

function renderSelection(panel, actor, entry = selectedEntry(actor, panel)) {
  const current = chronomancerState(actor);
  const reactionBlocked = Boolean(entry && /Reação/i.test(entry.execution) && !current.reaction);
  const insufficient = Boolean(entry && current.points < entry.cost);
  const execute = panel.querySelector("[data-action='execute-intervention']");
  panel.querySelector("[data-role='selected-name']").textContent = entry?.item.name ?? "Nenhuma Intervenção";
  panel.querySelector("[data-role='compact-name']").textContent = entry?.item.name ?? "Intervenções";
  panel.querySelector("[data-role='command-name']").textContent = entry?.item.name ?? "Nenhuma Intervenção";
  panel.querySelector("[data-role='selected-laws']").innerHTML = lawBadges(entry);
  panel.querySelector("[data-role='selected-meta']").textContent = entry ? `${entry.cost} PT • ${entry.execution}${entry.range ? ` • ${entry.range}` : ""}` : "Escolha uma Intervenção conhecida";
  panel.querySelector("[data-role='selected-description']").textContent = entry ? stripHtml(entry.item.system?.description?.value).slice(0, 230) : "Adicione Intervenções à ficha para usá-las pelo relógio.";
  panel.querySelector("[data-role='confluence-preview']").innerHTML = entry && willConverge(entry, current.trail)
    ? `<i class="fa-solid fa-sparkles"></i> Gerará Confluência: ${current.trail} + ${generatedLaw(entry, current.trail)}`
    : entry ? `<i class="fa-solid fa-wave-square"></i> Novo Rastro: ${generatedLaw(entry, current.trail) || "inalterado"}` : "";
  execute.disabled = !entry || insufficient || reactionBlocked;
  execute.classList.toggle("ready", Boolean(entry && !insufficient && !reactionBlocked));
  execute.querySelector("span").textContent = insufficient ? `Faltam ${entry.cost - current.points} PT` : reactionBlocked ? "Reação utilizada" : "Executar Intervenção";
  panel.querySelector("[data-action='open-intervention']").disabled = !entry;
}

function renderSelector(panel, actor) {
  const entries = entriesInCategory(actor, panel);
  const selected = selectedEntry(actor, panel);
  if (selected) panel.dataset.selectedItemId = selected.item.id;
  else delete panel.dataset.selectedItemId;
  const categoryIndex = selectedCategory(panel);
  const selectedIndex = Math.max(0, entries.findIndex(entry => entry.item.id === selected?.item.id));
  panel.style.setProperty("--category-rotation", `${-(categoryIndex * 90)}deg`);
  panel.style.setProperty("--intervention-rotation", `${entries.length ? -(selectedIndex * (360 / entries.length)) : 0}deg`);
  panel.dataset.category = CATEGORIES[categoryIndex].toLowerCase().replaceAll(" ", "-");
  for (const button of panel.querySelectorAll("[data-action='category']")) button.classList.toggle("active", Number(button.dataset.categoryIndex) === categoryIndex);
  panel.querySelector("[data-role='active-category']").textContent = CATEGORY_LABELS[categoryIndex];
  panel.querySelector("[data-role='intervention-ring']").innerHTML = interventionButtons(entries, selected);
  const list = panel.querySelector("[data-role='category-list']");
  list.innerHTML = entries.length ? entries.map(entry => `<button type="button" data-action="select-intervention" data-item-id="${entry.item.id}" class="${entry.item.id === selected?.item.id ? "active" : ""}"><span>${entry.item.name}</span><small>${entry.cost} PT</small></button>`).join("") : `<p>Nenhuma ${CATEGORIES[categoryIndex].toLowerCase()} conhecida.</p>`;
  renderSelection(panel, actor, selected);
}

function rotateCategory(panel, actor, direction) {
  panel.dataset.categoryIndex = String((selectedCategory(panel) + direction + CATEGORIES.length) % CATEGORIES.length);
  delete panel.dataset.selectedItemId;
  renderSelector(panel, actor);
}

function rotateIntervention(panel, actor, direction) {
  const entries = entriesInCategory(actor, panel);
  if (!entries.length) return;
  const currentIndex = Math.max(0, entries.findIndex(entry => entry.item.id === selectedEntry(actor, panel)?.item.id));
  panel.dataset.selectedItemId = entries[(currentIndex + direction + entries.length) % entries.length].item.id;
  renderSelector(panel, actor);
}

function createPanel(actor, { standalone = false } = {}) {
  const panel = document.createElement("section");
  panel.className = `nova-era chronomancer-panel${standalone ? " ne-crono-standalone drawer-open" : ""}`;
  panel.dataset.actorUuid = actor.uuid;
  panel.dataset.categoryIndex = "0";
  panel.innerHTML = `
    ${standalone ? `<header class="ne-crono-pt-bar"><div class="ne-crono-pt-number"><strong data-role="points-top">0 / 0</strong><small>PT</small></div><div><h2>Pontos Temporais</h2><div class="ne-crono-crystals" data-role="temporal-crystals"></div></div></header><aside class="ne-crono-left-rail"><section><h3>Rastro Temporal</h3><i class="fa-solid fa-hourglass-half"></i><strong data-role="trail-display">Nenhum</strong><small>Expira no início do seu turno</small></section><section><h3>Confluência</h3><i class="fa-solid fa-code-merge"></i><strong data-role="confluence-display">Nenhuma disponível</strong><small data-role="confluence-hint">Escolha uma Intervenção compatível</small></section><section class="ne-crono-affinity"><h3>Afinidade</h3><i class="fa-solid fa-star"></i><strong data-role="affinity"></strong><small>Passivo temporal</small></section></aside>` : ""}
    <div class="ne-crono-stage">
    <div class="ne-crono-clock" data-role="clock">
      <header class="ne-crono-title"><i class="fa-solid fa-clock"></i><strong>Nova Era — Cronomante</strong></header>
      <div class="ne-crono-category-ring" data-role="category-ring">${categoryButtons()}</div>
      <button type="button" data-action="category-prev" class="ne-crono-rotate ne-crono-rotate-left" aria-label="Categoria anterior"><i class="fa-solid fa-chevron-left"></i></button>
      <button type="button" data-action="category-next" class="ne-crono-rotate ne-crono-rotate-right" aria-label="Próxima categoria"><i class="fa-solid fa-chevron-right"></i></button>
      <div class="ne-crono-category-marker"><small>Categoria</small><strong data-role="active-category"></strong></div>
      <div class="ne-crono-intervention-ring" data-role="intervention-ring"></div>
      <button type="button" data-action="intervention-prev" class="ne-crono-step ne-crono-step-left" aria-label="Intervenção anterior"><i class="fa-solid fa-rotate-left"></i></button>
      <button type="button" data-action="intervention-next" class="ne-crono-step ne-crono-step-right" aria-label="Próxima Intervenção"><i class="fa-solid fa-rotate-right"></i></button>
      <div class="ne-crono-resource-ring"><button type="button" data-action="points-minus" aria-label="Gastar um Ponto Temporal"><i class="fa-solid fa-minus"></i></button><div class="ne-crono-core"><small>Pontos Temporais</small><strong data-role="points">0 / 0</strong><span data-role="selected-name"></span><button type="button" data-action="toggle-drawer" class="ne-crono-core-toggle" aria-label="Abrir comandos do Cronomante" aria-expanded="false"></button></div><button type="button" data-action="points-plus" aria-label="Recuperar um Ponto Temporal"><i class="fa-solid fa-plus"></i></button></div>
      <div class="ne-crono-trail"><span>Rastro</span><div>${LAWS.map((law, index) => `<button type="button" data-action="trail" data-law="${law}" title="${law}"><i class="fa-solid ${LAW_ICONS[index]}"></i></button>`).join("")}</div><button type="button" data-action="trail-clear" class="ne-crono-clear" title="Limpar Rastro"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="ne-crono-confluence"><small>Confluências</small><strong data-role="confluences">0</strong><button type="button" data-action="confluence-clear" title="Zerar Confluências"><i class="fa-solid fa-rotate-left"></i></button></div>
      <footer><button type="button" data-action="open-treatise"><i class="fa-solid fa-book-open"></i><span data-role="treatise"></span></button><button type="button" data-action="reaction" class="ne-crono-reaction"><i class="fa-solid fa-hourglass"></i><span data-role="reaction"></span></button></footer>
    </div>
    </div>
    <div class="ne-crono-compact-status"><button type="button" data-action="toggle-drawer" aria-expanded="false"><i class="fa-solid fa-clock-rotate-left"></i><span data-role="compact-name">Intervenções</span><b data-role="compact-points">0/0 PT</b><i class="fa-solid fa-chevron-right" data-role="drawer-chevron"></i></button></div>
    <section class="ne-crono-command" data-role="command-drawer"><header><div><small class="ne-crono-drawer-kicker">Intervenções</small><strong data-role="command-name"></strong><small data-role="selected-meta"></small><div data-role="selected-laws" class="ne-crono-laws"></div></div><div class="ne-crono-drawer-actions"><button type="button" data-action="open-intervention" title="Abrir descrição completa"><i class="fa-solid fa-book"></i></button><button type="button" data-action="toggle-drawer" title="Recolher comandos"><i class="fa-solid fa-chevron-right"></i></button></div></header><p data-role="selected-description"></p><div data-role="confluence-preview" class="ne-crono-preview"></div><button type="button" data-action="execute-intervention" class="ne-crono-execute"><i class="fa-solid fa-hourglass-start"></i><span>Executar Intervenção</span></button><details class="ne-crono-library" open><summary><i class="fa-solid fa-list"></i> Biblioteca da categoria</summary><div data-role="category-list"></div></details></section>
    ${standalone ? `<footer class="ne-crono-timeline"><h3>Linha do Tempo</h3><div data-role="combat-timeline">${combatTimeline()}</div></footer>` : ""}`;

  panel.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;
    event.preventDefault();
    const current = chronomancerState(actor);
    const action = button.dataset.action;
    if (action === "toggle-drawer") {
      const open = !panel.classList.contains("drawer-open");
      panel.classList.toggle("drawer-open", open);
      for (const toggle of panel.querySelectorAll('[data-action="toggle-drawer"]')) toggle.setAttribute("aria-expanded", String(open));
    }
    else if (action === "category") { panel.dataset.categoryIndex = button.dataset.categoryIndex; delete panel.dataset.selectedItemId; renderSelector(panel, actor); }
    else if (action === "category-prev") rotateCategory(panel, actor, -1);
    else if (action === "category-next") rotateCategory(panel, actor, 1);
    else if (action === "intervention-prev") rotateIntervention(panel, actor, -1);
    else if (action === "intervention-next") rotateIntervention(panel, actor, 1);
    else if (action === "select-intervention") { panel.dataset.selectedItemId = button.dataset.itemId; renderSelector(panel, actor); }
    else if (action === "execute-intervention") await activateChronomancerIntervention(actor, selectedEntry(actor, panel));
    else if (action === "open-intervention") selectedEntry(actor, panel)?.item.sheet?.render(true);
    else if (action === "points-minus") await updateChronomancerState(actor, { points: current.points - 1 });
    else if (action === "points-plus") await updateChronomancerState(actor, { points: current.points + 1 });
    else if (action === "trail") { const confluence = Boolean(current.trail && current.trail !== button.dataset.law); await updateChronomancerState(actor, { trail: button.dataset.law, confluences: current.confluences + (confluence ? 1 : 0) }); }
    else if (action === "trail-clear") await updateChronomancerState(actor, { trail: "" });
    else if (action === "confluence-clear") await updateChronomancerState(actor, { confluences: 0 });
    else if (action === "reaction") await updateChronomancerState(actor, { reaction: !current.reaction });
    else if (action === "open-treatise") treatise(actor)?.sheet?.render(true);
  });
  panel.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !panel.classList.contains("drawer-open")) return;
    panel.classList.remove("drawer-open");
    for (const toggle of panel.querySelectorAll('[data-action="toggle-drawer"]')) toggle.setAttribute("aria-expanded", "false");
    panel.querySelector('[data-action="toggle-drawer"]')?.focus();
  });

  let lastWheel = 0;
  panel.querySelector("[data-role='clock']").addEventListener("wheel", event => {
    event.preventDefault();
    const now = Date.now();
    if (now - lastWheel < 180) return;
    lastWheel = now;
    if (event.shiftKey) rotateCategory(panel, actor, event.deltaY > 0 ? 1 : -1);
    else rotateIntervention(panel, actor, event.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  let dragStart = null;
  panel.querySelector("[data-role='clock']").addEventListener("pointerdown", event => { dragStart = { x: event.clientX }; });
  panel.querySelector("[data-role='clock']").addEventListener("pointerup", event => { if (!dragStart) return; const delta = event.clientX - dragStart.x; dragStart = null; if (Math.abs(delta) > 45) rotateIntervention(panel, actor, delta > 0 ? -1 : 1); });
  refreshPanel(panel, actor);
  renderSelector(panel, actor);
  return panel;
}

const FoundryApplication = globalThis.Application ?? foundry?.appv1?.api?.Application;

class ChronomancerClockApplication extends FoundryApplication {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["nova-era-window", "nova-era-chronomancer-clock-window"],
      width: 1280,
      height: 820,
      resizable: true,
      minimizable: true,
      popOut: true
    }, { inplace: false });
  }

  get id() {
    return `nova-era-chronomancer-clock-${this.actor.id}`;
  }

  get title() {
    return `Relógio do Cronomante — ${this.actor.name}`;
  }

  async _renderInner() {
    return globalThis.jQuery(createPanel(this.actor, { standalone: true }));
  }

  async close(options = {}) {
    openChronomancerClocks.delete(this.actor.uuid);
    return super.close(options);
  }
}

export function openChronomancerClock(actor) {
  if (!isNovaEraChronomancer(actor)) {
    ui.notifications.warn("Nova Era: esta ficha não pertence a um Cronomante.");
    return null;
  }
  const existing = openChronomancerClocks.get(actor.uuid);
  if (existing?.rendered) {
    existing.bringToTop?.();
    return existing;
  }
  const clock = new ChronomancerClockApplication(actor);
  openChronomancerClocks.set(actor.uuid, clock);
  clock.render(true);
  return clock;
}

function refreshPanel(panel, actor) {
  const current = chronomancerState(actor);
  panel.querySelector("[data-role='points']").textContent = `${current.points} / ${current.maximum}`;
  const pointsTop = panel.querySelector("[data-role='points-top']");
  if (pointsTop) pointsTop.textContent = `${current.points} / ${current.maximum}`;
  const crystals = panel.querySelector("[data-role='temporal-crystals']");
  if (crystals) crystals.innerHTML = temporalCrystals(current);
  panel.querySelector("[data-role='confluences']").textContent = current.confluences;
  panel.querySelector("[data-role='treatise']").textContent = treatise(actor)?.name ?? "Tratado não escolhido";
  panel.querySelector("[data-role='reaction']").textContent = current.reaction ? "Reação Temporal disponível" : "Reação Temporal utilizada";
  panel.querySelector("[data-role='compact-points']").textContent = `${current.points}/${current.maximum} PT`;
  panel.querySelector("[data-role='compact-name']").textContent = selectedEntry(actor, panel)?.item.name ?? "Intervenções";
  panel.querySelector("[data-action='reaction']").classList.toggle("active", current.reaction);
  panel.classList.toggle("reaction-ready", current.reaction);
  panel.querySelector("[data-action='points-minus']").disabled = current.points <= 0;
  panel.querySelector("[data-action='points-plus']").disabled = current.points >= current.maximum;
  for (const button of panel.querySelectorAll("[data-action='trail']")) button.classList.toggle("active", button.dataset.law === current.trail);
  const trailDisplay = panel.querySelector("[data-role='trail-display']");
  if (trailDisplay) trailDisplay.textContent = current.trail || "Nenhum Rastro";
  const confluenceDisplay = panel.querySelector("[data-role='confluence-display']");
  if (confluenceDisplay) confluenceDisplay.textContent = current.confluences ? `${current.confluences} Confluência${current.confluences === 1 ? "" : "s"}` : "Nenhuma disponível";
  const affinityDisplay = panel.querySelector("[data-role='affinity']");
  if (affinityDisplay) affinityDisplay.textContent = affinity(actor);
  for (const marker of panel.querySelectorAll("[data-role='combat-timeline'] [data-combatant-id]")) {
    marker.querySelector("small").textContent = game.combat?.combatants?.get(marker.dataset.combatantId)?.name ?? "—";
  }
  renderSelection(panel, actor);
}

function renderChronomancerPanel(app, html) {
  const actor = app.actor ?? app.document;
  if (!isNovaEraChronomancer(actor)) return;
  const root = sheetRoot(app, html);
  if (!root || root.querySelector(".ne-crono-sheet-launcher")) return;
  (root.closest(".application, .window-app") ?? root).classList.add("nova-era-chronomancer-sheet");
  const sidebar = root.querySelector(".sheet-body .main-content > .sidebar, .sheet-body .main-content .sidebar, [data-application-part='sidebar']");
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "ne-crono-sheet-launcher";
  launcher.title = "Abrir o Relógio do Cronomante";
  launcher.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i><span><strong>Relógio do Cronomante</strong><small>Abrir painel temporal</small></span><i class="fa-solid fa-up-right-from-square"></i>`;
  launcher.addEventListener("click", event => {
    event.preventDefault();
    openChronomancerClock(actor);
  });
  const portrait = sidebar?.querySelector(".portrait, .profile, .sheet-profile, [data-application-part='portrait']");
  if (portrait) portrait.after(launcher);
  else if (sidebar) sidebar.prepend(launcher);
  else root.querySelector(".sheet-body, [data-application-part='body'], .tab-body")?.prepend(launcher);
}

export function refreshChronomancerPanels() {
  for (const panel of document.querySelectorAll(".nova-era.chronomancer-panel")) {
    const actor = fromUuidSync(panel.dataset.actorUuid);
    if (actor) { refreshPanel(panel, actor); renderSelector(panel, actor); }
  }
}

export function registerChronomancerPanel() {
  for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderActorSheet5eCharacter", "renderActorSheet5eCharacter2"]) Hooks.on(hook, renderChronomancerPanel);
  Hooks.on("novaEraChronomancerChanged", refreshChronomancerPanels);
  Hooks.on("updateActor", refreshChronomancerPanels);
  Hooks.on("createItem", refreshChronomancerPanels);
  Hooks.on("deleteItem", refreshChronomancerPanels);
  Hooks.on("updateCombat", refreshChronomancerPanels);
}
