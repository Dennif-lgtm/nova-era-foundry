import { MODULE_ID } from "../constants.mjs";
import {
  bloodState,
  isNovaEraBerserker,
  payBloodTechnique,
  postBloodTechnique,
  setBloodTechniqueExecutor,
  spendBlood
} from "./core-automation.mjs";

const SOCKET_TYPE = "berserkerTechnique";
const ICON = `modules/${MODULE_ID}/assets/icons/berserker/coracao-com-sangue-v1.png`;

function key(item) { return item?.getFlag(MODULE_ID, "contentKey") ?? ""; }
function known(actor, contentKey) { return actor.items.find(item => key(item) === contentKey); }
function firstRoll(value) { return Array.isArray(value) ? value[0] : value?.[0] ?? value; }
function roundKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}` : `free:${Math.floor(Date.now() / 6000)}`; }
function turnKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `free:${Math.floor(Date.now() / 6000)}`; }
function proficiency(actor) { return Number(actor.system.attributes?.prof ?? 2); }
function constitution(actor) { return Number(actor.system.abilities?.con?.mod ?? 0); }
function bloodDC(actor) { return 8 + proficiency(actor) + constitution(actor); }
function responsible(actor) {
  const owners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return owners[0]?.id === game.user.id || (!owners.length && game.user.isGM && game.users.activeGM?.id === game.user.id);
}
function selectedTarget() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0].actor : null;
}

function isMeleeActivity(activity) {
  const type = activity?.attack?.type?.value ?? activity?.attack?.type ?? activity?.item?.system?.actionType;
  return type === "melee" || type === "mwak" || type === "msak";
}

async function executeDocument(uuid, action, data = {}) {
  const document = await fromUuid(uuid);
  if (!document) return false;
  if (action === "create-effect") {
    const old = document.effects.find(effect => effect.getFlag(MODULE_ID, "berserkerEffect") === data.effect.flags?.[MODULE_ID]?.berserkerEffect);
    if (old) await old.delete({ novaEraBerserker: true });
    await document.createEmbeddedDocuments("ActiveEffect", [data.effect], { novaEraBerserker: true });
  }
  if (action === "delete-effect") await document.delete({ novaEraBerserker: true });
  if (action === "update-actor") await document.update(data.change, { novaEraTechnique: true, ...(data.options ?? {}) });
  if (action === "move-token") await document.update(data.change, { novaEraTechnique: true });
  return true;
}

async function documentAction(document, action, data = {}) {
  if (game.user.isGM || document.isOwner) return executeDocument(document.uuid, action, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPE, uuid: document.uuid, action, data });
  return true;
}

async function createEffect(actor, effectKey, name, { changes = [], flags = {}, duration = {} } = {}) {
  return documentAction(actor, "create-effect", { effect: {
    name, img: ICON, origin: actor.uuid, disabled: false,
    duration: { startTime: game.time.worldTime, ...(game.combat ? { startRound: game.combat.round, startTurn: game.combat.turn } : {}), ...duration },
    changes,
    flags: { [MODULE_ID]: { berserkerEffect: effectKey, createdTurn: turnKey(), ...flags } }
  }});
}

async function deleteEffect(effect) { if (effect) await documentAction(effect, "delete-effect"); }

async function post(actor, title, text) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era berserker-chat"><h2>${title}</h2><p>${text}</p></section>` });
}

async function confirm(title, content) {
  return Dialog.confirm({ title, content: `<section class="nova-era ne-trigger-dialog"><div><strong>${title}</strong><p>${content}</p></div></section>`, yes: () => true, no: () => false, defaultYes: false });
}

async function rollSave(target, abilities, dc, label) {
  const ability = abilities.sort((left, right) => Number(target.system.abilities?.[right]?.save ?? 0) - Number(target.system.abilities?.[left]?.save ?? 0))[0];
  const roll = firstRoll(await target.rollSavingThrow({ ability }));
  const success = Number(roll?.total ?? 0) >= dc;
  await post(target, label, `${target.name} realizou salvaguarda de ${ability.toUpperCase()} contra CD ${dc}: <strong>${success ? "sucesso" : "falha"}</strong>.`);
  return success;
}

