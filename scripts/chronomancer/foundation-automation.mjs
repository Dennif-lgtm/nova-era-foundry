import { MODULE_ID } from "../constants.mjs";

function contentKey(entry) {
  return entry?.item?.getFlag?.(MODULE_ID, "contentKey") ?? entry?.item?.flags?.[MODULE_ID]?.contentKey ?? "";
}

async function documentAction(uuid, action, data = {}) {
  const document = uuid ? await fromUuid(uuid) : null;
  if (!document) return false;
  if (game.user.isGM || document.isOwner) return executeDocumentAction(document, action, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: "chronomancerFoundation", uuid, action, data });
  return true;
}

async function executeDocumentAction(document, action, data) {
  if (action === "move-token" && document.documentName === "Token") {
    await document.update({ x: Number(data.x), y: Number(data.y) }, { novaEraChronomancer: true });
    return true;
  }
  const actor = document.documentName === "Actor" ? document : document.actor;
  if (action === "remove-prone" && actor) {
    const prone = actor.effects.filter(effect => effect.statuses?.has?.("prone") || effect.statuses?.has?.("proneStatus"));
    if (prone.length) await actor.deleteEmbeddedDocuments("ActiveEffect", prone.map(effect => effect.id));
    return prone.length > 0;
  }
  return false;
}

function markedTarget(context = {}) {
  if (context.targetActorUuid || context.targetTokenUuid) return context;
  const token = [...(game.user.targets ?? [])][0];
  return token ? { ...context, targetActorUuid: token.actor?.uuid, targetTokenUuid: token.document?.uuid } : context;
}

async function choice(title, prompt, buttons) {
  return new Promise(resolve => {
    const choices = Object.fromEntries(buttons.map(([key, label, icon]) => [key, {
      icon: `<i class="fa-solid ${icon}"></i>`,
      label,
      callback: () => resolve(key)
    }]));
    new Dialog({
      title,
      content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-hourglass-half"></i><div><strong>${prompt}</strong><p>Escolha como o fluxo será alterado.</p></div></section>`,
      buttons: choices,
      close: () => resolve("")
    }, { classes: ["nova-era-foundation-dialog"] }).render(true);
  });
}

async function postResolution(actor, title, text) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<section class="nova-era chronomancer-chat"><h2><i class="fa-solid fa-clock-rotate-left"></i> ${title}</h2><p>${text}</p></section>`
  });
}

async function resolveAcceleration(actor, entry, rawContext) {
  const context = markedTarget(rawContext);
  const selected = await choice(entry.item.name, "Antecipe uma possibilidade", [
    ["move", "Mover até 3m", "fa-person-running"],
    ["stand", "Levantar-se", "fa-person-arrow-up-from-line"],
    ["interact", "Interagir com objeto", "fa-hand"]
  ]);
  if (!selected) return;
  const target = context.targetActorUuid ? await fromUuid(context.targetActorUuid) : actor;
  if (selected === "stand") {
    await documentAction(target?.uuid ?? actor.uuid, "remove-prone");
    await postResolution(actor, entry.item.name, `<strong>${target?.name ?? actor.name}</strong> levanta-se sem gastar deslocamento.`);
  } else if (selected === "move") {
    await postResolution(actor, entry.item.name, `<strong>${target?.name ?? actor.name}</strong> pode mover até 3m sem provocar Ataques de Oportunidade.`);
  } else {
    await postResolution(actor, entry.item.name, `<strong>${target?.name ?? actor.name}</strong> pode sacar, guardar, abrir, fechar ou manipular um objeto imediatamente.`);
  }
}

async function reduceMovement(actor, entry, context, distance = 3) {
  const token = context.targetTokenUuid ? await fromUuid(context.targetTokenUuid) : null;
  const from = context.from;
  const to = context.to;
  const travelled = Number(context.distance ?? 0);
  if (!token || !from || !to || travelled <= 0) {
    await postResolution(actor, entry.item.name, `Reduza o deslocamento da criatura afetada em <strong>${distance}m</strong>, mínimo 0.`);
    return;
  }
  const remaining = Math.max(0, travelled - distance);
  const ratio = travelled ? remaining / travelled : 0;
  const x = Math.round(Number(from.x) + (Number(to.x) - Number(from.x)) * ratio);
  const y = Math.round(Number(from.y) + (Number(to.y) - Number(from.y)) * ratio);
  await documentAction(token.uuid, "move-token", { x, y });
  await postResolution(actor, entry.item.name, `<strong>${token.name}</strong> teve o deslocamento reduzido em ${Math.min(distance, travelled).toFixed(1)}m.`);
}

async function resolveAnchor(actor, entry, context) {
  const target = context.targetActorUuid ? await fromUuid(context.targetActorUuid) : null;
  const selected = await choice(entry.item.name, "Estabilize a criatura no fluxo", [
    ["movement", "Reduzir movimento", "fa-anchor"],
    ["prone", "Impedir queda", "fa-shield-halved"]
  ]);
  if (selected === "movement") await reduceMovement(actor, entry, context, 3);
  else if (selected === "prone") {
    await documentAction(target?.uuid ?? context.targetActorUuid, "remove-prone");
    await postResolution(actor, entry.item.name, `<strong>${target?.name ?? "A criatura"}</strong> não fica Derrubada.`);
  }
}

async function resolveEcho(actor, entry, context) {
  const roll = context.roll;
  if (roll?.reroll) {
    const reroll = await roll.reroll({ async: true });
    await reroll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: context.targetActorUuid ? await fromUuid(context.targetActorUuid) : actor }), flavor: `${entry.item.name} — o novo resultado deve ser usado.` });
  } else await postResolution(actor, entry.item.name, "Repita a jogada afetada e utilize o novo resultado.");
}

export async function resolveChronomancerFoundation(actor, entry, context = {}) {
  const key = contentKey(entry);
  if (key === "crono-intervencao-acelerar" || key === "crono-intervencao-antecipacao") await resolveAcceleration(actor, entry, context);
  else if (key === "crono-intervencao-retardar") await reduceMovement(actor, entry, context);
  else if (key === "crono-intervencao-inercia-temporal") await postResolution(actor, entry.item.name, "Resolva primeiro o acontecimento que provocou a Reação. A Reação somente acontece depois, caso ainda possua alvo e condições válidas.");
  else if (key === "crono-intervencao-eco-temporal") await resolveEcho(actor, entry, context);
  else if (key === "crono-intervencao-ancora-temporal") await resolveAnchor(actor, entry, context);
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== "chronomancerFoundation") return;
  const document = await fromUuid(payload.uuid);
  if (document) await executeDocumentAction(document, payload.action, payload.data ?? {});
}

export function registerChronomancerFoundationAutomation() {
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
}
