import { MODULE_ID } from "../constants.mjs";
import {
  activeNecromancerToken, applyNecromancerDamage, applyNecromancerHealing, applyNecromancerTempHp,
  cadavericState, gainCadavericEssence, hasNecromancerFeature, isNovaEraNecromancer,
  necromancerDC, necromancerDistance, necromancerDocumentAction, necromancerIntelligence,
  necromancerLevel, necromancerProficiency, selectedNecromancerToken, setCadavericEssence,
  spendCadavericEssence, useCorpseExplosion, useDeathMark, useLesserReanimation,
  useProfaneSacrifice, useProfaneTouch
} from "./core-automation.mjs";

const ICON = "icons/magic/death/skull-humanoid-crown-white-blue.webp";
const ADV_SOCKET = "necromancerAdvancedAction";
const ACTIVE_KEYS = new Set([
  "necromancer-death-mark", "necromancer-profane-touch", "necromancer-cadaveric-essence",
  "necromancer-lesser-reanimation", "necromancer-corpse-explosion", "necromancer-unstable-body",
  "necromancer-death-presence", "necromancer-partial-lich", "necromancer-perfect-reanimation",
  "necromancer-dead-field", "necromancer-infinite-army", "necromancer-death-avatar",
  "blood-pact", "bloody-execution", "bone-fortress", "protective-tomb", "tomb-pact"
]);

function keyOf(item) { return item?.getFlag?.(MODULE_ID, "contentKey") ?? ""; }
function prof(actor) { return necromancerProficiency(actor); }
function int(actor) { return necromancerIntelligence(actor); }
function turnKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `free:${Math.floor(Date.now() / 6000)}`; }
function roundKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}` : `free:${Math.floor(Date.now() / 6000)}`; }
function responsible(actor) {
  const owners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return owners[0]?.id === game.user.id || (!owners.length && game.user.isGM && game.users.activeGM?.id === game.user.id);
}
function effectActive(actor, key) { return actor.effects.some(effect => effect.getFlag(MODULE_ID, "necromancerEffect") === key); }
function servants(actor) { return game.actors.filter(entry => entry.getFlag(MODULE_ID, "masterUuid") === actor.uuid && entry.getFlag(MODULE_ID, "necromancerServant")); }
function firstRoll(result) { return Array.isArray(result) ? result[0] : result; }
async function post(actor, title, text) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era necromancer-chat"><h2>${title}</h2><p>${text}</p></section>` });
}
async function choose(title, prompt, entries) {
  return Dialog.prompt({ title, content: `<form><p>${prompt}</p><select name="choice">${entries.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></form>`, label: "Confirmar", callback: html => String(html.find("[name='choice']").val()), rejectClose: false });
}
async function confirm(title, text) { return Dialog.confirm({ title, content: `<p>${text}</p>`, yes: () => true, no: () => false, defaultYes: true }); }
async function save(actor, ability) { return Number(firstRoll(await actor.rollSavingThrow({ ability }))?.total ?? 0); }
async function roll(actor, formula, flavor) { const result = await new Roll(formula, actor.getRollData()).evaluate(); await result.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor }); return Number(result.total); }
async function effect(actor, key, name, { rounds = 10, changes = [], extra = {} } = {}) {
  return necromancerDocumentAction(actor, "effect", { effect: { name, img: ICON, origin: actor.uuid, disabled: false, duration: { rounds, startRound: game.combat?.round, startTurn: game.combat?.turn }, changes, flags: { [MODULE_ID]: { necromancerEffect: key, ...extra } } } });
}

async function activatePresence(actor) {
  const avatar = effectActive(actor, "death-avatar");
  if (!avatar && !await spendCadavericEssence(actor, 1, "Presença da Morte")) return false;
  await effect(actor, "death-presence", "Presença da Morte", { extra: { radius: avatar ? 12 : 6 } });
  await post(actor, "Presença da Morte", `“A vida recua quando eu me aproximo.” Aura de ${avatar ? 12 : 6} m ativada.`);
  return true;
}

async function purgeEssence(actor) {
  const state = cadavericState(actor);
  if (!state.instability) return ui.notifications.warn("Nova Era: não há Instabilidade para purgar.");
  const damage = await roll(actor, "1d6", "Purgar Essência — dano irredutível");
  await applyNecromancerDamage(actor, damage, { ignoreTemp: true });
  await setCadavericEssence(actor, state.points, { reason: "Purgar Essência", instability: state.instability - 1 });
  return true;
}

async function activatePartialLich(actor, { avatar = false } = {}) {
  if (!avatar) {
    if (actor.getFlag(MODULE_ID, "partialLichUsed")) return ui.notifications.warn("Nova Era: Forma Lich Parcial já foi usada neste Descanso Longo.");
    if (!await spendCadavericEssence(actor, 2, "Forma Lich Parcial")) return false;
    await actor.setFlag(MODULE_ID, "partialLichUsed", true);
  }
  await setCadavericEssence(actor, cadavericState(actor).points, { reason: "Forma Lich Parcial", instability: 3 });
  await effect(actor, "partial-lich", "Forma Lich Parcial", { changes: [
    { key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "necrotic", priority: 20 },
    { key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "poison", priority: 20 },
    { key: "system.attributes.senses.darkvision", mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE, value: "36", priority: 20 }
  ], extra: { refusalUsed: false, avatar } });
  await post(actor, "Forma Lich Parcial", "“Meu coração é apenas um hábito que ainda não abandonei.” A transformação dura 1 minuto.");
  return true;
}

async function activateAvatar(actor) {
  if (actor.getFlag(MODULE_ID, "deathAvatarUsed")) return ui.notifications.warn("Nova Era: Avatar da Morte já foi usado neste Descanso Longo.");
  await actor.setFlag(MODULE_ID, "deathAvatarUsed", true);
  await activatePartialLich(actor, { avatar: true });
  await effect(actor, "death-avatar", "Avatar da Morte", { extra: { refusalUsed: false } });
  await post(actor, "Avatar da Morte", "“Por um minuto, a morte deixa de ser destino e passa a ser vontade.”");
  return true;
}

async function activateDeadField(actor) {
  const origin = selectedNecromancerToken() ?? activeNecromancerToken(actor);
  const source = activeNecromancerToken(actor);
  if (!origin || !source) return ui.notifications.warn("Nova Era: coloque o Necromante em uma cena e selecione o centro do Domínio.");
  if (necromancerDistance(source, origin) > 18) return ui.notifications.warn("Nova Era: o centro está além de 18 m.");
  if (!await spendCadavericEssence(actor, 5, "Domínio do Campo Morto")) return false;
  await actor.setFlag(MODULE_ID, "deadField", { sceneId: canvas.scene.id, x: origin.center.x, y: origin.center.y, expires: Date.now() + 60000 });
  await effect(actor, "dead-field", "Domínio do Campo Morto", { extra: { radius: 6 } });
  await post(actor, "Domínio do Campo Morto", "“Aqui, até o chão se lembra dos mortos.” Área de 6 m ativa por 1 minuto.");
  return true;
}

