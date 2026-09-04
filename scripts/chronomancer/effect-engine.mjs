import { MODULE_ID } from "../constants.mjs";

const SOCKET_TYPE = "chronomancerEffects";

function responsibleUser(actor) {
  const players = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return players[0] ?? (game.user.isGM ? game.user : null);
}

export function mayManageChronomancer(actor) {
  return Boolean(actor?.isOwner && responsibleUser(actor)?.id === game.user.id);
}

async function execute(document, action, data = {}) {
  const actor = document.documentName === "Actor" ? document : document.actor;
  if (action === "create-effect" && actor) {
    const existing = actor.effects.find(effect => effect.getFlag(MODULE_ID, "effectKey") === data.effect.flags?.[MODULE_ID]?.effectKey);
    if (existing) await existing.delete({ novaEraChronomancer: true });
    await actor.createEmbeddedDocuments("ActiveEffect", [data.effect], { novaEraChronomancer: true });
    return true;
  }
  if (action === "delete-effect" && document.documentName === "ActiveEffect") {
    await document.delete({ novaEraChronomancer: true });
    return true;
  }
  if (action === "update-actor" && actor) {
    await actor.update(data.change ?? {}, { novaEraChronomancer: true });
    return true;
  }
  return false;
}

export async function effectAction(uuid, action, data = {}) {
  const document = uuid ? await fromUuid(uuid) : null;
  if (!document) return false;
  if (game.user.isGM || document.isOwner) return execute(document, action, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPE, uuid, action, data });
  return true;
}

export function turnKey() {
  return game.combat ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : "";
}

export function activeEffectChange(key, value, mode = null, priority = 20) {
  return { key, mode: mode ?? CONST.ACTIVE_EFFECT_MODES.ADD, value: String(value), priority };
}

export async function createChronomancerEffect(actor, {
  effectKey,
  name,
  img = "icons/magic/time/clock-spinning-gold-pink.webp",
  changes = [],
  duration = {},
  flags = {}
}) {
  const effect = {
    name,
    img,
    origin: actor.uuid,
    disabled: false,
    duration: {
      startTime: game.time.worldTime,
      ...(game.combat ? { startRound: game.combat.round, startTurn: game.combat.turn } : {}),
      ...duration
    },
    changes,
    flags: {
      [MODULE_ID]: { effectKey, createdTurnKey: turnKey(), ...flags }
    }
  };
  await effectAction(actor.uuid, "create-effect", { effect });
}

export async function deleteChronomancerEffect(effect) {
  if (effect) await effectAction(effect.uuid, "delete-effect");
}

export async function removeEffects(actor, predicate) {
  for (const effect of actor?.effects?.filter(predicate) ?? []) await deleteChronomancerEffect(effect);
}

export async function removeEffectKey(actor, effectKey) {
  await removeEffects(actor, effect => effect.getFlag(MODULE_ID, "effectKey") === effectKey);
}

async function cleanTurnEffects(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const active = combat.combatant?.actor;
  if (!active) return;
  const current = turnKey();
  for (const actor of game.actors.filter(candidate => mayManageChronomancer(candidate))) {
    await removeEffects(actor, effect => {
      const data = effect.getFlag(MODULE_ID, "expiresAtTurnStart");
      return data === active.uuid && effect.getFlag(MODULE_ID, "createdTurnKey") !== current;
    });
  }
}

async function cleanWorkflowEffects(workflow) {
  const workflowId = workflow?.id ?? workflow?.uuid;
  if (!workflowId) return;
  for (const actor of game.actors.filter(candidate => candidate.effects?.some(effect => effect.getFlag(MODULE_ID, "workflowId") === workflowId))) {
    if (!mayManageChronomancer(actor)) continue;
    await removeEffects(actor, effect => effect.getFlag(MODULE_ID, "workflowId") === workflowId);
  }
}

async function cleanConsumedRoll(actor, type) {
  if (!actor || !mayManageChronomancer(actor)) return;
  const effect = actor.effects.find(candidate => candidate.getFlag(MODULE_ID, "consumeOn") === type || candidate.getFlag(MODULE_ID, "consumeOn") === "attack-or-save");
  if (effect) await deleteChronomancerEffect(effect);
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== SOCKET_TYPE) return;
  const document = await fromUuid(payload.uuid);
  if (document) await execute(document, payload.action, payload.data ?? {});
}

export function registerChronomancerEffectEngine() {
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
  Hooks.on("updateCombat", (combat, changed) => void cleanTurnEffects(combat, changed));
  Hooks.on("midi-qol.RollComplete", workflow => void cleanWorkflowEffects(workflow));
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => void cleanConsumedRoll(data?.subject?.actor ?? data?.subject, "attack"));
  Hooks.on("dnd5e.postRollSavingThrow", (rolls, data) => void cleanConsumedRoll(data?.subject?.actor ?? data?.subject, "save"));
}
