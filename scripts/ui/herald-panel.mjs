import { MODULE_ID } from "../constants.mjs";
import {
  activateHeraldConcordance, activateHeraldHarmony, configureHeraldSpellAffinity,
  dissipateHeraldResonances, endHeraldTurn, generateHeraldResonance, heraldCounts,
  heraldLevel, heraldPath, heraldState, isNovaEraHerald, prepareHeraldRelease,
  tuneHeraldResonances
} from "../herald/core-automation.mjs";
import { heraldCapacity, heraldOverloadThreshold } from "../herald/rules.mjs";
import { activateHeraldFeature } from "../herald/advanced-automation.mjs";

const openPanels = new Map();
const FoundryApplication = globalThis.Application ?? foundry?.appv1?.api?.Application;
const ART_ROOT = `modules/${MODULE_ID}/assets/ui/herald`;
const TYPE_NAMES = { vida: "Vida", equilibrio: "Equilíbrio", ruptura: "Ruptura" };
const PATH_NAMES = { none: "Caminho ainda não escolhido", vida: "Sentimentalista", equilibrio: "Concordante", ruptura: "Executor" };
const ECO_NAMES = { ve: "Harmonia Vital", er: "Interferência", vr: "Paradoxo Vital" };

function rootOf(app, html) { return html?.querySelector ? html : html?.[0]?.querySelector ? html[0] : app.element?.[0] ?? app.element ?? null; }
function escape(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
function mode(state, level) {
  if (state.absoluteTurns > 0) return "absoluto";
  if (state.resonances.length >= heraldOverloadThreshold(level)) return "sobrecarga";
  return state.resonances.length ? "sintonia" : "inerte";
}
function power(value, absolute) { return absolute ? 1 : value <= 0 ? 0 : value === 1 ? .52 : value === 2 ? .78 : 1; }

function markup(app) {
  const actor = app.actor, state = heraldState(actor), level = heraldLevel(actor), counts = heraldCounts(actor), path = heraldPath(actor), visual = mode(state, level), capacity = heraldCapacity(level);
  const threshold = heraldOverloadThreshold(level);
  const resonances = state.resonances.map(entry => `<button class="ne-herald-resonance ${app.selected.has(entry.id) ? "selected" : ""}" data-action="select" data-id="${entry.id}" data-type="${entry.type}"><strong>${TYPE_NAMES[entry.type]}</strong><small>até o turno ${entry.expires}</small></button>`).join("");
  const dots = Array.from({ length: capacity }, (_, index) => `<i class="${index < state.resonances.length ? "filled" : ""}"></i>`).join("");
  const concordances = Object.entries(ECO_NAMES).map(([key, name]) => `<button data-action="echo" data-key="${key}" class="${state.concordances.some(entry => entry.key === key) ? "active" : ""}" ${state.pendingEcho.includes(key) ? "" : "disabled"}><i class="duo ${key}"></i>${name}</button>`).join("");
  const flowRemaining = Math.max(0, Number(actor.system?.attributes?.prof ?? 2) - state.flowUses);
  const pathAbilities = path === "vida" ? [[7, "herald-vital-bond", "Vínculo Vital"], [20, "herald-unbreakable-life", "Vida Inquebrável"]]
    : path === "equilibrio" ? [[15, "herald-combat-symphony", "Sinfonia de Combate"], [20, "herald-divine-tempo", "Tempo Divino"]]
      : path === "ruptura" ? [[11, "herald-absolute-piercing", "Perfuração Absoluta"], [20, "herald-final-judgment", "Julgamento Final"]] : [];
  const pathButtons = pathAbilities.filter(([required]) => level >= required).map(([, key, label]) => `<button data-action="feature" data-key="${key}">${label}</button>`).join("");
  return `<section class="nova-era ne-herald-instrument" data-mode="${visual}" data-path="${path}" data-motion="${globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "off" : "on"}" style="--v-power:${power(counts.vida, state.absoluteTurns > 0)};--e-power:${power(counts.equilibrio, state.absoluteTurns > 0)};--r-power:${power(counts.ruptura, state.absoluteTurns > 0)}">
    <header class="ne-herald-head"><div>A R A U T O &nbsp; D A S &nbsp; R E S S O N Â N C I A S</div><h2>Cristais da Ressonância</h2><p>${PATH_NAMES[path]} · Nível ${level}</p></header>
    <div class="ne-herald-status"><span>TURNO ${state.turn}</span><strong>${visual === "absoluto" ? "HARMONIA ABSOLUTA" : visual.toUpperCase()}</strong><span>${state.resonances.length} / ${capacity} ECOS</span></div>
    <div class="ne-herald-stage"><img class="ne-herald-frame" src="${ART_ROOT}/moldura-ressonante.svg" alt=""><div class="ne-herald-art"><i class="aura vida"></i><i class="aura equilibrio"></i><i class="aura ruptura"></i><img class="base" src="${ART_ROOT}/cristais-flutuantes.png" alt="Três Cristais da Ressonância"><img class="overlay vida" src="${ART_ROOT}/cristais-flutuantes.png" alt=""><img class="overlay equilibrio" src="${ART_ROOT}/cristais-flutuantes.png" alt=""><img class="overlay ruptura" src="${ART_ROOT}/cristais-flutuantes.png" alt=""></div><img class="ne-herald-fixed" src="${ART_ROOT}/base-imovel.png" alt=""><div class="ne-herald-pulse"></div></div>
    <div class="ne-herald-frequencies"><div class="vida"><span>VIDA</span><b>${counts.vida}</b></div><div class="equilibrio"><span>EQUILÍBRIO</span><b>${counts.equilibrio}</b></div><div class="ruptura"><span>RUPTURA</span><b>${counts.ruptura}</b></div></div>
    <div class="ne-herald-meter"><div><strong>RESSONÂNCIAS ARMAZENADAS</strong><small>${Number.isFinite(threshold) ? `Sobrecarga a partir de ${threshold}` : "Sobrecarga suprimida"}</small></div><div class="ne-herald-dots">${dots}</div><div class="ne-herald-track">${resonances || "<span>Os cristais aguardam a primeira conjuração.</span>"}</div></div>
    <div class="ne-herald-cast"><button data-action="generate" data-type="vida"><i></i><b>Gerar Vida</b></button><button data-action="generate" data-type="equilibrio"><i></i><b>Gerar Equilíbrio</b></button><button data-action="generate" data-type="ruptura"><i></i><b>Gerar Ruptura</b></button></div>
    <div class="ne-herald-section"><div><strong>ECO RESSONANTE</strong><small>${level >= 13 ? "2 Concordâncias ativas" : "1 Concordância ativa"}</small></div><div class="ne-herald-concordances">${concordances}</div></div>
    <div class="ne-herald-tools"><button data-action="tune" ${app.selected.size ? "" : "disabled"}>Afinar selecionados</button><button data-action="dissipate" data-mode="heal" ${app.selected.size ? "" : "disabled"}>Dissipar · PV</button><button data-action="dissipate" data-mode="temp" ${app.selected.size ? "" : "disabled"}>Dissipar · PV temp.</button></div>
    <div class="ne-herald-release"><label>Frequência<select data-field="affinity"><option value="vida">Vida</option><option value="equilibrio">Equilíbrio</option><option value="ruptura">Ruptura</option></select></label><label>Liberação<select data-field="release"><option value="modulacao">Modulação · 1</option><option value="pura">Ressonância Pura · 3</option><option value="triade">Tríade · V+E+R</option></select></label><button data-action="release">Preparar para a próxima magia</button></div>
    ${pathButtons ? `<div class="ne-herald-path-actions"><strong>TÉCNICAS DO CAMINHO</strong><div>${pathButtons}</div></div>` : ""}
    <div class="ne-herald-readouts"><div><small>ESTABILIDADE</small><strong>${visual === "sobrecarga" ? "Teste ao fim do turno" : visual === "absoluto" ? "Perfeita" : "Estável"}</strong></div><div><small>FLUXO APRIMORADO</small><strong>${level >= 7 ? `${flowRemaining} usos` : "Nível 7"}</strong></div><div><small>CAMINHO</small><strong>${PATH_NAMES[path]}</strong></div></div>
    <div class="ne-herald-actions"><button data-action="affinities">Afinidades das magias</button>${level >= 20 ? `<button data-action="harmony" ${state.absoluteUsed ? "disabled" : ""}>Harmonia Absoluta</button>` : ""}<button class="primary" data-action="end-turn">Encerrar turno <span>→</span></button></div>
    <div class="ne-herald-notice">${state.pendingRelease ? `${escape(state.pendingRelease.kind)} de ${TYPE_NAMES[state.pendingRelease.affinity]} preparada.` : state.pendingEcho.length ? "Uma Concordância aguarda sua escolha." : "A magia de agora prepara as escolhas do próximo turno."}</div>
    <footer>Toda magia deixa uma memória. O Arauto decide o que ela se tornará.</footer>
  </section>`;
}

async function chooseType(title) {
  return new Promise(resolve => new Dialog({ title, content: "<p>Escolha a nova frequência dos ecos selecionados.</p>", buttons: Object.fromEntries(Object.entries(TYPE_NAMES).map(([key, label]) => [key, { label, callback: () => resolve(key) }])), close: () => resolve("") }).render(true));
}

function panelElement(app) {
  const wrapper = document.createElement("div"); wrapper.innerHTML = markup(app); const panel = wrapper.firstElementChild;
  panel.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]"); if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "select") { const id = button.dataset.id; if (app.selected.has(id)) app.selected.delete(id); else { if (app.selected.size >= 2) app.selected.clear(); app.selected.add(id); } app.render(false); return; }
    if (action === "generate") await generateHeraldResonance(app.actor, button.dataset.type, { source: "Ajuste manual pelo painel" });
    if (action === "echo") await activateHeraldConcordance(app.actor, button.dataset.key);
    if (action === "tune") { const type = await chooseType("Satz Aurora — Afinar"); if (type && await tuneHeraldResonances(app.actor, [...app.selected], type)) app.selected.clear(); }
    if (action === "dissipate" && await dissipateHeraldResonances(app.actor, [...app.selected], button.dataset.mode)) app.selected.clear();
    if (action === "release") { const root = button.closest(".ne-herald-instrument"); await prepareHeraldRelease(app.actor, root.querySelector('[data-field="release"]').value, root.querySelector('[data-field="affinity"]').value); }
    if (action === "end-turn") await endHeraldTurn(app.actor);
    if (action === "harmony") await activateHeraldHarmony(app.actor);
    if (action === "affinities") await configureHeraldSpellAffinity(app.actor);
    if (action === "feature") await activateHeraldFeature(app.actor, button.dataset.key);
  });
  return panel;
}