async function applyInvestida(actor, item) {
  const payment = await payBloodTechnique(actor, item);
  if (!payment) return false;
  await createEffect(actor, "investida-carniceira", "Investida Carniceira", {
    changes: [
      { key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "3", priority: 20 },
      { key: "system.bonuses.mwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 },
      { key: "system.bonuses.msak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 }
    ], flags: { consumeOnMeleeAttack: true, expiresAtTurnStart: actor.uuid }
  });
  await postBloodTechnique(actor, item, payment, "<p><strong>+3 m de movimento e +2 no próximo ataque corpo a corpo preparados.</strong></p>");
  return true;
}

async function applyLamina(actor, item) {
  const type = await Dialog.prompt({
    title: "Lâmina Hemática",
    content: `<form><div class="form-group"><label>Tipo de dano</label><select name="type"><option value="slashing">Cortante</option><option value="piercing">Perfurante</option><option value="necrotic">Necrótico</option></select></div></form>`,
    label: "Manifestar",
    callback: html => String(html.find("[name='type']").val()), rejectClose: false
  });
  if (!type) return false;
  const payment = await payBloodTechnique(actor, item);
  if (!payment) return false;
  await createEffect(actor, "lamina-hematica", "Lâmina Hemática", { duration: { seconds: 60 }, flags: { damageType: type } });
  await postBloodTechnique(actor, item, payment, `<p><strong>Lâmina ativa por 1 minuto — dano ${type}.</strong></p>`);
  return true;
}

function tokenFor(actor) { return actor.getActiveTokens(true, true)?.[0] ?? actor.getActiveTokens()?.[0] ?? null; }
async function pullToward(sourceActor, targetActor, metres = 3) {
  const source = tokenFor(sourceActor);
  const target = tokenFor(targetActor);
  if (!source || !target || !canvas?.scene) return false;
  const gridSize = Number(canvas.scene.grid.size ?? 100);
  const gridDistance = Number(canvas.scene.grid.distance ?? 1.5);
  const sx = source.center.x, sy = source.center.y, tx = target.center.x, ty = target.center.y;
  const dx = sx - tx, dy = sy - ty, distance = Math.hypot(dx, dy);
  if (!distance) return false;
  const pixels = Math.min(distance - gridSize, metres / gridDistance * gridSize);
  if (pixels <= 0) return true;
  const x = target.document.x + dx / distance * pixels;
  const y = target.document.y + dy / distance * pixels;
  await documentAction(target.document, "move-token", { change: { x, y } });
  return true;
}

async function applyPuxao(actor, item) {
  const target = selectedTarget();
  if (!target) { ui.notifications.warn("Nova Era: selecione exatamente um alvo para Puxão Escarlate."); return false; }
  const payment = await payBloodTechnique(actor, item);
  if (!payment) return false;
  const success = await rollSave(target, ["str"], bloodDC(actor), item.name);
  if (!success) {
    const moved = await pullToward(actor, target, 3);
    await createEffect(actor, "puxao-ataque-imediato", "Puxão Escarlate — Ataque imediato", {
      flags: { suppressBloodTechniques: true, consumeOnMeleeAttack: true, expiresAtTurnStart: actor.uuid }
    });
    await post(actor, item.name, moved ? `${target.name} foi puxado até 3 m. O próximo ataque corpo a corpo é o ataque imediato e não aceita Golpe Brutal ou outra Técnica.` : `${target.name} falhou. Mova-o até 3 m em direção ao Berserker; o próximo ataque corpo a corpo permitido não aceita Golpe Brutal ou outra Técnica.`);
  }
  await postBloodTechnique(actor, item, payment);
  return true;
}

async function applyHitTechnique(actor, item, target) {
  const payment = await payBloodTechnique(actor, item);
  if (!payment) return false;
  if (key(item) === "berserker-tecnica-quebra-ossos") {
    const success = await rollSave(target, ["str", "con"], bloodDC(actor), item.name);
    if (!success) {
      const existing = target.effects.find(effect => effect.getFlag(MODULE_ID, "berserkerEffect") === "quebra-ossos");
      if (existing) await documentAction(target, "create-effect", { effect: { name: "Caído — Quebra-Ossos", img: ICON, statuses: ["prone"], disabled: false, duration: { rounds: 1, startRound: game.combat?.round, startTurn: game.combat?.turn }, changes: [], flags: { [MODULE_ID]: { berserkerEffect: "quebra-ossos-prone", expiresAtTurnStart: actor.uuid } } } });
      await createEffect(target, "quebra-ossos", "Quebra-Ossos — Deslocamento reduzido", { changes: [
        { key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.5", priority: 20 },
        { key: "system.attributes.movement.fly", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.5", priority: 20 },
        { key: "system.attributes.movement.swim", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.5", priority: 20 }
      ], flags: { expiresAtTurnStart: actor.uuid } });
    }
  } else {
    await createEffect(target, `marca-rubra-${actor.id}`, `Marca Rubra — ${actor.name}`, { flags: { sourceActorUuid: actor.uuid, expiresAtTurnStart: actor.uuid }, duration: { rounds: 1 } });
  }
  await postBloodTechnique(actor, item, payment);
  return true;
}

async function applyDamageReaction(actor, item, damage, previousHp) {
  const state = bloodState(actor);
  const cost = Number(item.getFlag(MODULE_ID, "bloodCost") ?? 0);
  const sacrifice = !!item.getFlag(MODULE_ID, "sacrifice");
  const hpCost = sacrifice ? cost * proficiency(actor) : 0;
  if (sacrifice && Number(previousHp) - hpCost < 1) {
    ui.notifications.warn(`Nova Era: o Sacrifício exige ${hpCost} PV e não poderia reduzir ${actor.name} abaixo de 1 PV antes do dano.`);
    return false;
  }
  if (!await spendBlood(actor, cost, { reason: item.name })) return false;
  const payment = { cost, sacrifice, hpCost };
  const formula = key(item) === "berserker-tecnica-carne" ? "1d10 + @abilities.con.mod" : String(proficiency(actor) + constitution(actor));
  const roll = await new Roll(formula, actor.getRollData()).evaluate();
  const reduction = Math.min(damage, Math.max(0, Number(roll.total)));
  const hp = Number(actor.system.attributes.hp.value ?? 0);
  const maximum = Number(actor.system.attributes.hp.max ?? hp);
  await documentAction(actor, "update-actor", {
    change: { "system.attributes.hp.value": Math.max(0, Math.min(maximum, hp + reduction - hpCost)) },
    options: { novaEraSacrifice: true }
  });
  if (key(item) === "berserker-tecnica-carne") {
    const target = selectedTarget();
    if (target) await createEffect(actor, "carne-pela-carne", "Carne pela Carne — Contra-ataque", { flags: { retaliationTargetUuid: target.uuid, expiresAtTurnStart: actor.uuid } });
  }
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${item.name} — redução de dano` });
  await postBloodTechnique(actor, item, payment, `<p><strong>${reduction} de dano foram anulados mecanicamente${hpCost ? `; ${hpCost} PV de Sacrifício foram pagos separadamente` : ""}.</strong></p>`);
  await actor.setFlag(MODULE_ID, "berserkerReactionRound", roundKey());
  return true;
}

async function applyRecusar(actor, item) {
  const payment = await payBloodTechnique(actor, item);
  if (!payment) return false;
  await documentAction(actor, "update-actor", { change: { "system.attributes.hp.value": 1 } });
  await actor.setFlag(MODULE_ID, "recusarQuedaUsed", true);
  await createEffect(actor, "recusar-queda", "Recusar a Queda", {
    flags: { advantageFirstMelee: true, expiresAtTurnStart: actor.uuid }
  });
  await postBloodTechnique(actor, item, payment, "<p><strong>Permanece com 1 PV e prepara vantagem no primeiro ataque corpo a corpo.</strong></p>");
  return true;
}

async function executeTechnique(actor, item, context = {}) {
  const contentKey = key(item);
  if (["berserker-tecnica-quebra-ossos", "berserker-tecnica-marca"].includes(contentKey) && actor.effects.some(effect => effect.getFlag(MODULE_ID, "suppressBloodTechniques"))) {
    ui.notifications.warn("Nova Era: este ataque não permite Golpe Brutal nem outra Técnica de Sangue.");
    return false;
  }
  if (contentKey === "berserker-tecnica-investida") return applyInvestida(actor, item);
  if (contentKey === "berserker-tecnica-lamina") return applyLamina(actor, item);
  if (contentKey === "berserker-tecnica-puxao") return applyPuxao(actor, item);
  if (["berserker-tecnica-quebra-ossos", "berserker-tecnica-marca"].includes(contentKey)) {
    if (!context.target) { ui.notifications.info(`Nova Era: ${item.name} será oferecida automaticamente após um acerto corpo a corpo.`); return false; }
    return applyHitTechnique(actor, item, context.target);
  }
  if (["berserker-tecnica-carne", "berserker-tecnica-coagulado"].includes(contentKey)) {
    if (!context.damage) { ui.notifications.info(`Nova Era: ${item.name} será oferecida automaticamente quando o Berserker sofrer dano.`); return false; }
    return applyDamageReaction(actor, item, context.damage, context.previousHp);
  }
  if (contentKey === "berserker-tecnica-recusar") {
    if (!context.fallen) { ui.notifications.info("Nova Era: Recusar a Queda será oferecida automaticamente ao chegar a 0 PV."); return false; }
    return applyRecusar(actor, item);
  }
  const payment = await payBloodTechnique(actor, item);
  if (!payment) return false;
  await postBloodTechnique(actor, item, payment);
  return true;
}

async function onMeleeHit({ actor, target, suppressTechniques = false }) {
  if (!responsible(actor) || !target) return;
  const lamina = actor.effects.find(effect => effect.getFlag(MODULE_ID, "berserkerEffect") === "lamina-hematica");
  if (lamina && actor.getFlag(MODULE_ID, "laminaHematicaTurn") !== turnKey()) {
    await actor.setFlag(MODULE_ID, "laminaHematicaTurn", turnKey());
    const level = Number(actor.items.find(item => item.type === "class" && item.system.identifier === "berserker-nova-era")?.system.levels ?? 1);
    const die = level >= 17 ? 10 : level >= 9 ? 8 : 6;
    const type = lamina.getFlag(MODULE_ID, "damageType") ?? "necrotic";
    const roll = await new Roll(`1d${die}`).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Lâmina Hemática — dano ${type}` });
  }
  const retaliation = actor.effects.find(effect => effect.getFlag(MODULE_ID, "retaliationTargetUuid") === target.uuid);
  if (retaliation) {
    await createEffect(target, `sem-reacoes-${actor.id}`, "Carne pela Carne — Sem Reações", { flags: { noReactions: true, expiresAtTurnStart: target.uuid }, duration: { rounds: 1 } });
    await deleteEffect(retaliation);
  }
  if (suppressTechniques) return;
  const options = [known(actor, "berserker-tecnica-quebra-ossos"), known(actor, "berserker-tecnica-marca")].filter(item => item && Number(item.getFlag(MODULE_ID, "bloodCost")) <= bloodState(actor).points);
  if (!options.length) return;
  const selected = await Dialog.prompt({
    title: "Técnica ao acertar",
    content: `<form><div class="form-group"><label>Usar uma Técnica neste acerto?</label><select name="item"><option value="">Não usar</option>${options.map(item => `<option value="${item.id}">${item.name} — ${item.getFlag(MODULE_ID, "bloodCost")} PS</option>`).join("")}</select></div></form>`,
    label: "Confirmar", callback: html => String(html.find("[name='item']").val()), rejectClose: false
  });
  if (selected) await executeTechnique(actor, actor.items.get(selected), { target });
}

async function onDamaged({ actor, damage, nextHp, previousHp }) {
  if (!responsible(actor) || damage <= 0) return;
  if (actor.getFlag(MODULE_ID, "berserkerReactionRound") !== roundKey()) {
    const carne = selectedTarget() ? known(actor, "berserker-tecnica-carne") : null;
    const coagulado = known(actor, "berserker-tecnica-coagulado");
    const reactions = [carne, coagulado].filter(item => item && Number(item.getFlag(MODULE_ID, "bloodCost")) <= bloodState(actor).points);
    if (reactions.length) {
      const choice = await Dialog.prompt({
        title: "Reação de Sangue",
        content: `<form><div class="form-group"><label>Tipo dos ${damage} de dano</label><select name="damageType"><option value="physical">Cortante, Perfurante ou Concussão</option><option value="psychic">Psíquico</option><option value="other">Outro tipo</option></select></div><div class="form-group"><label>Usar uma Reação?</label><select name="item"><option value="">Não usar</option>${reactions.map(item => `<option value="${item.id}">${item.name}</option>`).join("")}</select></div></form>`,
        label: "Confirmar",
        callback: html => ({ itemId: String(html.find("[name='item']").val()), damageType: String(html.find("[name='damageType']").val()) }),
        rejectClose: false
      });
      if (choice?.itemId) {
        const item = actor.items.get(choice.itemId);
        if (key(item) === "berserker-tecnica-coagulado" && (choice.damageType === "psychic" || (!bloodState(actor).frenzy && choice.damageType !== "physical"))) {
          ui.notifications.warn("Nova Era: Sangue Coagulado só aceita dano físico; em Frenesi aceita qualquer dano exceto Psíquico.");
        } else await executeTechnique(actor, item, { damage, previousHp, damageType: choice.damageType });
      }
    }
  }
  const recusar = known(actor, "berserker-tecnica-recusar");
  if (Number(actor.system.attributes.hp.value ?? nextHp) <= 0 && recusar && !actor.getFlag(MODULE_ID, "recusarQuedaUsed") && bloodState(actor).points >= 3) {
    if (await confirm("Recusar a Queda", "Gastar 3 PS para permanecer com 1 PV?")) await executeTechnique(actor, recusar, { fallen: true });
  }
  if (Number(actor.system.attributes.hp.value ?? 0) <= 0) {
    const lamina = actor.effects.find(effect => effect.getFlag(MODULE_ID, "berserkerEffect") === "lamina-hematica");
    if (lamina) await deleteEffect(lamina);
  }
}

function prepareMeleeAttack(config) {
  const activity = config?.subject ?? config?.activity;
  const actor = activity?.actor ?? config?.actor;
  if (!actor || !isMeleeActivity(activity)) return;
  if (actor.effects.some(effect => effect.getFlag(MODULE_ID, "advantageFirstMelee"))) config.advantage = true;
}

async function finishMeleeAttack(rolls, { subject } = {}) {
  if (!isMeleeActivity(subject)) return;
  const actor = subject?.actor;
  if (!actor || !responsible(actor)) return;
  const consumed = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "consumeOnMeleeAttack") || effect.getFlag(MODULE_ID, "advantageFirstMelee"));
  for (const effect of consumed) await deleteEffect(effect);
}

