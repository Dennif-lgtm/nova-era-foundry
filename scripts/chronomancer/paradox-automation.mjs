import { MODULE_ID } from "../constants.mjs";

const STATE_FLAG = "chronomancerParadoxState";

function keyOf(entry) {
  return entry?.item?.getFlag?.(MODULE_ID, "contentKey") ?? entry?.item?.flags?.[MODULE_ID]?.contentKey ?? "";
}

function responsibleUser(actor) {
  const players = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return players[0] ?? (game.user.isGM ? game.user : null);
}

function mayManage(actor) {
  return Boolean(actor?.isOwner && responsibleUser(actor)?.id === game.user.id);
}

async function executeAction(document, action, data = {}) {
  if (action === "set-state" && document.documentName === "Actor") {
    await document.setFlag(MODULE_ID, STATE_FLAG, data.state ?? {});
    return true;
  }
  if (action === "create-manifestation" && document.documentName === "Scene") {
    await document.createEmbeddedDocuments("Token", [data.source], { novaEraChronomancer: true });
    return true;
  }
  if (action === "delete-token" && document.documentName === "Token") {
    await document.delete({ novaEraChronomancer: true });
    return true;
  }
  if (action === "update-token" && document.documentName === "Token") {
    await document.update(data.change ?? {}, { novaEraChronomancer: true });
    return true;
  }
  return false;
}

async function requestAction(uuid, action, data = {}) {
  const document = uuid ? await fromUuid(uuid) : null;
  if (!document) return false;
  if (game.user.isGM || document.isOwner) return executeAction(document, action, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: "chronomancerParadox", uuid, action, data });
  return true;
}

async function post(actor, title, text) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era chronomancer-chat"><h2><i class="fa-solid fa-infinity"></i> ${title}</h2><p>${text}</p></section>` });
}

async function resolveSimultaneousExistence(actor, entry) {
  const source = actor.getActiveTokens?.().find(token => !token.document.getFlag(MODULE_ID, "paradoxManifestation"))?.document;
  if (!source?.parent) return post(actor, entry.item.name, "Coloque o Cronomante em uma cena para criar a manifestação simultânea.");
  const existing = source.parent.tokens.find(token => token.getFlag(MODULE_ID, "paradoxManifestation") && token.getFlag(MODULE_ID, "sourceActorUuid") === actor.uuid);
  if (existing) await requestAction(existing.uuid, "delete-token");
  const tokenSource = source.toObject();
  delete tokenSource._id;
  tokenSource.name = `Manifestação — ${actor.name}`;
  tokenSource.x = Number(source.x) + Number(canvas.grid.size ?? 100);
  tokenSource.y = Number(source.y);
  tokenSource.actorLink = false;
  tokenSource.alpha = 0.82;
  tokenSource.flags ??= {};
  tokenSource.flags[MODULE_ID] = {
    paradoxManifestation: true,
    sourceActorUuid: actor.uuid,
    placementPending: true,
    expiresRound: Number(game.combat?.round ?? 0) + 10
  };
  await requestAction(source.parent.uuid, "create-manifestation", { source: tokenSource });
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  state.existence = { real: "original", expiresRound: Number(game.combat?.round ?? 0) + 10 };
  await requestAction(actor.uuid, "set-state", { state });
  await Dialog.confirm({
    title: `${entry.item.name} — posição inicial`,
    content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-location-crosshairs"></i><div><strong>Escolha onde a manifestação surgirá</strong><p>Assim que o token aparecer, arraste-o para um espaço desocupado a até <b>9m</b> do Cronomante. Uma posição acima desse limite será recusada.</p></div></section>`,
    yes: () => true,
    no: () => false,
    defaultYes: true
  });
  await post(actor, entry.item.name, "A manifestação foi posicionada na linha temporal. No início de cada turno, uma janela escolherá qual posição é real; somente ela poderá ser afetada.");
}

function validateManifestationPlacement(token, change, options) {
  if (options?.novaEraChronomancer || !("x" in change || "y" in change) || !token.getFlag(MODULE_ID, "paradoxManifestation")) return;
  if (token.getFlag(MODULE_ID, "placementPending") !== true) {
    ui.notifications.warn("Nova Era: a Manifestação de Existência Simultânea não pode ser movida depois de posicionada.");
    return false;
  }
  const sourceUuid = token.getFlag(MODULE_ID, "sourceActorUuid");
  const sourceActor = game.actors.get(String(sourceUuid).split(".").at(-1));
  const sourceToken = sourceActor?.getActiveTokens?.().find(value => !value.document.getFlag(MODULE_ID, "paradoxManifestation"));
  if (!sourceToken) return false;
  const size = Number(canvas.grid.size ?? 100);
  const destination = {
    x: Number(change.x ?? token.x) + Number(token.width ?? 1) * size / 2,
    y: Number(change.y ?? token.y) + Number(token.height ?? 1) * size / 2
  };
  let distance = Infinity;
  try { distance = Number(canvas.grid.measurePath([sourceToken.center, destination]).distance ?? Infinity); } catch { return false; }
  if (distance > 9) {
    ui.notifications.warn(`Nova Era: a manifestação deve ser colocada a até 9m; posição de ${distance.toFixed(1)}m recusada.`);
    return false;
  }
  foundry.utils.setProperty(change, `flags.${MODULE_ID}.placementPending`, false);
  ui.notifications.info(`Nova Era: manifestação posicionada a ${distance.toFixed(1)}m.`);
}

