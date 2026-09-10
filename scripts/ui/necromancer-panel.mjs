import { MODULE_ID } from "../constants.mjs";
import {
  cadavericState, isNovaEraNecromancer, lesserServantLimit, necromancerLevel,
  setCadavericEssence, useCorpseExplosion, useDeathMark, useLesserReanimation,
  useProfaneSacrifice, useProfaneTouch
} from "../necromancer/core-automation.mjs";

const openPanels = new Map();
const FoundryApplication = globalThis.Application ?? foundry?.appv1?.api?.Application;
const ART_ROOT = `modules/${MODULE_ID}/assets/ui/necromancer/relicario-v1`;
const ICON = `${ART_ROOT}/relicario-essencia.webp`;

function rootOf(app, html) { return html?.querySelector ? html : html?.[0]?.querySelector ? html[0] : app.element?.[0] ?? app.element ?? null; }
function contentKey(item) { return item?.getFlag?.(MODULE_ID, "contentKey") ?? ""; }
function feature(actor, key) { return actor.items.find(item => contentKey(item) === key); }
function stateMode(actor, state) {
  const effects = actor.effects.map(effect => String(effect.getFlag(MODULE_ID, "necromancerEffect") ?? ""));
  if (effects.includes("death-avatar")) return "avatar";
  if (effects.includes("partial-lich")) return "lich";
  return state.points > 0 ? "essence" : "empty";
}
function modeTitle(mode) { return ({ empty: "O SILÊNCIO DAS ALMAS", essence: "ESSÊNCIA APRISIONADA", lich: "FORMA LICH PARCIAL", avatar: "AVATAR DA MORTE" })[mode]; }
function worldServants(actor) { return game.actors.filter(entry => entry.getFlag(MODULE_ID, "necromancerServant") && entry.getFlag(MODULE_ID, "masterUuid") === actor.uuid); }
function perfectCorpse(actor) { return game.actors.find(entry => entry.getFlag(MODULE_ID, "necromancerPerfectCorpse") && entry.getFlag(MODULE_ID, "masterUuid") === actor.uuid) ?? null; }
function effectActive(actor, key) { return actor.effects.some(effect => effect.getFlag(MODULE_ID, "necromancerEffect") === key); }
function escape(value) { return foundry.utils.escapeHTML(String(value ?? "")); }