function rememberMovement(token, changed, options) {
  if (options?.novaEraTechnique || (changed.x === undefined && changed.y === undefined)) return;
  options.novaEraBerserkerOrigin = { x: Number(token.x), y: Number(token.y) };
}

async function offerInvestida(token, changed, options = {}) {
  const actor = token.actor;
  if (!actor || !isNovaEraBerserker(actor) || !responsible(actor) || !options.novaEraBerserkerOrigin) return;
  const item = known(actor, "berserker-tecnica-investida");
  if (!item || bloodState(actor).points < Number(item.getFlag(MODULE_ID, "bloodCost")) || actor.effects.some(effect => effect.getFlag(MODULE_ID, "consumeOnMeleeAttack"))) return;
  const targetActor = selectedTarget();
  const target = targetActor ? tokenFor(targetActor) : null;
  if (!target || Number(target.document.disposition) === Number(token.disposition)) return;
  const grid = Number(canvas.scene?.grid?.size ?? 100);
  const units = Number(canvas.scene?.grid?.distance ?? 1.5);
  const origin = options.novaEraBerserkerOrigin;
  const destination = { x: Number(token.x), y: Number(token.y) };
  const travelled = Math.hypot(destination.x - origin.x, destination.y - origin.y) / grid * units;
  const targetCenter = target.center;
  const half = grid * Number(token.width ?? 1) / 2;
  const before = Math.hypot(origin.x + half - targetCenter.x, origin.y + half - targetCenter.y);
  const after = Math.hypot(destination.x + half - targetCenter.x, destination.y + half - targetCenter.y);
  if (travelled < 3 || after >= before) return;
  if (await confirm("Investida Carniceira", `Você se moveu ${travelled.toFixed(1)} m em direção a ${targetActor.name}. Gastar 1 PS para ativar a Investida?`)) await executeTechnique(actor, item, { movement: travelled, target: targetActor });
}

