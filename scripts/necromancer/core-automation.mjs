import { MODULE_ID } from "../constants.mjs";

const STATE_FLAG = "necromancerState";
const SOCKET_TYPE = "necromancerAction";
const ICON = "icons/magic/death/skull-humanoid-crown-white-blue.webp";

function classItem(actor) {
  return actor?.items?.find(item => item.type === "class" && (item.system?.identifier === "necromancer-nova-era" || item.getFlag(MODULE_ID, "contentKey") === "necromancer"));
}
export function isNovaEraNecromancer(actor) { return !!classItem(actor); }
export function necromancerLevel(actor) { return Number(classItem(actor)?.system?.levels ?? 0); }
export function necromancerProficiency(actor) { return Number(actor?.system?.attributes?.prof ?? 2); }
export function necromancerIntelligence(actor) { return Number(actor?.system?.abilities?.int?.mod ?? 0); }
function prof(actor) { return necromancerProficiency(actor); }
function intelligence(actor) { return necromancerIntelligence(actor); }
export function cadavericMaximum(actor) { return Math.max(0, prof(actor) + intelligence(actor)); }
export function cadavericState(actor) {
  const raw = actor?.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const maximum = cadavericMaximum(actor);
  return {
    points: Math.clamp(Number(raw.points ?? maximum), 0, maximum), maximum,
    instability: Math.clamp(Number(raw.instability ?? 0), 0, 3),
    markUuid: String(raw.markUuid ?? ""), sacrificeUses: Number(raw.sacrificeUses ?? 0),
    extractionUses: Number(raw.extractionUses ?? 0), lastEcSpend: Number(raw.lastEcSpend ?? 0)
  };
}
function responsible(actor) {
  const owners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return owners[0]?.id === game.user.id || (!owners.length && game.user.isGM && game.users.activeGM?.id === game.user.id);
}
export function hasNecromancerFeature(actor, key) { return actor?.items?.some(item => item.getFlag(MODULE_ID, "contentKey") === key); }
function has(actor, key) { return hasNecromancerFeature(actor, key); }
export function lesserServantLimit(actor) {
  const level = necromancerLevel(actor);
  const base = level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
  return base + (has(actor, "necromantic-command") ? 1 : 0) + (has(actor, "eternal-legacy") ? 1 : 0);
}
function turnKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `free:${Math.floor(Date.now() / 6000)}`; }
export function selectedNecromancerToken() { const targets = [...game.user.targets]; return targets.length === 1 ? targets[0] : null; }
export function activeNecromancerToken(actor) { return actor?.getActiveTokens?.(false, false)?.[0] ?? null; }
export function necromancerDC(actor) { return 8 + prof(actor) + intelligence(actor); }
export function necromancerDistance(a, b) { try { return Number(canvas.grid.measurePath([a.center, b.center]).distance ?? Infinity); } catch { return Infinity; } }
function selectedToken() { return selectedNecromancerToken(); }
function activeToken(actor) { return activeNecromancerToken(actor); }
function dc(actor) { return necromancerDC(actor); }
function distance(a, b) { return necromancerDistance(a, b); }

