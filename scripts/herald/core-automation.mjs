import { MODULE_ID } from "../constants.mjs";
import {
  CONCORDANCES, RESONANCE_TYPES, availableConcordances, canPayComposition,
  expireHeraldTurn, heraldCapacity, heraldDuration, heraldOverloadThreshold,
  normalizeHeraldState, removeComposition, resonanceCounts
} from "./rules.mjs";

const STATE_FLAG = "heraldResonanceState";
const SOCKET_TYPE = "heraldAction";
const lastCombatant = new Map();
const TYPE_NAMES = { vida: "Vida", equilibrio: "Equilíbrio", ruptura: "Ruptura" };
const ECO_NAMES = { ve: "Harmonia Vital", er: "Interferência Disruptiva", vr: "Paradoxo Vital" };

function classItem(actor) {
  return actor?.items?.find(item => item.type === "class" && (item.system?.identifier === "herald-resonances-nova-era" || item.getFlag(MODULE_ID, "contentKey") === "herald-resonances"));
}

export function isNovaEraHerald(actor) { return !!classItem(actor); }
export function heraldLevel(actor) { return Number(classItem(actor)?.system?.levels ?? 0); }
export function heraldProficiency(actor) { return Number(actor?.system?.attributes?.prof ?? 2); }
export function heraldWisdom(actor) { return Number(actor?.system?.abilities?.wis?.mod ?? 0); }
export function heraldDC(actor) { return 8 + heraldProficiency(actor) + heraldWisdom(actor); }
export function hasHeraldFeature(actor, key) { return actor?.items?.some(item => item.getFlag(MODULE_ID, "contentKey") === key); }

export function heraldPath(actor) {
  const path = actor?.items?.find(item => item.type === "subclass" && item.system?.classIdentifier === "herald-resonances-nova-era");
  const key = path?.getFlag(MODULE_ID, "contentKey") ?? "";
  if (key.includes("sentimentalist")) return "vida";
  if (key.includes("concordant")) return "equilibrio";
  if (key.includes("executor")) return "ruptura";
  return "none";
}

export function heraldState(actor) { return normalizeHeraldState(actor?.getFlag(MODULE_ID, STATE_FLAG) ?? {}, heraldLevel(actor)); }
export function heraldCounts(actor) { return resonanceCounts(heraldState(actor).resonances); }
function turnKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `free:${Math.floor(Date.now() / 6000)}`; }
function responsible(actor) {
  const owners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((left, right) => left.id.localeCompare(right.id));
  return owners[0]?.id === game.user.id || (!owners.length && game.user.isGM && game.users.activeGM?.id === game.user.id);
}
function escape(value) { return foundry.utils.escapeHTML(String(value ?? "")); }

async function post(actor, title, text) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era herald-chat"><h2>${escape(title)}</h2><p>${text}</p><blockquote>“Toda magia deixa uma memória.”</blockquote></section>` });
}

async function choose(title, prompt, choices) {
  return new Promise(resolve => new Dialog({
    title,
    content: `<section class="nova-era ne-herald-dialog"><strong>${prompt}</strong></section>`,
    buttons: Object.fromEntries(choices.map(([key, label, icon = "fa-wave-square"]) => [key, { icon: `<i class="fa-solid ${icon}"></i>`, label, callback: () => resolve(key) }])),
    close: () => resolve("")
  }, { classes: ["nova-era-feature-dialog"] }).render(true));
}