async function createPerfectCorpse(actor) {
  const corpse = selectedNecromancerToken();
  if (!corpse?.actor || Number(corpse.actor.system.attributes.hp.value ?? 1) > 0) return ui.notifications.warn("Nova Era: selecione um cadáver válido.");
  const state = cadavericState(actor);
  if (state.points < 5) return ui.notifications.warn("Nova Era: são necessárias pelo menos 5 EC.");
  if (game.actors.some(entry => entry.getFlag(MODULE_ID, "necromancerPerfectCorpse") && entry.getFlag(MODULE_ID, "masterUuid") === actor.uuid)) return ui.notifications.warn("Nova Era: você já possui um Cadáver Perfeito.");
  await setCadavericEssence(actor, 0, { reason: "Reanimação Perfeita" });
  await corpse.document.setFlag(MODULE_ID, "cadaverExhausted", true);
  if (!game.user.isGM) {
    game.socket.emit(`module.${MODULE_ID}`, { type: ADV_SOCKET, action: "create-perfect", actorUuid: actor.uuid, corpseUuid: corpse.document.uuid, ownerId: game.user.id });
    await post(actor, "Reanimação Perfeita", "“Você não voltou como era. Voltou como eu decidi.” O ritual foi entregue ao Mestre.");
    return true;
  }
  return finishPerfectCorpse(actor, corpse, game.user.id);
}

