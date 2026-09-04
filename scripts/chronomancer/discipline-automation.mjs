import { MODULE_ID } from "../constants.mjs";

const STATE_FLAG = "chronomancerDisciplineState";
const previousCombatants = new Map();

function contentKey(entry) {
  return entry?.item?.getFlag?.(MODULE_ID, "contentKey") ?? entry?.item?.flags?.[MODULE_ID]?.contentKey ?? "";
}

function activationType(activity) {
  return activity?.activation?.type ?? activity?.item?.system?.activation?.type ?? "";
}

function mayManage(actor) {
  if (!actor?.isOwner) return false;
  const players = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return (players[0] ?? (game.user.isGM ? game.user : null))?.id === game.user.id;
}

async function executeAction(document, action, data = {}) {
  const actor = document.documentName === "Actor" ? document : document.actor;
  if (action === "update-token" && document.documentName === "Token") {
    await document.update({ x: Number(data.x), y: Number(data.y) }, { novaEraChronomancer: true });
    return true;
  }
  if (action === "update-hp" && actor) {
    const maximum = Number(actor.system?.attributes?.hp?.max ?? Number.MAX_SAFE_INTEGER);
    await actor.update({ "system.attributes.hp.value": Math.max(0, Math.min(maximum, Number(data.value))) }, { novaEraChronomancer: true });
    return true;
  }
  if (action === "set-state" && actor) {
    await actor.setFlag(MODULE_ID, STATE_FLAG, data.state ?? {});
    return true;
  }
  if (action === "no-reaction" && actor) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: data.name ?? "Lacuna Temporal",
      icon: "icons/magic/time/clock-stopwatch-white-blue.webp",
      duration: { rounds: 1, turns: 0, startRound: game.combat?.round, startTurn: game.combat?.turn },
      flags: { [MODULE_ID]: { noReaction: true } }
    }], { novaEraChronomancer: true });
    return true;
  }
  if (action === "delete-effect" && document.documentName === "ActiveEffect") {
    await document.delete({ novaEraChronomancer: true });
    return true;
  }
  if (action === "update-effect" && document.documentName === "ActiveEffect") {
    await document.update(data.change ?? {}, { novaEraChronomancer: true });
    return true;
  }
  return false;
}

async function requestAction(uuid, action, data = {}) {
  const document = uuid ? await fromUuid(uuid) : null;
  if (!document) return false;
  if (game.user.isGM || document.isOwner) return executeAction(document, action, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: "chronomancerDiscipline", uuid, action, data });
  return true;
}

async function post(actor, title, text) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era chronomancer-chat"><h2><i class="fa-solid fa-code-branch"></i> ${title}</h2><p>${text}</p></section>` });
}

async function choose(title, text, choices) {
  return new Promise(resolve => {
    new Dialog({
      title,
      content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-code-branch"></i><div><strong>${text}</strong><p>Escolha a linha temporal que permanecerá.</p></div></section>`,
      buttons: Object.fromEntries(choices.map(([key, label, icon]) => [key, { icon: `<i class="fa-solid ${icon}"></i>`, label, callback: () => resolve(key) }])),
      close: () => resolve("")
    }, { classes: ["nova-era-discipline-dialog"] }).render(true);
  });
}

function markedTarget(context, actor) {
  if (context.targetActorUuid) return context.targetActorUuid;
  return [...(game.user.targets ?? [])][0]?.actor?.uuid ?? actor.uuid;
}

async function intelligenceSave(source, target, flavor) {
  const modifier = Number(target.system?.abilities?.int?.save ?? target.system?.abilities?.int?.mod ?? 0);
  const dc = 8 + Number(source.system?.attributes?.prof ?? 0) + Number(source.system?.abilities?.int?.mod ?? 0);
  const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: target }), flavor: `${flavor} — CD ${dc}` });
  return { success: Number(roll.total) >= dc, total: Number(roll.total), dc };
}

async function resolveStep(actor, entry) {
  const speed = Number(actor.system?.attributes?.movement?.walk ?? 0);
  await post(actor, entry.item.name, `${actor.name} pode mover até <strong>${speed ? speed / 2 : "metade do deslocamento"}${speed ? "m" : ""}</strong> sem Ataques de Oportunidade e atravessar espaços ocupados como terreno difícil.`);
}

