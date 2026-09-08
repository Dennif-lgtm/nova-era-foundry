import { MODULE_ID } from "../constants.mjs";
import { bloodState, isNovaEraBerserker, setBloodPoints, useBloodTechnique, useBrutalStrike } from "../berserker/core-automation.mjs";

const openPanels = new Map();
const FoundryApplication = globalThis.Application ?? foundry?.appv1?.api?.Application;
const ICON_ROOT = `modules/${MODULE_ID}/assets/icons/berserker`;

function sheetRoot(app, html) {
  if (html?.querySelector) return html;
  if (html?.[0]?.querySelector) return html[0];
  return app.element?.[0] ?? app.element ?? null;
}

function panelMarkup(actor) {
  const state = bloodState(actor);
  const ratio = state.maximum ? state.points / state.maximum : 0;
  const heart = state.frenzy ? "coracao-frenesi-v1.png" : state.points ? "coracao-com-sangue-v1.png" : "coracao-sem-sangue-v1.png";
  const segments = Array.from({ length: state.maximum }, (_, index) => `<span class="${index < state.points ? "filled" : ""}${index + 1 === state.threshold ? " threshold" : ""}" title="${index + 1} PS"></span>`).join("");
  const techniqueItems = actor.items.filter(item => String(item.getFlag(MODULE_ID, "group") ?? "").startsWith("tecnicas-")).sort((a, b) => Number(a.getFlag(MODULE_ID, "level")) - Number(b.getFlag(MODULE_ID, "level")) || a.name.localeCompare(b.name));
  const techniques = techniqueItems.map(item => {
    const cost = Number(item.getFlag(MODULE_ID, "bloodCost") ?? 0);
    const sacrifice = !!item.getFlag(MODULE_ID, "sacrifice");
    const level = Number(item.getFlag(MODULE_ID, "level") ?? 0);
    return `<button data-action="technique" data-item-id="${item.id}" ${cost > state.points ? "disabled" : ""}><span>${item.name}</span><small>N${level} • ${cost} PS${sacrifice ? " + Sacrifício" : ""}</small></button>`;
  }).join("") || `<p>Nenhuma Técnica conhecida na ficha.</p>`;
  const legacy = actor.items.find(item => item.type === "subclass" && String(item.system?.classIdentifier ?? "") === "berserker-nova-era");
  const legacyFeatures = actor.items.filter(item => ["legado-imortal", "legado-carniceiro", "legado-frenetico", "legado-besta"].includes(String(item.getFlag(MODULE_ID, "group") ?? ""))).sort((a, b) => Number(a.getFlag(MODULE_ID, "level")) - Number(b.getFlag(MODULE_ID, "level")));
  const mutations = actor.items.filter(item => String(item.getFlag(MODULE_ID, "contentKey") ?? "").startsWith("berserker-mutacao-"));
  const featureList = entries => entries.length ? entries.map(item => `<button data-action="open-item" data-item-id="${item.id}"><span>${item.name}</span><small>Nível ${Number(item.getFlag(MODULE_ID, "level") ?? 0)}</small></button>`).join("") : `<p>Nenhuma escolha registrada.</p>`;
  return `<section class="nova-era berserker-panel ${state.frenzy ? "is-frenzy" : ""}" data-actor-uuid="${actor.uuid}" style="--blood-ratio:${ratio}">
    <div class="ne-berserker-frame">
      <header><small>NOVA ERA</small><h2>BERSERKER</h2><em>${state.frenzy ? "FRENESI" : "SANGUE DO MASSACRE"}</em></header>
      <div class="ne-berserker-heart"><img src="${ICON_ROOT}/${heart}" alt="Estado do Sangue"><strong>${state.points}<small> / ${state.maximum} PS</small></strong></div>
      <div class="ne-berserker-segments">${segments}</div>
      <p class="ne-berserker-threshold">Limiar de Frenesi: ${state.threshold} PS</p>
      <div class="ne-berserker-controls"><button data-action="minus" title="Remover 1 PS">−</button><button data-action="brutal"><i class="fa-solid fa-hand-fist"></i> GOLPE BRUTAL</button><button data-action="plus" title="Adicionar 1 PS">+</button></div>
      <section class="ne-berserker-status"><span>${legacy?.name ?? "LEGADO NÃO ESCOLHIDO"}</span><span>${state.frenzy ? "FRENESI ATIVO" : `${Math.max(0, state.threshold - state.points)} PS PARA O FRENESI`}</span></section>
      <details class="ne-berserker-techniques" open><summary>TÉCNICAS DE SANGUE • ${techniqueItems.length}/6</summary><div>${techniques}</div></details>
      <details class="ne-berserker-techniques"><summary>LEGADO • ${legacyFeatures.length}</summary><div>${featureList(legacyFeatures)}</div></details>
      <details class="ne-berserker-techniques"><summary>MUTAÇÕES • ${mutations.length}/3</summary><div>${featureList(mutations)}</div></details>
      <footer>${state.frenzy ? "A dor já não ordena. Ela obedece." : "Toda ferida aproxima o despertar."}</footer>
    </div>
  </section>`;
}

