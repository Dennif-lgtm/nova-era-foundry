import { MODULE_ID } from "../constants.mjs";

const STATE_FLAG = "chronomancerGreatTheoryState";
const LAWS = ["Precedência", "Atraso", "Repetição", "Continuidade", "Ruptura"];

function keyOf(entry) {
  return entry?.item?.getFlag?.(MODULE_ID, "contentKey") ?? entry?.item?.flags?.[MODULE_ID]?.contentKey ?? "";
}

function mayManage(actor) {
  if (!actor?.isOwner) return false;
  const players = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return (players[0] ?? (game.user.isGM ? game.user : null))?.id === game.user.id;
}

async function executeAction(document, action, data = {}) {
  if (action === "set-state" && document.documentName === "Actor") {
    await document.setFlag(MODULE_ID, STATE_FLAG, data.state ?? {});
    return true;
  }
  if (action === "create-echo" && document.documentName === "Scene") {
    await document.createEmbeddedDocuments("Token", [data.source], { novaEraChronomancer: true });
    return true;
  }
  if (action === "delete-token" && document.documentName === "Token") {
    await document.delete({ novaEraChronomancer: true });
    return true;
  }
  if (action === "update-token" && document.documentName === "Token") {
    await document.update({ x: Number(data.x), y: Number(data.y) }, { novaEraChronomancer: true });
    return true;
  }
  if (action === "update-hp" && document.documentName === "Actor") {
    const maximum = Number(document.system?.attributes?.hp?.max ?? Number.MAX_SAFE_INTEGER);
    await document.update({ "system.attributes.hp.value": Math.max(0, Math.min(maximum, Number(data.value))) }, { novaEraChronomancer: true });
    return true;
  }
  if (action === "delete-effect" && document.documentName === "ActiveEffect") {
    await document.delete({ novaEraChronomancer: true });
    return true;
  }
  return false;
}

async function requestAction(uuid, action, data = {}) {
  const document = uuid ? await fromUuid(uuid) : null;
  if (!document) return false;
  if (game.user.isGM || document.isOwner) return executeAction(document, action, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: "chronomancerGreatTheory", uuid, action, data });
  return true;
}

async function post(actor, title, text) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era chronomancer-chat"><h2><i class="fa-solid fa-star"></i> ${title}</h2><p>${text}</p></section>` });
}

async function choose(title, text, entries) {
  return new Promise(resolve => {
    new Dialog({
      title,
      content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-star"></i><div><strong>${text}</strong><p>Escolha uma possibilidade.</p></div></section>`,
      buttons: Object.fromEntries(entries.map(([key, label, icon = "fa-star"]) => [key, { icon: `<i class="fa-solid ${icon}"></i>`, label, callback: () => resolve(key) }])),
      close: () => resolve("")
    }, { classes: ["nova-era-great-theory-dialog"] }).render(true);
  });
}

function selectedTarget(context, actor) {
  if (context.targetActorUuid) return context.targetActorUuid;
  return [...(game.user.targets ?? [])][0]?.actor?.uuid ?? actor.uuid;
}

function turnKey() {
  return game.combat ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `scene:${Math.floor(Date.now() / 6000)}`;
}

function actorEchoes(actor) {
  return (canvas.scene?.tokens ?? []).filter(token => token.getFlag(MODULE_ID, "chronomancerEcho") && token.getFlag(MODULE_ID, "sourceActorUuid") === actor.uuid);
}