async function resolveAdvancedState(actor, entry, context) {
  const targetUuid = markedTarget(context, actor);
  const target = await fromUuid(targetUuid);
  const token = context.targetTokenUuid ? await fromUuid(context.targetTokenUuid) : target?.getActiveTokens?.()[0]?.document;
  if (!target || !token) return post(actor, entry.item.name, "Marque um aliado com token na cena para registrar sua posição temporal.");
  const state = target.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  state.advancedPosition = { sourceActorUuid: actor.uuid, x: token.x, y: token.y, tokenUuid: token.uuid, expires: `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}` };
  await requestAction(target.uuid, "set-state", { state });
  await post(actor, entry.item.name, `A posição de <strong>${target.name}</strong> foi registrada. Ao iniciar o próximo deslocamento, poderá ser reposicionado a até 3m desse ponto.`);
}

async function resolvePreventiveRupture(actor, entry, context) {
  const target = context.targetActorUuid ? await fromUuid(context.targetActorUuid) : null;
  if (!target) return post(actor, entry.item.name, "O alvo deve realizar uma resistência de Inteligência; na falha, sua Reação é gasta sem efeito.");
  const save = await intelligenceSave(actor, target, entry.item.name);
  await post(actor, entry.item.name, save.success
    ? `${target.name} resiste com ${save.total} contra CD ${save.dc}; a Reação continua.`
    : `${target.name} falha com ${save.total} contra CD ${save.dc}; a Reação é gasta sem produzir efeito.`);
}

async function resolveAnticipatedEcho(actor, entry, context) {
  const original = context.roll;
  const d20 = original?.dice?.find(die => Number(die.faces) === 20);
  const activeResult = d20?.results?.find(result => result.active !== false)?.result;
  if (!original || activeResult == null) return post(actor, entry.item.name, "Repita imediatamente a jogada com vantagem e utilize obrigatoriamente o novo resultado.");
  const modifier = Number(original.total) - Number(activeResult);
  const reroll = await new Roll("2d20kh + @modifier", { modifier }).evaluate();
  const target = context.targetActorUuid ? await fromUuid(context.targetActorUuid) : actor;
  await reroll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: target }), flavor: `${entry.item.name} — nova rolagem com vantagem; o novo resultado deve ser aceito.` });
  await post(actor, entry.item.name, `O resultado original <strong>${original.total}</strong> foi substituído por <strong>${reroll.total}</strong>.`);
}

async function resolveLateEcho(actor, entry, context) {
  const targetUuid = markedTarget(context, actor);
  const target = await fromUuid(targetUuid);
  if (!target || context.rollTotal == null) return post(actor, entry.item.name, "Registre o resultado bem-sucedido e seu tipo para utilizá-lo em uma nova jogada equivalente.");
  const state = target.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  state.lateEcho = { sourceActorUuid: actor.uuid, total: Number(context.rollTotal), rollType: context.rollType ?? "teste", turnKey: context.turnKey ?? "" };
  await requestAction(target.uuid, "set-state", { state });
  await post(actor, entry.item.name, `<strong>${context.rollTotal}</strong> foi registrado para ${target.name} em ${context.rollType ?? "uma jogada equivalente"}.`);
}

async function resolveSuspension(actor, entry, context) {
  const target = context.targetActorUuid ? await fromUuid(context.targetActorUuid) : null;
  if (!target || !Number(context.damage)) return post(actor, entry.item.name, "Role 2d8 + Inteligência e suspenda essa parcela do dano até o final do próximo turno da criatura.");
  const roll = await new Roll("2d8 + @modifier", { modifier: Number(actor.system?.abilities?.int?.mod ?? 0) }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: entry.item.name });
  const suspended = Math.max(0, Math.min(Number(context.damage), Number(roll.total)));
  const hp = Number(target.system?.attributes?.hp?.value ?? context.nextHp ?? 0);
  const state = target.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const suspendedDamage = Array.isArray(state.suspendedDamage) ? state.suspendedDamage : state.suspendedDamage ? [state.suspendedDamage] : [];
  suspendedDamage.push({ sourceActorUuid: actor.uuid, amount: suspended, waitingForTurn: true });
  state.suspendedDamage = suspendedDamage;
  await requestAction(target.uuid, "set-state", { state });
  await requestAction(target.uuid, "update-hp", { value: hp + suspended });
  await post(actor, entry.item.name, `<strong>${suspended}</strong> de dano sofrido por ${target.name} foi suspenso até o final do próximo turno da criatura.`);
}

async function resolveGap(actor, entry, context) {
  const targetUuid = markedTarget(context, actor);
  const target = await fromUuid(targetUuid);
  await requestAction(targetUuid, "no-reaction", { name: entry.item.name });
  await post(actor, entry.item.name, `<strong>${target?.name ?? "A criatura"}</strong> não pode realizar Reações até o início do próximo turno dela.`);
}

