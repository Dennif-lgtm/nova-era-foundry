import { MODULE_ID } from "../constants.mjs";
import {
  heraldDC, heraldDocumentAction, heraldLevel, heraldPath, heraldProficiency,
  heraldState, heraldWisdom, isNovaEraHerald, updateHeraldState
} from "./core-automation.mjs";

const ACTIVE_KEYS = new Set([
  "herald-vital-bond", "herald-combat-symphony", "herald-divine-tempo",
  "herald-absolute-piercing", "herald-unbreakable-life", "herald-final-judgment"
]);
const ICON = `modules/${MODULE_ID}/assets/ui/herald/tres-cristais.png`;

function keyOf(item) { return item?.getFlag?.(MODULE_ID, "contentKey") ?? ""; }
function firstRoll(result) { return Array.isArray(result) ? result[0] : result; }
function targets() { return [...(game.user.targets ?? [])].filter(token => token.actor); }
function responsible(actor) {
  const owners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return owners[0]?.id === game.user.id || (!owners.length && game.user.isGM && game.users.activeGM?.id === game.user.id);
}
function distanceMeters(leftActor, rightActor) {
  if (leftActor === rightActor) return 0;
  const left = globalThis.canvas?.tokens?.placeables?.find(token => token.actor === leftActor), right = globalThis.canvas?.tokens?.placeables?.find(token => token.actor === rightActor);
  if (!left || !right) return Infinity;
  try { return Number(globalThis.canvas.grid.measurePath([left.center, right.center]).distance ?? Infinity); } catch { return Infinity; }
}
async function confirm(title, content) { return Dialog.confirm({ title, content: `<p>${content}</p>`, defaultYes: false }); }
async function choose(title, options) {
  return new Promise(resolve => new Dialog({ title, content: "<p>Escolha uma opção.</p>", buttons: Object.fromEntries(options.map(([key, label]) => [key, { label, callback: () => resolve(key) }])), close: () => resolve("") }).render(true));
}
async function spend(actor, type, amount, reason) {
  const state = heraldState(actor), selected = state.resonances.filter(entry => entry.type === type).slice(0, amount);
  if (selected.length < amount) { ui.notifications.warn(`Nova Era: são necessárias ${amount} Ressonâncias de ${type}.`); return false; }
  await updateHeraldState(actor, { resonances: state.resonances.filter(entry => !selected.some(spent => spent.id === entry.id)) }, reason);
  return true;
}
async function effect(actor, name, changes, flag, duration = { rounds: 1 }) {
  return heraldDocumentAction(actor, "effect", { effect: { name, img: ICON, origin: actor.uuid, disabled: false, duration, changes, flags: { [MODULE_ID]: { heraldEffect: flag } } } });
}

async function vitalBond(actor) {
  const target = targets()[0]?.actor;
  if (!target) { ui.notifications.warn("Nova Era: selecione a criatura do Vínculo Vital."); return false; }
  if (!await spend(actor, "vida", 1, "Vínculo Vital")) return false;
  await actor.setFlag(MODULE_ID, "heraldVitalBond", { targetUuid: target.uuid, expiresAt: game.time.worldTime + 60 });
  await effect(target, `Vínculo Vital — ${actor.name}`, [], `vital-bond:${actor.uuid}`, { seconds: 60, startTime: game.time.worldTime });
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era herald-chat"><h2>Vínculo Vital</h2><p>${actor.name} e ${target.name} passam a compartilhar o eco da cura.</p><blockquote>“Duas vidas. Uma única canção.”</blockquote></section>` });
  return true;
}