class HeraldPanelApplication extends FoundryApplication {
  constructor(actor, options = {}) { super(options); this.actor = actor; this.selected = new Set(); }
  static get defaultOptions() { return foundry.utils.mergeObject(super.defaultOptions, { classes: ["nova-era-window", "nova-era-herald-window"], width: 760, height: Math.min(900, Math.max(560, globalThis.innerHeight - 90)), resizable: true, minimizable: true, popOut: true, scrollY: [".window-content"] }, { inplace: false }); }
  get id() { return `nova-era-herald-${this.actor.id}`; }
  get title() { return `Cristais da Ressonância — ${this.actor.name}`; }
  async _renderInner() { return globalThis.jQuery(panelElement(this)); }
  async close(options = {}) { openPanels.delete(this.actor.uuid); return super.close(options); }
}

export function openHeraldPanel(actor) {
  if (!isNovaEraHerald(actor)) { ui.notifications.warn("Nova Era: esta ficha não pertence a um Arauto das Ressonâncias."); return null; }
  const existing = openPanels.get(actor.uuid); if (existing?.rendered) { existing.bringToTop?.(); return existing; }
  const panel = new HeraldPanelApplication(actor); openPanels.set(actor.uuid, panel); panel.render(true); return panel;
}

function launcher(app, html) {
  const actor = app.actor ?? app.document; if (!isNovaEraHerald(actor)) return;
  const root = rootOf(app, html); if (!root || root.querySelector(".ne-herald-launcher")) return;
  const button = document.createElement("button"); button.type = "button"; button.className = "ne-herald-launcher";
  button.innerHTML = `<img src="${ART_ROOT}/tres-cristais.png" alt=""><span><strong>Cristais da Ressonância</strong><small>Abrir painel ressonante</small></span><i class="fa-solid fa-up-right-from-square"></i>`;
  button.addEventListener("click", event => { event.preventDefault(); openHeraldPanel(actor); });
  const sidebar = root.querySelector(".sheet-body .main-content > .sidebar, .sheet-body .main-content .sidebar, [data-application-part='sidebar']");
  const portrait = sidebar?.querySelector(".portrait, .profile, .sheet-profile, [data-application-part='portrait']");
  if (portrait) portrait.after(button); else if (sidebar) sidebar.prepend(button); else root.querySelector(".sheet-body, [data-application-part='body'], .tab-body")?.prepend(button);
}

export function registerHeraldPanel() {
  for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderActorSheet5eCharacter", "renderActorSheet5eCharacter2"]) Hooks.on(hook, launcher);
  Hooks.on("novaEraHeraldChanged", ({ actor }) => { const app = openPanels.get(actor.uuid); if (app?.rendered) app.render(false); });
  Hooks.on("deleteActor", actor => { const app = openPanels.get(actor.uuid); if (app) void app.close(); });
}