async function resolveRestoredLine(actor, entry, context) {
  const snapshot = context.snapshot;
  const target = context.targetActorUuid ? await fromUuid(context.targetActorUuid) : null;
  if (!target || !snapshot) return post(actor, entry.item.name, "Escolha restaurar a posição inicial, PV perdidos no turno ou uma condição adquirida durante o turno.");
  const gainedConditions = target.effects.filter(effect => !snapshot.effectIds?.includes(effect.id));
  const selected = await choose(entry.item.name, `Restaure uma propriedade de ${target.name}`, [
    ["position", "Posição inicial", "fa-location-dot"],
    ["hp", `PV perdidos (${Math.max(0, snapshot.hp - Number(target.system?.attributes?.hp?.value ?? 0))})`, "fa-heart"],
    ...gainedConditions.slice(0, 4).map(effect => [`condition:${effect.id}`, `Remover ${effect.name}`, "fa-shield-heart"])
  ]);
  if (selected === "position" && snapshot.tokenUuid) await requestAction(snapshot.tokenUuid, "update-token", { x: snapshot.x, y: snapshot.y });
  else if (selected === "hp") {
    const roll = await new Roll("2d8 + @modifier", { modifier: Number(actor.system?.abilities?.int?.mod ?? 0) }).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: entry.item.name });
    const currentHp = Number(target.system?.attributes?.hp?.value ?? 0);
    await requestAction(target.uuid, "update-hp", { value: Math.min(snapshot.hp, currentHp + Number(roll.total)) });
  } else if (selected.startsWith("condition:")) {
    const effect = gainedConditions.find(candidate => candidate.id === selected.slice(10));
    if (effect) await requestAction(effect.uuid, "delete-effect");
  }
  if (selected) await post(actor, entry.item.name, `${target.name} teve sua <strong>${selected === "position" ? "posição" : selected === "hp" ? "linha de vitalidade" : "condição"}</strong> restaurada.`);
}

async function resolveFracturedEcho(actor, entry, context) {
  if (context.originalTotal == null || context.newTotal == null) return post(actor, entry.item.name, "Escolha entre o resultado original e a nova rolagem de Cronomancia.");
  const selected = await choose(entry.item.name, `Original ${context.originalTotal} • Novo ${context.newTotal}`, [["original", `Manter ${context.originalTotal}`, "fa-rotate-left"], ["new", `Usar ${context.newTotal}`, "fa-rotate-right"]]);
  if (selected) await post(actor, entry.item.name, `O resultado que permanece é <strong>${selected === "original" ? context.originalTotal : context.newTotal}</strong>.`);
}

export async function resolveChronomancerDiscipline(actor, entry, context = {}) {
  const key = contentKey(entry);
  if (key === "crono-intervencao-passo-intersticial") await resolveStep(actor, entry);
  else if (key === "crono-intervencao-eco-antecipado") await resolveAnticipatedEcho(actor, entry, context);
  else if (key === "crono-intervencao-estado-adiantado") await resolveAdvancedState(actor, entry, context);
  else if (key === "crono-intervencao-ruptura-preventiva") await resolvePreventiveRupture(actor, entry, context);
  else if (key === "crono-intervencao-eco-tardio") await resolveLateEcho(actor, entry, context);
  else if (key === "crono-intervencao-suspensao-temporal") await resolveSuspension(actor, entry, context);
  else if (key === "crono-intervencao-lacuna-temporal") await resolveGap(actor, entry, context);
  else if (key === "crono-intervencao-linha-restaurada") await resolveRestoredLine(actor, entry, context);
  else if (key === "crono-intervencao-eco-fraturado") await resolveFracturedEcho(actor, entry, context);
  else if (key === "crono-intervencao-continuidade-quebrada") {
    if (context.effectUuid && context.previousDuration) await requestAction(context.effectUuid, "update-effect", { change: { duration: context.previousDuration } });
    await post(actor, entry.item.name, `<strong>${context.effectName ?? "O efeito"}</strong> mantém seu término original e não pode ser renovado ou reaplicado pela mesma fonte até o início do próximo turno da criatura.`);
  }
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== "chronomancerDiscipline") return;
  const document = await fromUuid(payload.uuid);
  if (document) await executeAction(document, payload.action, payload.data ?? {});
}