async function absolutePiercing(actor) {
  if (actor.getFlag(MODULE_ID, "heraldAbsolutePiercingUsed")) { ui.notifications.warn("Nova Era: Perfuração Absoluta já foi usada neste descanso."); return false; }
  const chosen = targets();
  if (!chosen.length) { ui.notifications.warn("Nova Era: selecione as criaturas na linha de 9 m."); return false; }
  if (!await spend(actor, "ruptura", 2, "Perfuração Absoluta")) return false;
  const damage = await new Roll(`4d6 + ${heraldWisdom(actor)}`).evaluate();
  await damage.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Perfuração Absoluta — Constituição CD ${heraldDC(actor)}` });
  for (const token of chosen) {
    const save = firstRoll(await token.actor.rollSavingThrow({ ability: "con" }));
    const failed = Number(save?.total ?? 0) < heraldDC(actor);
    await heraldDocumentAction(token.actor, "hp", { mode: "damage", amount: failed ? Number(damage.total) : Math.floor(Number(damage.total) / 2) });
    if (failed) await effect(token.actor, `Fraturada por ${actor.name}`, [], `fractured:${actor.uuid}`);
  }
  await actor.setFlag(MODULE_ID, "heraldAbsolutePiercingUsed", true);
  return true;
}

async function combatSymphony(actor) {
  const state = heraldState(actor);
  if (!state.concordances.length) { ui.notifications.warn("Nova Era: ative uma Concordância primeiro."); return false; }
  if (!await spend(actor, "equilibrio", 2, "Sinfonia de Combate")) return false;
  const mode = await choose("Sinfonia de Combate", [["offense", "Ofensiva · +1d6"], ["defense", "Defensiva · +2 CA"], ["vital", "Vital · +1d6 de cura"]]);
  if (!mode) return false;
  await actor.setFlag(MODULE_ID, "heraldSymphony", { mode, expiresTurn: state.turn + 3 });
  const recipients = targets().map(token => token.actor); if (!recipients.includes(actor)) recipients.push(actor);
  for (const recipient of recipients) {
    const changes = mode === "defense" ? [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 }]
      : mode === "offense" ? ["mwak", "rwak", "msak", "rsak"].map(kind => ({ key: `system.bonuses.${kind}.damage`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1d6", priority: 20 }))
        : [{ key: "system.bonuses.heal", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1d6", priority: 20 }];
    await effect(recipient, `Sinfonia ${mode === "defense" ? "Defensiva" : mode === "offense" ? "Ofensiva" : "Vital"} — ${actor.name}`, changes, `symphony:${actor.uuid}`, { rounds: 3 });
  }
  ui.notifications.info("Nova Era: Sinfonia ativa por 3 turnos; o painel registrará sua aura.");
  return true;
}

async function concordanceActivated({ actor }) {
  if (heraldPath(actor) !== "equilibrio" || heraldLevel(actor) < 7 || !responsible(actor)) return;
  const mode = await choose("Campo Harmônico", [["ascending", "Ascendente · aliados +1 em ataques"], ["descending", "Descendente · inimigos atingidos -1 no próximo ataque"]]);
  if (!mode) return;
  await actor.setFlag(MODULE_ID, "heraldHarmonicField", { mode, expiresTurn: heraldState(actor).turn + 1 });
  if (mode === "ascending") {
    const recipients = targets().map(token => token.actor); if (!recipients.includes(actor)) recipients.push(actor);
    const changes = ["mwak", "rwak", "msak", "rsak"].map(kind => ({ key: `system.bonuses.${kind}.attack`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1", priority: 20 }));
    for (const recipient of recipients) await effect(recipient, `Campo Harmônico Ascendente — ${actor.name}`, changes, `harmonic-field:${actor.uuid}`);
  }
}

async function resonanceGenerated({ actor, type, resonanceId }) {
  if (type !== "equilibrio" || heraldPath(actor) !== "equilibrio" || heraldLevel(actor) < 3 || !responsible(actor)) return;
  const state = heraldState(actor), candidates = state.resonances.filter(entry => entry.id !== resonanceId);
  if (!candidates.length) return;
  const selected = await choose("Concordância Perfeita", [["none", "Não sintonizar agora"], ...candidates.map(entry => [entry.id, `${entry.type} · expira no turno ${entry.expires}`])]);
  if (!selected || selected === "none") return;
  const virtual = await choose("Concordância Perfeita", [["vida", "Tratar como Vida para formar Harmonia Vital"], ["ruptura", "Tratar como Ruptura para formar Interferência Disruptiva"]]);
  if (!virtual) return;
  const echo = virtual === "vida" ? "ve" : "er";
  await updateHeraldState(actor, { pendingEcho: [...new Set([...state.pendingEcho, echo])], perfectTuning: { resonanceId: selected, virtualType: virtual, expiresTurn: state.turn + 1 } }, "Concordância Perfeita");
}

async function combatTurnChanged(combat) {
  const ally = combat?.combatant?.actor;
  if (!ally) return;
  const key = `${combat.id}:${combat.round}:${combat.turn}`;
  for (const actor of game.actors.filter(candidate => isNovaEraHerald(candidate) && responsible(candidate) && heraldPath(candidate) === "equilibrio" && heraldLevel(candidate) >= 11)) {
    const field = actor.getFlag(MODULE_ID, "heraldHarmonicField");
    if (!field || field.expiresTurn < heraldState(actor).turn || actor.getFlag(MODULE_ID, "heraldRhythmTurn") === key || distanceMeters(actor, ally) > 6) continue;
    if (await confirm("Ritmo que Eleva", `Permitir que ${ally.name} mova até metade do deslocamento sem provocar ataques de oportunidade?`)) {
      await actor.setFlag(MODULE_ID, "heraldRhythmTurn", key);
      await effect(ally, `Ritmo que Eleva — movimento livre`, [], `uplifting-rhythm:${actor.uuid}`);
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era herald-chat"><h2>Ritmo que Eleva</h2><p>${ally.name} pode mover até metade do deslocamento sem gastar ação e sem provocar ataques de oportunidade.</p></section>` });
    }
  }
}

