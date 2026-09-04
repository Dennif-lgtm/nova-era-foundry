import { MODULE_ID } from "../constants.mjs";
import { createChronomancerEffect, deleteChronomancerEffect, effectAction, mayManageChronomancer, turnKey } from "./effect-engine.mjs";

const PENDING_FLAG = `flags.${MODULE_ID}.confluencePending`;
const startPositions = new Map();

function markedToken() {
  return [...(game.user.targets ?? [])][0] ?? null;
}

function actorToken(actor) {
  return actor?.getActiveTokens?.(true, true)?.[0] ?? actor?.getActiveTokens?.()?.[0] ?? null;
}

function affectedToken(actor, context = {}) {
  return context.targetToken ?? markedToken() ?? actorToken(context.targetActor) ?? actorToken(actor);
}

function gridDistance(a, b) {
  if (!a || !b) return Infinity;
  const canvasGrid = canvas?.grid;
  try {
    if (canvasGrid?.measurePath) return Number(canvasGrid.measurePath([a.center, b.center])?.distance ?? Infinity);
  } catch (_) { /* Foundry 12 fallback below. */ }
  const pixels = Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
  return pixels / Number(canvasGrid?.size ?? 100) * Number(canvas?.scene?.grid?.distance ?? 1.5);
}

export async function confirmedChronomancerMovement(token, maximum, title) {
  if (!token?.document) return ui.notifications.warn(`Nova Era: selecione no mapa a criatura de ${title}.`);
  const origin = { x: token.document.x, y: token.document.y };
  const accepted = await Dialog.confirm({
    title,
    content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-person-walking-arrow-right"></i><div><strong>Mova ${token.name} no mapa</strong><p>Arraste a ficha até <b>${maximum}m</b> e clique em Confirmar. O módulo recusará uma distância maior.</p></div></section>`,
    yes: () => true,
    no: () => false,
    defaultYes: true
  });
  if (!accepted) return false;
  const distance = gridDistance({ x: origin.x, y: origin.y, center: { x: origin.x + token.w / 2, y: origin.y + token.h / 2 } }, token);
  if (distance > maximum + 0.01) {
    await token.document.update(origin);
    ui.notifications.warn(`Nova Era: movimento de ${distance.toFixed(1)}m excedeu ${maximum}m e foi desfeito.`);
    return false;
  }
  return true;
}

async function choose(title, content, yesLabel, noLabel) {
  return Dialog.confirm({ title, content, yes: () => true, no: () => false, defaultYes: true,
    options: { classes: ["nova-era", "ne-chronomancer-choice"] },
    render: html => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      const buttons = root?.querySelectorAll?.("button");
      if (buttons?.[0]) buttons[0].innerHTML = yesLabel;
      if (buttons?.[1]) buttons[1].innerHTML = noLabel;
    }
  });
}

async function setPending(actor, type, sourceActor) {
  if (!actor) return false;
  await effectAction(actor.uuid, "update-actor", { change: { [PENDING_FLAG]: { type, sourceActorUuid: sourceActor?.uuid ?? "", createdTurnKey: turnKey() } } });
  return true;
}

export async function armChronomancerSecondaryEffect(actor, type, sourceActor) {
  return setPending(actor, type, sourceActor);
}

async function clearPending(actor) {
  if (!actor) return;
  await effectAction(actor.uuid, "update-actor", { change: { [PENDING_FLAG]: null } });
}

export async function prepareChronomancerConfluence(actor, name, context = {}) {
  const contextualToken = context.targetTokenUuid ? await fromUuid(context.targetTokenUuid) : null;
  const contextualActor = context.targetActorUuid ? await fromUuid(context.targetActorUuid) : null;
  const token = contextualToken?.object ?? contextualToken ?? affectedToken(actor, context);
  const target = token?.actor ?? contextualActor ?? context.targetActor ?? actor;
  const runtime = { targetActorUuid: target?.uuid ?? "", tokenUuid: token?.document?.uuid ?? "" };
  if (name === "Causalidade Invertida" && target) {
    await createChronomancerEffect(target, {
      effectKey: `confluence-no-reaction-${actor.id}`,
      name: "Causalidade Invertida — sem Reações",
      flags: { noReaction: true, confluenceResolution: true, sourceActorUuid: actor.uuid }
    });
  }
  if (name === "Horizonte Suspenso") await setPending(target, "delay-secondary", actor);
  if (name === "Instante Perdido") await setPending(target, "discard-secondary", actor);
  if (name === "Linha Convergente" && token?.document) {
    runtime.startPosition = { x: token.document.x, y: token.document.y };
  }
  return runtime;
}