function blockReaction(activity) {
  if (!/reaction/i.test(activationType(activity))) return;
  const actor = activity?.item?.actor;
  if (!actor?.effects?.some(effect => effect.getFlag(MODULE_ID, "noReaction"))) return;
  ui.notifications.warn(`Nova Era: ${actor.name} está preso em uma Lacuna Temporal e não pode realizar Reações.`);
  return false;
}

async function offerAdvancedPosition(token, change, options) {
  if (options?.novaEraChronomancer || !("x" in change || "y" in change) || !token.actor || !mayManage(token.actor)) return;
  const state = token.actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const advance = state.advancedPosition;
  if (!advance || advance.tokenUuid !== token.uuid) return;
  const use = await Dialog.confirm({
    title: "Estado Adiantado",
    content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-forward"></i><div><strong>${token.name} iniciou um deslocamento</strong><p>Deseja retornar primeiro à posição temporal registrada e então realizar o movimento normalmente?</p></div></section>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });
  if (!use) return;
  await requestAction(token.uuid, "update-token", { x: advance.x, y: advance.y });
  delete state.advancedPosition;
  await requestAction(token.actor.uuid, "set-state", { state });
}

async function offerLateEcho(rolls, data = {}, rollType) {
  const roll = rolls?.[0] ?? rolls;
  const actor = data.subject?.actor ?? data.subject ?? data.actor;
  if (!actor || !roll || !mayManage(actor)) return;
  const state = actor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const echo = state.lateEcho;
  if (!echo || echo.rollType !== rollType) return;
  const use = await Dialog.confirm({
    title: "Eco Tardio",
    content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-repeat"></i><div><strong>Resultado registrado: ${echo.total}</strong><p>A nova rolagem totalizou ${roll.total}. Deseja substituir pelo resultado preservado?</p></div></section>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });
  if (!use) return;
  delete state.lateEcho;
  await requestAction(actor.uuid, "set-state", { state });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era chronomancer-chat"><h2>Eco Tardio</h2><p>O resultado da jogada é substituído por <strong>${echo.total}</strong>.</p></section>` });
}

async function resolveDeferredDamage(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const previousId = previousCombatants.get(combat.id);
  const previousActor = combat.combatants.get(previousId)?.actor;
  if (previousActor && mayManage(previousActor)) {
    const previousState = previousActor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
    const suspendedDamage = Array.isArray(previousState.suspendedDamage) ? previousState.suspendedDamage : previousState.suspendedDamage ? [previousState.suspendedDamage] : [];
    const due = suspendedDamage.filter(entry => entry.waitingForTurn === false);
    if (due.length) {
      const amount = due.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
      const hp = Number(previousActor.system?.attributes?.hp?.value ?? 0);
      const waiting = suspendedDamage.filter(entry => entry.waitingForTurn !== false);
      if (waiting.length) previousState.suspendedDamage = waiting;
      else delete previousState.suspendedDamage;
      await requestAction(previousActor.uuid, "set-state", { state: previousState });
      await requestAction(previousActor.uuid, "update-hp", { value: hp - amount });
      await ChatMessage.create({ content: `<section class="nova-era chronomancer-chat"><h2>Suspensão Temporal</h2><p>O tempo cobra <strong>${amount} de dano suspenso</strong> de ${previousActor.name} ao final do turno.</p></section>` });
    }
  }
  const currentActor = combat.combatant?.actor;
  if (!currentActor) return;
  const state = currentActor.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const suspendedDamage = Array.isArray(state.suspendedDamage) ? state.suspendedDamage : state.suspendedDamage ? [state.suspendedDamage] : [];
  if (suspendedDamage.some(entry => entry.waitingForTurn) && mayManage(currentActor)) {
    state.suspendedDamage = suspendedDamage.map(entry => ({ ...entry, waitingForTurn: false }));
    await requestAction(currentActor.uuid, "set-state", { state });
  }
  previousCombatants.set(combat.id, combat.combatant.id);
}

export function registerChronomancerDisciplineAutomation() {
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
  Hooks.on("dnd5e.preUseActivity", blockReaction);
  Hooks.on("updateToken", (token, change, options) => void offerAdvancedPosition(token, change, options));
  Hooks.on("dnd5e.postRollAbilityCheck", (rolls, data) => void offerLateEcho(rolls, data, "teste de atributo"));
  Hooks.on("dnd5e.postRollSavingThrow", (rolls, data) => void offerLateEcho(rolls, data, "resistência"));
  Hooks.on("updateCombat", (combat, changed) => void resolveDeferredDamage(combat, changed));
  Hooks.on("deleteCombat", combat => previousCombatants.delete(combat.id));
}