function markup(actor) {
  const state = cadavericState(actor);
  const mode = stateMode(actor, state);
  const level = necromancerLevel(actor);
  const mark = state.markUuid ? fromUuidSync(state.markUuid) : null;
  const path = actor.items.find(item => item.type === "subclass" && item.system?.classIdentifier === "necromancer-nova-era");
  const servants = worldServants(actor);
  const servantLimit = lesserServantLimit(actor);
  const champion = perfectCorpse(actor);
  const energy = Array.from({ length: state.maximum }, (_, index) => `<i class="${index < state.points ? "full" : ""}"></i>`).join("");
  const dust = Array.from({ length: 22 }, (_, index) => `<i class="ne-relic-mote" style="--x:${18 + (index * 23) % 64}%;--dur:${5 + index % 7}s;--delay:${-(index * .67)}s"></i>`).join("");
  const servantSlots = Array.from({ length: Math.max(servantLimit, servants.length) }, (_, index) => {
    const servant = servants[index];
    if (!servant) return `<button class="ne-relic-servant empty" data-action="reanimate" aria-label="Vínculo ${index + 1} vazio">·</button>`;
    const type = servant.getFlag(MODULE_ID, "servantType") === "zombie" ? "Z" : "E";
    const hp = servant.system.attributes?.hp ?? {};
    return `<button class="ne-relic-servant" data-action="open-actor" data-actor-id="${servant.id}" title="${escape(servant.name)} • ${Number(hp.value ?? 0)}/${Number(hp.max ?? 0)} PV">${type}</button>`;
  }).join("");
  const fieldButton = (key, label, cost) => {
    const item = feature(actor, key);
    const effectKey = key === "necromancer-death-presence" ? "death-presence" : key === "necromancer-dead-field" ? "dead-field" : "cadaveric-horde";
    const active = effectActive(actor, effectKey);
    return `<button data-action="open-feature" data-item-id="${item?.id ?? ""}" aria-pressed="${active}" ${item ? "" : "disabled"}>${active ? `${label} • ativa` : `${label} • ${cost}`}</button>`;
  };
  const art = ["empty", "essence", "lich", "avatar"].map(name => `<img class="ne-relic-art ${mode === name ? "visible" : ""}" src="${ART_ROOT}/relicario-${name === "empty" ? "vazio" : name === "essence" ? "essencia" : name}.webp" alt="Relicário: ${name}">`).join("");
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  return `<section class="nova-era necromancer-panel ne-soul-reliquary" data-actor-uuid="${actor.uuid}" data-mode="${mode}" data-motion="${reducedMotion ? "off" : "on"}" style="--energy:${mode === "empty" ? 0 : mode === "essence" ? (.22 + .6 * state.points / Math.max(1, state.maximum)).toFixed(2) : mode === "lich" ? .85 : 1}">
    <header class="ne-relic-head"><div>N E C R O M A N T E</div><h2>Relicário de Almas</h2><p>${escape(path?.name?.replace("Caminho do ", "") ?? "Caminho não escolhido")} · Nível ${level}</p><strong>${modeTitle(mode)}</strong></header>
    <div class="ne-relic-stage"><div class="ne-relic-core-light"></div><div class="ne-relic-halo"></div><div class="ne-relic-orbit"><i></i></div><div class="ne-relic-orbit second"><i></i></div><div class="ne-relic-art-stack">${art}</div>
      <div class="ne-relic-runes" aria-label="Instabilidade ${state.instability}">${[1,2,3].map(value => `<span class="${value <= state.instability ? "on" : ""}"><b>${["I","II","III"][value-1]}</b></span>`).join("")}</div><div class="ne-relic-dust">${dust}</div><div class="ne-relic-burst"></div>
      <div class="ne-relic-readout"><span>${state.points}</span><i> / ${state.maximum}</i><small>ESSÊNCIA CADAVÉRICA</small></div>
    </div>
    <div class="ne-relic-energy" role="meter" aria-valuemin="0" aria-valuemax="${state.maximum}" aria-valuenow="${state.points}">${energy}</div>
    <div class="ne-relic-reserve"><button data-action="minus" ${state.points <= 0 ? "disabled" : ""}>−</button><span>INSTABILIDADE <b>${["0","I","II","III"][state.instability]}</b></span><button data-action="plus" ${state.points >= state.maximum ? "disabled" : ""}>+</button></div>
    <button class="ne-relic-mark" data-action="mark" data-marked="${!!mark}"><i></i><span>${mark ? `MARCA · ${escape(mark.name)}` : "NENHUMA MARCA DE MORTE"}</span></button>
    <div class="ne-relic-commands"><button data-action="mark"><b>Marca de Morte</b><small>AÇÃO BÔNUS · 18 M</small></button><button data-action="sacrifice" ${state.points >= state.maximum ? "disabled" : ""}><b>Sacrifício</b><small>AÇÃO BÔNUS · +1 EC</small></button><button data-action="reanimate" ${state.points < 2 || servants.length >= servantLimit ? "disabled" : ""}><b>Reanimar</b><small>AÇÃO · 2 EC</small></button><button data-action="explode" ${state.points < 2 ? "disabled" : ""}><b>Explodir cadáver</b><small>AÇÃO · 2 EC</small></button><button data-action="touch"><b>Toque Profano</b><small>AÇÃO · 18 M</small></button><button data-action="open-feature" data-item-id="${feature(actor,"necromancer-mass-harvest")?.id ?? ""}" ${feature(actor,"necromancer-mass-harvest") ? "" : "disabled"}><b>Colheita</b><small>MORTE MARCADA · 9 M</small></button></div>
    <div class="ne-relic-fields">${fieldButton("necromancer-death-presence","Presença",mode === "avatar" ? "0 EC" : "1 EC")}${fieldButton("necromancer-dead-field","Domínio","5 EC")}${fieldButton("necromancer-infinite-army","Horda","6 EC")}</div>
    <div class="ne-relic-army-head"><span>VÍNCULOS CADAVÉRICOS</span><span>${servants.length} / ${servantLimit}</span></div><div class="ne-relic-servants">${servantSlots}</div>
    <button class="ne-relic-champion ${champion ? "" : "empty"}" data-action="${champion ? "open-actor" : "open-feature"}" data-actor-id="${champion?.id ?? ""}" data-item-id="${feature(actor,"necromancer-perfect-reanimation")?.id ?? ""}"><span class="sigil">V</span><span><b>${escape(champion?.name ?? "Nenhum Cadáver Perfeito")}</b><small>${champion ? "CADÁVER PERFEITO" : "RITUAL DISPONÍVEL NO NÍVEL 11"}</small></span><span class="hp">${champion ? `${Number(champion.system.attributes?.hp?.value ?? 0)} / ${Number(champion.system.attributes?.hp?.max ?? 0)} PV` : "SEM VÍNCULO"}</span></button>
    <div class="ne-relic-notice" role="status">As almas aguardam sua vontade.</div>
    <details class="ne-relic-orders"><summary>ORDENS NECROMÂNTICAS</summary><div>${["Atacar","Defender","Avançar","Recuar","Interagir"].map(order => `<button data-action="order" data-order="${order}">${order}</button>`).join("")}</div></details>
    <footer>A morte deixa memória. Você lhe dá propósito.</footer>
  </section>`;
}