async function executeDocument(uuid, type, data = {}) {
  const document = await fromUuid(uuid);
  if (!document) return false;
  if (type === "update") await document.update(data.change ?? {}, { novaEraNecromancer: true, ...(data.options ?? {}) });
  if (type === "effect") {
    const actor = document.documentName === "Actor" ? document : document.actor;
    const existing = actor.effects.find(effect => effect.getFlag(MODULE_ID, "necromancerEffect") === data.effect.flags?.[MODULE_ID]?.necromancerEffect);
    if (existing) await existing.delete({ novaEraNecromancer: true });
    await actor.createEmbeddedDocuments("ActiveEffect", [data.effect], { novaEraNecromancer: true });
  }
  if (type === "clear-effect") {
    const actor = document.documentName === "Actor" ? document : document.actor;
    const matches = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "necromancerEffect") === data.key);
    if (matches.length) await actor.deleteEmbeddedDocuments("ActiveEffect", matches.map(effect => effect.id), { novaEraNecromancer: true });
  }
  if (type === "token-flag") await document.setFlag(MODULE_ID, data.key, data.value);
  if (type === "hp") {
    const actor = document.documentName === "Actor" ? document : document.actor;
    const hp = actor.system.attributes.hp;
    const amount = Math.max(0, Number(data.amount) || 0);
    if (data.mode === "heal") await actor.update({ "system.attributes.hp.value": Math.min(Number(hp.max ?? 0), Number(hp.value ?? 0) + amount) }, { novaEraNecromancer: true });
    else if (data.mode === "temp") await actor.update({ "system.attributes.hp.temp": Math.max(Number(hp.temp ?? 0), amount) }, { novaEraNecromancer: true });
    else {
      const absorbed = data.ignoreTemp ? 0 : Math.min(Number(hp.temp ?? 0), amount);
      await actor.update({ "system.attributes.hp.temp": data.ignoreTemp ? Number(hp.temp ?? 0) : Number(hp.temp ?? 0) - absorbed, "system.attributes.hp.value": Math.max(0, Number(hp.value ?? 0) - amount + absorbed) }, { novaEraNecromancer: true, novaEraNecromancerPreviousHp: Number(hp.value ?? 0) });
    }
  }
  return true;
}
export async function necromancerDocumentAction(document, type, data = {}) {
  if (!document) return false;
  if (game.user.isGM || document.isOwner) return executeDocument(document.uuid, type, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPE, uuid: document.uuid, action: type, data });
  return true;
}
async function action(document, type, data = {}) { return necromancerDocumentAction(document, type, data); }
export async function applyNecromancerDamage(actor, amount, { ignoreTemp = false } = {}) { return action(actor, "hp", { mode: "damage", amount, ignoreTemp }); }
export async function applyNecromancerHealing(actor, amount) { return action(actor, "hp", { mode: "heal", amount }); }
export async function applyNecromancerTempHp(actor, amount) { return action(actor, "hp", { mode: "temp", amount }); }
async function post(actor, title, text) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era necromancer-chat"><h2>${title}</h2><p>${text}</p></section>` });
}

export async function setCadavericEssence(actor, value, { reason = "Ajuste", instability = null } = {}) {
  if (!isNovaEraNecromancer(actor) || !actor.isOwner) return cadavericState(actor);
  const before = cadavericState(actor);
  const next = { ...before, points: Math.clamp(Number(value) || 0, 0, before.maximum) };
  if (instability !== null) next.instability = Math.clamp(Number(instability) || 0, 0, 3);
  await actor.setFlag(MODULE_ID, STATE_FLAG, next);
  Hooks.callAll("novaEraNecromancerChanged", { actor, before, after: cadavericState(actor), reason });
  return cadavericState(actor);
}
export async function gainCadavericEssence(actor, amount = 1, reason = "Colher a Morte") {
  const state = cadavericState(actor);
  return setCadavericEssence(actor, state.points + amount, { reason });
}
export async function spendCadavericEssence(actor, amount, reason = "Necromancia") {
  const state = cadavericState(actor);
  let cost = Math.max(0, Number(amount) || 0);
  const avatar = actor.effects.some(effect => effect.getFlag(MODULE_ID, "necromancerEffect") === "death-avatar");
  const discountKey = turnKey();
  if (avatar && cost && actor.getFlag(MODULE_ID, "necromancerAvatarDiscountTurn") !== discountKey) {
    cost = Math.max(0, cost - 2);
    await actor.setFlag(MODULE_ID, "necromancerAvatarDiscountTurn", discountKey);
  }
  if (state.points < cost) { ui.notifications.warn(`Nova Era: ${actor.name} não possui ${cost} EC.`); return false; }
  const instability = has(actor, "necromancer-unstable-body") && cost >= 2 ? Math.min(3, state.instability + 1) : state.instability;
  await setCadavericEssence(actor, state.points - cost, { reason, instability });
  return { cost };
}

