import { MODULE_ID } from "../constants.mjs";
import {
  bloodState,
  isNovaEraBerserker,
  payBloodTechnique,
  postBloodTechnique,
  setBloodTechniqueExecutor,
  spendBlood
} from "./core-automation.mjs";
import { advancedDamageTechniqueItems, advancedHitTechniqueItems, resolveAdvancedBloodTechnique } from "./advanced-technique-automation.mjs";

const SOCKET_TYPE = "berserkerTechnique";
const ICON = `modules/${MODULE_ID}/assets/icons/berserker/coracao-com-sangue-v1.png`;
const movementOrigins = new Map();
const ATTACKER_FLAG = "berserkerLastAttacker";

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

function selectedTargetToken() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0] : null;
}

function invisible(actor) {
  return actor?.effects?.some(effect => effect.statuses?.has?.("invisible") || effect.statuses?.has?.("invisibility")) ?? false;
}

function actorFromUuid(uuid) {
  if (!uuid) return null;
  return game.actors.get(String(uuid).split(".").at(-1)) ?? null;
}

function recentAttacker(actor) {
  const record = actor?.getFlag?.(MODULE_ID, ATTACKER_FLAG);
  if (!record?.actorUuid || Date.now() - Number(record.at ?? 0) > 30_000) return null;
  return actorFromUuid(record.actorUuid);
}

function isMeleeActivity(activity) {
  const item = activity?.item;
  const type = activity?.attack?.type?.value ?? activity?.attack?.type ?? item?.system?.actionType;
  const validTypes = activity?.validAttackTypes instanceof Set ? [...activity.validAttackTypes] : [];
  return ["melee", "mwak", "msak"].includes(type)
    || validTypes.some(entry => ["melee", "mwak", "msak"].includes(entry))
    || ["simpleM", "martialM", "natural"].includes(item?.system?.type?.value)
    || item?.system?.range?.units === "touch";
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
  let roll;
  try {
    roll = firstRoll(await target.rollSavingThrow({ ability }));
  } catch (error) {
    console.debug(`${MODULE_ID} | Salvaguarda nativa indisponível para ${target.name}; usando rolagem direta.`, error);
    roll = await new Roll("1d20 + @save", { save: Number(target.system.abilities?.[ability]?.save ?? 0) }).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: target }), flavor: `${label} — salvaguarda de ${ability.toUpperCase()}` });
  }
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

function tokenFor(actor) {
  // O segundo argumento de getActiveTokens solicita TokenDocuments. As rotinas
  // geométricas abaixo precisam dos Token placeables, que possuem `center` e
  // uma referência `document` para a atualização das coordenadas.
  const token = actor.getActiveTokens(false, false)?.[0] ?? null;
  return token?.center && token?.document ? token : token?.object ?? null;
}
function meleeChoices(actor) {
  const choices = [];
  for (const item of actor.items) {
    for (const activity of item.system?.activities ?? []) {
      if (isMeleeActivity(activity)) choices.push({ item, activity });
    }
  }
  return choices;
}

async function offerImmediateMeleeAttack(actor, target) {
  const choices = meleeChoices(actor);
  if (!choices.length) {
    ui.notifications.warn("Nova Era: nenhuma atividade de ataque corpo a corpo foi encontrada na ficha.");
    return false;
  }
  const selected = await Dialog.prompt({
    title: "Puxão Escarlate — Ataque imediato",
    content: `<form><div class="form-group"><label>Escolha o ataque contra ${target.name}</label><select name="attack">${choices.map(({ item, activity }) => `<option value="${item.id}:${activity.id}">${item.name} — ${activity.name}</option>`).join("")}</select></div><p>Este ataque não permite Golpe Brutal nem outra Técnica de Sangue.</p></form>`,
    label: "Atacar",
    callback: html => String(html.find("[name='attack']").val()),
    rejectClose: false
  });
  if (!selected) return false;
  const [itemId, activityId] = selected.split(":");
  const activity = actor.items.get(itemId)?.system?.activities?.get(activityId);
  if (!activity) return false;
  await activity.use();
  return true;
}

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
    if (!moved) ui.notifications.warn("Nova Era: não foi possível localizar os dois tokens na cena; mova o alvo manualmente até 3 m.");
    await createEffect(actor, "puxao-ataque-imediato", "Puxão Escarlate — Ataque imediato", {
      flags: { suppressBloodTechniques: true, consumeOnMeleeAttack: true, expiresAtTurnStart: actor.uuid }
    });
    await post(actor, item.name, moved ? `${target.name} foi puxado até 3 m. O próximo ataque corpo a corpo é o ataque imediato e não aceita Golpe Brutal ou outra Técnica.` : `${target.name} falhou. Mova-o até 3 m em direção ao Berserker; o próximo ataque corpo a corpo permitido não aceita Golpe Brutal ou outra Técnica.`);
    await postBloodTechnique(actor, item, payment);
    await offerImmediateMeleeAttack(actor, target);
    return true;
  }
  await postBloodTechnique(actor, item, payment);
  return true;
}

