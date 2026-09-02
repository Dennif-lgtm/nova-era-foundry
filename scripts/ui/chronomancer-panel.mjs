import { MODULE_ID } from "../constants.mjs";

const LAWS = ["Precedência", "Atraso", "Repetição", "Continuidade", "Ruptura"];
const CATEGORIES = ["Fundamento", "Disciplina", "Grande Teoria", "Paradoxo"];
const CATEGORY_LABELS = ["Fundamentos", "Disciplinas", "Grandes Teorias", "Paradoxos"];
const LAW_ICONS = ["fa-bolt", "fa-hourglass-half", "fa-repeat", "fa-shield-halved", "fa-burst"];
const CATEGORY_ICONS = ["fa-compass", "fa-gem", "fa-star", "fa-infinity"];
const CLOCK_MODES = ["Essencial", ...CATEGORIES];
const ICON_ROOT = `modules/${MODULE_ID}/assets/icons/chronomancer`;
const LAW_SLUGS = ["precedencia", "atraso", "repeticao", "continuidade", "ruptura"];
const TRAIL_ORBIT = [[34.8,30.8],[30.4,36.8],[28.8,44.1],[30.4,51.4],[34.8,57.4]];
const CONFLUENCE_ORBIT = [[65.2,30.8],[69.6,36.8],[71.2,44.1],[69.6,51.4],[65.2,57.4]];
const FOUNDATION_ICON_SLUGS = new Set([
  "acelerar", "antecipacao", "retardar", "inercia-temporal", "eco-temporal",
  "reverberacao", "ancora-temporal", "permanencia", "colapso", "descontinuidade"
]);
const MODE_ANGLES = [0, -55, 55, -125, 125];
const CONFLUENCE_NAMES = {
  "Atraso|Precedência": "Equilíbrio Causal",
  "Precedência|Repetição": "Impulso Temporal",
  "Continuidade|Precedência": "Instante Preservado",
  "Precedência|Ruptura": "Causalidade Invertida",
  "Atraso|Repetição": "Horizonte Ecoante",
  "Atraso|Continuidade": "Horizonte Suspenso",
  "Atraso|Ruptura": "Instante Perdido",
  "Continuidade|Repetição": "Linha Convergente",
  "Repetição|Ruptura": "Eco Fraturado",
  "Continuidade|Ruptura": "Ponto de Ruptura"
};
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

function hasContent(actor, key) {
  return actor.items.some(item => item.getFlag(MODULE_ID, "contentKey") === key);
}

function temporalTurnKey() {
  return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : "";
}

export function chronomancerState(actor) {
  const maximum = temporalMaximum(actor);
  const stored = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
  return {
    maximum,
    points: Math.max(0, Math.min(maximum, Number(stored.points ?? maximum))),
    trail: LAWS.includes(stored.trail) ? stored.trail : "",
    confluences: Math.max(0, Number(stored.confluences ?? 0)),
    reaction: stored.reaction !== false,
    clockMode: Math.max(0, Math.min(CLOCK_MODES.length - 1, Number(stored.clockMode ?? 0))),
    quickSlots: stored.quickSlots && typeof stored.quickSlots === "object" ? stored.quickSlots : {},
    parallelTurnKey: String(stored.parallelTurnKey ?? ""),
    parallelUses: Array.isArray(stored.parallelUses) ? stored.parallelUses.slice(0, 2) : [],
    lastAction: stored.lastAction && typeof stored.lastAction === "object" ? stored.lastAction : null
  };
}