async function finishPerfectCorpse(actor, corpse, ownerId) {
  const level = necromancerLevel(actor), hp = 10 + 6 * level, attacks = level >= 17 ? 3 : 2, average = level >= 20 ? 16 : level >= 17 ? 14 : level >= 15 ? 12 : 10;
  const champion = await Actor.create({ name: `Cadáver Perfeito de ${actor.name}`, type: "npc", img: corpse.actor.img ?? ICON, system: { details: { type: { value: "undead" }, cr: 0 }, attributes: { ac: { flat: 12 + prof(actor), calc: "flat" }, hp: { value: hp, max: hp }, movement: foundry.utils.deepClone(corpse.actor.system.attributes?.movement ?? { walk: 9, units: "m" }) } }, ownership: { [ownerId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }, flags: { [MODULE_ID]: { necromancerServant: true, necromancerPerfectCorpse: true, masterUuid: actor.uuid, inheritanceSlots: level >= 18 ? 4 : level >= 15 ? 3 : 2 } } });
  await champion.createEmbeddedDocuments("Item", [{ name: "Ataques do Cadáver Perfeito", type: "weapon", img: corpse.actor.img ?? ICON, system: { equipped: true, proficient: 0, weaponType: "natural", activation: { type: "action", cost: 1 }, actionType: "mwak", ability: "", attackBonus: String(prof(actor) + int(actor)), damage: { parts: [[`${attacks} * ${average}`, "necrotic"]] } }, flags: { [MODULE_ID]: { necromancerServantAttack: true, masterUuid: actor.uuid } } }]);
  const source = champion.prototypeToken.toObject(); source.name = champion.name; source.actorId = champion.id; source.x = corpse.document.x; source.y = corpse.document.y; source.disposition = activeNecromancerToken(actor)?.document.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  await canvas.scene.createEmbeddedDocuments("Token", [source]);
  await post(actor, "Reanimação Perfeita", `“Você não voltou como era. Voltou como eu decidi.” ${attacks} ataques e ${champion.getFlag(MODULE_ID, "inheritanceSlots")} espaços de Herança.`);
  return true;
}

async function activateHorde(actor) {
  if (actor.getFlag(MODULE_ID, "infiniteArmyUsed")) return ui.notifications.warn("Nova Era: Exército Infinito já foi usado neste Descanso Longo.");
  const free = hasNecromancerFeature(actor, "tide-of-dead");
  if (!free && !await spendCadavericEssence(actor, 6, "Exército Infinito")) return false;
  const spot = selectedNecromancerToken() ?? activeNecromancerToken(actor);
  if (!spot) return ui.notifications.warn("Nova Era: selecione o ponto da Horda.");
  const hp = 15 * prof(actor) + (free ? 30 : 0);
  await actor.setFlag(MODULE_ID, "infiniteArmyUsed", true);
  if (!game.user.isGM) {
    game.socket.emit(`module.${MODULE_ID}`, { type: ADV_SOCKET, action: "create-horde", actorUuid: actor.uuid, ownerId: game.user.id, x: spot.document.x, y: spot.document.y, disposition: activeNecromancerToken(actor)?.document.disposition });
    await post(actor, "Exército Infinito", "“Uma voz ordena. Mil cadáveres respondem.” A Horda foi entregue ao Mestre.");
    return true;
  }
  return finishHorde(actor, { ownerId: game.user.id, x: spot.document.x, y: spot.document.y, disposition: activeNecromancerToken(actor)?.document.disposition });
}

async function finishHorde(actor, data) {
  const free = hasNecromancerFeature(actor, "tide-of-dead"), hp = 15 * prof(actor) + (free ? 30 : 0);
  const horde = await Actor.create({ name: `Horda Cadavérica de ${actor.name}`, type: "npc", img: ICON, system: { details: { type: { value: "undead" }, cr: 0 }, attributes: { ac: { flat: 12 + prof(actor), calc: "flat" }, hp: { value: hp, max: hp }, movement: { walk: 6, units: "m" } } }, ownership: { [data.ownerId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }, flags: { [MODULE_ID]: { necromancerServant: true, necromancerHorde: true, masterUuid: actor.uuid, expires: Date.now() + 60000 } } });
  await horde.createEmbeddedDocuments("Item", [{ name: "Maré Cadavérica", type: "feat", img: ICON, system: { activation: { type: "action", cost: 1 } }, flags: { [MODULE_ID]: { necromancerServantAttack: true, necromancerHordeAttack: true, masterUuid: actor.uuid } } }]);
  const tokenData = horde.prototypeToken.toObject(); tokenData.name = horde.name; tokenData.actorId = horde.id; tokenData.x = data.x; tokenData.y = data.y; tokenData.width = 4; tokenData.height = 4; tokenData.disposition = data.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
  await effect(actor, "cadaveric-horde", "Exército Infinito", { extra: { hordeUuid: horde.uuid } });
  await post(actor, "Exército Infinito", `“Uma voz ordena. Mil cadáveres respondem.” Horda criada com ${hp} PV.`);
  return true;
}

async function activateBloodPact(actor) {
  if (actor.getFlag(MODULE_ID, "bloodPactUsed")) return ui.notifications.warn("Nova Era: Sangue Pactuado precisa de Descanso Curto ou Longo.");
  const picked = await Dialog.prompt({ title: "Sangue Pactuado", content: `<form><p>Escolha exatamente dois benefícios.</p>${[["essence","+2 EC"],["damage","+1d8 necrótico/turno"],["resistance","Resistência física"],["hunt","Caçar feridos"]].map(([v,l])=>`<label><input type="checkbox" name="benefit" value="${v}"> ${l}</label><br>`).join("")}</form>`, label: "Pactuar", callback: html => [...html[0].querySelectorAll("[name='benefit']:checked")].slice(0,2).map(input => input.value), rejectClose: false });
  if (!picked?.length) return false;
  const damage = await roll(actor, `1d8 + ${necromancerLevel(actor)}`, "Sangue Pactuado — perda irredutível");
  await applyNecromancerDamage(actor, damage, { ignoreTemp: true });
  if (picked.includes("essence")) await gainCadavericEssence(actor, 2, "Sangue Pactuado");
  const changes = picked.includes("resistance") ? ["bludgeoning","piercing","slashing"].map(value => ({ key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value, priority: 20 })) : [];
  await effect(actor, "blood-pact", "Sangue Pactuado", { changes, extra: { benefits: picked } });
  await actor.setFlag(MODULE_ID, "bloodPactUsed", true);
  return true;
}

async function bloodyExecution(actor) {
  const target = selectedNecromancerToken();
  if (!target?.actor) return ui.notifications.warn("Nova Era: selecione exatamente um alvo.");
  const hp = target.actor.system.attributes.hp;
  if (Number(hp.value) >= Number(hp.max) / 2) return ui.notifications.warn("Nova Era: Execução Sangrenta exige alvo abaixo da metade dos PV.");
  if (!await spendCadavericEssence(actor, 3, "Execução Sangrenta")) return false;
  const marked = cadavericState(actor).markUuid === target.actor.uuid;
  const options = marked ? { advantage: false, disadvantage: true } : {};
  const result = firstRoll(await target.actor.rollSavingThrow({ ability: "con", ...options }));
  const damage = await roll(actor, "6d10", "Execução Sangrenta — dano necrótico");
  const failed = Number(result?.total ?? 0) < necromancerDC(actor);
  await applyNecromancerDamage(target.actor, failed ? damage : Math.floor(damage / 2));
  if (failed && Number(target.actor.system.attributes.hp.value ?? 0) > 0) await effect(target.actor, `execution-no-heal:${actor.id}`, "Ferida da Execução Sangrenta", { rounds: 1, extra: { noHealing: true } });
  return true;
}

async function boneFortress(actor) {
  if (!await spendCadavericEssence(actor, 2, "Fortaleza de Ossos")) return false;
  const mode = await choose("Fortaleza de Ossos", "Escolha a manifestação.", [["wall","Muralha de três segmentos"],["field","Campo de Ossos (3 m)"]]);
  if (!mode) return false;
  const spot = selectedNecromancerToken() ?? activeNecromancerToken(actor);
  await actor.setFlag(MODULE_ID, "boneFortress", { mode, sceneId: canvas.scene.id, x: spot?.center.x, y: spot?.center.y, expires: Date.now() + (mode === "wall" ? 600000 : 60000) });
  await effect(actor, "bone-fortress", mode === "wall" ? "Muralha de Ossos" : "Campo de Ossos", { rounds: mode === "wall" ? 100 : 10, extra: { mode, hp: 5 * necromancerLevel(actor), radius: 3 } });
  await post(actor, "Fortaleza de Ossos", mode === "wall" ? `Três segmentos: CA 15 e ${5 * necromancerLevel(actor)} PV cada.` : "Campo de 3 m: terreno difícil e 2d6 perfurante na primeira movimentação hostil de cada turno.");
  return true;
}

async function protectiveTomb(actor) {
  const target = selectedNecromancerToken() ?? activeNecromancerToken(actor);
  if (!target?.actor) return ui.notifications.warn("Nova Era: selecione o protegido.");
  if (target.actor.effects.some(value => String(value.getFlag(MODULE_ID, "necromancerEffect") ?? "").startsWith(`protective-tomb:${actor.id}`)) && Number(target.actor.system.attributes.hp.temp ?? 0) > 0) return ui.notifications.warn("Nova Era: o Túmulo ainda protege este alvo.");
  if (!await spendCadavericEssence(actor, 1, "Túmulo Protetor")) return false;
  const sentinel = effectActive(actor, "eternal-sentinel");
  const amount = sentinel ? 8 + int(actor) + necromancerLevel(actor) : await roll(actor, `1d8 + ${int(actor) + necromancerLevel(actor)}`, "Túmulo Protetor");
  await applyNecromancerTempHp(target.actor, amount);
  const undead = target.actor.system.details?.type?.value === "undead" || target.actor.getFlag(MODULE_ID, "necromancerServant");
  const ac = hasNecromancerFeature(actor, "unbreakable-bones") ? (undead ? 2 : 1) : 0;
  await effect(target.actor, `protective-tomb:${actor.id}`, `Túmulo Protetor — ${actor.name}`, { rounds: 999, changes: ac ? [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(ac), priority: 20 }] : [], extra: { sourceUuid: actor.uuid, initialTemp: amount } });
  return true;
}

async function eternalSentinel(actor) {
  if (actor.getFlag(MODULE_ID, "eternalSentinelUsed")) return ui.notifications.warn("Nova Era: Sentinela Eterno já foi usado neste Descanso Longo.");
  await actor.setFlag(MODULE_ID, "eternalSentinelUsed", true);
  await effect(actor, "eternal-sentinel", "Sentinela Eterno", { changes: [] });
  await post(actor, "Sentinela Eterno", "“Enquanto eu vigiar, a sepultura permanecerá fechada.” Protegidos resistem a dano físico por 1 minuto.");
  return true;
}

export async function issueNecromanticOrder(actor, order) {
  const army = servants(actor);
  if (!army.length) return ui.notifications.warn("Nova Era: não há servos vinculados para receber a ordem.");
  for (const servant of army) {
    for (const old of servant.effects.filter(value => String(value.getFlag(MODULE_ID, "necromancerEffect") ?? "").startsWith(`servant-order:${actor.id}`))) await old.delete({ novaEraNecromancer: true });
    const changes = order === "Defender" ? [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 }] : order === "Avançar" ? [{ key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "2", priority: 20 }] : [];
    await effect(servant, `servant-order:${actor.id}`, `Ordem — ${order}`, { rounds: 1, changes, extra: { order, noAttack: order === "Defender", disengage: order === "Recuar", opportunityAdvantage: order === "Avançar" } });
  }
  await actor.setFlag(MODULE_ID, "necromancerOrder", order);
  if (order === "Atacar") {
    const target = selectedNecromancerToken();
    await actor.setFlag(MODULE_ID, "necromancerFocusTarget", target?.actor?.uuid ?? cadavericState(actor).markUuid ?? "");
  }
  await post(actor, `Ordem: ${order}`, `“Os mortos não hesitam. Eles obedecem.” ${army.length} servo(s) receberam a ordem.`);
  Hooks.callAll("novaEraNecromancerChanged", { actor, reason: `Ordem ${order}` });
  return true;
}