async function applyHitTechnique(actor, item, target) {
  const payment = await payBloodTechnique(actor, item);
  if (!payment) return false;
  let extra = "";
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
    await createEffect(target, `marca-rubra-${actor.id}`, `Marca Rubra — ${actor.name}`, {
      flags: { sourceActorUuid: actor.uuid, expiresAtTurnStart: actor.uuid, ignoresInvisibility: true },
      duration: { rounds: 1 }
    });
    await createEffect(actor, "marca-rubra-movimento", `Marca Rubra — perseguindo ${target.name}`, {
      changes: [
        { key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "3", priority: 20 }
      ],
      flags: { markedTargetUuid: target.uuid, towardMarkedTargetOnly: true, expiresAtTurnStart: actor.uuid },
      duration: { rounds: 1 }
    });
    extra = `<p><strong>${target.name}</strong> foi marcado. Você conhece sua direção enquanto estiver a até 18 m, ignora os benefícios da Invisibilidade contra ele e recebe +3 m de deslocamento apenas ao se aproximar.</p>`;
  }
  await postBloodTechnique(actor, item, payment, extra);
  return true;
}

async function applyDamageReaction(actor, item, damage, previousHp, attacker = null) {
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
    const target = attacker ?? recentAttacker(actor) ?? selectedTarget();
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
    return applyDamageReaction(actor, item, context.damage, context.previousHp, context.attacker);
  }
  if (contentKey === "berserker-tecnica-recusar") {
    if (!context.fallen) { ui.notifications.info("Nova Era: Recusar a Queda será oferecida automaticamente ao chegar a 0 PV."); return false; }
    return applyRecusar(actor, item);
  }
  const advanced = await resolveAdvancedBloodTechnique(actor, item, context);
  if (advanced !== null) return advanced;
  const payment = await payBloodTechnique(actor, item);
  if (!payment) return false;
  await postBloodTechnique(actor, item, payment);
  return true;
}