export async function prepareChronomancerGreatTheory(actor, entry, context = {}) {
  if (entry.category !== "Fundamento") return context;
  const echoes = actorEchoes(actor);
  if (!echoes.length) return context;
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const currentTurn = turnKey();
  if (state.echoOriginTurnKey === currentTurn) return context;
  const useEcho = await Dialog.confirm({
    title: "Clone Temporal",
    content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-clone"></i><div><strong>Originar ${entry.item.name} no Eco Temporal?</strong><p>Esta é a origem alternativa disponível neste turno.</p></div></section>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });
  if (!useEcho) return context;
  state.echoOriginTurnKey = currentTurn;
  await requestAction(actor.uuid, "set-state", { state });
  context.echoOriginTokenUuid = echoes[0].uuid;
  await post(actor, "Clone Temporal", `<strong>${entry.item.name}</strong> tem origem no Eco Temporal nesta resolução.`);
  return context;
}

async function resolveClone(actor, entry) {
  const source = actor.getActiveTokens?.()[0]?.document;
  if (!source?.parent) return post(actor, entry.item.name, "Coloque o Cronomante em uma cena para criar seu Eco Temporal.");
  const grid = Number(canvas.grid.size ?? 100);
  const tokenSource = source.toObject();
  delete tokenSource._id;
  tokenSource.name = `Eco Temporal — ${actor.name}`;
  tokenSource.x = Number(source.x) + grid;
  tokenSource.y = Number(source.y);
  tokenSource.alpha = 0.68;
  tokenSource.displayBars = 0;
  tokenSource.actorLink = false;
  tokenSource.flags ??= {};
  tokenSource.flags[MODULE_ID] = {
    chronomancerEcho: true,
    sourceActorUuid: actor.uuid,
    expiresRound: Number(game.combat?.round ?? 0) + 10
  };
  await requestAction(source.parent.uuid, "create-echo", { source: tokenSource });
  await post(actor, entry.item.name, `Um Eco Temporal foi criado próximo de ${actor.name}. Ele pode ser movido 6m no início do turno e desaparece se ficar além de 18m.`);
}

async function resolveAlternativeLine(actor, entry, context) {
  const targetUuid = selectedTarget(context, actor);
  const target = await fromUuid(targetUuid);
  const token = context.targetTokenUuid ? await fromUuid(context.targetTokenUuid) : target?.getActiveTokens?.()[0]?.document;
  if (!target || !token) return post(actor, entry.item.name, "Selecione um aliado com token na cena para registrar sua linha alternativa.");
  const state = target.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  state.alternativeLine = {
    sourceActorUuid: actor.uuid,
    hp: Number(target.system?.attributes?.hp?.value ?? 0),
    x: Number(token.x), y: Number(token.y), tokenUuid: token.uuid,
    effectIds: target.effects.map(effect => effect.id),
    createdTurnKey: `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}`
  };
  await requestAction(target.uuid, "set-state", { state });
  await post(actor, entry.item.name, `Posição, PV e condições de <strong>${target.name}</strong> foram registrados até o início do próximo turno.`);
}

async function restoreAlternativeLine(target, snapshot) {
  const gained = target.effects.filter(effect => !snapshot.effectIds.includes(effect.id));
  const selection = await choose("Linha Alternativa", `Qual propriedade de ${target.name} deve retornar?`, [
    ["position", "Posição registrada", "fa-location-dot"],
    ["hp", `PV registrados (${snapshot.hp})`, "fa-heart"],
    ...gained.slice(0, 4).map(effect => [`effect:${effect.id}`, `Remover ${effect.name}`, "fa-shield-heart"])
  ]);
  if (selection === "position") await requestAction(snapshot.tokenUuid, "update-token", { x: snapshot.x, y: snapshot.y });
  else if (selection === "hp") await requestAction(target.uuid, "update-hp", { value: snapshot.hp });
  else if (selection.startsWith("effect:")) {
    const effect = gained.find(candidate => candidate.id === selection.slice(7));
    if (effect) await requestAction(effect.uuid, "delete-effect");
  }
  return selection;
}

async function resolveFrozenHorizon(actor, entry, context) {
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  state.frozenEvent = { name: context.activityName ?? "Acontecimento", originActorUuid: context.targetActorUuid ?? "", untilActorTurn: actor.uuid };
  await requestAction(actor.uuid, "set-state", { state });
  await post(actor, entry.item.name, `<strong>${context.activityName ?? "O acontecimento"}</strong> foi marcado como suspenso até o início do próximo turno de ${actor.name}. Ataque, área e alvos permanecem registrados.`);
}

async function resolveInfiniteEcho(actor, entry) {
  const foundations = actor.items.filter(item => String(item.getFlag(MODULE_ID, "contentKey") ?? "").startsWith("crono-intervencao-") && String(item.getFlag(MODULE_ID, "group") ?? "").includes("Fundamento"));
  if (!foundations.length) return post(actor, entry.item.name, "Nenhum Fundamento conhecido foi encontrado.");
  const selected = await choose(entry.item.name, "Qual Fundamento produzirá um Eco Infinito?", foundations.map(item => [item.id, item.name, "fa-infinity"]));
  if (!selected) return;
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  state.infiniteEcho = { itemId: selected, usedRoundKey: "" };
  await requestAction(actor.uuid, "set-state", { state });
  await post(actor, entry.item.name, `<strong>${foundations.find(item => item.id === selected)?.name}</strong> foi ligado ao Eco Infinito por até 1 minuto.`);
}

async function resolveAbsoluteConvergence(actor, entry) {
  const selected = await choose(entry.item.name, "Escolha a segunda Lei da próxima Intervenção", LAWS.map(law => [law, law, "fa-code-merge"]));
  if (!selected) return;
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  state.absoluteConvergence = { law: selected, sourceItemId: entry.item.id };
  await requestAction(actor.uuid, "set-state", { state });
  await post(actor, entry.item.name, `<strong>${selected}</strong> será acrescentada como segunda Lei à próxima Intervenção.`);
}

export function absoluteConvergence(actor, entry, baseLaw) {
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const pending = state.absoluteConvergence;
  if (!pending || keyOf(entry) === "crono-intervencao-convergencia-absoluta" || !baseLaw || pending.law === baseLaw) return null;
  return { previousLaw: baseLaw, newLaw: pending.law };
}

export async function consumeAbsoluteConvergence(actor) {
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  if (!state.absoluteConvergence) return;
  delete state.absoluteConvergence;
  await requestAction(actor.uuid, "set-state", { state });
}

async function sustainInfiniteEcho(actor, entry) {
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const echo = state.infiniteEcho;
  const roundKey = `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}`;
  if (!echo || echo.itemId !== entry.item.id || echo.usedRoundKey === roundKey) return;
  echo.usedRoundKey = roundKey;
  await requestAction(actor.uuid, "set-state", { state });
  const temporal = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
  temporal.trailExpiry = "end-next-turn";
  await actor.setFlag(MODULE_ID, "chronomancerState", temporal);
  Hooks.callAll("novaEraChronomancerChanged", actor);
  await post(actor, "Eco Infinito", `O Rastro de <strong>${entry.item.name}</strong> permanece disponível até o início do próximo turno.`);
}

export async function resolveChronomancerGreatTheory(actor, entry, context = {}) {
  const key = keyOf(entry);
  if (key === "crono-intervencao-clone-temporal") await resolveClone(actor, entry);
  else if (key === "crono-intervencao-linha-alternativa") await resolveAlternativeLine(actor, entry, context);
  else if (key === "crono-intervencao-horizonte-congelado") await resolveFrozenHorizon(actor, entry, context);
  else if (key === "crono-intervencao-eco-infinito") await resolveInfiniteEcho(actor, entry);
  else if (key === "crono-intervencao-convergencia-absoluta") await resolveAbsoluteConvergence(actor, entry);
  else if (String(entry.item.getFlag(MODULE_ID, "group") ?? "").includes("Fundamento")) await sustainInfiniteEcho(actor, entry);
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== "chronomancerGreatTheory") return;
  const document = await fromUuid(payload.uuid);
  if (document) await executeAction(document, payload.action, payload.data ?? {});
}

async function maintainEchoRange(token, change, options) {
  if (options?.novaEraChronomancer || !token.getFlag(MODULE_ID, "chronomancerEcho")) return;
  const actor = await fromUuid(token.getFlag(MODULE_ID, "sourceActorUuid"));
  const source = actor?.getActiveTokens?.()[0];
  if (!source || !mayManage(actor)) return;
  let distance = 0;
  try { distance = canvas.grid.measurePath([source.center, token.object?.center ?? { x: token.x, y: token.y }]).distance; } catch { return; }
  if (distance > 18) {
    await requestAction(token.uuid, "delete-token");
    ui.notifications.info("Nova Era: o Eco Temporal desapareceu por ultrapassar 18m.");
  }
}

function validateEchoMovement(token, change, options) {
  if (options?.novaEraChronomancer || !("x" in change || "y" in change) || !token.getFlag(MODULE_ID, "chronomancerEcho")) return;
  const sourceUuid = token.getFlag(MODULE_ID, "sourceActorUuid");
  if (game.combat?.combatant?.actor?.uuid && game.combat.combatant.actor.uuid !== sourceUuid) {
    ui.notifications.warn("Nova Era: o Eco Temporal só pode ser movido no turno do Cronomante.");
    return false;
  }
  const currentTurn = turnKey();
  if (token.getFlag(MODULE_ID, "echoMoveTurnKey") === currentTurn) {
    ui.notifications.warn("Nova Era: o Eco Temporal já foi movido neste turno.");
    return false;
  }
  const grid = Number(canvas.grid.size ?? 100);
  const width = Number(token.width ?? 1) * grid;
  const height = Number(token.height ?? 1) * grid;
  const origin = { x: Number(token.x) + width / 2, y: Number(token.y) + height / 2 };
  const destination = { x: Number(change.x ?? token.x) + width / 2, y: Number(change.y ?? token.y) + height / 2 };
  let distance = 0;
  try { distance = canvas.grid.measurePath([origin, destination]).distance; } catch { return; }
  if (distance > 6) {
    ui.notifications.warn("Nova Era: o Eco Temporal pode se mover no máximo 6m por turno.");
    return false;
  }
  foundry.utils.setProperty(change, `flags.${MODULE_ID}.echoMoveTurnKey`, currentTurn);
}

async function processEchoes(combat, activeActor) {
  const scene = combat.scene ?? canvas.scene;
  if (!scene) return;
  for (const token of scene.tokens.filter(candidate => candidate.getFlag(MODULE_ID, "chronomancerEcho"))) {
    const source = await fromUuid(token.getFlag(MODULE_ID, "sourceActorUuid"));
    if (!source || !mayManage(source)) continue;
    if (Number(combat.round ?? 0) >= Number(token.getFlag(MODULE_ID, "expiresRound") ?? Number.MAX_SAFE_INTEGER)) {
      await requestAction(token.uuid, "delete-token");
      continue;
    }
    if (source.uuid === activeActor?.uuid) ui.notifications.info(`Nova Era: ${source.name} pode mover seu Eco Temporal até 6m neste início de turno.`);
  }
}

function preventEchoTarget(user, token, targeted) {
  const document = token?.document ?? token;
  if (!targeted || user.id !== game.user.id || !document?.getFlag?.(MODULE_ID, "chronomancerEcho")) return;
  const retained = [...user.targets].filter(candidate => candidate.id !== token.id).map(candidate => candidate.id);
  setTimeout(() => user.updateTokenTargets(retained), 0);
  ui.notifications.warn("Nova Era: o Eco Temporal não pode ser escolhido como alvo.");
}

async function processTurn(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const actor = combat.combatant?.actor;
  if (!actor) return;
  await processEchoes(combat, actor);
  if (mayManage(actor)) {
    const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
    if (state.alternativeLine) {
      const restored = await restoreAlternativeLine(actor, state.alternativeLine);
      delete state.alternativeLine;
      await requestAction(actor.uuid, "set-state", { state });
      if (restored) await post(actor, "Linha Alternativa", `${actor.name} retornou à possibilidade registrada.`);
    }
  }
  for (const chronomancer of game.actors.filter(candidate => candidate.getFlag(MODULE_ID, STATE_FLAG)?.frozenEvent && mayManage(candidate))) {
    if (chronomancer.uuid !== actor.uuid) continue;
    const state = chronomancer.getFlag(MODULE_ID, STATE_FLAG) ?? {};
    const event = state.frozenEvent;
    delete state.frozenEvent;
    await requestAction(chronomancer.uuid, "set-state", { state });
    await post(chronomancer, "Horizonte Congelado", `<strong>${event.name}</strong> volta a ser resolvido agora.`);
  }
}

export function registerChronomancerGreatTheoryAutomation() {
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
  Hooks.on("targetToken", preventEchoTarget);
  Hooks.on("preUpdateToken", validateEchoMovement);
  Hooks.on("updateToken", (token, change, options) => void maintainEchoRange(token, change, options));
  Hooks.on("updateCombat", (combat, changed) => void processTurn(combat, changed));
}