async function useServantAttack(servant) {
  const master = await fromUuid(servant.getFlag(MODULE_ID, "masterUuid"));
  if (master && servant.getFlag(MODULE_ID, "necromancerHorde")) {
    const hordeToken = activeNecromancerToken(servant);
    if (!hordeToken) return ui.notifications.warn("Nova Era: coloque a Horda na cena.");
    const die = hasNecromancerFeature(master, "tide-of-dead") ? "5d8" : "4d8";
    const damage = await roll(master, `${die} + ${int(master)}`, "Maré Cadavérica");
    let affected = 0;
    for (const token of canvas.tokens?.placeables ?? []) {
      if (!token.actor || token.document.disposition === hordeToken.document.disposition || necromancerDistance(hordeToken, token) > 4.5) continue;
      const failed = await save(token.actor, "dex") < necromancerDC(master);
      await applyNecromancerDamage(token.actor, failed ? damage : Math.floor(damage / 2));
      if (failed) await effect(token.actor, `cadaveric-wave:${master.id}`, "Derrubado pela Maré Cadavérica", { rounds: 1, extra: { prone: true } });
      affected += 1;
    }
    await post(master, "Maré Cadavérica", `${affected} criatura(s) foram alcançadas pela Horda.`);
    return true;
  }
  const target = selectedNecromancerToken();
  if (!master || !target?.actor) return ui.notifications.warn("Nova Era: selecione exatamente um alvo para o servo.");
  const order = servant.effects.find(value => String(value.getFlag(MODULE_ID, "necromancerEffect") ?? "").startsWith(`servant-order:${master.id}`));
  if (order?.getFlag(MODULE_ID, "noAttack")) return ui.notifications.warn("Nova Era: este servo está sob a ordem Defender e não pode atacar.");
  const marked = cadavericState(master).markUuid === target.actor.uuid;
  const firstVsMark = marked && master.getFlag(MODULE_ID, "servantMarkAttackTurn") !== turnKey();
  const formula = `${firstVsMark ? "2d20kh" : "1d20"} + ${prof(master) + int(master)}`;
  const attack = await roll(servant, formula, `${servant.name} — ataque${firstVsMark ? " com Vantagem contra a Marca" : ""}`);
  if (firstVsMark) await master.setFlag(MODULE_ID, "servantMarkAttackTurn", turnKey());
  if (attack < Number(target.actor.system.attributes.ac.value ?? Infinity)) return post(master, "Ataque do Servo", `${servant.name} não alcançou a defesa de ${target.name}.`);
  let bonus = 0;
  if (servant.getFlag(MODULE_ID, "servantType") === "skeleton" && marked && master.getFlag(MODULE_ID, "calculatedAttackTurn") !== turnKey()) { bonus += int(master); await master.setFlag(MODULE_ID, "calculatedAttackTurn", turnKey()); }
  const focus = master.getFlag(MODULE_ID, "necromancerFocusTarget");
  if (hasNecromancerFeature(master, "necromantic-command") && focus === target.actor.uuid && master.getFlag(MODULE_ID, "commandAttackTurn") !== turnKey()) { bonus += int(master); await master.setFlag(MODULE_ID, "commandAttackTurn", turnKey()); }
  if (effectActive(master, "death-presence") && master.getFlag(MODULE_ID, "presenceServantHitTurn") !== turnKey()) { bonus += Math.ceil(prof(master) / 2); await master.setFlag(MODULE_ID, "presenceServantHitTurn", turnKey()); }
  const perfect = servant.getFlag(MODULE_ID, "necromancerPerfectCorpse");
  const level = necromancerLevel(master), count = perfect ? (level >= 17 ? 3 : 2) : 1, average = level >= 20 ? 16 : level >= 17 ? 14 : level >= 15 ? 12 : 10;
  const damage = perfect ? count * average + bonus : await roll(master, `1d6 + ${prof(master) + bonus}`, `${servant.name} — dano`);
  await applyNecromancerDamage(target.actor, damage);
  await post(master, "Ataque do Servo", `${servant.name} causou <strong>${damage}</strong> de dano a ${target.name}.`);
  return true;
}

export async function activateNecromancerFeature(actor, itemOrKey) {
  const key = typeof itemOrKey === "string" ? itemOrKey : keyOf(itemOrKey);
  const actions = {
    "necromancer-death-mark": useDeathMark, "necromancer-profane-touch": useProfaneTouch,
    "necromancer-cadaveric-essence": useProfaneSacrifice, "necromancer-lesser-reanimation": useLesserReanimation,
    "necromancer-corpse-explosion": useCorpseExplosion, "necromancer-death-presence": activatePresence,
    "necromancer-unstable-body": purgeEssence, "necromancer-partial-lich": activatePartialLich,
    "necromancer-perfect-reanimation": createPerfectCorpse, "necromancer-dead-field": activateDeadField,
    "necromancer-infinite-army": activateHorde, "necromancer-death-avatar": activateAvatar,
    "blood-pact": activateBloodPact, "bloody-execution": bloodyExecution, "bone-fortress": boneFortress,
    "protective-tomb": protectiveTomb, "tomb-pact": eternalSentinel
  };
  if (!actions[key]) return ui.notifications.warn("Nova Era: esta habilidade é passiva ou acionada automaticamente.");
  return actions[key](actor);
}