export async function useProfaneSacrifice(actor) {
  const state = cadavericState(actor);
  if (state.points >= state.maximum) return ui.notifications.warn("Nova Era: a Essência Cadavérica já está cheia.");
  if (state.sacrificeUses >= prof(actor)) return ui.notifications.warn("Nova Era: Sacrifício Profano não possui usos restantes.");
  const roll = await new Roll("1d6 + @abilities.int.mod", actor.getRollData()).evaluate();
  const hp = Number(actor.system.attributes.hp.value ?? 0);
  await actor.update({ "system.attributes.hp.value": Math.max(0, hp - Number(roll.total)) }, { novaEraNecromancerSacrifice: true });
  const next = cadavericState(actor);
  await actor.setFlag(MODULE_ID, STATE_FLAG, { ...next, points: Math.min(next.maximum, next.points + 1), sacrificeUses: state.sacrificeUses + 1 });
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Sacrifício Profano — dano irredutível" });
  await post(actor, "Sacrifício Profano", `“Toda vida já pertence à morte.” <strong>+1 EC</strong>.`);
  Hooks.callAll("novaEraNecromancerChanged", { actor, reason: "Sacrifício Profano" });
  return true;
}

export async function useDeathMark(actor) {
  const token = selectedToken();
  if (!token?.actor) return ui.notifications.warn("Nova Era: selecione exatamente um alvo para a Marca de Morte.");
  const source = activeToken(actor);
  if (source && distance(source, token) > 18) return ui.notifications.warn("Nova Era: o alvo está além de 18 m.");
  const state = cadavericState(actor);
  if (state.markUuid && state.markUuid !== token.actor.uuid) {
    const old = await fromUuid(state.markUuid);
    if (old) await action(old, "clear-effect", { key: `death-mark:${actor.uuid}` });
  }
  await actor.setFlag(MODULE_ID, STATE_FLAG, { ...state, markUuid: token.actor.uuid });
  await action(token.actor, "effect", { effect: {
    name: `Marca de Morte — ${actor.name}`, img: ICON, origin: actor.uuid, disabled: false,
    duration: {}, changes: [], flags: { [MODULE_ID]: { necromancerEffect: `death-mark:${actor.uuid}`, sourceUuid: actor.uuid } }
  }});
  await post(actor, "Marca de Morte", `“Eu já vi o instante em que <strong>${token.name}</strong> deixará de respirar.”`);
  Hooks.callAll("novaEraNecromancerChanged", { actor, reason: "Marca de Morte" });
  return true;
}

async function moveTarget(sourceToken, targetToken, metres, toward) {
  if (!sourceToken || !targetToken) return false;
  const grid = Number(canvas.scene.grid.size ?? 100), unit = Number(canvas.scene.grid.distance ?? 1.5);
  const dx = targetToken.center.x - sourceToken.center.x, dy = targetToken.center.y - sourceToken.center.y, len = Math.hypot(dx, dy);
  if (!len) return false;
  const sign = toward ? -1 : 1;
  const pixels = metres / unit * grid;
  return action(targetToken.document, "update", { change: { x: targetToken.document.x + sign * dx / len * pixels, y: targetToken.document.y + sign * dy / len * pixels } });
}