async function resetSimultaneousExistence(actor, result, config) {
  const longRest = result?.longRest === true || config?.type === "long";
  if (!longRest || !actor || !mayManage(actor)) return;
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens.filter(value => value.getFlag(MODULE_ID, "paradoxManifestation") && value.getFlag(MODULE_ID, "sourceActorUuid") === actor.uuid)) {
      await requestAction(token.uuid, "delete-token");
    }
  }
  const paradox = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  delete paradox.existence;
  await requestAction(actor.uuid, "set-state", { state: paradox });
  // A recuperação geral do Cronomante também usa este gancho. Aguarde-a para
  // preservar os PT restaurados e remova apenas o uso deste Paradoxo.
  await new Promise(resolve => setTimeout(resolve, 100));
  const temporal = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
  const limitedUses = { ...(temporal.limitedUses ?? {}) };
  const item = actor.items.find(value => keyOf({ item: value }) === "crono-intervencao-existencia-simultanea");
  if (item) delete limitedUses[item.id];
  await actor.setFlag(MODULE_ID, "chronomancerState", { ...temporal, limitedUses, reaction: true });
  Hooks.callAll("novaEraChronomancerChanged", actor);
}

async function resolveImmobileTime(actor, entry) {
  if (!game.combat) {
    await post(actor, entry.item.name, "Fora de combate, resolva imediatamente o deslocamento, a Ação e a Ação Bônus adicionais; não há economia de turno ativa para o módulo controlar.");
    return;
  }
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  state.immobileTime = { turnKey: `${game.combat.id}:${game.combat.round}:${game.combat.turn}` };
  await requestAction(actor.uuid, "set-state", { state });
  await post(actor, entry.item.name, "O intervalo imóvel está ativo até o fim deste turno: deslocamento completo, uma Ação e uma Ação Bônus adicionais. A automação bloqueará ataques e atividades ofensivas enquanto ele durar.");
}

async function resolveRewrittenDestiny(actor, entry, context) {
  const eventName = context.activityName ?? context.eventName ?? "o acontecimento observado";
  const result = await Dialog.prompt({
    title: entry.item.name,
    content: `<form class="nova-era ne-library-dialog"><header><i class="fa-solid fa-infinity"></i><div><strong>Reescreva um resultado possível</strong><small>${eventName}</small></div></header><div class="form-group"><label>Novo resultado válido</label><textarea name="result" rows="4" placeholder="Descreva um resultado que poderia ter ocorrido naturalmente."></textarea></div></form>`,
    label: "Registrar novo destino",
    callback: html => (html?.[0] ?? html).querySelector('[name="result"]')?.value?.trim() ?? "",
    rejectClose: false
  });
  if (!result) return post(actor, entry.item.name, `O destino de <strong>${eventName}</strong> foi aberto para adjudicação do Mestre, mas nenhum resultado substituto foi registrado.`);
  await post(actor, entry.item.name, `<strong>Acontecimento:</strong> ${eventName}<br><strong>Novo resultado proposto:</strong> ${result}<br><em>O Mestre confirma que o resultado era naturalmente possível antes de aplicá-lo.</em>`);
}

export async function resolveChronomancerParadox(actor, entry, context = {}) {
  const key = keyOf(entry);
  if (key === "crono-intervencao-existencia-simultanea") await resolveSimultaneousExistence(actor, entry);
  else if (key === "crono-intervencao-tempo-imovel") await resolveImmobileTime(actor, entry);
  else if (key === "crono-intervencao-destino-reescrito") await resolveRewrittenDestiny(actor, entry, context);
}

async function chooseReality(actor) {
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  if (!state.existence) return;
  const real = await new Promise(resolve => {
    new Dialog({
      title: "Existência Simultânea",
      content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-infinity"></i><div><strong>Qual posição de ${actor.name} é real neste turno?</strong><p>A outra manifestação não poderá ser afetada.</p></div></section>`,
      buttons: {
        original: { icon: '<i class="fa-solid fa-user"></i>', label: "Corpo original", callback: () => resolve("original") },
        manifestation: { icon: '<i class="fa-solid fa-images"></i>', label: "Manifestação", callback: () => resolve("manifestation") }
      },
      close: () => resolve(state.existence.real ?? "original")
    }, { classes: ["nova-era-paradox-dialog"] }).render(true);
  });
  state.existence.real = real;
  await requestAction(actor.uuid, "set-state", { state });
  await post(actor, "Existência Simultânea", `${real === "manifestation" ? "A manifestação" : "O corpo original"} é a posição real neste turno.`);
}

