import { MODULE_ID } from "../constants.mjs";
import { berserkerLevel, bloodState, isNovaEraBerserker, payBloodTechnique, postBloodTechnique } from "./core-automation.mjs";

const SOCKET_TYPE = "berserkerAdvancedTechnique";
const STATE_FLAG = "berserkerAdvancedTechniques";
const ICON = `modules/${MODULE_ID}/assets/icons/berserker/coracao-frenesi-v1.png`;
const origins = new Map();
const damagedOrigins = new Map();

function key(item) { return item?.getFlag?.(MODULE_ID, "contentKey") ?? ""; }
function known(actor, contentKey) { return actor.items.find(item => key(item) === contentKey); }
function proficiency(actor) { return Number(actor.system?.attributes?.prof ?? 2); }
function constitution(actor) { return Number(actor.system?.abilities?.con?.mod ?? 0); }
function bloodDC(actor) { return 8 + proficiency(actor) + constitution(actor); }
function turnKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `free:${Math.floor(Date.now() / 6000)}`; }
function roundKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}` : `free:${Math.floor(Date.now() / 6000)}`; }
function firstRoll(value) { return Array.isArray(value) ? value[0] : value?.[0] ?? value; }
function responsible(actor) {
  const owners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return owners[0]?.id === game.user.id || (!owners.length && game.user.isGM && game.users.activeGM?.id === game.user.id);
}
function targets() { return [...game.user.targets].filter(token => token.actor); }
function targetActor() { const chosen = targets(); return chosen.length === 1 ? chosen[0].actor : null; }
function tokenFor(actor) { return actor?.getActiveTokens?.(false, false)?.[0] ?? null; }
function movement(actor) { return Number(actor.system?.attributes?.movement?.walk ?? 0); }
function distance(left, right) {
  if (!left || !right) return Infinity;
  try { return Number(canvas.grid.measurePath([left.center, right.center]).distance ?? Infinity); }
  catch { return Infinity; }
}

async function executeDocument(uuid, action, data = {}) {
  const document = await fromUuid(uuid);
  if (!document) return false;
  if (action === "create-effect") {
    const old = document.effects.find(effect => effect.getFlag(MODULE_ID, "berserkerAdvancedEffect") === data.effect.flags?.[MODULE_ID]?.berserkerAdvancedEffect);
    if (old) await old.delete({ novaEraBerserker: true });
    await document.createEmbeddedDocuments("ActiveEffect", [data.effect], { novaEraBerserker: true });
  }
  if (action === "delete-effect") await document.delete({ novaEraBerserker: true });
  if (action === "update-actor") await document.update(data.change, { novaEraAdvancedTechnique: true, ...(data.options ?? {}) });
  if (action === "move-token") await document.update(data.change, { novaEraAdvancedTechnique: true });
  return true;
}
async function action(document, type, data = {}) {
  if (!document) return false;
  if (game.user.isGM || document.isOwner) return executeDocument(document.uuid, type, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPE, uuid: document.uuid, action: type, data });
  return true;
}
async function effect(actor, effectKey, name, { changes = [], flags = {}, duration = {}, statuses = [] } = {}) {
  return action(actor, "create-effect", { effect: {
    name, img: ICON, origin: actor.uuid, disabled: false, changes, statuses,
    duration: { startTime: game.time.worldTime, ...(game.combat ? { startRound: game.combat.round, startTurn: game.combat.turn } : {}), ...duration },
    flags: { [MODULE_ID]: { berserkerAdvancedEffect: effectKey, createdTurn: turnKey(), ...flags } }
  }});
}
async function post(actor, title, text) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era berserker-chat"><h2>${title}</h2><p>${text}</p></section>` });
}
async function confirm(title, text) {
  return Dialog.confirm({ title, content: `<section class="nova-era ne-trigger-dialog"><div><strong>${title}</strong><p>${text}</p></div></section>`, yes: () => true, no: () => false, defaultYes: false });
}
async function choose(title, label, choices) {
  return Dialog.prompt({ title, content: `<form><div class="form-group"><label>${label}</label><select name="choice">${choices.map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}</select></div></form>`, label: "Confirmar", callback: html => String(html.find("[name='choice']").val()), rejectClose: false });
}
async function save(source, target, abilities, label) {
  const ability = abilities.sort((a, b) => Number(target.system?.abilities?.[b]?.save ?? 0) - Number(target.system?.abilities?.[a]?.save ?? 0))[0];
  let roll;
  try { roll = firstRoll(await target.rollSavingThrow({ ability })); }
  catch { roll = await new Roll("1d20 + @save", { save: Number(target.system?.abilities?.[ability]?.save ?? 0) }).evaluate(); await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: target }), flavor: `${label} — ${ability.toUpperCase()}` }); }
  const success = Number(roll?.total ?? 0) >= bloodDC(source);
  await post(source, label, `${target.name}: <strong>${success ? "sucesso" : "falha"}</strong> na salvaguarda de ${ability.toUpperCase()} contra CD ${bloodDC(source)}.`);
  return success;
}
function trait(actor, path, type) {
  const value = foundry.utils.getProperty(actor, path);
  return value instanceof Set ? value.has(type) : Array.isArray(value) ? value.includes(type) : value?.value instanceof Set ? value.value.has(type) : false;
}
async function damage(target, amount, type, { ignoreResistance = false } = {}) {
  let total = Math.max(0, Number(amount) || 0);
  if (trait(target, "system.traits.di.value", type)) total = 0;
  else if (!ignoreResistance && trait(target, "system.traits.dr.value", type)) total = Math.floor(total / 2);
  else if (trait(target, "system.traits.dv.value", type)) total *= 2;
  const hp = Number(target.system?.attributes?.hp?.value ?? 0);
  const temp = Number(target.system?.attributes?.hp?.temp ?? 0);
  const absorbed = Math.min(temp, total);
  await action(target, "update-actor", { change: { "system.attributes.hp.temp": temp - absorbed, "system.attributes.hp.value": Math.max(0, hp - (total - absorbed)) } });
  return total;
}
async function moveRelative(sourceActor, targetActor, metres, toward = false) {
  const source = tokenFor(sourceActor), target = tokenFor(targetActor);
  if (!source || !target || !canvas?.scene) return false;
  const grid = Number(canvas.scene.grid.size ?? 100), unit = Number(canvas.scene.grid.distance ?? 1.5);
  const dx = target.center.x - source.center.x, dy = target.center.y - source.center.y, length = Math.hypot(dx, dy);
  if (!length) return true;
  const moving = toward ? source : target;
  const pixels = metres / unit * grid;
  const change = { x: moving.document.x + dx / length * pixels, y: moving.document.y + dy / length * pixels };
  return action(moving.document, "move-token", { change });
}
async function pushAway(sourceActor, targetActor, metres) {
  const source = tokenFor(sourceActor), target = tokenFor(targetActor);
  if (!source || !target || !canvas?.scene) return false;
  const grid = Number(canvas.scene.grid.size ?? 100), unit = Number(canvas.scene.grid.distance ?? 1.5);
  const dx = target.center.x - source.center.x, dy = target.center.y - source.center.y, length = Math.hypot(dx, dy);
  if (!length) return true;
  const pixels = metres / unit * grid;
  return action(target.document, "move-token", { change: { x: target.document.x + dx / length * pixels, y: target.document.y + dy / length * pixels } });
}
async function pay(actor, item, extra = "") {
  const payment = await payBloodTechnique(actor, item);
  if (!payment) return null;
  await postBloodTechnique(actor, item, payment, extra);
  return payment;
}