export async function updateChronomancerState(actor, changes) {
  if (!actor.isOwner) return ui.notifications.warn("Nova Era: você não pode alterar os recursos desta ficha.");
  const current = chronomancerState(actor);
  const next = { ...current, ...changes };
  next.points = Math.max(0, Math.min(current.maximum, Number(next.points)));
  next.confluences = Math.max(0, Number(next.confluences));
  next.clockMode = Math.max(0, Math.min(CLOCK_MODES.length - 1, Number(next.clockMode ?? 0)));
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
  const turnKey = temporalTurnKey();
  const uses = turnKey && current.parallelTurnKey === turnKey ? [...current.parallelUses] : [];
  const parallelI = hasContent(actor, "crono-paralelismo-1");
  const parallelII = hasContent(actor, "crono-paralelismo-2");
  const law = generatedLaw(entry, current.trail);
  if (turnKey && uses.length >= 1) {
    if (!parallelI || uses.length >= 2) return ui.notifications.warn("Nova Era: você já realizou o máximo de Intervenções neste turno.");
    const allowedCategories = parallelII ? ["Fundamento", "Disciplina"] : ["Fundamento"];
    if (!allowedCategories.includes(uses[0].category) || !allowedCategories.includes(entry.category)) return ui.notifications.warn(`Nova Era: seu Paralelismo atual não combina ${uses[0].category} com ${entry.category}.`);
    if (!law || law === uses[0].law) return ui.notifications.warn("Nova Era: a segunda Intervenção do Paralelismo deve usar uma Lei diferente.");
  }
  const actualCost = uses.length === 1 && parallelII ? Math.max(1, entry.cost - 1) : entry.cost;
  if (current.points < actualCost) return ui.notifications.warn(`Nova Era: ${entry.item.name} exige ${actualCost} PT.`);
  if (/Reação/i.test(entry.execution) && !current.reaction) return ui.notifications.warn("Nova Era: sua Reação Temporal já foi utilizada.");
  const confluence = willConverge(entry, current.trail);
  const nextUses = turnKey ? [...uses, { itemId: entry.item.id, name: entry.item.name, category: entry.category, law }] : [];
  await updateChronomancerState(actor, {
    points: current.points - actualCost,
    trail: law || current.trail,
    confluences: current.confluences + (confluence ? 1 : 0),
    reaction: /Reação/i.test(entry.execution) ? false : current.reaction,
    parallelTurnKey: turnKey,
    parallelUses: nextUses,
    lastAction: { name: entry.item.name, cost: actualCost, law, confluence: confluence ? confluenceName(current.trail, law) : "", at: Date.now() }
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

function standalonePanelMarkup() {
  return `<div class="ne-bp-surface">
    <header class="ne-bp-points">
      <button type="button" data-action="points-minus" title="Gastar 1 PT"><i class="fa-solid fa-minus"></i></button>
      <strong data-role="points">0 / 0</strong>
      <div><h2>Pontos Temporais</h2><div class="ne-crono-crystals" data-role="temporal-crystals"></div></div>
      <button type="button" data-action="points-plus" title="Recuperar 1 PT"><i class="fa-solid fa-plus"></i></button>
    </header>
    <section class="ne-bp-card ne-bp-trail"><h3>Rastro Temporal</h3><i data-role="trail-icon" class="fa-solid fa-hourglass-half"></i><strong data-role="trail-display">Nenhum Rastro</strong><small>Expira no início do seu turno</small><button type="button" data-action="trail-clear">Limpar Rastro</button></section>
    <section class="ne-bp-card ne-bp-confluence"><h3>Confluência</h3><strong data-role="confluence-display">Nenhuma disponível</strong><div data-role="confluence-preview" class="ne-crono-preview"></div><small data-role="confluence-hint">A interface indicará combinações válidas.</small><button type="button" data-action="confluence-clear">Zerar contador</button></section>
    <section class="ne-bp-card ne-bp-affinity"><h3>Afinidade</h3><i class="fa-solid fa-star"></i><strong data-role="affinity"></strong><small>Passivo temporal</small></section>
    <section class="ne-bp-clock" data-role="clock">
      ${LAWS.map((law, index) => `<button type="button" class="ne-bp-law ne-bp-law-${index}" data-action="trail" data-law="${law}" title="Definir Rastro: ${law}"><span>${law}</span></button>`).join("")}
      <div class="ne-bp-core"><small>Estado Temporal</small><strong data-role="selected-name">Nenhuma Intervenção</strong></div>
    </section>
    <section class="ne-bp-interventions">
      <h3>Intervenções</h3>
      <nav class="ne-bp-categories">${categoryButtons()}</nav>
      <strong data-role="active-category">Fundamentos</strong>
      <div data-role="category-list" class="ne-bp-list"></div>
      <div data-role="intervention-ring" hidden></div>
    </section>
    <section class="ne-bp-parallel">
      <h3>Paralelismo Temporal</h3>
      <div><span>Intervenção I</span><span>Intervenção II</span></div>
    </section>
    <section class="ne-bp-selected">
      <header><div><small>Intervenção selecionada</small><strong data-role="command-name"></strong><small data-role="selected-meta"></small></div><button type="button" data-action="open-intervention" title="Abrir descrição"><i class="fa-solid fa-book"></i></button></header>
      <div data-role="selected-laws" class="ne-crono-laws"></div><p data-role="selected-description"></p>
      <button type="button" data-action="execute-intervention" class="ne-crono-execute"><i class="fa-solid fa-hourglass-start"></i><span>Executar Intervenção</span></button>
    </section>
    <section class="ne-bp-treatise"><h3>Tratado</h3><button type="button" data-action="open-treatise"><i class="fa-solid fa-book-open"></i><span data-role="treatise"></span></button></section>
    <footer class="ne-bp-timeline"><h3>Linha do Tempo</h3><div data-role="combat-timeline">${combatTimeline()}</div></footer>
    <nav class="ne-bp-utility"><button type="button" data-action="reaction" title="Alternar Reação Temporal"><i class="fa-solid fa-hourglass"></i></button><button type="button" data-action="toggle-compact" title="Modo compacto"><i class="fa-solid fa-down-left-and-up-right-to-center"></i></button><button type="button" data-action="open-treatise" title="Abrir Tratado"><i class="fa-solid fa-circle-info"></i></button></nav>
    <div class="ne-bp-compat" aria-hidden="true"><span data-role="points-top"></span><span data-role="compact-points"></span><span data-role="compact-name"></span><span data-role="confluences"></span><span data-role="reaction"></span><button data-action="toggle-drawer"></button></div>
  </div>`;
}

function lawIcon(law) {
  const index = Math.max(0, LAWS.indexOf(law));
  return `${ICON_ROOT}/leis/${LAW_SLUGS[index]}.webp`;
}

function contentSlug(name = "") {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function interventionIcon(entry) {
  const slug = contentSlug(entry?.item?.name);
  return FOUNDATION_ICON_SLUGS.has(slug) ? `${ICON_ROOT}/fundamentos/${slug}.webp` : entry?.item?.img;
}

function treatiseIcon(actor) {
  const name = treatise(actor)?.name ?? "";
  const slug = /preced/i.test(name) ? "precedencia" : /continui/i.test(name) ? "continuidade" : "possibilidades";
  return `${ICON_ROOT}/tratados/${slug}.webp`;
}

function confluenceName(first, second) {
  if (!first || !second || first === second) return "";
  return CONFLUENCE_NAMES[[first, second].sort((a, b) => a.localeCompare(b, "pt-BR")).join("|")] ?? "Confluência Temporal";
}

function circularPanelMarkup() {
  const trailLaws = LAWS.map((law, index) => `<button type="button" class="ne-v2-law" style="position:absolute;left:${TRAIL_ORBIT[index][0]}%;top:${TRAIL_ORBIT[index][1]}%;width:6.8%;height:6.8%;transform:translate(-50%,-50%)" data-action="trail" data-law="${law}" title="Rastro: ${law}"><img src="${lawIcon(law)}" alt=""><span>${law}</span></button>`).join("");
  const confluenceLaws = LAWS.map((law, index) => `<button type="button" class="ne-v2-law" style="position:absolute;left:${CONFLUENCE_ORBIT[index][0]}%;top:${CONFLUENCE_ORBIT[index][1]}%;width:6.8%;height:6.8%;transform:translate(-50%,-50%)" data-action="confluence-law" data-law="${law}" title="Confluência: ${law}"><img src="${lawIcon(law)}" alt=""><span>${law}</span></button>`).join("");
  return `<div class="ne-v2-shell ne-v3-shell">
    <section class="ne-v2-clock ne-v3-clock" data-role="clock">
      <img class="ne-v2-plate" src="modules/${MODULE_ID}/assets/ui/chronomancer-clock-clean-v6.webp" alt="Relógio do Cronomante">
      <button type="button" class="ne-v2-mode ne-v2-mode-essential" data-action="clock-mode" data-mode="0" title="Visão essencial">Essencial</button>
      ${CATEGORIES.map((category, index) => `<button type="button" class="ne-v2-mode ne-v2-mode-${index}" data-action="clock-mode" data-mode="${index + 1}" title="${CATEGORY_LABELS[index]}"><img src="${ICON_ROOT}/categorias/${["fundamentos","disciplinas","grandes-teorias","paradoxos"][index]}.webp" alt=""><span>${CATEGORY_LABELS[index]}</span></button>`).join("")}
      <div class="ne-v2-pointer" data-role="clock-pointer" aria-hidden="true"><span class="ne-v2-pointer-tip"></span><span class="ne-v2-pointer-hand"></span><span class="ne-v2-pointer-pivot"></span></div>
      <section class="ne-v4-laws ne-v4-trails" style="position:absolute;inset:0;width:100%;height:100%;transform:none;display:block" data-role="trail-laws" aria-label="Rastro ativo">${trailLaws}</section>
      <section class="ne-v4-laws ne-v4-confluences" style="position:absolute;inset:0;width:100%;height:100%;transform:none;display:block" data-role="confluence-laws" aria-label="Possibilidades de Confluência">${confluenceLaws}</section>
      <section class="ne-v2-core">
        <small>Pontos Temporais</small><strong data-role="points">0 / 0</strong>
        <div><button type="button" data-action="points-minus" title="Gastar 1 PT"><i class="fa-solid fa-minus"></i></button><button type="button" data-action="points-plus" title="Recuperar 1 PT"><i class="fa-solid fa-plus"></i></button></div>
      </section>
      <section class="ne-v2-quick" data-role="quick-slots" aria-label="Intervenções rápidas"><button type="button" data-slot="0"><img alt=""></button><button type="button" data-slot="1"><img alt=""></button><button type="button" data-slot="2"><img alt=""></button></section>
      <button type="button" class="ne-v2-treatise" style="left:50%;top:84.3%" data-action="open-treatise"><img data-role="treatise-icon" src="${ICON_ROOT}/tratados/possibilidades.webp" alt=""><span data-role="treatise"></span></button>
      <button type="button" class="ne-v2-reaction" data-action="reaction"><i class="fa-solid fa-hourglass"></i><span data-role="reaction"></span></button>
      <div class="ne-v2-feedback"><strong data-role="selected-name">Visão essencial</strong><small data-role="confluence-hint">Gire o anel para consultar a Biblioteca</small></div>
    </section>
    <aside class="ne-v2-library" data-role="library-panel">
      <header><div><small data-role="active-category">Essencial</small><strong data-role="command-name">Relógio do Cronomante</strong></div><button type="button" data-action="toggle-library"><i class="fa-solid fa-chevron-right"></i></button></header>
      <div data-role="category-list" class="ne-v2-list"></div>
      <div class="ne-v2-selected"><small data-role="selected-meta"></small><div data-role="selected-laws" class="ne-crono-laws"></div><p data-role="selected-description"></p><div data-role="confluence-preview" class="ne-crono-preview"></div></div>
      <footer><button type="button" data-action="open-intervention"><i class="fa-solid fa-book"></i> Ver</button><button type="button" data-action="execute-intervention" class="ne-crono-execute"><i class="fa-solid fa-hourglass-start"></i><span>Executar Intervenção</span></button></footer>
    </aside>
    <footer class="ne-v2-timeline"><h3>Linha do Tempo</h3><div data-role="combat-timeline">${combatTimeline()}</div></footer>
    <div class="ne-bp-compat" aria-hidden="true"><span data-role="points-top"></span><span data-role="compact-points"></span><span data-role="compact-name"></span><span data-role="confluences"></span><span data-role="trail-display"></span><span data-role="affinity"></span><div data-role="temporal-crystals"></div><i data-role="trail-icon"></i><strong data-role="confluence-display"></strong><div data-role="intervention-ring"></div><button data-action="toggle-drawer"></button><button data-action="confluence-clear"></button></div>
  </div>`;
}

function renderSelection(panel, actor, entry = selectedEntry(actor, panel)) {
  const current = chronomancerState(actor);
  const turnUses = temporalTurnKey() && current.parallelTurnKey === temporalTurnKey() ? current.parallelUses : [];
  const displayCost = entry && turnUses.length === 1 && hasContent(actor, "crono-paralelismo-2") ? Math.max(1, entry.cost - 1) : entry?.cost ?? 0;
  const parallelBlocked = Boolean(entry && turnUses.length >= 1 && (
    !hasContent(actor, "crono-paralelismo-1") || turnUses.length >= 2 ||
    !(hasContent(actor, "crono-paralelismo-2") ? ["Fundamento", "Disciplina"] : ["Fundamento"]).includes(entry.category) ||
    !(hasContent(actor, "crono-paralelismo-2") ? ["Fundamento", "Disciplina"] : ["Fundamento"]).includes(turnUses[0]?.category) ||
    generatedLaw(entry, current.trail) === turnUses[0]?.law
  ));
  const reactionBlocked = Boolean(entry && /Reação/i.test(entry.execution) && !current.reaction);
  const insufficient = Boolean(entry && current.points < displayCost);
  const execute = panel.querySelector("[data-action='execute-intervention']");
  panel.querySelector("[data-role='selected-name']").textContent = entry?.item.name ?? "Nenhuma Intervenção";
  panel.querySelector("[data-role='compact-name']").textContent = entry?.item.name ?? "Intervenções";
  panel.querySelector("[data-role='command-name']").textContent = entry?.item.name ?? "Nenhuma Intervenção";
  panel.querySelector("[data-role='selected-laws']").innerHTML = lawBadges(entry);
  panel.querySelector("[data-role='selected-meta']").textContent = entry ? `${displayCost} PT${displayCost !== entry.cost ? " (Paralelismo II)" : ""} • ${entry.execution}${entry.range ? ` • ${entry.range}` : ""}` : "Escolha uma Intervenção conhecida";
  panel.querySelector("[data-role='selected-description']").textContent = entry ? stripHtml(entry.item.system?.description?.value).slice(0, 230) : "Adicione Intervenções à ficha para usá-las pelo relógio.";
  panel.querySelector("[data-role='confluence-preview']").innerHTML = entry && willConverge(entry, current.trail)
    ? `<i class="fa-solid fa-sparkles"></i> Gerará Confluência: ${current.trail} + ${generatedLaw(entry, current.trail)}`
    : entry ? `<i class="fa-solid fa-wave-square"></i> Novo Rastro: ${generatedLaw(entry, current.trail) || "inalterado"}` : "";
  execute.disabled = !entry || insufficient || reactionBlocked || parallelBlocked;
  execute.classList.toggle("ready", Boolean(entry && !insufficient && !reactionBlocked && !parallelBlocked));
  execute.querySelector("span").textContent = insufficient ? `Faltam ${displayCost - current.points} PT` : reactionBlocked ? "Reação utilizada" : parallelBlocked ? "Paralelismo incompatível" : "Executar Intervenção";
  panel.querySelector("[data-action='open-intervention']").disabled = !entry;
}

function renderSelector(panel, actor) {
  const state = chronomancerState(actor);
  const mode = Number(panel.dataset.clockMode ?? state.clockMode ?? 0);
  const isCircular = panel.classList.contains("ne-crono-standalone");
  if (isCircular) {
    panel.dataset.clockMode = String(mode);
    panel.classList.toggle("ne-v2-essential", mode === 0);
    panel.style.setProperty("--pointer-angle", `${MODE_ANGLES[mode] ?? 0}deg`);
    panel.querySelector("[data-role='clock-pointer']")?.setAttribute("data-position", CLOCK_MODES[mode] ?? CLOCK_MODES[0]);
    panel.querySelectorAll("[data-action='clock-mode']").forEach(button => button.classList.toggle("active", Number(button.dataset.mode) === mode));
    const library = panel.querySelector("[data-role='library-panel']");
    library?.classList.toggle("available", mode > 0);
    if (mode === 0) {
      panel.querySelector("[data-role='active-category']").textContent = "Visão essencial";
      panel.querySelector("[data-role='category-list']").innerHTML = "<p>Gire o anel para Fundamentos, Disciplinas, Grandes Teorias ou Paradoxos.</p>";
      panel.querySelector("[data-role='quick-slots']")?.querySelectorAll("button").forEach(button => {
        button.disabled = true;
        button.dataset.itemId = "";
        button.removeAttribute("title");
        const image = button.querySelector("img");
        image.removeAttribute("src");
        image.alt = "";
      });
      renderSelection(panel, actor, null);
      return;
    }
    panel.dataset.categoryIndex = String(mode - 1);
  }
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
  const category = CATEGORIES[categoryIndex];
  const storedQuick = Array.isArray(state.quickSlots?.[category]) ? state.quickSlots[category] : [];
  const quickIds = [...storedQuick.filter(id => entries.some(entry => entry.item.id === id)), ...entries.map(entry => entry.item.id).filter(id => !storedQuick.includes(id))].slice(0, 3);
  list.innerHTML = entries.length ? entries.map(entry => `<div class="ne-v2-library-entry ${entry.item.id === selected?.item.id ? "active" : ""}"><button type="button" data-action="select-intervention" data-item-id="${entry.item.id}"><span>${entry.item.name}</span><small>${entry.cost} PT</small></button><button type="button" data-action="toggle-quick" data-item-id="${entry.item.id}" title="${quickIds.includes(entry.item.id) ? "Remover dos atalhos" : "Fixar nos atalhos"}"><i class="fa-${quickIds.includes(entry.item.id) ? "solid" : "regular"} fa-star"></i></button></div>`).join("") : `<p>Nenhuma ${category.toLowerCase()} conhecida.</p>`;
  const quick = panel.querySelector("[data-role='quick-slots']");
  quick?.querySelectorAll("button").forEach((button, index) => {
    const entry = entries.find(candidate => candidate.item.id === quickIds[index]);
    button.disabled = !entry;
    button.dataset.action = entry ? "quick-intervention" : "";
    button.dataset.itemId = entry?.item.id ?? "";
    button.title = entry ? `${entry.item.name} — ${entry.cost} PT` : "Encaixe de Intervenção vazio";
    const image = button.querySelector("img");
    if (entry) image.src = interventionIcon(entry);
    else image.removeAttribute("src");
    image.alt = entry?.item.name ?? "";
    button.classList.toggle("active", entry?.item.id === selected?.item.id);
  });
  renderSelection(panel, actor, selected);
}

async function rotateClockMode(panel, actor, direction) {
  const current = Number(panel.dataset.clockMode ?? chronomancerState(actor).clockMode ?? 0);
  const mode = (current + direction + CLOCK_MODES.length) % CLOCK_MODES.length;
  panel.dataset.clockMode = String(mode);
  delete panel.dataset.selectedItemId;
  await updateChronomancerState(actor, { clockMode: mode });
  renderSelector(panel, actor);
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

  if (standalone) {
    panel.innerHTML = circularPanelMarkup();
    panel.dataset.clockMode = "0";
  }

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
    else if (action === "quick-intervention") { panel.dataset.selectedItemId = button.dataset.itemId; renderSelector(panel, actor); }
    else if (action === "clock-mode") { panel.dataset.clockMode = button.dataset.mode; delete panel.dataset.selectedItemId; await updateChronomancerState(actor, { clockMode: Number(button.dataset.mode) }); renderSelector(panel, actor); }
    else if (action === "toggle-library") panel.classList.toggle("ne-v2-library-open");
    else if (action === "toggle-quick") {
      const category = CATEGORIES[selectedCategory(panel)];
      const quickSlots = foundry.utils.deepClone(current.quickSlots ?? {});
      const ids = Array.isArray(quickSlots[category]) ? [...quickSlots[category]] : [];
      const existing = ids.indexOf(button.dataset.itemId);
      if (existing >= 0) ids.splice(existing, 1);
      else { if (ids.length >= 3) ids.shift(); ids.push(button.dataset.itemId); }
      quickSlots[category] = ids;
      await updateChronomancerState(actor, { quickSlots });
      renderSelector(panel, actor);
    }
    else if (action === "confluence-law") {
      if (current.trail === button.dataset.law) { await updateChronomancerState(actor, { trail: "" }); return; }
      if (!current.trail) { await updateChronomancerState(actor, { trail: button.dataset.law }); return; }
      const candidates = actorInterventions(actor).filter(entry => entry.laws.includes(button.dataset.law));
      const entry = candidates.find(candidate => candidate.cost <= current.points && (!/Reação/i.test(candidate.execution) || current.reaction)) ?? candidates[0];
      if (entry) { panel.dataset.clockMode = String(CATEGORIES.indexOf(entry.category) + 1); panel.dataset.categoryIndex = String(CATEGORIES.indexOf(entry.category)); panel.dataset.selectedItemId = entry.item.id; await updateChronomancerState(actor, { clockMode: Number(panel.dataset.clockMode) }); renderSelector(panel, actor); panel.classList.add("ne-v2-library-open"); }
    }
    else if (action === "execute-intervention") await activateChronomancerIntervention(actor, selectedEntry(actor, panel));
    else if (action === "open-intervention") selectedEntry(actor, panel)?.item.sheet?.render(true);
    else if (action === "points-minus") await updateChronomancerState(actor, { points: current.points - 1 });
    else if (action === "points-plus") await updateChronomancerState(actor, { points: current.points + 1 });
    else if (action === "trail") await updateChronomancerState(actor, { trail: button.dataset.law });
    else if (action === "trail-clear") await updateChronomancerState(actor, { trail: "" });
    else if (action === "confluence-clear") await updateChronomancerState(actor, { confluences: 0 });
    else if (action === "reaction") await updateChronomancerState(actor, { reaction: !current.reaction });
    else if (action === "toggle-compact") panel.classList.toggle("ne-bp-compact");
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
    if (standalone) rotateClockMode(panel, actor, event.deltaY > 0 ? 1 : -1);
    else if (event.shiftKey) rotateCategory(panel, actor, event.deltaY > 0 ? 1 : -1);
    else rotateIntervention(panel, actor, event.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  let dragStart = null;
  panel.querySelector("[data-role='clock']").addEventListener("pointerdown", event => { dragStart = { x: event.clientX }; });
  panel.querySelector("[data-role='clock']").addEventListener("pointerup", event => { if (!dragStart) return; const delta = event.clientX - dragStart.x; dragStart = null; if (Math.abs(delta) > 45) { if (standalone) rotateClockMode(panel, actor, delta > 0 ? -1 : 1); else rotateIntervention(panel, actor, delta > 0 ? -1 : 1); } });
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
      width: 1320,
      height: 900,
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
  if (panel.classList.contains("ne-crono-standalone") && panel.dataset.clockMode === undefined) panel.dataset.clockMode = String(current.clockMode);
  panel.querySelector("[data-role='points']").textContent = `${current.points} / ${current.maximum}`;
  const pointsTop = panel.querySelector("[data-role='points-top']");
  if (pointsTop) pointsTop.textContent = `${current.points} / ${current.maximum}`;
  const crystals = panel.querySelector("[data-role='temporal-crystals']");
  if (crystals) crystals.innerHTML = temporalCrystals(current);
  panel.querySelector("[data-role='confluences']").textContent = current.confluences;
  panel.querySelector("[data-role='treatise']").textContent = treatise(actor)?.name ?? "Tratado não escolhido";
  const treatiseImage = panel.querySelector("[data-role='treatise-icon']");
  if (treatiseImage) treatiseImage.src = treatiseIcon(actor);
  panel.querySelector("[data-role='reaction']").textContent = current.reaction ? "Reação Temporal disponível" : "Reação Temporal utilizada";
  panel.querySelector("[data-role='compact-points']").textContent = `${current.points}/${current.maximum} PT`;
  panel.querySelector("[data-role='compact-name']").textContent = selectedEntry(actor, panel)?.item.name ?? "Intervenções";
  panel.querySelector("[data-action='reaction']").classList.toggle("active", current.reaction);
  panel.classList.toggle("reaction-ready", current.reaction);
  panel.querySelector("[data-action='points-minus']").disabled = current.points <= 0;
  panel.querySelector("[data-action='points-plus']").disabled = current.points >= current.maximum;
  for (const button of panel.querySelectorAll("[data-action='trail']")) {
    const active = button.dataset.law === current.trail;
    button.classList.toggle("active", active);
    if (button.closest("[data-role='trail-laws']")) button.style.transform = active ? "translate(-50%,-50%) translateX(7px) scale(1.18)" : "translate(-50%,-50%) scale(1)";
  }
  const interventions = actorInterventions(actor);
  for (const button of panel.querySelectorAll("[data-action='confluence-law']")) {
    const law = button.dataset.law;
    const same = !current.trail || law === current.trail;
    const candidates = same ? [] : interventions.filter(entry => entry.laws.includes(law));
    const ready = candidates.some(entry => entry.cost <= current.points && (!/Reação/i.test(entry.execution) || current.reaction));
    button.classList.toggle("ready", ready);
    button.classList.toggle("blocked", !same && candidates.length > 0 && !ready);
    button.classList.toggle("dark", same || !candidates.length);
    button.classList.toggle("active", law === current.trail);
    button.style.transform = ready
      ? "translate(-50%,-50%) translateX(-7px) scale(1.18)"
      : (!same && candidates.length > 0 ? "translate(-50%,-50%) scale(.9)" : "translate(-50%,-50%) scale(.86)");
    const name = confluenceName(current.trail, law);
    const matching = candidates.map(entry => entry.item.name).join(", ");
    button.title = same ? (current.trail ? "A mesma Lei não forma Confluência" : "Defina um Rastro primeiro") : `${name}${matching ? ` — ${matching}` : " — nenhuma Intervenção conhecida"}`;
  }
  const trailDisplay = panel.querySelector("[data-role='trail-display']");
  if (trailDisplay) trailDisplay.textContent = current.trail || "Nenhum Rastro";
  const trailIcon = panel.querySelector("[data-role='trail-icon']");
  if (trailIcon) trailIcon.className = `fa-solid ${current.trail ? LAW_ICONS[LAWS.indexOf(current.trail)] : "fa-minus"}`;
  const confluenceDisplay = panel.querySelector("[data-role='confluence-display']");
  if (confluenceDisplay) confluenceDisplay.textContent = current.confluences ? `${current.confluences} Confluência${current.confluences === 1 ? "" : "s"}` : "Nenhuma disponível";
  const affinityDisplay = panel.querySelector("[data-role='affinity']");
  if (affinityDisplay) affinityDisplay.textContent = affinity(actor);
  for (const marker of panel.querySelectorAll("[data-role='combat-timeline'] [data-combatant-id]")) {
    marker.querySelector("small").textContent = game.combat?.combatants?.get(marker.dataset.combatantId)?.name ?? "—";
  }
  renderSelection(panel, actor);
  const feedback = panel.querySelector("[data-role='confluence-hint']");
  if (feedback) {
    const uses = temporalTurnKey() && current.parallelTurnKey === temporalTurnKey() ? current.parallelUses.length : 0;
    const parallel = uses ? ` • Paralelismo ${uses}/2` : "";
    feedback.textContent = current.lastAction ? `${current.lastAction.confluence || `Rastro: ${current.lastAction.law || "—"}`} • ${current.lastAction.cost} PT${parallel}` : "Gire o anel para consultar a Biblioteca";
  }
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