async function releaseResolved({ actor, activity, release }) {
  if (!release?.spent?.some(entry => entry.type === "vida") || heraldPath(actor) !== "vida" || heraldLevel(actor) < 3) return;
  const target = [...(activity?.targets ?? game.user.targets ?? [])][0]?.actor ?? actor;
  await effect(target, `Empatia Viva — próxima salvaguarda +1`, [{ key: "system.bonuses.abilities.save", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1", priority: 20 }], `empathy-save:${actor.uuid}`);
}

async function spellResolved({ actor, activity, outcome, fracturedBefore, targetActors }) {
  if (!outcome?.damage) return;
  const key = `${game.combat?.id ?? "free"}:${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}`;
  for (const target of targetActors.filter(entry => fracturedBefore.includes(entry.uuid))) {
    const roll = await new Roll(String(heraldProficiency(actor))).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Fratura Ressonante — ${target.name}` });
    await heraldDocumentAction(target, "hp", { mode: "damage", amount: Number(roll.total) });
    await heraldDocumentAction(target, "remove-effect", { flag: `fractured:${actor.uuid}` });
    if (heraldPath(actor) === "ruptura" && heraldLevel(actor) >= 15 && actor.getFlag(MODULE_ID, "heraldRuptureChainTurn") !== key && heraldState(actor).resonances.filter(entry => entry.type === "ruptura").length >= 2 && await confirm("Cadeia de Ruptura", `Consumir 2 Rupturas para propagar a Fratura de ${target.name}?`)) {
      if (await spend(actor, "ruptura", 2, "Cadeia de Ruptura")) {
        await actor.setFlag(MODULE_ID, "heraldRuptureChainTurn", key);
        const others = targets().map(token => token.actor).filter(candidate => candidate !== target).slice(0, 2);
        if (others.length) {
          const chain = await new Roll(`2d6 + ${heraldWisdom(actor)}`).evaluate();
          await chain.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Cadeia de Ruptura" });
          for (const other of others) await heraldDocumentAction(other, "hp", { mode: "damage", amount: Number(chain.total) });
        } else {
          const chain = await new Roll("2d6").evaluate();
          await chain.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Cadeia de Ruptura — alvo isolado" });
          await heraldDocumentAction(target, "hp", { mode: "damage", amount: Number(chain.total) });
        }
      }
    }
  }
  const judgment = actor.getFlag(MODULE_ID, "heraldJudgmentTarget");
  if (judgment && targetActors.some(target => target.uuid === judgment) && actor.getFlag(MODULE_ID, "heraldJudgmentTurn") !== key) {
    const roll = await new Roll("2d6").evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Julgamento Final" });
    await heraldDocumentAction(await fromUuid(judgment), "hp", { mode: "damage", amount: Number(roll.total) });
    await actor.setFlag(MODULE_ID, "heraldJudgmentTurn", key);
  }
  const field = actor.getFlag(MODULE_ID, "heraldHarmonicField");
  if (field?.mode === "descending" && field.expiresTurn >= heraldState(actor).turn) {
    for (const target of targetActors) await effect(target, `Campo Harmônico Descendente — ${actor.name}`, ["mwak", "rwak", "msak", "rsak"].map(kind => ({ key: `system.bonuses.${kind}.attack`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1", priority: 20 })), `harmonic-field:${actor.uuid}`);
  }
}

async function divineTempo(actor) {
  if (actor.getFlag(MODULE_ID, "heraldDivineTempoUsed")) return false;
  const chosen = targets().slice(0, heraldProficiency(actor));
  if (!chosen.length) { ui.notifications.warn("Nova Era: selecione os aliados do Tempo Divino."); return false; }
  await actor.setFlag(MODULE_ID, "heraldDivineTempoUsed", true);
  for (const token of chosen) await effect(token.actor, "Tempo Divino — reação imediata", [], `divine-tempo:${actor.uuid}`);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era herald-chat"><h2>Tempo Divino</h2><p>${chosen.map(token => token.name).join(", ")} podem usar a reação imediatamente para mover, atacar, usar truque ou realizar ação sem recurso limitado.</p><blockquote>“O compasso pertence aos que conseguem ouvi-lo.”</blockquote></section>` });
  return true;
}

async function unbreakableLife(actor) {
  if (actor.getFlag(MODULE_ID, "heraldUnbreakableUsed")) return false;
  await actor.setFlag(MODULE_ID, "heraldUnbreakableUsed", true);
  await actor.setFlag(MODULE_ID, "heraldUnbreakableActive", { expiresAt: game.time.worldTime + 60, protected: [] });
  ui.notifications.info("Nova Era: Vida Inquebrável ativa por 1 minuto.");
  return true;
}

export async function activateHeraldFeature(actor, itemOrKey) {
  if (!isNovaEraHerald(actor) || !actor.isOwner) return false;
  const key = typeof itemOrKey === "string" ? itemOrKey : keyOf(itemOrKey);
  if (key === "herald-vital-bond") return vitalBond(actor);
  if (key === "herald-absolute-piercing") return absolutePiercing(actor);
  if (key === "herald-combat-symphony") return combatSymphony(actor);
  if (key === "herald-divine-tempo") return divineTempo(actor);
  if (key === "herald-unbreakable-life") return unbreakableLife(actor);
  if (key === "herald-final-judgment") { await chooseJudgmentTarget(actor); return true; }
  return false;
}

async function chooseJudgmentTarget(actor) {
  if (heraldPath(actor) !== "ruptura" || heraldLevel(actor) < 20) return;
  const target = targets()[0];
  if (!target) { ui.notifications.info("Nova Era: selecione o Alvo do Julgamento e clique em Julgamento Final na ficha quando estiver pronto."); return; }
  await actor.setFlag(MODULE_ID, "heraldJudgmentTarget", target.actor.uuid);
  await effect(target.actor, `Alvo do Julgamento — ${actor.name}`, [], `judgment:${actor.uuid}`, { rounds: 99 });
}

async function rest(actor, result, config = {}) {
  if (!isNovaEraHerald(actor) || !responsible(actor)) return;
  const long = result?.longRest === true || result?.type === "long" || config?.type === "long";
  const short = long || result?.shortRest === true || result?.type === "short" || config?.type === "short";
  if (short) await actor.unsetFlag(MODULE_ID, "heraldAbsolutePiercingUsed");
  if (!long) return;
  for (const key of ["heraldDivineTempoUsed", "heraldUnbreakableUsed", "heraldUnbreakableActive", "heraldGuidedRebirthUsed"]) await actor.unsetFlag(MODULE_ID, key);
}

async function reactToHpUpdate(target, changed, options) {
  if (options?.novaEraHerald) return;
  const next = Number(foundry.utils.getProperty(changed, "system.attributes.hp.value"));
  if (!Number.isFinite(next)) return;
  const previous = Number(target.system?.attributes?.hp?.value ?? 0);
  const heralds = game.actors.filter(actor => isNovaEraHerald(actor) && responsible(actor));
  if (next > previous) {
    for (const herald of heralds) {
      const bond = herald.getFlag(MODULE_ID, "heraldVitalBond");
      if (bond?.expiresAt > game.time.worldTime && [herald.uuid, bond.targetUuid].includes(target.uuid)) {
        const other = await fromUuid(target.uuid === herald.uuid ? bond.targetUuid : herald.uuid);
        const key = `${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}`;
        if (other && herald.getFlag(MODULE_ID, "heraldBondTriggerTurn") !== key) {
          await herald.setFlag(MODULE_ID, "heraldBondTriggerTurn", key);
          await heraldDocumentAction(other, "hp", { mode: "temp", amount: heraldProficiency(herald) });
        }
      }
      if (heraldPath(herald) === "vida" && heraldLevel(herald) >= 11 && heraldState(herald).resonances.some(entry => entry.type === "vida") && distanceMeters(herald, target) <= 9) {
        const key = `${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}:${target.uuid}`;
        if (herald.getFlag(MODULE_ID, "heraldComfortingTrigger") !== key) {
          await herald.setFlag(MODULE_ID, "heraldComfortingTrigger", key);
          await heraldDocumentAction(target, "hp", { mode: "temp", amount: heraldProficiency(herald) });
        }
      }
    }
    return;
  }
  if (previous <= 0 || next > 0) return;
  for (const herald of heralds.filter(actor => heraldPath(actor) === "vida" && distanceMeters(actor, target) <= 9)) {
    const aura = herald.getFlag(MODULE_ID, "heraldUnbreakableActive");
    if (aura?.expiresAt > game.time.worldTime && !aura.protected?.includes(target.uuid)) {
      const roll = await new Roll(`3d6 + ${heraldWisdom(herald)}`).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: herald }), flavor: `Vida Inquebrável — ${target.name}` });
      await heraldDocumentAction(target, "hp", { mode: "heal", amount: 1 + Number(roll.total) });
      await herald.setFlag(MODULE_ID, "heraldUnbreakableActive", { ...aura, protected: [...(aura.protected ?? []), target.uuid] });
      return;
    }
    if (heraldLevel(herald) >= 15 && !herald.getFlag(MODULE_ID, "heraldGuidedRebirthUsed") && heraldState(herald).resonances.filter(entry => entry.type === "vida").length >= 3 && await confirm("Renascimento Guiado", `${target.name} caiu a 0 PV. Usar sua Reação e consumir 3 Vidas?`)) {
      if (!await spend(herald, "vida", 3, "Renascimento Guiado")) return;
      const roll = await new Roll(`2d6 + ${heraldWisdom(herald)}`).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: herald }), flavor: `Renascimento Guiado — ${target.name}` });
      await heraldDocumentAction(target, "hp", { mode: "heal", amount: 1 + Number(roll.total) });
      await herald.setFlag(MODULE_ID, "heraldGuidedRebirthUsed", true);
      return;
    }
  }
}