async function onMeleeHit({ actor, target, roll, suppressTechniques = false }) {
  if (!responsible(actor) || !target) return;
  const lamina = actor.effects.find(effect => effect.getFlag(MODULE_ID, "berserkerEffect") === "lamina-hematica");
  if (lamina && !game.modules.get("midi-qol")?.active && actor.getFlag(MODULE_ID, "laminaHematicaTurn") !== turnKey()) {
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
  const options = [known(actor, "berserker-tecnica-quebra-ossos"), known(actor, "berserker-tecnica-marca"), ...advancedHitTechniqueItems(actor)].filter(item => item && Number(item.getFlag(MODULE_ID, "bloodCost")) <= bloodState(actor).points);
  if (!options.length) return;
  const selected = await Dialog.prompt({
    title: "Técnica ao acertar",
    content: `<form><div class="form-group"><label>Usar uma Técnica neste acerto?</label><select name="item"><option value="">Não usar</option>${options.map(item => `<option value="${item.id}">${item.name} — ${item.getFlag(MODULE_ID, "bloodCost")} PS</option>`).join("")}</select></div></form>`,
    label: "Confirmar", callback: html => String(html.find("[name='item']").val()), rejectClose: false
  });
  if (selected) await executeTechnique(actor, actor.items.get(selected), { target, roll });
}

async function onDamaged({ actor, damage, nextHp, previousHp }) {
  if (!responsible(actor) || damage <= 0) return;
  if (actor.getFlag(MODULE_ID, "berserkerReactionRound") !== roundKey()) {
    const attacker = recentAttacker(actor);
    const carne = (attacker ?? selectedTarget()) ? known(actor, "berserker-tecnica-carne") : null;
    const coagulado = known(actor, "berserker-tecnica-coagulado");
    const reactions = [carne, coagulado, ...advancedDamageTechniqueItems(actor)].filter(item => item && Number(item.getFlag(MODULE_ID, "bloodCost")) <= bloodState(actor).points);
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
        } else await executeTechnique(actor, item, { damage, previousHp, damageType: choice.damageType, attacker });
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
  const target = selectedTarget();
  if (invisible(target) && target.effects.some(effect => effect.getFlag(MODULE_ID, "sourceActorUuid") === actor.uuid && effect.getFlag(MODULE_ID, "ignoresInvisibility"))) {
    config.disadvantage = false;
  }
}

function ignoreMarkedInvisibility(workflow) {
  const actor = workflow?.actor ?? workflow?.item?.actor;
  if (!actor) return;
  const targets = [...(workflow.targets ?? [])];
  if (!targets.some(token => invisible(token.actor) && token.actor.effects.some(effect => effect.getFlag(MODULE_ID, "sourceActorUuid") === actor.uuid && effect.getFlag(MODULE_ID, "ignoresInvisibility")))) return;
  workflow.disadvantage = false;
}

async function rememberAttacker(actor, target) {
  if (!actor || !target || !isNovaEraBerserker(target)) return;
  await documentAction(target, "update-actor", {
    change: { [`flags.${MODULE_ID}.${ATTACKER_FLAG}`]: { actorUuid: actor.uuid, at: Date.now() } },
    options: { novaEraAttackerMarker: true }
  });
}

async function rememberCoreAttacker(rolls, data = {}) {
  if (game.modules.get("midi-qol")?.active) return;
  const activity = data.subject;
  const actor = activity?.actor ?? activity?.item?.actor ?? data.actor;
  if (!actor || !responsible(actor) || !isMeleeActivity(activity)) return;
  const target = selectedTarget();
  const roll = firstRoll(rolls);
  if (!target || !roll || Number(roll.total) < Number(target.system.attributes?.ac?.value ?? Infinity)) return;
  await rememberAttacker(actor, target);
}

async function midiDamageBonus(workflow) {
  const actor = workflow?.actor ?? workflow?.item?.actor;
  if (!actor || !responsible(actor) || !isMeleeActivity(workflow?.activity ?? workflow)) return;
  const targets = workflow.hitTargets instanceof Set ? [...workflow.hitTargets] : [...(workflow.targets ?? [])];
  if (!targets.length) return;
  for (const token of targets) await rememberAttacker(actor, token.actor);
  const lamina = actor.effects.find(effect => effect.getFlag(MODULE_ID, "berserkerEffect") === "lamina-hematica");
  if (!lamina || actor.getFlag(MODULE_ID, "laminaHematicaTurn") === turnKey()) return;
  await actor.setFlag(MODULE_ID, "laminaHematicaTurn", turnKey());
  const level = Number(actor.items.find(item => item.type === "class" && item.system.identifier === "berserker-nova-era")?.system.levels ?? 1);
  const die = level >= 17 ? 10 : level >= 9 ? 8 : 6;
  const type = lamina.getFlag(MODULE_ID, "damageType") ?? "necrotic";
  const dice = workflow.isCritical ? 2 : 1;
  const roll = await new CONFIG.Dice.DamageRoll(`${dice}d${die}`, actor.getRollData(), { type, flavor: "Lâmina Hemática" }).evaluate();
  const existing = [...(workflow.bonusDamageRolls ?? [])];
  if (typeof workflow.setBonusDamageRolls === "function") await workflow.setBonusDamageRolls([...existing, roll]);
  else if (typeof workflow.setBonusDamageRoll === "function") await workflow.setBonusDamageRoll(roll);
  else await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Lâmina Hemática — dano ${type}` });
}

function directionName(dx, dy) {
  const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  return ["leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste", "norte", "nordeste"][Math.round(angle / 45) % 8];
}

function reportMarkedDirection(token, changed, options = {}) {
  if (options?.novaEraTechnique || (changed.x === undefined && changed.y === undefined)) return;
  const target = token.actor;
  for (const mark of target?.effects?.filter(effect => effect.getFlag(MODULE_ID, "ignoresInvisibility")) ?? []) {
    const source = actorFromUuid(mark.getFlag(MODULE_ID, "sourceActorUuid"));
    if (!source || !responsible(source)) continue;
    const sourceToken = tokenFor(source);
    if (!sourceToken || !canvas?.scene) continue;
    const grid = Number(canvas.scene.grid.size ?? 100);
    const units = Number(canvas.scene.grid.distance ?? 1.5);
    const destination = { x: Number(changed.x ?? token.x) + grid * Number(token.width ?? 1) / 2, y: Number(changed.y ?? token.y) + grid * Number(token.height ?? 1) / 2 };
    const dx = destination.x - sourceToken.center.x;
    const dy = destination.y - sourceToken.center.y;
    const distance = Math.hypot(dx, dy) / grid * units;
    if (distance <= 18) ui.notifications.info(`Marca Rubra: ${target.name} está a ${distance.toFixed(1)} m, na direção ${directionName(dx, dy)}.`);
  }
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
  movementOrigins.set(token.uuid, { x: Number(token.x), y: Number(token.y), at: Date.now() });
}

async function offerInvestida(token, changed, options = {}) {
  const actor = token.actor;
  const origin = movementOrigins.get(token.uuid);
  movementOrigins.delete(token.uuid);
  if (!actor || !isNovaEraBerserker(actor) || !responsible(actor) || !origin || Date.now() - origin.at > 10000) return;
  const item = known(actor, "berserker-tecnica-investida");
  if (!item || bloodState(actor).points < Number(item.getFlag(MODULE_ID, "bloodCost")) || actor.effects.some(effect => effect.getFlag(MODULE_ID, "consumeOnMeleeAttack"))) return;
  const grid = Number(canvas.scene?.grid?.size ?? 100);
  const units = Number(canvas.scene?.grid?.distance ?? 1.5);
  const destination = { x: Number(token.x), y: Number(token.y) };
  const travelled = Math.hypot(destination.x - origin.x, destination.y - origin.y) / grid * units;
  if (travelled < 3) return;
  const half = grid * Number(token.width ?? 1) / 2;
  const selected = selectedTargetToken();
  const candidates = (canvas.tokens?.placeables ?? []).filter(candidate => {
    if (!candidate?.actor || candidate.id === token.id || candidate.document.hidden) return false;
    return Number(candidate.document.disposition) !== Number(token.disposition);
  });
  candidates.sort((left, right) => Number(right.id === selected?.id) - Number(left.id === selected?.id));
  const approaches = candidates.map(target => {
    const before = Math.hypot(origin.x + half - target.center.x, origin.y + half - target.center.y);
    const after = Math.hypot(destination.x + half - target.center.x, destination.y + half - target.center.y);
    return { target, before, after, gain: before - after };
  }).filter(candidate => candidate.gain > 0).sort((left, right) => {
    const selectedDifference = Number(right.target.id === selected?.id) - Number(left.target.id === selected?.id);
    return selectedDifference || right.gain - left.gain || left.after - right.after;
  });
  const target = approaches[0]?.target;
  const targetActor = target?.actor;
  if (!targetActor) return;
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
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => void rememberCoreAttacker(rolls, data));
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => void finishMeleeAttack(rolls, data));
  Hooks.on("preUpdateToken", (token, changed, options) => rememberMovement(token, changed, options));
  Hooks.on("updateToken", (token, changed, options) => {
    void offerInvestida(token, changed, options);
    reportMarkedDirection(token, changed, options);
  });
  Hooks.on("midi-qol.preAttackRoll", workflow => ignoreMarkedInvisibility(workflow));
  Hooks.on("midi-qol.DamageRollComplete", workflow => midiDamageBonus(workflow));
  Hooks.on("updateCombat", (combat, changed) => void cleanTurnEffects(combat, changed));
  Hooks.on("dnd5e.preUseActivity", activity => blockReaction(activity));
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void resetLongRest(actor, result, config));
  game.socket.on(`module.${MODULE_ID}`, payload => void socket(payload));
}