export async function resolveChronomancerConfluence(actor, name, context = {}) {
  const runtime = context.confluenceRuntime ?? {};
  const tokenDocument = runtime.tokenUuid ? await fromUuid(runtime.tokenUuid) : null;
  const token = tokenDocument?.object ?? affectedToken(actor, context);
  const target = runtime.targetActorUuid ? await fromUuid(runtime.targetActorUuid) : (token?.actor ?? actor);

  if (name === "Equilíbrio Causal") await confirmedChronomancerMovement(token, 1.5, "Equilíbrio Causal");
  if (name === "Impulso Temporal" && context.movement) await confirmedChronomancerMovement(token, 1.5, "Impulso Temporal — movimento adicional");
  if (name === "Instante Preservado") {
    const effect = context.effectUuid ? await fromUuid(context.effectUuid) : null;
    if (effect?.documentName === "ActiveEffect") {
      await effectAction(effect.uuid, "update-effect", { change: { [`flags.${MODULE_ID}.expiresAtTurnStart`]: actor.uuid, [`flags.${MODULE_ID}.preservedByConfluence`]: true } });
    } else if (target) {
      await createChronomancerEffect(target, { effectKey: `instante-preservado-${actor.id}`, name: "Instante Preservado", flags: { expiresAtTurnStart: actor.uuid, preservedByConfluence: true } });
    }
  }
  if (name === "Causalidade Invertida" && target) {
    const effect = target.effects.find(value => value.getFlag(MODULE_ID, "effectKey") === `confluence-no-reaction-${actor.id}`);
    if (effect) await deleteChronomancerEffect(effect);
  }
  if (name === "Linha Convergente" && token?.document && runtime.startPosition) {
    const returnToStart = await choose("Linha Convergente", `<p><b>${token.name}</b> pode manter a posição atual ou retornar à posição registrada no começo da resolução.</p>`, "<i class='fa-solid fa-rotate-left'></i> Retornar", "<i class='fa-solid fa-location-dot'></i> Manter");
    if (returnToStart) await token.document.update(runtime.startPosition);
  }
  if (name === "Ponto de Ruptura") {
    const effect = context.effectUuid ? await fromUuid(context.effectUuid) : target?.effects?.find(value => value.duration?.rounds <= 1 || value.duration?.turns <= 1);
    if (effect?.documentName === "ActiveEffect") await effectAction(effect.uuid, "update-effect", { change: { [`flags.${MODULE_ID}.noTemporalExtension`]: true } });
    else if (target) await setPending(target, "prevent-extension", actor);
  }
}

function preCreateEffect(effect, data, options, userId) {
  const actor = effect.parent;
  const pending = actor?.getFlag?.(MODULE_ID, "confluencePending");
  if (!pending || data?.flags?.[MODULE_ID]?.effectKey) return;
  if (pending.type === "discard-secondary") {
    ui.notifications.info(`Nova Era: ${effect.name} foi perdido por Instante Perdido.`);
    void clearPending(actor);
    return false;
  }
  if (pending.type === "delay-secondary") {
    effect.updateSource({ disabled: true, [`flags.${MODULE_ID}.activateAtTurnEnd`]: actor.uuid, [`flags.${MODULE_ID}.delayedByConfluence`]: true });
    void clearPending(actor);
  }
  if (pending.type === "prevent-extension") {
    effect.updateSource({ [`flags.${MODULE_ID}.noTemporalExtension`]: true });
    void clearPending(actor);
  }
}

async function onCombatTurn(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const previousUuid = startPositions.get(combat.id);
  if (previousUuid) {
    const previous = await fromUuid(previousUuid);
    if (previous && mayManageChronomancer(previous)) {
      for (const effect of previous.effects.filter(value => value.getFlag(MODULE_ID, "activateAtTurnEnd") === previous.uuid)) {
        await effectAction(effect.uuid, "update-effect", { change: { disabled: false, [`flags.${MODULE_ID}.activateAtTurnEnd`]: null } });
      }
    }
  }
  if (combat.combatant?.actor) startPositions.set(combat.id, combat.combatant.actor.uuid);
}

export function registerChronomancerConfluenceAutomation() {
  Hooks.on("preCreateActiveEffect", preCreateEffect);
  Hooks.on("updateCombat", (combat, changed) => void onCombatTurn(combat, changed));
  Hooks.on("deleteCombat", combat => startPositions.delete(combat.id));
}