async function extraction({ actor, target, damage }) {
  if (!actor || !target || damage <= 0 || Number(target.system.attributes.hp.value ?? 0) <= 0 || !responsible(actor)) return;
  if (cadavericState(actor).instability >= 2 && actor.getFlag(MODULE_ID, "unstableDamageTurn") !== turnKey()) {
    await actor.setFlag(MODULE_ID, "unstableDamageTurn", turnKey());
    await applyNecromancerDamage(target, await roll(actor, "1d8", "Essência Transbordante — dano necrótico adicional"));
  }
  const available = [];
  if (hasNecromancerFeature(actor, "necromancer-essence-extraction") && actor.getFlag(MODULE_ID, "essenceExtractionTurn") !== turnKey()) available.push(["drain", "Extração — Drenar (PV temporários)"], ["feed", "Extração — Alimentar servo"], ["collect", "Extração — Coletar 1 EC"]);
  if (hasNecromancerFeature(actor, "soul-thirst") && activeNecromancerToken(actor) && activeNecromancerToken(target) && necromancerDistance(activeNecromancerToken(actor), activeNecromancerToken(target)) <= 6 && actor.getFlag(MODULE_ID, "soulThirstTurn") !== turnKey()) available.push(["devour", "Sede de Alma — Devorar"], ["bleed", "Sede de Alma — Sangrar por 1 EC"]);
  if (!available.length) return;
  const option = await choose("A alma foi exposta", "Deseja extrair algo deste dano necrótico?", [["none", "Não usar"], ...available]);
  if (!option || option === "none") return;
  if (["drain","feed","collect"].includes(option)) await actor.setFlag(MODULE_ID, "essenceExtractionTurn", turnKey());
  else await actor.setFlag(MODULE_ID, "soulThirstTurn", turnKey());
  if (["drain","devour"].includes(option)) await applyNecromancerTempHp(actor, Math.max(0, prof(actor) + int(actor)));
  if (option === "bleed") { await applyNecromancerDamage(actor, prof(actor), { ignoreTemp: true }); await gainCadavericEssence(actor, 1, "Sede de Alma"); }
  if (option === "collect") {
    const state = cadavericState(actor); const feast = effectActive(actor, "profane-feast");
    if (!feast && state.extractionUses >= prof(actor)) return ui.notifications.warn("Nova Era: usos de Coletar esgotados.");
    await actor.setFlag(MODULE_ID, "necromancerState", { ...state, extractionUses: feast ? state.extractionUses : state.extractionUses + 1 });
    await gainCadavericEssence(actor, 1, "Extração — Coletar");
  }
  if (option === "feed") {
    const token = selectedNecromancerToken();
    if (!token?.actor?.getFlag(MODULE_ID, "necromancerServant") || token.actor.getFlag(MODULE_ID, "masterUuid") !== actor.uuid) return ui.notifications.warn("Nova Era: selecione um servo controlado para Alimentar.");
    const upgraded = hasNecromancerFeature(actor, "voracious-drain") && await confirm("Dreno Voraz", "Gastar 1 EC para intensificar a Transfusão Profana?");
    if (upgraded && await spendCadavericEssence(actor, 1, "Dreno Voraz")) {
      await applyNecromancerHealing(token.actor, await roll(actor, `2d8 + ${int(actor) + prof(actor)}`, "Transfusão Profana"));
      await effect(token.actor, `voracious-ac:${actor.id}`, "Transfusão Profana", { rounds: 1, changes: [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 }] });
    } else await applyNecromancerHealing(token.actor, await roll(actor, `1d8 + ${int(actor) + prof(actor)}`, "Alimentar servo"));
  }
  if (effectActive(actor, "blood-pact")) {
    const pact = actor.effects.find(value => value.getFlag(MODULE_ID, "necromancerEffect") === "blood-pact");
    if (pact?.getFlag(MODULE_ID, "benefits")?.includes("damage") && actor.getFlag(MODULE_ID, "bloodPactDamageTurn") !== turnKey()) {
      await actor.setFlag(MODULE_ID, "bloodPactDamageTurn", turnKey());
      await applyNecromancerDamage(target, await roll(actor, "1d8", "Sangue Pactuado — dano necrótico adicional"));
    }
  }
  if (effectActive(actor, "profane-feast") && actor.getFlag(MODULE_ID, "profaneFeastHealTurn") !== turnKey()) { await actor.setFlag(MODULE_ID, "profaneFeastHealTurn", turnKey()); await applyNecromancerHealing(actor, Math.floor(damage / 2)); }
}

async function midiNecroticDamage(workflow) {
  const actor = workflow?.actor ?? workflow?.item?.actor;
  if (!isNovaEraNecromancer(actor) || !responsible(actor)) return;
  const details = workflow.damageDetail ?? workflow.damageItem?.damageDetail ?? [];
  const necrotic = details.filter(entry => ["necrotic","necroticDamage"].includes(entry.type)).reduce((sum, entry) => sum + Number(entry.value ?? entry.damage ?? 0), 0);
  if (necrotic <= 0) return;
  const targets = workflow.hitTargets instanceof Set ? [...workflow.hitTargets] : [...(workflow.targets ?? [])];
  for (const token of targets) Hooks.callAll("novaEraNecromancerNecroticDamage", { actor, target: token.actor, damage: necrotic, itemKey: keyOf(workflow.item) || workflow.item?.name });
}

async function harvested({ necromancer: actor, fallen, fallenToken, marked }) {
  if (hasNecromancerFeature(actor, "necromancer-profane-transcendence") && actor.getFlag(MODULE_ID, "feedDeathTurn") !== turnKey()) { await actor.setFlag(MODULE_ID, "feedDeathTurn", turnKey()); await applyNecromancerHealing(actor, Math.max(0, int(actor))); }
  if (!marked) return;
  if (hasNecromancerFeature(actor, "necromancer-mass-harvest")) {
    const option = await choose("Colheita em Massa", "A Marca tombou. Escolha a colheita.", [["essence","Devorar Essência: +1 EC"],["life","Devorar Vida: curar 2d8 + INT"],["cry","Grito dos Mortos"]]);
    if (option === "essence") await gainCadavericEssence(actor, 1, "Colheita em Massa");
    if (option === "life") { const target = selectedNecromancerToken()?.actor ?? actor; await applyNecromancerHealing(target, await roll(actor, `2d8 + ${int(actor)}`, "Devorar Vida")); }
    if (option === "cry") for (const servant of servants(actor)) await effect(servant, `cry-dead:${actor.id}`, "Grito dos Mortos", { rounds: 1, extra: { advantage: true, bonusDamage: "1d8" } });
  }
  if (hasNecromancerFeature(actor, "profane-feast") && !actor.getFlag(MODULE_ID, "profaneFeastUsed")) {
    await actor.setFlag(MODULE_ID, "profaneFeastUsed", true); await effect(actor, "profane-feast", "Banquete Profano");
    const burst = await roll(actor, "3d6", "Banquete Profano — Ruptura necrótica");
    for (const token of canvas.tokens?.placeables ?? []) if (token.actor && fallenToken && token.document.disposition !== activeNecromancerToken(actor)?.document.disposition && necromancerDistance(fallenToken, token) <= 3) await applyNecromancerDamage(token.actor, burst);
  }
}