async function mutateDocument(uuid, action, data = {}) {
  const document = await fromUuid(uuid);
  if (!document) return false;
  const actor = document.documentName === "Actor" ? document : document.actor;
  if (action === "hp") {
    const hp = actor.system.attributes.hp;
    const amount = Math.max(0, Number(data.amount) || 0);
    if (data.mode === "heal") await actor.update({ "system.attributes.hp.value": Math.min(Number(hp.max ?? 0), Number(hp.value ?? 0) + amount) }, { novaEraHerald: true });
    if (data.mode === "temp") await actor.update({ "system.attributes.hp.temp": Math.max(Number(hp.temp ?? 0), amount) }, { novaEraHerald: true });
    if (data.mode === "damage") {
      const absorbed = Math.min(Number(hp.temp ?? 0), amount);
      await actor.update({ "system.attributes.hp.temp": Number(hp.temp ?? 0) - absorbed, "system.attributes.hp.value": Math.max(0, Number(hp.value ?? 0) - amount + absorbed) }, { novaEraHerald: true });
    }
  }
  if (action === "effect") await actor.createEmbeddedDocuments("ActiveEffect", [data.effect], { novaEraHerald: true });
  if (action === "remove-effect") {
    const matches = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "heraldEffect") === data.flag);
    if (matches.length) await actor.deleteEmbeddedDocuments("ActiveEffect", matches.map(effect => effect.id), { novaEraHerald: true });
  }
  return true;
}

export async function heraldDocumentAction(document, action, data = {}) {
  if (!document) return false;
  if (game.user.isGM || document.isOwner) return mutateDocument(document.uuid, action, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPE, uuid: document.uuid, action, data });
  return true;
}

export async function updateHeraldState(actor, patch, reason = "Ressonâncias") {
  if (!isNovaEraHerald(actor) || !actor.isOwner) return heraldState(actor);
  const before = heraldState(actor);
  const next = normalizeHeraldState({ ...before, ...patch }, heraldLevel(actor));
  await actor.setFlag(MODULE_ID, STATE_FLAG, next);
  Hooks.callAll("novaEraHeraldChanged", { actor, before, after: heraldState(actor), reason });
  return heraldState(actor);
}

async function chooseTargetActor(actor, title, fallbackSelf = true) {
  const targets = [...(game.user.targets ?? [])].filter(token => token.actor);
  if (targets.length === 1) return targets[0].actor;
  if (!targets.length && fallbackSelf) return actor;
  if (!targets.length) { ui.notifications.warn("Nova Era: selecione exatamente um alvo."); return null; }
  const selected = await choose(title, "Escolha o alvo.", targets.map(token => [token.id, token.name, "fa-crosshairs"]));
  return targets.find(token => token.id === selected)?.actor ?? null;
}

async function makeRoom(actor, state, type) {
  if (state.resonances.length < heraldCapacity(heraldLevel(actor))) return state.resonances;
  if (heraldLevel(actor) >= 17) return null;
  const selected = await choose("Armazenamento cheio", `Qual eco será dispensado para receber ${TYPE_NAMES[type]}?`, [
    ["new", `Descartar a nova Ressonância de ${TYPE_NAMES[type]}`, "fa-xmark"],
    ...state.resonances.map(entry => [entry.id, `${TYPE_NAMES[entry.type]} — expira no turno ${entry.expires}`, "fa-wave-square"])
  ]);
  if (!selected || selected === "new") return null;
  return state.resonances.filter(entry => entry.id !== selected);
}