async function consumeNextRollEffect(_rolls, data = {}) {
  const actor = data.subject?.actor ?? data.subject ?? data.actor ?? data.item?.actor;
  if (!actor?.isOwner) return;
  const effects = actor.effects.filter(entry => entry.getFlag(MODULE_ID, "consumeOnNextRoll") || entry.getFlag(MODULE_ID, "heraldEffect")?.startsWith("balance-release:"));
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(entry => entry.id), { novaEraHerald: true });
}

function addItemActivation(app, html) {
  const item = app.item ?? app.document;
  if (!ACTIVE_KEYS.has(keyOf(item)) || !item?.actor?.isOwner) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".ne-herald-activate")) return;
  const button = document.createElement("button"); button.type = "button"; button.className = "ne-herald-activate";
  button.innerHTML = '<i class="fa-solid fa-gem"></i> Ativar automação Nova Era';
  button.addEventListener("click", event => { event.preventDefault(); void activateHeraldFeature(item.actor, item); });
  root.querySelector("form")?.append(button);
}

function addSheetActivations(app, html) {
  const actor = app.actor ?? app.document, root = html instanceof HTMLElement ? html : html?.[0];
  if (!isNovaEraHerald(actor) || !actor.isOwner || !root || root.dataset.novaEraHeraldActivation) return;
  root.dataset.novaEraHeraldActivation = "true";
  root.addEventListener("click", event => {
    const row = event.target.closest?.("[data-item-id]"), item = row ? actor.items.get(row.dataset.itemId) : null;
    if (!ACTIVE_KEYS.has(keyOf(item)) || !event.target.closest?.(".item-image[data-action='use']")) return;
    event.preventDefault(); event.stopImmediatePropagation(); void activateHeraldFeature(actor, item);
  }, true);
}