function createPanel(actor) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = panelMarkup(actor);
  const panel = wrapper.firstElementChild;
  panel.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "minus") await setBloodPoints(actor, bloodState(actor).points - 1, { reason: "Ajuste manual" });
    if (button.dataset.action === "plus") await setBloodPoints(actor, bloodState(actor).points + 1, { reason: "Ajuste manual" });
    if (button.dataset.action === "brutal") await useBrutalStrike(actor);
    if (button.dataset.action === "technique") await useBloodTechnique(actor, actor.items.get(button.dataset.itemId));
    if (button.dataset.action === "open-item") actor.items.get(button.dataset.itemId)?.sheet?.render(true);
  });
  return panel;
}

class BerserkerPanelApplication extends FoundryApplication {
  constructor(actor, options = {}) { super(options); this.actor = actor; }
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { classes: ["nova-era-window", "nova-era-berserker-window"], width: 500, height: 760, resizable: true, minimizable: true, popOut: true }, { inplace: false });
  }
  get id() { return `nova-era-berserker-${this.actor.id}`; }
  get title() { return `Coração do Berserker — ${this.actor.name}`; }
  async _renderInner() { return globalThis.jQuery(createPanel(this.actor)); }
  async close(options = {}) { openPanels.delete(this.actor.uuid); return super.close(options); }
}

export function openBerserkerPanel(actor) {
  if (!isNovaEraBerserker(actor)) {
    ui.notifications.warn("Nova Era: esta ficha não pertence a um Berserker.");
    return null;
  }
  const existing = openPanels.get(actor.uuid);
  if (existing?.rendered) { existing.bringToTop?.(); return existing; }
  const panel = new BerserkerPanelApplication(actor);
  openPanels.set(actor.uuid, panel);
  panel.render(true);
  return panel;
}

function addSheetLauncher(app, html) {
  const actor = app.actor ?? app.document;
  if (!isNovaEraBerserker(actor)) return;
  const root = sheetRoot(app, html);
  if (!root || root.querySelector(".ne-berserker-launcher")) return;
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "ne-berserker-launcher";
  launcher.innerHTML = `<img src="${ICON_ROOT}/coracao-frenesi-v1.png" alt=""><span><strong>Coração do Berserker</strong><small>Abrir painel de Sangue</small></span><i class="fa-solid fa-up-right-from-square"></i>`;
  launcher.addEventListener("click", event => { event.preventDefault(); openBerserkerPanel(actor); });
  const sidebar = root.querySelector(".sheet-body .main-content > .sidebar, .sheet-body .main-content .sidebar, [data-application-part='sidebar']");
  const portrait = sidebar?.querySelector(".portrait, .profile, .sheet-profile, [data-application-part='portrait']");
  if (portrait) portrait.after(launcher);
  else if (sidebar) sidebar.prepend(launcher);
  else root.querySelector(".sheet-body, [data-application-part='body'], .tab-body")?.prepend(launcher);
}

export function refreshBerserkerPanels() {
  for (const app of openPanels.values()) if (app.rendered) app.render(false);
}

export function registerBerserkerPanel() {
  for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderActorSheet5eCharacter", "renderActorSheet5eCharacter2"]) Hooks.on(hook, addSheetLauncher);
  Hooks.on("novaEraBerserkerChanged", refreshBerserkerPanels);
  Hooks.on("updateActor", refreshBerserkerPanels);
  Hooks.on("createItem", refreshBerserkerPanels);
  Hooks.on("deleteItem", refreshBerserkerPanels);
  Hooks.on("createActiveEffect", refreshBerserkerPanels);
  Hooks.on("deleteActiveEffect", refreshBerserkerPanels);
}