async function resolveOverflow(actor, type) {
  const target = await chooseTargetActor(actor, `Transbordamento de ${TYPE_NAMES[type]}`);
  if (!target) return false;
  if (type === "equilibrio") {
    await heraldDocumentAction(target, "effect", { effect: {
      name: "Transbordamento de Equilíbrio — +2 CA", img: "icons/magic/defensive/shield-barrier-glowing-blue.webp", origin: actor.uuid, disabled: false,
      duration: { rounds: 1 }, changes: [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 }],
      flags: { [MODULE_ID]: { heraldEffect: "overflow-balance", expiresAtTurnStart: actor.uuid } }
    } });
    await post(actor, "Transbordamento de Equilíbrio", `<strong>${escape(target.name)}</strong> recebe +2 CA até o início do próximo turno.`);
    return true;
  }
  const formula = `2d6 + ${heraldWisdom(actor)}`;
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Transbordamento de ${TYPE_NAMES[type]}` });
  await heraldDocumentAction(target, "hp", { mode: type === "vida" ? "heal" : "damage", amount: Number(roll.total) });
  return true;
}

export async function generateHeraldResonance(actor, type, { source = "Conjuração", offerFlow = true, damaged = false } = {}) {
  if (!RESONANCE_TYPES.includes(type) || !isNovaEraHerald(actor) || !actor.isOwner) return false;
  const level = heraldLevel(actor), before = heraldState(actor), existingSame = before.resonances.filter(entry => entry.type === type);
  let resonances = await makeRoom(actor, before, type);
  if (!resonances) {
    if (level >= 17 && before.overflowUsedTurn !== turnKey()) {
      if (await resolveOverflow(actor, type)) await updateHeraldState(actor, { overflowUsedTurn: turnKey() }, "Transbordamento Ressonante");
    }
    else if (level >= 17) ui.notifications.info("Nova Era: o Transbordamento já foi usado neste turno; a Ressonância excedente foi perdida.");
    else ui.notifications.info(`Nova Era: a nova Ressonância de ${TYPE_NAMES[type]} foi dissipada.`);
    return false;
  }
  const id = foundry.utils.randomID();
  resonances = [...resonances, { id, type, expires: before.turn + heraldDuration(level) }];
  let naturalUsedTurn = before.naturalUsedTurn;
  if (level >= 3 && heraldPath(actor) === type && existingSame.length && naturalUsedTurn !== turnKey()) {
    const oldest = resonances.find(entry => entry.id === existingSame[0].id);
    if (oldest) oldest.expires = before.turn + heraldDuration(level);
    naturalUsedTurn = turnKey();
  }
  let flowUses = before.flowUses, flowUsedTurn = before.flowUsedTurn;
  if (offerFlow && level >= 7 && flowUses < heraldProficiency(actor) && flowUsedTurn !== turnKey() && resonances.length < heraldCapacity(level)) {
    const use = await Dialog.confirm({ title: "Aprimoramento de Fluxo", content: `<p>Gerar uma segunda Ressonância de <strong>${TYPE_NAMES[type]}</strong>? Restam ${heraldProficiency(actor) - flowUses} usos.</p>`, defaultYes: false });
    if (use) {
      resonances.push({ id: foundry.utils.randomID(), type, expires: before.turn + heraldDuration(level) });
      flowUses += 1; flowUsedTurn = turnKey();
    }
  }
  const options = level >= 2 ? availableConcordances(resonances).filter(key => CONCORDANCES[key].includes(type) && CONCORDANCES[key].some(value => value !== type && before.resonances.some(entry => entry.type === value))) : [];
  await updateHeraldState(actor, { resonances, pendingEcho: options, flowUses, flowUsedTurn, naturalUsedTurn }, source);
  Hooks.callAll("novaEraHeraldResonanceGenerated", { actor, type, resonanceId: id, source });
  await post(actor, `${TYPE_NAMES[type]} ressoa`, `<strong>+${resonances.length - before.resonances.length} Ressonância</strong> após ${escape(source)}. ${options.length ? "Uma Concordância pode ser ativada." : "O eco foi armazenado."}`);
  if (level >= 3 && heraldPath(actor) === "vida" && type === "vida" && hasHeraldFeature(actor, "herald-living-empathy")) {
    const target = await chooseTargetActor(actor, "Empatia Viva");
    if (target) {
      const current = heraldState(actor), sameTurn = current.empathyUsedTurn === turnKey(), used = sameTurn ? current.empathyTargets : [];
      if (!used.includes(target.uuid)) {
        await heraldDocumentAction(target, "hp", { mode: "temp", amount: heraldProficiency(actor) });
        await updateHeraldState(actor, { empathyUsedTurn: turnKey(), empathyTargets: [...used, target.uuid] }, "Empatia Viva");
      } else ui.notifications.info(`Nova Era: ${target.name} já recebeu Empatia Viva neste turno.`);
    }
  }
  if (level >= 3 && heraldPath(actor) === "ruptura" && type === "ruptura" && damaged && hasHeraldFeature(actor, "herald-resonant-fracture")) {
    const target = await chooseTargetActor(actor, "Fratura Ressonante", false);
    if (target) await heraldDocumentAction(target, "effect", { effect: { name: `Fraturada por ${actor.name}`, img: "icons/magic/sonic/explosion-shock-wave-teal.webp", origin: actor.uuid, disabled: false, duration: { rounds: 1 }, changes: [], flags: { [MODULE_ID]: { heraldEffect: `fractured:${actor.uuid}`, sourceUuid: actor.uuid } } } });
  }
  return true;
}

export async function activateHeraldConcordance(actor, key) {
  const state = heraldState(actor), level = heraldLevel(actor), limit = level >= 13 ? 2 : 1;
  if (!CONCORDANCES[key] || !state.pendingEcho.includes(key) || state.echoUsedTurn === turnKey()) return false;
  if (state.concordances.some(entry => entry.key === key) || state.concordances.length >= limit) return false;
  const concordances = [...state.concordances, { key, expires: state.turn + 1 }];
  await updateHeraldState(actor, { concordances, pendingEcho: [], echoUsedTurn: turnKey() }, ECO_NAMES[key]);
  await post(actor, ECO_NAMES[key], "A Concordância foi ativada sem consumir Ressonâncias e permanece até o início do próximo turno.");
  Hooks.callAll("novaEraHeraldConcordanceActivated", { actor, key });
  return true;
}

export async function tuneHeraldResonances(actor, ids, type) {
  const state = heraldState(actor), maximum = heraldLevel(actor) >= 9 ? 2 : 1;
  const selected = [...new Set(ids)].slice(0, maximum);
  if (!RESONANCE_TYPES.includes(type) || !selected.length || state.satzUsedTurn === turnKey()) return false;
  const resonances = state.resonances.map(entry => selected.includes(entry.id) ? { ...entry, type } : entry);
  await updateHeraldState(actor, { resonances, satzUsedTurn: turnKey(), pendingEcho: [] }, "Satz Aurora — Afinar");
  await post(actor, "Satz Aurora", `${selected.length} eco${selected.length > 1 ? "s foram afinados" : " foi afinado"} para <strong>${TYPE_NAMES[type]}</strong>, conservando a duração.`);
  return true;
}

export async function dissipateHeraldResonances(actor, ids, mode) {
  const state = heraldState(actor), selected = [...new Set(ids)].slice(0, 2).filter(id => state.resonances.some(entry => entry.id === id));
  if (!selected.length || state.satzUsedTurn === turnKey() || !["heal", "temp"].includes(mode)) return false;
  const resonances = state.resonances.filter(entry => !selected.includes(entry.id));
  if (mode === "heal") {
    const roll = await new Roll(`${selected.length}d4`).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Satz Aurora — cura" });
    await heraldDocumentAction(actor, "hp", { mode: "heal", amount: Number(roll.total) });
  } else await heraldDocumentAction(actor, "hp", { mode: "temp", amount: heraldProficiency(actor) });
  await updateHeraldState(actor, { resonances, satzUsedTurn: turnKey(), pendingEcho: [] }, "Satz Aurora — Dissipar");
  await post(actor, "Satz Aurora", `${selected.length} eco${selected.length > 1 ? "s foram dissipados" : " foi dissipado"}.`);
  return true;
}

export async function prepareHeraldRelease(actor, kind, affinity) {
  const state = heraldState(actor), level = heraldLevel(actor);
  const minimum = { modulacao: 6, pura: 5, triade: 10 }[kind] ?? 99;
  if (level < minimum || state.releaseUsedTurn === turnKey() || state.pendingRelease) return false;
  const discount = state.absoluteTurns > 0 ? 1 : 0;
  if (!canPayComposition(state.resonances, kind, affinity, discount)) { ui.notifications.warn("Nova Era: composição de Ressonâncias insuficiente."); return false; }
  const payment = removeComposition(state.resonances, kind, affinity, discount);
  await updateHeraldState(actor, { resonances: payment.remaining, pendingRelease: { kind, affinity, spent: payment.spent, armedAt: turnKey() }, releaseUsedTurn: turnKey() }, "Liberação Ressonante");
  await post(actor, "Liberação preparada", `<strong>${escape(kind)}</strong> de ${TYPE_NAMES[affinity]} será aplicada à próxima magia compatível deste turno.`);
  return true;
}

async function offerReleaseForSpell(activity) {
  const item = activity?.item, actor = activity?.actor ?? item?.actor;
  if (!actor || item?.type !== "spell" || !isNovaEraHerald(actor) || !responsible(actor)) return;
  const state = heraldState(actor), level = heraldLevel(actor);
  if (state.pendingRelease || state.releaseUsedTurn === turnKey() || level < 5) return;
  const affinity = await affinityForSpell(actor, item);
  if (!affinity) return;
  const discount = state.absoluteTurns > 0 ? 1 : 0, options = [];
  for (const type of RESONANCE_TYPES) if (level >= 6 && canPayComposition(state.resonances, "modulacao", type, discount)) options.push([`modulacao:${type}`, `Modulação de ${TYPE_NAMES[type]} · 1 eco`, "fa-wave-square"]);
  if (canPayComposition(state.resonances, "pura", affinity, discount)) options.push([`pura:${affinity}`, `Ressonância Pura de ${TYPE_NAMES[affinity]} · 3 ecos`, "fa-gem"]);
  if (level >= 10 && canPayComposition(state.resonances, "triade", affinity, discount)) options.push([`triade:${affinity}`, `Tríade de ${TYPE_NAMES[affinity]} · Vida + Equilíbrio + Ruptura`, "fa-circle-nodes"]);
  if (!options.length) return;
  options.push(["none", "Conjurar sem consumir Ressonâncias", "fa-forward"]);
  const selected = await choose("Liberação Ressonante", `Deseja fortalecer ${escape(item.name)} antes da conjuração?`, options);
  if (!selected || selected === "none") return;
  const [kind, type] = selected.split(":");
  await prepareHeraldRelease(actor, kind, type);
}

async function affinityForSpell(actor, item) {
  let stored = item.getFlag(MODULE_ID, "resonanceAffinity");
  if (RESONANCE_TYPES.includes(stored)) return stored;
  const selected = await choose("Afinidade Ressonante", `Qual é a Afinidade de ${escape(item.name)}? A escolha ficará registrada na magia.`, RESONANCE_TYPES.map(type => [type, TYPE_NAMES[type], "fa-gem"]));
  if (!selected) return "";
  if (item.isOwner) await item.setFlag(MODULE_ID, "resonanceAffinity", selected);
  return selected;
}

export async function configureHeraldSpellAffinity(actor) {
  const spells = actor.items.filter(item => item.type === "spell").sort((left, right) => left.name.localeCompare(right.name));
  if (!spells.length) { ui.notifications.warn("Nova Era: esta ficha ainda não possui magias."); return false; }
  const spellId = await choose("Afinidades Ressonantes", "Escolha a magia que deseja afinar.", spells.map(item => [item.id, `${item.name}${item.getFlag(MODULE_ID, "resonanceAffinity") ? ` — ${TYPE_NAMES[item.getFlag(MODULE_ID, "resonanceAffinity")]}` : " — sem Afinidade"}`, "fa-book-sparkles"]));
  const spell = actor.items.get(spellId);
  if (!spell) return false;
  const affinity = await choose("Afinidade Ressonante", `Qual frequência pertence a ${escape(spell.name)}?`, RESONANCE_TYPES.map(type => [type, TYPE_NAMES[type], "fa-gem"]));
  if (!affinity) return false;
  await spell.setFlag(MODULE_ID, "resonanceAffinity", affinity);
  ui.notifications.info(`Nova Era: ${spell.name} foi afinada com ${TYPE_NAMES[affinity]}.`);
  return true;
}

async function resolvePendingRelease(actor, activity) {
  const state = heraldState(actor), pending = state.pendingRelease;
  if (!pending) return;
  const targetTokens = [...(activity?.targets ?? game.user.targets ?? [])].filter(token => token?.actor);
  const target = targetTokens[0]?.actor ?? actor;
  const level = heraldLevel(actor), pb = heraldProficiency(actor), wisdom = heraldWisdom(actor);
  const upgraded = level >= 14, supreme = level >= 15;
  if (pending.affinity === "ruptura") {
    const formula = pending.kind === "modulacao" ? (upgraded ? `1d6 + ${pb}` : `${pb}`) : pending.kind === "pura" ? (supreme ? "5d6" : "3d6") : "2d6";
    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${pending.kind} de Ruptura` });
    if (target) await heraldDocumentAction(target, "hp", { mode: "damage", amount: Number(roll.total) });
  } else if (pending.affinity === "vida") {
    if (pending.kind === "modulacao") {
      await heraldDocumentAction(target, "hp", { mode: "temp", amount: pb });
      if (upgraded) { const roll = await new Roll("1d6").evaluate(); await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Modulação Aprimorada de Vida" }); await heraldDocumentAction(target, "hp", { mode: "heal", amount: Number(roll.total) }); }
    } else {
      const formula = pending.kind === "pura" ? (supreme ? `4d6 + ${wisdom}` : `2d6 + ${wisdom}`) : "2d6";
      const roll = await new Roll(formula).evaluate(); await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${pending.kind} de Vida` }); await heraldDocumentAction(target, "hp", { mode: "heal", amount: Number(roll.total) });
    }
  } else {
    const recipients = pending.kind === "triade" || (pending.kind === "pura" && supreme) ? targetTokens.slice(0, 2) : targetTokens.slice(0, 1);
    if (!recipients.length) recipients.push({ actor, document: { disposition: 1 } });
    const sourceDisposition = actor.getActiveTokens?.()[0]?.document?.disposition ?? 1;
    for (const token of recipients) {
      const friendly = token.actor === actor || Number(token.document?.disposition ?? sourceDisposition) === Number(sourceDisposition);
      let changes;
      if (pending.kind === "pura") changes = friendly ? [
        { key: "flags.dnd5e.advantage.attack.all", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "1", priority: 20 },
        { key: "flags.dnd5e.advantage.ability.save.all", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "1", priority: 20 }
      ] : [
        { key: "flags.dnd5e.disadvantage.attack.all", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "1", priority: 20 },
        { key: "flags.dnd5e.disadvantage.ability.save.all", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "1", priority: 20 }
      ];
      else if (pending.kind === "triade") changes = friendly ? [
        { key: "system.bonuses.mwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1d4", priority: 20 },
        { key: "system.bonuses.rwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1d4", priority: 20 },
        { key: "system.bonuses.msak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1d4", priority: 20 },
        { key: "system.bonuses.rsak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1d4", priority: 20 },
        { key: "system.bonuses.abilities.save", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1d4", priority: 20 }
      ] : [{ key: "system.bonuses.abilities.save", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1d4", priority: 20 }];
      else {
        const value = upgraded ? 2 : 1;
        const signed = friendly ? String(value) : String(-value);
        changes = [
          { key: "system.bonuses.mwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: signed, priority: 20 },
          { key: "system.bonuses.rwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: signed, priority: 20 },
          { key: "system.bonuses.msak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: signed, priority: 20 },
          { key: "system.bonuses.rsak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: signed, priority: 20 },
          { key: "system.bonuses.abilities.save", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: signed, priority: 20 }
        ];
      }
      await heraldDocumentAction(token.actor, "effect", { effect: { name: `${pending.kind} de Equilíbrio — ${actor.name}`, img: "icons/magic/control/buff-flight-wings-runes-blue.webp", origin: actor.uuid, disabled: false, duration: { rounds: pending.kind === "pura" && supreme ? 2 : 1 }, changes, flags: { [MODULE_ID]: { heraldEffect: `balance-release:${actor.uuid}`, consumeOnNextRoll: true } } } });
    }
    await post(actor, `${pending.kind} de Equilíbrio`, `O ajuste foi aplicado a ${recipients.map(entry => escape(entry.actor.name)).join(", ")}.`);
  }
  const current = heraldState(actor);
  let resonances = current.resonances;
  if (level >= 18 && pending.spent?.length >= 2 && resonances.length < heraldCapacity(level)) resonances = [...resonances, { ...pending.spent[0], id: foundry.utils.randomID(), expires: current.turn + 1 }];
  await updateHeraldState(actor, { resonances, pendingRelease: null }, "Liberação resolvida");
  Hooks.callAll("novaEraHeraldReleaseResolved", { actor, activity, release: pending });
  return pending;
}

function spellOutcome(activity) {
  const item = activity?.item;
  const type = String(activity?.type ?? activity?.constructor?.name ?? "").toLowerCase();
  const serialized = JSON.stringify(activity?.damage?.parts ?? item?.system?.damage?.parts ?? []).toLowerCase();
  const healing = type.includes("heal") || serialized.includes("healing") || serialized.includes("temphp");
  const damage = !healing && (type.includes("attack") || type.includes("damage") || type.includes("save") || serialized.length > 2);
  return { damage, healing };
}

async function resolveConcordanceTriggers(actor, activity) {
  const state = heraldState(actor), outcome = spellOutcome(activity);
  const selected = [...(activity?.targets ?? game.user.targets ?? [])].filter(token => token?.actor);
  const first = selected[0]?.actor ?? actor;
  const consumed = [];
  if (state.concordances.some(entry => entry.key === "ve") && (outcome.healing || !outcome.damage)) {
    await heraldDocumentAction(first, "hp", { mode: "temp", amount: heraldProficiency(actor) });
    await post(actor, "Harmonia Vital", `${escape(first.name)} recebe PV temporários iguais à Proficiência.`);
  }
  if (state.concordances.some(entry => entry.key === "er") && outcome.damage && first) {
    await heraldDocumentAction(first, "effect", { effect: {
      name: `Interferência Disruptiva — ${actor.name}`, img: "icons/magic/sonic/explosion-shock-wave-teal.webp", origin: actor.uuid, disabled: false, duration: { rounds: 1 },
      changes: [
        { key: "system.bonuses.mwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1", priority: 20 },
        { key: "system.bonuses.rwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1", priority: 20 },
        { key: "system.bonuses.msak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1", priority: 20 },
        { key: "system.bonuses.rsak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1", priority: 20 },
        { key: "system.bonuses.abilities.save", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1", priority: 20 }
      ], flags: { [MODULE_ID]: { heraldEffect: `interference:${actor.uuid}`, consumeOnNextRoll: true } }
    } });
    consumed.push("er");
  }
  if (state.concordances.some(entry => entry.key === "vr")) {
    if (outcome.damage) {
      await heraldDocumentAction(actor, "hp", { mode: "heal", amount: heraldProficiency(actor) });
      consumed.push("vr");
    } else if (outcome.healing) {
      const hostile = selected.find(token => token.actor !== first)?.actor;
      if (hostile) await heraldDocumentAction(hostile, "hp", { mode: "damage", amount: heraldProficiency(actor) });
      else await post(actor, "Paradoxo Vital", "A cura ressoou, mas nenhum alvo hostil adicional foi selecionado para receber o dano.");
      consumed.push("vr");
    }
  }
  if (state.absoluteTurns > 0 && state.absoluteSpellTurn !== turnKey() && (outcome.damage || outcome.healing)) {
    const roll = await new Roll("2d6").evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Harmonia Absoluta — ${outcome.healing ? "cura" : "dano"} adicional` });
    await heraldDocumentAction(first, "hp", { mode: outcome.healing ? "heal" : "damage", amount: Number(roll.total) });
    await updateHeraldState(actor, { absoluteSpellTurn: turnKey() }, "Harmonia Absoluta");
  }
  if (consumed.length) {
    const current = heraldState(actor);
    await updateHeraldState(actor, { concordances: current.concordances.filter(entry => !consumed.includes(entry.key)) }, "Gatilho de Concordância");
  }
}