async function processTurn(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const activeActor = combat.combatant?.actor;
  for (const actor of game.actors.filter(candidate => mayManage(candidate))) {
    const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
    if (state.immobileTime && state.immobileTime.turnKey !== `${combat.id}:${combat.round}:${combat.turn}`) {
      delete state.immobileTime;
      await requestAction(actor.uuid, "set-state", { state });
    }
    if (state.existence && Number(combat.round ?? 0) >= Number(state.existence.expiresRound ?? Number.MAX_SAFE_INTEGER)) {
      const manifestation = combat.scene?.tokens.find(token => token.getFlag(MODULE_ID, "paradoxManifestation") && token.getFlag(MODULE_ID, "sourceActorUuid") === actor.uuid);
      if (manifestation) await requestAction(manifestation.uuid, "delete-token");
      delete state.existence;
      await requestAction(actor.uuid, "set-state", { state });
    } else if (state.existence && activeActor?.uuid === actor.uuid) await chooseReality(actor);
  }
}

function preventUnrealTarget(user, token, targeted) {
  if (!targeted || user.id !== game.user.id) return;
  const document = token?.document ?? token;
  const isManifestation = document?.getFlag?.(MODULE_ID, "paradoxManifestation");
  const actor = isManifestation ? game.actors.get(document.actorId) : document?.actor;
  const sourceUuid = isManifestation ? document.getFlag(MODULE_ID, "sourceActorUuid") : actor?.uuid;
  const source = sourceUuid ? game.actors.get(sourceUuid.split(".").at(-1)) : null;
  const real = source?.getFlag(MODULE_ID, STATE_FLAG)?.existence?.real;
  const unreal = (isManifestation && real !== "manifestation") || (!isManifestation && real === "manifestation" && source?.uuid === actor?.uuid);
  if (!unreal) return;
  setTimeout(() => user.updateTokenTargets([...user.targets].filter(candidate => candidate.id !== token.id).map(candidate => candidate.id)), 0);
  ui.notifications.warn("Nova Era: esta existência não é a posição real e não pode ser afetada.");
}

function blockImmobileOffense(activity) {
  const actor = activity?.item?.actor;
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  if (!state.immobileTime) return;
  const hasDamage = Number(activity.damage?.parts?.length ?? activity.item?.system?.damage?.parts?.length ?? 0) > 0;
  const hasSave = Boolean(activity.save?.ability?.length || activity.item?.system?.save?.ability);
  const offensive = activity.type === "attack" || hasDamage || hasSave;
  if (!offensive) return;
  ui.notifications.warn("Nova Era: Tempo Imóvel impede causar dano, forçar resistências ou afetar diretamente outra criatura.");
  return false;
}

function sourceActorForToken(token) {
  const document = token?.document ?? token;
  if (!document) return null;
  const sourceUuid = document.getFlag?.(MODULE_ID, "sourceActorUuid");
  if (sourceUuid) return game.actors.get(String(sourceUuid).split(".").at(-1)) ?? null;
  return document.actor ?? null;
}

async function offerRealitySwap(activity) {
  if (activity?.type !== "attack") return;
  const candidates = activity.targets ? [...activity.targets] : [...(game.user.targets ?? [])];
  const actors = [...new Set(candidates.map(sourceActorForToken).filter(Boolean))];
  for (const actor of actors) {
    if (!mayManage(actor)) continue;
    const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
    const temporal = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
    if (!state.existence || temporal.reaction === false) continue;
    const swap = await Dialog.confirm({
      title: "Existência Simultânea — Reação",
      content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-arrows-rotate"></i><div><strong>${activity.item?.name ?? "Um ataque"} foi declarado contra ${actor.name}.</strong><p>Deseja gastar sua Reação Temporal e trocar qual posição é real antes do ataque?</p></div></section>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    if (!swap) continue;
    state.existence.real = state.existence.real === "manifestation" ? "original" : "manifestation";
    temporal.reaction = false;
    await requestAction(actor.uuid, "set-state", { state });
    await actor.setFlag(MODULE_ID, "chronomancerState", temporal);
    Hooks.callAll("novaEraChronomancerChanged", actor);
    await post(actor, "Existência Simultânea", `${state.existence.real === "manifestation" ? "A manifestação" : "O corpo original"} tornou-se real antes do ataque. A posição anteriormente visada não pode ser afetada.`);
  }
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== "chronomancerParadox") return;
  const document = await fromUuid(payload.uuid);
  if (document) await executeAction(document, payload.action, payload.data ?? {});
}

export function registerChronomancerParadoxAutomation() {
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
  Hooks.on("updateCombat", (combat, changed) => void processTurn(combat, changed));
  Hooks.on("targetToken", preventUnrealTarget);
  Hooks.on("preUpdateToken", validateManifestationPlacement);
  Hooks.on("dnd5e.preUseActivity", blockImmobileOffense);
  Hooks.on("dnd5e.preUseActivity", activity => void offerRealitySwap(activity));
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void resetSimultaneousExistence(actor, result, config));
}