async function arremesso(actor, item) {
  const target = targetActor();
  if (!target) return ui.notifications.warn("Nova Era: selecione exatamente o alvo agarrado.");
  if (!await pay(actor, item)) return false;
  await pushAway(actor, target, 3);
  if (!await save(actor, target, ["str"], item.name)) await effect(target, `prone-${actor.id}`, "Caído — Arremesso Brutal", { statuses: ["prone"], flags: { expiresAtTurnStart: target.uuid }, duration: { rounds: 1 } });
  return true;
}
async function avanco(actor, item, full = false, explicitTarget = null) {
  const target = explicitTarget ?? targetActor();
  if (!target) return ui.notifications.warn("Nova Era: selecione um hostil para indicar a direção.");
  if (!await pay(actor, item)) return false;
  const amount = full ? movement(actor) : movement(actor) / 2;
  await moveRelative(actor, target, amount, true);
  await effect(actor, `movement-safe-${item.id}`, `${item.name} — sem Ataques de Oportunidade`, { flags: { noOpportunity: true, expiresAtTurnStart: actor.uuid } });
  return true;
}
async function onda(actor, item, diluvio = false) {
  const chosen = targets();
  if (!chosen.length) return ui.notifications.warn("Nova Era: selecione as criaturas na área.");
  if (!await pay(actor, item)) return false;
  const level = berserkerLevel(actor);
  const formula = diluvio ? "6d8" : `${level >= 17 ? 4 : level >= 11 ? 3 : 2}d8`;
  const roll = await new CONFIG.Dice.DamageRoll(formula, actor.getRollData(), { type: "necrotic", flavor: item.name }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: item.name });
  for (const token of chosen) {
    const success = await save(actor, token.actor, ["con"], item.name);
    await damage(token.actor, success ? Math.floor(roll.total / 2) : roll.total, "necrotic");
    if (!success) {
      if (diluvio) await effect(token.actor, `diluvio-${actor.id}`, "Dilúvio Carmesim — deslocamento reduzido", { changes: [{ key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.5", priority: 20 }], flags: { expiresAtTurnStart: actor.uuid }, duration: { rounds: 1 } });
      else await pushAway(actor, token.actor, 1.5);
    }
  }
  return true;
}
async function correntes(actor, item, prison = false) {
  const target = targetActor();
  if (!target) return ui.notifications.warn("Nova Era: selecione exatamente uma criatura.");
  if (!await pay(actor, item)) return false;
  if (await save(actor, target, prison ? ["con"] : ["str"], item.name)) return true;
  await effect(target, `${prison ? "prison" : "chains"}-${actor.id}`, item.name, {
    changes: prison ? [{ key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "0", priority: 30 }] : [],
    statuses: [prison ? "restrained" : "grappled"],
    flags: { sourceActorUuid: actor.uuid, repeatSave: prison ? "con" : "str", noHealing: prison, expiresAtTurnStart: actor.uuid },
    duration: { rounds: 1 }
  });
  return true;
}
async function atravessar(actor, item) {
  if (!await pay(actor, item)) return false;
  const minimum = Math.max(0, movement(actor) / 2);
  await effect(actor, "atravessar-dor", "Atravessar a Dor", { changes: [{ key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(minimum), priority: 40 }], flags: { expiresAtTurnStart: actor.uuid } });
  return true;
}
async function impacto(actor, item, context) {
  if (!context.target) return false;
  if (!await pay(actor, item)) return false;
  if (!await save(actor, context.target, ["str"], item.name)) {
    await pushAway(actor, context.target, 4.5);
    await effect(context.target, `impact-${actor.id}`, "Impacto Demolidor", { statuses: ["prone"], flags: { expiresAtTurnStart: actor.uuid }, duration: { rounds: 1 } });
  }
  return true;
}
async function passo(actor, item) {
  if (!await pay(actor, item)) return false;
  const token = tokenFor(actor);
  if (!token) return false;
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  state.teleport = { tokenUuid: token.document.uuid, x: token.document.x, y: token.document.y, maximum: 9, at: Date.now() };
  await action(actor, "update-actor", { change: { [`flags.${MODULE_ID}.${STATE_FLAG}`]: state } });
  ui.notifications.info("Nova Era: arraste agora o token para o espaço visível de destino, a até 9 m.");
  return true;
}
async function sismico(actor, item) {
  const chosen = targets();
  if (!chosen.length) return ui.notifications.warn("Nova Era: selecione os alvos escolhidos em até 3 m.");
  if (!await pay(actor, item)) return false;
  for (const token of chosen.filter(candidate => distance(tokenFor(actor), candidate) <= 3)) if (!await save(actor, token.actor, ["str"], item.name)) {
    await pushAway(actor, token.actor, 1.5);
    await effect(token.actor, `sismico-${actor.id}`, "Caído — Golpe Sísmico", { statuses: ["prone"], flags: { expiresAtTurnStart: actor.uuid }, duration: { rounds: 1 } });
  }
  await post(actor, item.name, "A área de 3 m ao redor do impacto é terreno difícil até o início do seu próximo turno.");
  return true;
}
async function arsenal(actor, item) {
  const form = await choose(item.name, "Manifestação", [["blade", "Lâmina — 1d10"], ["whip", "Chicote — 1d8, alcance +1,5 m"], ["hammer", "Martelo — 1d8, empurrão 1,5 m"]]);
  if (!form || !await pay(actor, item)) return false;
  await effect(actor, "blood-arsenal", `Arsenal Hemático — ${form}`, { flags: { arsenalForm: form }, duration: { seconds: 60 } });
  await post(actor, item.name, `A forma <strong>${form === "blade" ? "Lâmina (1d10)" : form === "whip" ? "Chicote (1d8, alcance ampliado)" : "Martelo (1d8, empurrão)"}</strong> foi moldada por 1 minuto. Os acertos corpo a corpo aplicarão a manifestação automaticamente.`);
  return true;
}
async function inquebravel(actor, item, context) {
  if (!context.target || !await pay(actor, item)) return false;
  await effect(actor, "break-unbreakable", item.name, { flags: { ignoreResistance: true, ignoreReduction: true, suppressDamageReactions: true, consumeOnMeleeAttack: true, expiresAtTurnStart: actor.uuid } });
  return true;
}
async function corpo(actor, item, context) {
  if (!context.damage || !await pay(actor, item)) return false;
  const restored = Math.ceil(Number(context.damage) / 2);
  const hp = Number(actor.system?.attributes?.hp?.value ?? 0), max = Number(actor.system?.attributes?.hp?.max ?? hp);
  await action(actor, "update-actor", { change: { "system.attributes.hp.value": Math.min(max, hp + restored) }, options: { novaEraSacrifice: true } });
  await effect(actor, "blood-body", item.name, {
    changes: ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "radiant", "slashing", "thunder"].map(value => ({ key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value, priority: 20 })),
    flags: { bloodBody: true, expiresAtTurnStart: actor.uuid }
  });
  return true;
}

const HANDLED = new Set(["arremesso", "avanco", "onda", "correntes", "atravessar", "impacto", "pacto", "passo", "sismico", "cacada", "arsenal", "prisao", "distancia", "inquebravel", "diluvio", "corpo"].map(value => `berserker-tecnica-${value}`));

export function advancedHitTechniqueItems(actor) {
  return [known(actor, "berserker-tecnica-impacto"), known(actor, "berserker-tecnica-inquebravel")].filter(Boolean);
}
export function advancedDamageTechniqueItems(actor) {
  return [known(actor, "berserker-tecnica-corpo")].filter(Boolean);
}

export async function resolveAdvancedBloodTechnique(actor, item, context = {}) {
  const contentKey = key(item);
  if (!HANDLED.has(contentKey)) return null;
  if (contentKey === "berserker-tecnica-arremesso") return arremesso(actor, item);
  if (contentKey === "berserker-tecnica-avanco") return avanco(actor, item);
  if (contentKey === "berserker-tecnica-onda") return onda(actor, item);
  if (contentKey === "berserker-tecnica-correntes") return correntes(actor, item);
  if (contentKey === "berserker-tecnica-atravessar") return atravessar(actor, item);
  if (contentKey === "berserker-tecnica-impacto") return impacto(actor, item, context);
  if (contentKey === "berserker-tecnica-passo") return passo(actor, item);
  if (contentKey === "berserker-tecnica-sismico") return sismico(actor, item);
  if (contentKey === "berserker-tecnica-arsenal") return arsenal(actor, item);
  if (contentKey === "berserker-tecnica-prisao") return correntes(actor, item, true);
  if (contentKey === "berserker-tecnica-distancia") return avanco(actor, item, true);
  if (contentKey === "berserker-tecnica-inquebravel") return inquebravel(actor, item, context);
  if (contentKey === "berserker-tecnica-diluvio") return onda(actor, item, true);
  if (contentKey === "berserker-tecnica-corpo") return corpo(actor, item, context);
  if (contentKey === "berserker-tecnica-cacada") return ui.notifications.info("Nova Era: Caçada Impossível será oferecida automaticamente quando um alvo se afastar.");
  if (contentKey === "berserker-tecnica-pacto") return ui.notifications.info("Nova Era: Pacto Carmesim será oferecido automaticamente quando um aliado próximo sofrer dano.");
  return false;
}

function rememberPosition(token, changed, options) {
  if (changed.x === undefined && changed.y === undefined) return;
  origins.set(token.uuid, { x: Number(token.x), y: Number(token.y), at: Date.now() });
}
function seedPositions() {
  for (const token of canvas?.scene?.tokens ?? []) origins.set(token.uuid, { x: Number(token.x), y: Number(token.y), at: Date.now() });
}
async function validateTeleport(token, changed, options) {
  if (options?.novaEraAdvancedTechnique || (changed.x === undefined && changed.y === undefined) || !token.actor) return;
  const state = token.actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const pending = state.teleport;
  if (!pending || pending.tokenUuid !== token.uuid || Date.now() - pending.at > 30_000) return;
  const grid = Number(canvas.scene?.grid?.size ?? 100), unit = Number(canvas.scene?.grid?.distance ?? 1.5);
  const travelled = Math.hypot(Number(changed.x ?? token.x) - pending.x, Number(changed.y ?? token.y) - pending.y) / grid * unit;
  if (travelled > pending.maximum) {
    ui.notifications.warn(`Nova Era: Passo Rubro alcança no máximo ${pending.maximum} m.`);
    await action(token, "move-token", { change: { x: pending.x, y: pending.y } });
  }
  delete state.teleport;
  await action(token.actor, "update-actor", { change: { [`flags.${MODULE_ID}.${STATE_FLAG}`]: state } });
}
async function offerHunt(token, changed, options) {
  const origin = origins.get(token.uuid);
  if (changed.x === undefined && changed.y === undefined) return;
  const destination = { x: Number(changed.x ?? token.x), y: Number(changed.y ?? token.y) };
  origins.set(token.uuid, { ...destination, at: Date.now() });
  if (!origin || !token.actor || options?.novaEraAdvancedTechnique || options?.novaEraTechnique) return;
  const grid = Number(canvas.scene?.grid?.size ?? 100);
  for (const actor of game.actors.filter(candidate => isNovaEraBerserker(candidate) && responsible(candidate) && known(candidate, "berserker-tecnica-cacada") && bloodState(candidate).points >= 2)) {
    const hunter = tokenFor(actor);
    if (!hunter || Number(hunter.document.disposition) === Number(token.disposition) || distance(hunter, token.object) > 9) continue;
    const before = Math.hypot(origin.x - hunter.document.x, origin.y - hunter.document.y);
    const after = Math.hypot(destination.x - hunter.document.x, destination.y - hunter.document.y);
    if (after <= before + grid / 4) continue;
    const item = known(actor, "berserker-tecnica-cacada");
    if (await confirm(item.name, `${token.name} afastou-se. Gastar 2 PS para persegui-lo?`)) await avanco(actor, item, true, token.actor);
  }
}

function rememberDamagedActor(actor, changed, options = {}) {
  if (options.novaEraAdvancedTechnique || options.novaEraSacrifice) return;
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next === undefined || Number(next) >= Number(actor.system?.attributes?.hp?.value ?? next)) return;
  damagedOrigins.set(actor.uuid, Number(actor.system.attributes.hp.value ?? 0));
}

async function offerPact(target, changed, options = {}) {
  const previousHp = damagedOrigins.get(target.uuid);
  damagedOrigins.delete(target.uuid);
  if (previousHp === undefined || options.novaEraAdvancedTechnique || options.novaEraSacrifice) return;
  const nextHp = Number(foundry.utils.getProperty(changed, "system.attributes.hp.value") ?? previousHp);
  const suffered = Math.max(0, previousHp - nextHp);
  if (!suffered) return;
  const targetToken = tokenFor(target);
  for (const actor of game.actors.filter(candidate => isNovaEraBerserker(candidate) && candidate.uuid !== target.uuid && responsible(candidate))) {
    const item = known(actor, "berserker-tecnica-pacto");
    const sourceToken = tokenFor(actor);
    if (!item || !sourceToken || !targetToken || Number(sourceToken.document.disposition) !== Number(targetToken.document.disposition) || distance(sourceToken, targetToken) > 6 || bloodState(actor).points < 2) continue;
    if (actor.getFlag(MODULE_ID, "berserkerReactionRound") === roundKey()) continue;
    if (!await confirm(item.name, `${target.name} sofreu ${suffered} de dano a até 6 m. Usar sua Reação e gastar os custos para protegê-lo?`)) continue;
    const payment = await payBloodTechnique(actor, item);
    if (!payment) continue;
    const roll = await new Roll("2d10 + @con", { con: constitution(actor) }).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: item.name });
    const prevented = Math.min(suffered, Number(roll.total ?? 0));
    await action(target, "update-actor", { change: { "system.attributes.hp.value": Math.min(previousHp, nextHp + prevented) }, options: { novaEraSacrifice: true } });
    await actor.setFlag(MODULE_ID, "berserkerReactionRound", roundKey());
    await postBloodTechnique(actor, item, payment, `<p><strong>${prevented} de dano sofrido por ${target.name} desapareceram.</strong></p>`);
  }
}