async function processAuras(combat, changed = {}) {
  if (combat && !("turn" in changed || "round" in changed)) return;
  for (const actor of game.actors.filter(candidate => isNovaEraNecromancer(candidate) && responsible(candidate))) {
    const source = activeNecromancerToken(actor);
    if (source && effectActive(actor, "death-presence")) {
      const radius = effectActive(actor, "death-avatar") ? 12 : 6;
      for (const token of canvas.tokens?.placeables ?? []) {
        if (!token.actor || token.document.disposition === source.document.disposition || necromancerDistance(source, token) > radius || token.actor.getFlag(MODULE_ID, "presenceSaveTurn") === turnKey()) continue;
        await token.actor.setFlag(MODULE_ID, "presenceSaveTurn", turnKey());
        if (await save(token.actor, "wis") < necromancerDC(actor)) await effect(token.actor, `death-presence:${actor.id}`, "Opressão da Presença da Morte", { rounds: 1, extra: { noReaction: true, savePenalty: "1d4", frightened: effectActive(actor, "death-avatar") } });
      }
    }
    const linked = servants(actor).map(activeNecromancerToken).filter(Boolean);
    for (const servantToken of linked) {
      const adjacent = hasNecromancerFeature(actor, "necromantic-command") && linked.some(other => other !== servantToken && necromancerDistance(servantToken, other) <= 1.5);
      const current = servantToken.actor.effects.find(value => value.getFlag(MODULE_ID, "necromancerEffect") === `cadaveric-formation:${actor.id}`);
      if (adjacent && !current) await effect(servantToken.actor, `cadaveric-formation:${actor.id}`, "Formação Cadavérica", { rounds: 999, changes: [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1", priority: 20 }] });
      if (!adjacent && current) await current.delete({ novaEraNecromancer: true });
    }
    if (effectActive(actor, "death-avatar")) {
      const marked = cadavericState(actor).markUuid ? await fromUuid(cadavericState(actor).markUuid) : null;
      const hp = marked?.system?.attributes?.hp;
      const executions = actor.getFlag(MODULE_ID, "avatarExecutions") ?? {};
      if (marked && Number(hp?.value ?? 31) > 0 && Number(hp?.value ?? 31) <= 30 && !executions[marked.uuid]) {
        executions[marked.uuid] = true; await actor.setFlag(MODULE_ID, "avatarExecutions", executions);
        if (await save(marked, "con") < necromancerDC(actor)) await necromancerDocumentAction(marked, "update", { change: { "system.attributes.hp.value": 0 } });
        else await applyNecromancerDamage(marked, await roll(actor, "6d10", "Avatar da Morte — sentença necrótica"));
      }
    }
    const field = actor.getFlag(MODULE_ID, "deadField");
    if (field?.sceneId === canvas.scene?.id && field.expires > Date.now()) {
      const point = { center: { x: field.x, y: field.y } };
      for (const token of canvas.tokens?.placeables ?? []) {
        if (!token.actor || token.document.disposition === source?.document.disposition || necromancerDistance(point, token) > 6 || token.actor.getFlag(MODULE_ID, "deadFieldRound") === roundKey()) continue;
        await token.actor.setFlag(MODULE_ID, "deadFieldRound", roundKey());
        const damage = await roll(actor, "2d8", "Domínio do Campo Morto");
        await applyNecromancerDamage(token.actor, (await save(token.actor, "con")) >= necromancerDC(actor) ? Math.floor(damage / 2) : damage);
        await effect(token.actor, `dead-field-no-heal:${actor.id}`, "Campo Morto — sem cura", { rounds: 1, extra: { noHealing: true } });
      }
    }
    for (const token of canvas.tokens?.placeables ?? []) {
      if (!token.actor) continue;
      const controlled = token.actor.getFlag(MODULE_ID, "masterUuid") === actor.uuid && token.actor.getFlag(MODULE_ID, "necromancerServant");
      const protectedTarget = token.actor.effects.some(value => String(value.getFlag(MODULE_ID, "necromancerEffect") ?? "").startsWith(`protective-tomb:${actor.id}`));
      const inPresence = source && effectActive(actor, "death-presence") && necromancerDistance(source, token) <= (effectActive(actor, "death-avatar") ? 12 : 6);
      const inField = field?.sceneId === canvas.scene?.id && field.expires > Date.now() && necromancerDistance({ center: { x: field.x, y: field.y } }, token) <= 6;
      const bonus = (controlled && inPresence ? 1 : 0) + (controlled && inField ? 2 : 0) + (protectedTarget && inPresence && hasNecromancerFeature(actor, "sepulchral-fortress") ? 1 : 0);
      const aura = token.actor.effects.find(value => value.getFlag(MODULE_ID, "necromancerEffect") === `necromancer-aura:${actor.id}`);
      if (bonus > 0) {
        const changes = [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(bonus), priority: 20 }];
        if (protectedTarget && inPresence && hasNecromancerFeature(actor, "sepulchral-fortress")) changes.push({ key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "necrotic", priority: 20 });
        await effect(token.actor, `necromancer-aura:${actor.id}`, "Proteção do Campo Morto", { rounds: 1, changes });
      } else if (aura) await aura.delete({ novaEraNecromancer: true });
    }
  }
}

async function protectFromZero(actor, changed, options = {}) {
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next === undefined || Number(next) > 0 || Number(actor.system.attributes.hp.value ?? 0) <= 0) return;
  if (isNovaEraNecromancer(actor) && responsible(actor)) {
    const lich = actor.effects.find(value => value.getFlag(MODULE_ID, "necromancerEffect") === "partial-lich");
    const avatar = effectActive(actor, "death-avatar");
    if (lich && !lich.getFlag(MODULE_ID, "refusalUsed")) {
      foundry.utils.setProperty(changed, "system.attributes.hp.value", avatar ? Math.max(1, necromancerLevel(actor) + int(actor)) : 1);
      void lich.setFlag(MODULE_ID, "refusalUsed", true);
      void post(actor, "Recusa da Morte", "“Ainda não.” A forma sustenta o corpo acima do abismo.");
      setTimeout(async () => {
        const source = activeNecromancerToken(actor); if (!source) return;
        const damage = await roll(actor, "3d8", "Recusa da Morte — explosão necrótica");
        for (const token of canvas.tokens?.placeables ?? []) {
          if (!token.actor || token.document.disposition === source.document.disposition || necromancerDistance(source, token) > 3) continue;
          const failed = await save(token.actor, "con") < necromancerDC(actor);
          await applyNecromancerDamage(token.actor, failed ? damage : Math.floor(damage / 2));
        }
      }, 0);
      return;
    }
  }
  const tomb = actor.effects.find(value => String(value.getFlag(MODULE_ID, "necromancerEffect") ?? "").startsWith("protective-tomb:"));
  const master = tomb ? fromUuidSync(tomb.getFlag(MODULE_ID, "sourceUuid")) : null;
  if (master && responsible(master) && hasNecromancerFeature(master, "tomb-pact") && !actor.getFlag(MODULE_ID, `tombPactUsed:${master.id}`) && cadavericState(master).points >= 2) {
    foundry.utils.setProperty(changed, "system.attributes.hp.value", 1);
    void spendCadavericEssence(master, 2, "Pacto do Túmulo"); void actor.setFlag(MODULE_ID, `tombPactUsed:${master.id}`, true);
    if (actor.getFlag(MODULE_ID, "necromancerServant")) void (async () => applyNecromancerHealing(actor, await roll(master, `2d8 + ${int(master)}`, "Pacto do Túmulo")))();
  }
}

function stopHealing(actor, changed, options = {}) {
  if (options.novaEraNecromancer) return;
  const current = Number(actor.system.attributes.hp.value ?? 0), next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next !== undefined && Number(next) > current && actor.effects.some(effect => effect.getFlag(MODULE_ID, "noHealing"))) foundry.utils.setProperty(changed, "system.attributes.hp.value", current);
}