export async function useProfaneTouch(actor) {
  const targetToken = selectedToken();
  if (!targetToken?.actor) return ui.notifications.warn("Nova Era: selecione exatamente um alvo.");
  const sourceToken = activeToken(actor);
  if (sourceToken && distance(sourceToken, targetToken) > 18) return ui.notifications.warn("Nova Era: o alvo está além de 18 m.");
  const pact = actor.effects.find(effect => effect.getFlag(MODULE_ID, "necromancerEffect") === "blood-pact");
  const hunting = pact?.getFlag(MODULE_ID, "benefits")?.includes("hunt") && Number(targetToken.actor.system.attributes.hp.value ?? 0) < Number(targetToken.actor.system.attributes.hp.max ?? 0) / 2;
  const attack = await new Roll(`${hunting ? "2d20kh" : "1d20"} + @attributes.prof + @abilities.int.mod`, actor.getRollData()).evaluate();
  await attack.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Toque Profano contra ${targetToken.name}` });
  if (Number(attack.total) < Number(targetToken.actor.system.attributes.ac.value ?? Infinity)) return post(actor, "Toque Profano", "A essência escapa por um instante.");
  const level = necromancerLevel(actor), dice = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
  const marked = cadavericState(actor).markUuid === targetToken.actor.uuid;
  const bonus = marked && actor.getFlag(MODULE_ID, "necromancerMarkDamageTurn") !== turnKey() ? prof(actor) : 0;
  if (bonus) await actor.setFlag(MODULE_ID, "necromancerMarkDamageTurn", turnKey());
  const damage = await new Roll(`${dice}d8 + @abilities.int.mod + ${bonus}`, actor.getRollData()).evaluate();
  await damage.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Toque Profano — dano necrótico${bonus ? " + Marca de Morte" : ""}` });
  await applyNecromancerDamage(targetToken.actor, Number(damage.total));
  if (marked) {
    const choices = has(actor, "necromancer-improved-touch") ? 2 : 1;
    const picked = await Dialog.prompt({ title: "Manipulação Profana", content: `<form><p>Escolha ${choices === 2 ? "até duas manipulações diferentes" : "uma manipulação"}.</p>${["pull|Atrair", "push|Repelir", "weaken|Enfraquecer", ...(has(actor, "necromancer-improved-touch") ? ["profane|Profanar"] : [])].map(value => { const [key,label]=value.split("|"); return `<label><input type="checkbox" name="effect" value="${key}"> ${label}</label><br>`; }).join("")}</form>`, label: "Aplicar", callback: html => [...html[0].querySelectorAll("[name='effect']:checked")].slice(0, choices).map(input => input.value), rejectClose: false }) ?? [];
    const intensified = has(actor, "necromancer-transcendent-touch");
    if (picked.includes("pull") && !picked.includes("push")) await moveTarget(sourceToken, targetToken, intensified ? 6 : 3, true);
    if (picked.includes("push") && !picked.includes("pull")) await moveTarget(sourceToken, targetToken, intensified ? 6 : 3, false);
    if (picked.includes("weaken")) await action(targetToken.actor, "effect", { effect: { name: "Enfraquecido pelo Toque", img: ICON, origin: actor.uuid, disabled: false, duration: { rounds: 1, startRound: game.combat?.round, startTurn: game.combat?.turn }, changes: intensified ? [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2", priority: 20 }] : [], flags: { [MODULE_ID]: { necromancerEffect: `profane-weaken:${actor.uuid}`, noOpportunityAgainst: actor.uuid } } } });
    if (picked.includes("profane")) await action(targetToken.actor, "effect", { effect: { name: "Profanado", img: ICON, origin: actor.uuid, disabled: false, duration: { rounds: 1, startRound: game.combat?.round, startTurn: game.combat?.turn }, changes: [], flags: { [MODULE_ID]: { necromancerEffect: `profane-healing:${actor.uuid}`, noHealing: true } } } });
    if (picked.includes("profane") && intensified) await action(targetToken.actor, "update", { change: { "system.attributes.hp.temp": 0 } });
  }
  Hooks.callAll("novaEraNecromancerNecroticDamage", { actor, target: targetToken.actor, damage: Number(damage.total), itemKey: "necromancer-profane-touch" });
  return true;
}

export async function useCorpseExplosion(actor) {
  const corpse = selectedToken();
  const controlled = corpse?.actor?.getFlag(MODULE_ID, "masterUuid") === actor.uuid && corpse?.actor?.getFlag(MODULE_ID, "necromancerServant");
  if (!corpse?.actor || (!controlled && Number(corpse.actor.system.attributes.hp.value ?? 1) > 0)) return ui.notifications.warn("Nova Era: selecione um cadáver ou morto-vivo controlado.");
  if (corpse.document.getFlag(MODULE_ID, "cadaverExhausted")) return ui.notifications.warn("Nova Era: este cadáver já está Exaurido.");
  if (!controlled && !await spendCadavericEssence(actor, 2, "Explosão Cadavérica")) return false;
  await action(corpse.document, "token-flag", { key: "cadaverExhausted", value: true });
  if (controlled && Number(corpse.actor.system.attributes.hp.value ?? 0) > 0) await necromancerDocumentAction(corpse.actor, "update", { change: { "system.attributes.hp.value": 0 }, options: { novaEraNecromancerDetonation: true } });
  const level = necromancerLevel(actor), dice = level >= 17 ? 8 : level >= 11 ? 6 : 4;
  const roll = await new Roll(`${dice}d6`, actor.getRollData()).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Explosão Cadavérica — CD ${dc(actor)} Destreza • raio ${has(actor, "necromancer-dead-field") ? "3 m (4,5 m no Domínio)" : "3 m"}` });
  const radius = actor.effects.some(effect => effect.getFlag(MODULE_ID, "necromancerEffect") === "dead-field") ? 4.5 : 3;
  for (const token of canvas.tokens?.placeables ?? []) {
    if (!token.actor || token === corpse || distance(corpse, token) > radius) continue;
    const result = await token.actor.rollSavingThrow({ ability: "dex" });
    const save = Array.isArray(result) ? result[0] : result;
    const amount = Number(save?.total ?? 0) >= dc(actor) ? Math.floor(Number(roll.total) / 2) : Number(roll.total);
    await applyNecromancerDamage(token.actor, amount);
    Hooks.callAll("novaEraNecromancerNecroticDamage", { actor, target: token.actor, damage: amount, itemKey: "necromancer-corpse-explosion" });
  }
  await post(actor, "Explosão Cadavérica", `“Até os restos ainda têm algo a oferecer.” O cadáver de <strong>${corpse.name}</strong> foi Exaurido.`);
  return true;
}

export async function useLesserReanimation(actor) {
  let corpses = [...game.user.targets];
  const double = has(actor, "profane-recruitment") && corpses.length === 2;
  if (!double) corpses = corpses.length === 1 ? corpses : [];
  if (!corpses.length || corpses.some(corpse => !corpse.actor || Number(corpse.actor.system.attributes.hp.value ?? 1) > 0)) return ui.notifications.warn("Nova Era: selecione um Cadáver Válido — ou dois com Recrutamento Profano.");
  if (corpses.some(corpse => corpse.document.getFlag(MODULE_ID, "cadaverExhausted"))) return ui.notifications.warn("Nova Era: um dos cadáveres está Exaurido.");
  const servants = game.actors.filter(entry => entry.getFlag(MODULE_ID, "masterUuid") === actor.uuid && entry.getFlag(MODULE_ID, "necromancerServant") && !entry.getFlag(MODULE_ID, "necromancerPerfectCorpse") && !entry.getFlag(MODULE_ID, "necromancerHorde"));
  if (servants.length + corpses.length > lesserServantLimit(actor)) return ui.notifications.warn(`Nova Era: limite de ${lesserServantLimit(actor)} servos menores atingido.`);
  const choice = await Dialog.prompt({ title: "Reanimação Menor", content: `<form><label>Forma <select name="form"><option value="skeleton">Esqueleto</option><option value="zombie">Zumbi</option></select></label></form>`, label: "Erguer", callback: html => String(html.find("[name='form']").val()), rejectClose: false });
  const discount = actor.getFlag(MODULE_ID, "profaneRecruitmentDiscount") ? 1 : 0;
  const cost = Math.max(1, (double ? 3 : 2) - discount);
  if (!choice || !await spendCadavericEssence(actor, cost, double ? "Recrutamento Profano" : "Reanimação Menor")) return false;
  if (discount) await actor.unsetFlag(MODULE_ID, "profaneRecruitmentDiscount");
  const level = necromancerLevel(actor), proficiency = prof(actor);
  const created = [];
  for (const corpse of corpses) {
    await action(corpse.document, "token-flag", { key: "cadaverExhausted", value: true });
    created.push(await createServant({ choice, level, proficiency, intelligence: intelligence(actor), masterUuid: actor.uuid, masterName: actor.name, ownerId: game.user.id, x: corpse.document.x, y: corpse.document.y, disposition: activeToken(actor)?.document.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY }));
  }
  await post(actor, double ? "Recrutamento Profano" : "Reanimação Menor", `“Levantem-se. Sua utilidade ainda não terminou.” <strong>${created.length} ${choice === "skeleton" ? "Esqueleto(s)" : "Zumbi(s)"}</strong> criado(s).`);
  return created;
}

async function createServant(data) {
  if (!game.user.isGM) {
    game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPE, action: "create-servant", data });
    return true;
  }
  const skeleton = data.choice === "skeleton";
  const hp = skeleton ? 5 + 3 * Number(data.level) : 8 + 4 * Number(data.level);
  const servant = await Actor.create({
    name: `${skeleton ? "Esqueleto" : "Zumbi"} de ${data.masterName}`, type: "npc", img: skeleton ? "icons/svg/skull.svg" : "icons/svg/mystery-man.svg",
    system: {
      details: { type: { value: "undead" }, cr: 0 },
      attributes: { ac: { flat: (skeleton ? 12 : 10) + Number(data.proficiency), calc: "flat" }, hp: { value: hp, max: hp }, movement: { walk: skeleton ? 9 : 6, units: "m" } }
    }, ownership: { [data.ownerId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }, flags: { [MODULE_ID]: { necromancerServant: true, masterUuid: data.masterUuid, servantType: data.choice } }
  }, { temporary: false });
  await servant.createEmbeddedDocuments("Item", [{
    name: skeleton ? "Lâmina Óssea" : "Golpe Cadavérico", type: "weapon", img: skeleton ? "icons/weapons/swords/sword-broad-serrated-blue.webp" : "icons/skills/melee/unarmed-punch-fist.webp",
    system: { equipped: true, proficient: 0, weaponType: "natural", activation: { type: "action", cost: 1 }, actionType: "mwak", ability: "", attackBonus: String(Number(data.proficiency) + Number(data.intelligence ?? 0)), damage: { parts: [[`1d6 + ${data.proficiency}`, skeleton ? "piercing" : "bludgeoning"]] } },
    flags: { [MODULE_ID]: { necromancerServantAttack: true, masterUuid: data.masterUuid } }
  }]);
  if (canvas?.scene) {
    const source = servant.prototypeToken.toObject();
    source.name = servant.name; source.actorId = servant.id; source.x = Number(data.x); source.y = Number(data.y); source.disposition = Number(data.disposition);
    await canvas.scene.createEmbeddedDocuments("Token", [source]);
  }
  return servant;
}

async function onPreUpdateActor(actor, changed, options) {
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next !== undefined) options.novaEraNecromancerPreviousHp = Number(actor.system.attributes.hp.value ?? 0);
  if (actor.effects.some(effect => effect.getFlag(MODULE_ID, "noHealing")) && Number(next) > Number(actor.system.attributes.hp.value ?? 0)) foundry.utils.setProperty(changed, "system.attributes.hp.value", actor.system.attributes.hp.value);
  if (!isNovaEraNecromancer(actor) || options?.novaEraNecromancer || options?.novaEraNecromancerSacrifice) return;
}
async function onUpdateActor(actor, changed, options = {}) {
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next === undefined || Number(next) > 0 || Number(options.novaEraNecromancerPreviousHp ?? 0) <= 0) return;
  if (actor.getFlag(MODULE_ID, "necromancerServant") && !options.novaEraNecromancer) {
    const master = await fromUuid(actor.getFlag(MODULE_ID, "masterUuid"));
    if (master && responsible(master) && has(master, "profane-recruitment")) await master.setFlag(MODULE_ID, "profaneRecruitmentDiscount", true);
  }
  for (const necromancer of game.actors.filter(isNovaEraNecromancer)) {
    if (!responsible(necromancer)) continue;
    const source = activeToken(necromancer), fallen = activeToken(actor);
    if (!source || !fallen || distance(source, fallen) > 9) continue;
    if (source.document.disposition === fallen.document.disposition) continue;
    const challenge = Number(actor.system.details?.cr?.value ?? actor.system.details?.cr ?? 0);
    if (actor.getFlag(MODULE_ID, "necromancerServant") || (actor.type === "npc" && challenge === 0)) continue;
    const state = cadavericState(necromancer);
    const marked = state.markUuid === actor.uuid;
    await gainCadavericEssence(necromancer, 1 + (marked ? 1 : 0), marked ? "Colheita Marcada" : "Colher a Morte");
    if (marked) await necromancer.setFlag(MODULE_ID, STATE_FLAG, { ...cadavericState(necromancer), markUuid: "" });
    await action(fallen.document, "token-flag", { key: "cadaverExhausted", value: false });
    await post(necromancer, "Colher a Morte", `“A queda de <strong>${actor.name}</strong> alimenta aquilo que virá.” +${marked ? 2 : 1} EC.`);
    Hooks.callAll("novaEraNecromancerDeathHarvested", { necromancer, fallen: actor, fallenToken: fallen, marked });
  }
}
async function recoverRest(actor, result, config) {
  const long = result?.longRest === true || result?.type === "long" || config?.type === "long";
  if (!long || !isNovaEraNecromancer(actor) || !actor.isOwner) return;
  const state = cadavericState(actor);
  if (state.markUuid) {
    const marked = await fromUuid(state.markUuid);
    if (marked) await action(marked, "clear-effect", { key: `death-mark:${actor.uuid}` });
  }
  await actor.setFlag(MODULE_ID, STATE_FLAG, { ...state, points: state.maximum, instability: 0, markUuid: "", sacrificeUses: 0, extractionUses: 0 });
  Hooks.callAll("novaEraNecromancerChanged", { actor, reason: "Descanso Longo" });
}
async function avatarTurn(combat) {
  const actor = combat?.combatant?.actor;
  if (!actor || !isNovaEraNecromancer(actor) || !responsible(actor) || !actor.effects.some(effect => effect.getFlag(MODULE_ID, "necromancerEffect") === "death-avatar")) return;
  await gainCadavericEssence(actor, 3, "Essência Inesgotável");
}

export function registerNecromancerAutomation() {
  game.socket.on(`module.${MODULE_ID}`, async payload => {
    if (!game.user.isGM || payload?.type !== SOCKET_TYPE) return;
    if (payload.action === "create-servant") return createServant(payload.data ?? {});
    await executeDocument(payload.uuid, payload.action, payload.data);
  });
  Hooks.on("preUpdateActor", (actor, changed, options) => void onPreUpdateActor(actor, changed, options));
  Hooks.on("updateActor", (actor, changed, options) => void onUpdateActor(actor, changed, options));
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void recoverRest(actor, result, config));
  Hooks.on("updateCombat", combat => void avatarTurn(combat));
  Hooks.on("createItem", item => { if (isNovaEraNecromancer(item.parent)) void setCadavericEssence(item.parent, cadavericState(item.parent).points, { reason: "Sincronização" }); });
}