async function useArsenal({ actor, target }) {
  if (!responsible(actor) || !target) return;
  const active = actor.effects.find(value => value.getFlag(MODULE_ID, "arsenalForm"));
  if (!active) return;
  const form = active.getFlag(MODULE_ID, "arsenalForm");
  const roll = await new CONFIG.Dice.DamageRoll(form === "blade" ? "1d10 + @str" : "1d8 + @str", { str: Number(actor.system.abilities?.str?.mod ?? 0) }, { type: "slashing", flavor: active.name }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: active.name });
  await damage(target, Number(roll.total ?? 0), form === "blade" ? "slashing" : "bludgeoning");
  if (form === "hammer" && actor.getFlag(MODULE_ID, "arsenalHammerTurn") !== turnKey()) {
    await actor.setFlag(MODULE_ID, "arsenalHammerTurn", turnKey());
    await pushAway(actor, target, 1.5);
  }
}

async function bypassMidiDefences(token, { workflow, damageItem } = {}) {
  const actor = workflow?.actor ?? workflow?.item?.actor;
  const active = actor?.effects?.find(value => value.getFlag(MODULE_ID, "ignoreResistance") && value.getFlag(MODULE_ID, "consumeOnMeleeAttack"));
  if (!active || !damageItem || !responsible(actor)) return;
  const raw = Array.isArray(damageItem.rawDamageDetail) ? damageItem.rawDamageDetail : [];
  for (const detail of damageItem.damageDetail ?? []) {
    if (detail.active?.immunity) continue;
    if (!detail.active?.resistance && !detail.active?.DR) continue;
    const original = raw.find(entry => entry.type === detail.type);
    if (original) detail.value = Number(original.value ?? detail.value);
    if (detail.active) { detail.active.resistance = false; detail.active.DR = false; detail.active.multiplier = 1; }
  }
  damageItem.details ??= [];
  damageItem.details.push("Quebrar o Inquebrável ignorou resistência e redução fixa.");
  await action(active, "delete-effect");
}
async function repeatSaves(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const previousId = combat.previous?.combatantId;
  const actor = combat.combatants.get(previousId)?.actor ?? null;
  if (!actor || !responsible(actor)) return;
  for (const active of actor.effects.filter(value => value.getFlag(MODULE_ID, "repeatSave"))) {
    const source = await fromUuid(active.getFlag(MODULE_ID, "sourceActorUuid"));
    if (!source || !await save(source, actor, [active.getFlag(MODULE_ID, "repeatSave")], active.name)) continue;
    await action(active, "delete-effect");
  }
}
function blockHealing(actor, changed) {
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next === undefined || Number(next) <= Number(actor.system?.attributes?.hp?.value ?? 0)) return;
  if (actor.effects.some(value => value.getFlag(MODULE_ID, "noHealing"))) foundry.utils.setProperty(changed, "system.attributes.hp.value", actor.system.attributes.hp.value);
}
async function socket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== SOCKET_TYPE) return;
  await executeDocument(payload.uuid, payload.action, payload.data);
}