function servantDamageReduction(actor, amount, updates) {
  if (amount <= 0 || !actor) return;
  const tomb = actor.effects.find(value => String(value.getFlag(MODULE_ID, "necromancerEffect") ?? "").startsWith("protective-tomb:"));
  const master = actor.getFlag(MODULE_ID, "necromancerServant") ? fromUuidSync(actor.getFlag(MODULE_ID, "masterUuid")) : tomb ? fromUuidSync(tomb.getFlag(MODULE_ID, "sourceUuid")) : null;
  if (!master || !responsible(master)) return;
  const hpPath = "system.attributes.hp.value";
  if (actor.getFlag(MODULE_ID, "servantType") === "zombie" && actor.getFlag(MODULE_ID, "deadFleshRound") !== roundKey()) {
    const reduction = Math.min(Number(amount), prof(master));
    if (Number.isFinite(Number(updates[hpPath]))) updates[hpPath] = Math.min(Number(actor.system.attributes.hp.max), Number(updates[hpPath]) + reduction);
    setTimeout(() => void actor.setFlag(MODULE_ID, "deadFleshRound", roundKey()), 0);
    ui.notifications.info(`Nova Era: Carne Morta reduziu ${reduction} de dano em ${actor.name}.`);
  }
  if (!tomb || cadavericState(master).points < 1) return;
  setTimeout(async () => {
    if (!await confirm("Ossos Guardiões", `Gastar 1 EC para reduzir o dano sofrido por ${actor.name}?`)) return;
    if (!await spendCadavericEssence(master, 1, "Ossos Guardiões")) return;
    const dice = effectActive(master, "eternal-sentinel") ? "2d8" : "1d8";
    await applyNecromancerHealing(actor, await roll(master, `${dice} + ${int(master)}`, "Ossos Guardiões"));
  }, 0);
}

async function offerServantSurvival(actor, changed, options = {}) {
  if (options.novaEraNecromancerDetonation || !actor?.getFlag(MODULE_ID, "necromancerServant")) return;
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next === undefined || Number(next) > 0 || Number(options.novaEraNecromancerPreviousHp ?? actor.system.attributes.hp.value) <= 0) return;
  const master = await fromUuid(actor.getFlag(MODULE_ID, "masterUuid"));
  if (!master || !responsible(master) || !hasNecromancerFeature(master, "necromancer-death-bond")) return;
  const option = await choose("Vínculo com a Morte", `${actor.name} cairia a 0 PV. Usar sua Reação?`, [["none","Não usar"],["share","Partilhar a Dor"],["refuse","Recusar a Perda (2 EC)"]]);
  if (!option || option === "none") return;
  if (option === "refuse" && !await spendCadavericEssence(master, 2, "Recusar a Perda")) return;
  await actor.update({ "system.attributes.hp.value": 1 }, { novaEraNecromancer: true });
  if (option === "share") await applyNecromancerDamage(master, Math.ceil(Number(options.novaEraNecromancerPreviousHp ?? 1) / 2), { ignoreTemp: true });
  await post(master, "Vínculo com a Morte", `${actor.name} recusou a destruição e permaneceu com 1 PV.`);
}