export async function activateHeraldHarmony(actor) {
  const state = heraldState(actor);
  if (heraldLevel(actor) < 20 || state.absoluteUsed) return false;
  await updateHeraldState(actor, { absoluteTurns: 10, absoluteUsed: true }, "Harmonia Absoluta");
  await post(actor, "Harmonia Absoluta", "Por 1 minuto, os ecos não expiram e o instrumento ressoa sem Sobrecarga.");
  return true;
}

export async function endHeraldTurn(actor) {
  if (!isNovaEraHerald(actor) || !actor.isOwner) return false;
  const state = heraldState(actor), threshold = heraldOverloadThreshold(heraldLevel(actor));
  let working = state;
  const excess = state.resonances.length - (threshold - 1);
  if (Number.isFinite(threshold) && excess > 0) {
    const roll = await new Roll("1d20 + @abilities.wis.mod", actor.getRollData()).evaluate();
    const dc = 10 + excess;
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Sobrecarga Ressonante — CD ${dc}` });
    if (Number(roll.total) < dc) {
      const damage = await new Roll(`${excess}d4`).evaluate();
      await damage.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Sobrecarga — dano psíquico" });
      await heraldDocumentAction(actor, "hp", { mode: "damage", amount: Number(damage.total) });
      const resonances = state.resonances.map((entry, index) => index === 0 ? { ...entry, expires: entry.expires - 1 } : entry);
      working = { ...state, resonances };
    }
  }
  const next = expireHeraldTurn(working, heraldLevel(actor));
  await updateHeraldState(actor, next, "Fim do turno");
  if (next.absoluteTurns > 0) {
    const type = await choose("Harmonia Absoluta", "Qual Ressonância surge no início do novo turno?", RESONANCE_TYPES.map(value => [value, TYPE_NAMES[value], "fa-gem"]));
    if (type) await generateHeraldResonance(actor, type, { source: "Harmonia Absoluta", offerFlow: false });
  }
  return true;
}

async function onSpellResolved(activity) {
  const item = activity?.item, actor = activity?.actor ?? item?.actor;
  if (!actor || !item || item.type !== "spell" || !isNovaEraHerald(actor) || !responsible(actor)) return;
  const targetActors = [...(activity?.targets ?? game.user.targets ?? [])].map(token => token?.actor).filter(Boolean);
  const fracturedBefore = targetActors.filter(target => target.effects?.some(effect => effect.getFlag(MODULE_ID, "heraldEffect") === `fractured:${actor.uuid}`)).map(target => target.uuid);
  const affinity = await affinityForSpell(actor, item);
  if (!affinity) return;
  const release = await resolvePendingRelease(actor, activity);
  await resolveConcordanceTriggers(actor, activity);
  const damaged = Boolean(activity?.damage?.parts?.length || item.system?.damage?.parts?.length);
  await generateHeraldResonance(actor, affinity, { source: item.name, damaged });
  Hooks.callAll("novaEraHeraldSpellResolved", { actor, activity, affinity, outcome: spellOutcome(activity), release, fracturedBefore, targetActors });
}

async function onCombatChanged(combat) {
  if (!combat?.started) return;
  const current = combat.combatant?.actor ?? null;
  const previousUuid = lastCombatant.get(combat.id);
  if (previousUuid && previousUuid !== current?.uuid) {
    const previous = await fromUuid(previousUuid);
    if (previous && isNovaEraHerald(previous) && responsible(previous)) await endHeraldTurn(previous);
  }
  if (current) lastCombatant.set(combat.id, current.uuid);
}

async function recoverRest(actor, result, config) {
  if (!isNovaEraHerald(actor) || !responsible(actor)) return;
  const long = result?.longRest === true || result?.type === "long" || config?.type === "long";
  if (!long) return;
  await updateHeraldState(actor, { flowUses: 0, absoluteUsed: false, pendingRelease: null }, "Descanso Longo");
}

export function registerHeraldAutomation() {
  game.socket.on(`module.${MODULE_ID}`, async payload => {
    if (!game.user.isGM || payload?.type !== SOCKET_TYPE) return;
    await mutateDocument(payload.uuid, payload.action, payload.data);
  });
  Hooks.on("dnd5e.preUseActivity", activity => void offerReleaseForSpell(activity));
  Hooks.on("dnd5e.postUseActivity", activity => void onSpellResolved(activity));
  Hooks.on("updateCombat", combat => void onCombatChanged(combat));
  Hooks.on("deleteCombat", combat => lastCombatant.delete(combat.id));
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void recoverRest(actor, result, config));
}