async function cleanTurnEffects(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const active = combat.combatant?.actor;
  if (!active) return;
  for (const actor of game.actors.filter(responsible)) {
    for (const effect of actor.effects.filter(effect => effect.getFlag(MODULE_ID, "expiresAtTurnStart") === active.uuid && effect.getFlag(MODULE_ID, "createdTurn") !== turnKey())) await deleteEffect(effect);
  }
}

function blockReaction(activity) {
  const actor = activity?.actor;
  if (!actor?.effects?.some(effect => effect.getFlag(MODULE_ID, "noReactions"))) return;
  if (activity.activation?.type !== "reaction") return;
  ui.notifications.warn("Nova Era: esta criatura não pode realizar Reações.");
  return false;
}

async function resetLongRest(actor, result, config = {}) {
  const longRest = config.type === "long" || result?.type === "long" || result?.longRest === true;
  if (longRest && isNovaEraBerserker(actor) && actor.isOwner) await actor.unsetFlag(MODULE_ID, "recusarQuedaUsed");
}

async function socket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== SOCKET_TYPE) return;
  await executeDocument(payload.uuid, payload.action, payload.data);
}

export function registerBerserkerTechniqueAutomation() {
  setBloodTechniqueExecutor(executeTechnique);
  Hooks.on("novaEraBerserkerMeleeHit", data => void onMeleeHit(data));
  Hooks.on("novaEraBerserkerDamaged", data => void onDamaged(data));
  Hooks.on("dnd5e.preRollAttack", config => prepareMeleeAttack(config));
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => void finishMeleeAttack(rolls, data));
  Hooks.on("preUpdateToken", (token, changed, options) => rememberMovement(token, changed, options));
  Hooks.on("updateToken", (token, changed, options) => void offerInvestida(token, changed, options));
  Hooks.on("updateCombat", (combat, changed) => void cleanTurnEffects(combat, changed));
  Hooks.on("dnd5e.preUseActivity", activity => blockReaction(activity));
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void resetLongRest(actor, result, config));
  game.socket.on(`module.${MODULE_ID}`, payload => void socket(payload));
}