function panelElement(actor) {
  const wrapper = document.createElement("div"); wrapper.innerHTML = markup(actor); const panel = wrapper.firstElementChild;
  panel.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]"); if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "minus") await setCadavericEssence(actor, cadavericState(actor).points - 1, { reason: "Ajuste manual" });
    if (action === "plus") await setCadavericEssence(actor, cadavericState(actor).points + 1, { reason: "Ajuste manual" });
    if (action === "mark") await useDeathMark(actor);
    if (action === "touch") await useProfaneTouch(actor);
    if (action === "sacrifice") await useProfaneSacrifice(actor);
    if (action === "reanimate") await useLesserReanimation(actor);
    if (action === "explode") await useCorpseExplosion(actor);
    if (action === "open-feature") actor.items.get(button.dataset.itemId)?.sheet?.render(true);
    if (action === "open-actor") game.actors.get(button.dataset.actorId)?.sheet?.render(true);
    if (action === "order") {
      await actor.setFlag(MODULE_ID, "necromancerOrder", button.dataset.order);
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era necromancer-chat"><h2>Ordem: ${button.dataset.order}</h2><p>“Os mortos não hesitam. Eles obedecem.”</p></section>` });
      Hooks.callAll("novaEraNecromancerChanged", { actor, reason: `Ordem ${button.dataset.order}` });
    }
  });
  return panel;
}

class NecromancerPanelApplication extends FoundryApplication {
  constructor(actor, options={}) { super(options); this.actor=actor; }
  static get defaultOptions() { return foundry.utils.mergeObject(super.defaultOptions, { classes:["nova-era-window","nova-era-necromancer-window"], width:680, height:1000, resizable:true, minimizable:true, popOut:true }, { inplace:false }); }
  get id() { return `nova-era-necromancer-${this.actor.id}`; }
  get title() { return `Relicário de Almas — ${this.actor.name}`; }
  async _renderInner() { return globalThis.jQuery(panelElement(this.actor)); }
  async close(options={}) { openPanels.delete(this.actor.uuid); return super.close(options); }
}
export function openNecromancerPanel(actor) {
  if (!isNovaEraNecromancer(actor)) { ui.notifications.warn("Nova Era: esta ficha não pertence a um Necromante."); return null; }
  const existing=openPanels.get(actor.uuid); if(existing?.rendered){ existing.bringToTop?.(); return existing; }
  const panel=new NecromancerPanelApplication(actor); openPanels.set(actor.uuid,panel); panel.render(true); return panel;
}
function launcher(app, html) {
  const actor=app.actor??app.document; if(!isNovaEraNecromancer(actor)) return;
  const root=rootOf(app,html); if(!root||root.querySelector(".ne-necro-launcher")) return;
  const button=document.createElement("button"); button.type="button"; button.className="ne-necro-launcher";
  button.innerHTML=`<img src="${ICON}" alt=""><span><strong>Relicário de Almas</strong><small>Abrir receptáculo necromântico</small></span><i class="fa-solid fa-up-right-from-square"></i>`;
  button.addEventListener("click",event=>{event.preventDefault();openNecromancerPanel(actor);});
  const sidebar=root.querySelector(".sheet-body .main-content > .sidebar, .sheet-body .main-content .sidebar, [data-application-part='sidebar']");
  const portrait=sidebar?.querySelector(".portrait, .profile, .sheet-profile, [data-application-part='portrait']");
  if(portrait) portrait.after(button); else if(sidebar) sidebar.prepend(button); else root.querySelector(".sheet-body, [data-application-part='body'], .tab-body")?.prepend(button);
}
export function refreshNecromancerPanels(){ for(const app of openPanels.values()) if(app.rendered) app.render(false); }
export function registerNecromancerPanel(){
  for(const hook of ["renderActorSheet","renderActorSheetV2","renderActorSheet5eCharacter","renderActorSheet5eCharacter2"]) Hooks.on(hook,launcher);
  Hooks.on("novaEraNecromancerChanged",refreshNecromancerPanels); Hooks.on("updateActor",refreshNecromancerPanels); Hooks.on("createItem",refreshNecromancerPanels); Hooks.on("deleteItem",refreshNecromancerPanels); Hooks.on("createActiveEffect",refreshNecromancerPanels); Hooks.on("deleteActiveEffect",refreshNecromancerPanels);
}