async function synchronizePassives(actor) {
  if (!isNovaEraNecromancer(actor) || !responsible(actor)) return;
  const permanent = actor.effects.find(value => value.getFlag(MODULE_ID, "necromancerEffect") === "profane-transcendence");
  if (hasNecromancerFeature(actor, "necromancer-profane-transcendence") && !permanent) await effect(actor, "profane-transcendence", "Transcendência Profana", { rounds: 999999, changes: [
    { key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "necrotic", priority: 20 },
    { key: "system.traits.ci.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "frightened", priority: 20 },
    { key: "system.attributes.senses.truesight", mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE, value: "18", priority: 20 }
  ] });
  const unstable = actor.effects.find(value => value.getFlag(MODULE_ID, "necromancerEffect") === "unstable-body");
  const rank = cadavericState(actor).instability;
  if (hasNecromancerFeature(actor, "necromancer-unstable-body") && rank > 0) {
    await effect(actor, "unstable-body", `Corpo Instável ${["0","I","II","III"][rank]}`, { rounds: 999, changes: [{ key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "necrotic", priority: 20 }], extra: { rank } });
  } else if (unstable) await necromancerDocumentAction(actor, "clear-effect", { key: "unstable-body" });
}

async function synchronizeServant(servant) {
  if (!servant?.getFlag(MODULE_ID, "necromancerServant") || servant.items.some(item => item.getFlag(MODULE_ID, "necromancerServantAttack"))) return;
  const master = await fromUuid(servant.getFlag(MODULE_ID, "masterUuid"));
  if (!master || !responsible(master)) return;
  const horde = servant.getFlag(MODULE_ID, "necromancerHorde"), perfect = servant.getFlag(MODULE_ID, "necromancerPerfectCorpse"), skeleton = servant.getFlag(MODULE_ID, "servantType") === "skeleton";
  await servant.createEmbeddedDocuments("Item", [{
    name: horde ? "Maré Cadavérica" : perfect ? "Ataques do Cadáver Perfeito" : skeleton ? "Lâmina Óssea" : "Golpe Cadavérico",
    type: horde ? "feat" : "weapon", img: servant.img ?? ICON,
    system: horde ? { activation: { type: "action", cost: 1 } } : { equipped: true, proficient: 0, weaponType: "natural", activation: { type: "action", cost: 1 }, actionType: "mwak", ability: "", attackBonus: String(prof(master) + int(master)), damage: { parts: [[`1d6 + ${prof(master)}`, skeleton ? "piercing" : "bludgeoning"]] } },
    flags: { [MODULE_ID]: { necromancerServantAttack: true, necromancerHordeAttack: horde, masterUuid: master.uuid } }
  }]);
}

async function rest(actor, result, config = {}) {
  if (!isNovaEraNecromancer(actor) || !responsible(actor)) return;
  const long = result?.longRest === true || result?.type === "long" || config?.type === "long";
  const short = long || result?.shortRest === true || result?.type === "short" || config?.type === "short";
  if (short) await actor.unsetFlag(MODULE_ID, "bloodPactUsed");
  if (!long) return;
  for (const key of ["partialLichUsed","deathAvatarUsed","infiniteArmyUsed","profaneFeastUsed","eternalSentinelUsed","deadField","boneFortress","avatarExecutions"]) await actor.unsetFlag(MODULE_ID, key);
  for (const target of game.actors) if (target.getFlag(MODULE_ID, `tombPactUsed:${actor.id}`)) await target.unsetFlag(MODULE_ID, `tombPactUsed:${actor.id}`);
  const champion = game.actors.find(entry => entry.getFlag(MODULE_ID, "necromancerPerfectCorpse") && entry.getFlag(MODULE_ID, "masterUuid") === actor.uuid && Number(entry.system.attributes.hp.value ?? 0) <= 0);
  if (champion && cadavericState(actor).points >= 5 && await confirm("Reconstruir Cadáver Perfeito", `Gastar 5 EC para reconstruir ${champion.name} com PV total?`)) { await spendCadavericEssence(actor, 5, "Reconstrução Perfeita"); await champion.update({ "system.attributes.hp.value": champion.system.attributes.hp.max }); }
}

function addItemActivation(app, html) {
  const item = app.item ?? app.document;
  const servantAttack = item?.getFlag?.(MODULE_ID, "necromancerServantAttack");
  if ((!ACTIVE_KEYS.has(keyOf(item)) && !servantAttack) || !item?.actor?.isOwner) return;
  const root = html instanceof HTMLElement ? html : html?.[0]; if (!root || root.querySelector(".ne-necromancer-activate")) return;
  const button = document.createElement("button"); button.type = "button"; button.className = "ne-necromancer-activate"; button.innerHTML = '<i class="fa-solid fa-skull"></i> Ativar automação Nova Era';
  button.addEventListener("click", event => { event.preventDefault(); void (servantAttack ? useServantAttack(item.actor) : activateNecromancerFeature(item.actor, item)); }); root.querySelector("form")?.append(button);
}
function addSheetActivations(app, html) {
  const actor = app.actor ?? app.document, root = html instanceof HTMLElement ? html : html?.[0];
  const servant = actor?.getFlag?.(MODULE_ID, "necromancerServant");
  if ((!isNovaEraNecromancer(actor) && !servant) || !actor.isOwner || !root || root.dataset.novaEraNecromancerActivation) return;
  root.dataset.novaEraNecromancerActivation = "true";
  root.addEventListener("click", event => {
    const row = event.target.closest?.("[data-item-id]"); const item = row ? actor.items.get(row.dataset.itemId) : null;
    const servantAttack = item?.getFlag?.(MODULE_ID, "necromancerServantAttack");
    if ((!ACTIVE_KEYS.has(keyOf(item)) && !servantAttack) || !event.target.closest?.(".item-image[data-action='use']")) return;
    event.preventDefault(); event.stopImmediatePropagation(); void (servantAttack ? useServantAttack(actor) : activateNecromancerFeature(actor, item));
  }, true);
}

export function registerNecromancerAdvancedAutomation() {
  game.socket.on(`module.${MODULE_ID}`, async payload => {
    if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== ADV_SOCKET) return;
    const actor = await fromUuid(payload.actorUuid); if (!actor) return;
    if (payload.action === "create-perfect") { const corpseDocument = await fromUuid(payload.corpseUuid); if (corpseDocument?.object) await finishPerfectCorpse(actor, corpseDocument.object, payload.ownerId); }
    if (payload.action === "create-horde") await finishHorde(actor, payload);
  });
  Hooks.on("novaEraNecromancerNecroticDamage", data => void extraction(data));
  Hooks.on("novaEraNecromancerDeathHarvested", data => void harvested(data));
  Hooks.on("midi-qol.DamageRollComplete", workflow => void midiNecroticDamage(workflow));
  Hooks.on("preUpdateActor", (actor, changed, options) => { stopHealing(actor, changed, options); void protectFromZero(actor, changed, options); });
  Hooks.on("updateActor", (actor, changed, options) => void offerServantSurvival(actor, changed, options));
  Hooks.on("dnd5e.preApplyDamage", servantDamageReduction);
  Hooks.on("updateCombat", (combat, changed) => void processAuras(combat, changed));
  Hooks.on("updateToken", () => void processAuras(null, {}));
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void rest(actor, result, config));
  for (const hook of ["renderItemSheet", "renderItemSheet5e", "renderItemSheetV2"]) Hooks.on(hook, addItemActivation);
  for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderActorSheet5eCharacter", "renderActorSheet5eCharacter2"]) Hooks.on(hook, addSheetActivations);
  Hooks.on("novaEraNecromancerChanged", ({ actor }) => void synchronizePassives(actor));
  Hooks.on("createItem", item => { if (isNovaEraNecromancer(item.parent)) void synchronizePassives(item.parent); });
  Hooks.on("deleteItem", item => { if (isNovaEraNecromancer(item.parent)) void synchronizePassives(item.parent); });
  for (const actor of game.actors.filter(isNovaEraNecromancer)) setTimeout(() => void synchronizePassives(actor), 250);
  for (const actor of game.actors.filter(candidate => candidate.getFlag(MODULE_ID, "necromancerServant"))) setTimeout(() => void synchronizeServant(actor), 350);
}