async function offerAtravessar(active) {
  const actor = active.parent;
  if (!isNovaEraBerserker(actor) || !responsible(actor) || active.getFlag(MODULE_ID, "berserkerAdvancedEffect")) return;
  const reducesMovement = active.changes?.some(change => {
    if (!String(change.key).startsWith("system.attributes.movement.")) return false;
    const value = Number(change.value);
    return (change.mode === CONST.ACTIVE_EFFECT_MODES.ADD && value < 0) || (change.mode === CONST.ACTIVE_EFFECT_MODES.MULTIPLY && value < 1) || change.mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE;
  });
  const item = known(actor, "berserker-tecnica-atravessar");
  if (!reducesMovement || !item || bloodState(actor).points < 2) return;
  if (await confirm(item.name, `${active.name} reduziu seu deslocamento. Gastar 2 PS para garantir ao menos metade do deslocamento até o fim do turno?`)) await atravessar(actor, item);
}

export function registerBerserkerAdvancedTechniqueAutomation() {
  Hooks.on("preUpdateToken", rememberPosition);
  Hooks.on("updateToken", (token, changed, options) => { void validateTeleport(token, changed, options); void offerHunt(token, changed, options); });
  Hooks.on("updateCombat", (combat, changed) => void repeatSaves(combat, changed));
  Hooks.on("novaEraBerserkerMeleeHit", data => void useArsenal(data));
  Hooks.on("midi-qol.preTargetDamageApplication", (token, data) => bypassMidiDefences(token, data));
  Hooks.on("preUpdateActor", blockHealing);
  Hooks.on("preUpdateActor", rememberDamagedActor);
  Hooks.on("updateActor", (actor, changed, options) => void offerPact(actor, changed, options));
  Hooks.on("createActiveEffect", active => void offerAtravessar(active));
  Hooks.on("canvasReady", seedPositions);
  Hooks.on("createToken", token => origins.set(token.uuid, { x: Number(token.x), y: Number(token.y), at: Date.now() }));
  Hooks.on("deleteToken", token => origins.delete(token.uuid));
  seedPositions();
  game.socket.on(`module.${MODULE_ID}`, payload => void socket(payload));
}