export function registerHeraldAdvancedAutomation() {
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void rest(actor, result, config));
  Hooks.on("combatStart", () => { for (const actor of game.actors.filter(isNovaEraHerald)) if (responsible(actor)) void chooseJudgmentTarget(actor); });
  Hooks.on("preUpdateActor", (actor, changed, options) => void reactToHpUpdate(actor, changed, options));
  Hooks.on("novaEraHeraldConcordanceActivated", data => void concordanceActivated(data));
  Hooks.on("novaEraHeraldResonanceGenerated", data => void resonanceGenerated(data));
  Hooks.on("novaEraHeraldReleaseResolved", data => void releaseResolved(data));
  Hooks.on("novaEraHeraldSpellResolved", data => void spellResolved(data));
  Hooks.on("updateCombat", combat => void combatTurnChanged(combat));
  Hooks.on("dnd5e.rollSavingThrow", (rolls, data) => void consumeNextRollEffect(rolls, data));
  Hooks.on("dnd5e.rollAttack", (rolls, data) => void consumeNextRollEffect(rolls, data));
  for (const hook of ["renderItemSheet", "renderItemSheet5e", "renderItemSheetV2"]) Hooks.on(hook, addItemActivation);
  for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderActorSheet5eCharacter", "renderActorSheet5eCharacter2"]) Hooks.on(hook, addSheetActivations);
}
