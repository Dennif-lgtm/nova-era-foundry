import { MODULE_ID } from "../constants.mjs";
import { ExposureStore } from "../exposure/exposure-store.mjs";

const ICON = "icons/svg/aura.svg";

function hasFeature(actor, key) {
  return actor?.items?.some(item => item.getFlag(MODULE_ID, "contentKey") === key);
}

function turnKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : `free:${foundry.utils.randomID()}`;
}

function roundKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}:${combat.round}` : null;
}

function firstRoll(result) {
  return Array.isArray(result) ? result[0] : result;
}

function selectedActor() {
  const controlled = canvas.tokens?.controlled ?? [];
  return controlled.length === 1 ? controlled[0].actor : game.user.character;
}

function selectedTarget() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0].actor : null;
}

async function card(actor, title, body) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<section class="nova-era exposure-card"><header>${title}</header><p>${body}</p></section>`
  });
}

async function effect(actor, source) {
  const key = source.flags[MODULE_ID].subclassEffect;
  const previous = actor.effects.find(entry => entry.getFlag(MODULE_ID, "subclassEffect") === key);
  if (previous) await actor.deleteEmbeddedDocuments("ActiveEffect", [previous.id]);
  return actor.createEmbeddedDocuments("ActiveEffect", [source]);
}

function requireActors(actor, target, feature) {
  if (!actor || !target || !hasFeature(actor, feature)) {
    ui.notifications.warn("Nova Era: selecione o Ladino e exatamente um alvo válido.");
    return false;
  }
  return true;
}

export async function useUnreachablePresence(actor = selectedActor(), target = selectedTarget()) {
  if (!requireActors(actor, target, "presenca-inalcancavel") || ExposureStore.get(target, actor) < 1) return;
  await card(actor, "Presença Inalcançável", `${target.name} errou o ataque. Use sua Reação para mover até metade do deslocamento sem provocar ataque de oportunidade dela. Ao terminar em posição válida, você pode realizar Hide.`);
}

export async function useFade(actor = selectedActor(), target = selectedTarget()) {
  if (!requireActors(actor, target, "desvanecer") || ExposureStore.get(target, actor) < 1) return;
  const current = roundKey();
  if (current && actor.getFlag(MODULE_ID, "fadeRound") === current) {
    ui.notifications.warn("Nova Era: Desvanecer já foi usado nesta rodada.");
    return;
  }
  const roll = await actor.rollSkill({ skill: "ste" });
  if (!roll) return;
  if (current) await actor.setFlag(MODULE_ID, "fadeRound", current);
  await effect(actor, {
    name: `Desvanecer — invisível para ${target.name}`,
    img: ICON,
    disabled: false,
    duration: { rounds: 1 },
    flags: { [MODULE_ID]: { subclassEffect: "fade", targetActorUuid: target.uuid } }
  });
  await card(actor, "Desvanecer", `Furtividade: <strong>${Array.isArray(roll) ? roll[0]?.total : roll.total}</strong>. Em sucesso contra ${target.name}, trate o Ladino como Invisível apenas para essa criatura até o início do próximo turno ou até revelar sua posição.`);
}

export async function toggleGhostForm(actor = selectedActor()) {
  if (!actor || !hasFeature(actor, "forma-fantasma")) return ui.notifications.warn("Nova Era: o Ladino não possui Forma Fantasma.");
  const active = actor.effects.find(entry => entry.getFlag(MODULE_ID, "subclassEffect") === "ghostForm");
  if (active) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", [active.id]);
    return card(actor, "Forma Fantasma", "Forma Fantasma encerrada.");
  }
  if (actor.getFlag(MODULE_ID, "ghostFormUsed")) return ui.notifications.warn("Nova Era: Forma Fantasma recupera após Descanso Longo.");
  await actor.setFlag(MODULE_ID, "ghostFormUsed", true);
  await effect(actor, {
    name: "Forma Fantasma — Nova Era",
    img: ICON,
    disabled: false,
    duration: { rounds: 10 },
    flags: { [MODULE_ID]: { subclassEffect: "ghostForm" } }
  });
  await card(actor, "Forma Fantasma", "Ativa por 1 minuto: Ponto Morto, Sem Rastro, Nunca Esteve Aqui e Ausência estão disponíveis.");
}

function breachDice(actor) {
  const patience = actor.getFlag(MODULE_ID, "mortalPatience");
  if (patience && hasFeature(actor, "execucao-perfeita")) return 3;
  if (patience && hasFeature(actor, "paciencia-mortal")) return 2;
  return 1;
}

export async function prepareMortalPatience(actor = selectedActor(), target = selectedTarget()) {
  if (!requireActors(actor, target, "paciencia-mortal") || ExposureStore.get(target, actor) !== 3) return;
  await actor.setFlag(MODULE_ID, "mortalPatience", { targetActorUuid: target.uuid, expiresTurn: turnKey() });
  await card(actor, "Paciência Mortal", `Preparada contra ${target.name}. Mantenha as 3 Exposições e não cause dano ao alvo neste turno; a preparação vale até o fim do próximo turno.`);
  Hooks.callAll("novaEraSubclassChanged", { actor, target });
}

async function executeMortalBreach(actor, target, amount = 1) {
  if (!requireActors(actor, target, "brecha-mortal")) return;
  const last = actor.getFlag(MODULE_ID, "lastSneakAttack");
  if (!last || last.targetActorUuid !== target.uuid || last.turn !== (game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null)) {
    return ui.notifications.warn("Nova Era: use Brecha Mortal após o Ataque Furtivo do turno contra o alvo selecionado.");
  }
  const cost = Math.clamp(Number(amount) || 1, 1, 2);
  if (!(await ExposureStore.consume(target, actor, cost))) return;
  const perExposure = breachDice(actor);
  const roll = await new Roll(`${cost * perExposure}d6`, actor.getRollData()).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Brecha Mortal — ${cost} Exposição(ões) contra ${target.name}` });
  const dc = 8 + Number(actor.system.attributes?.prof ?? 0) + Number(actor.system.abilities?.dex?.mod ?? 0);
  const save = firstRoll(await target.rollSavingThrow({ ability: "con" }));
  if (save && save.total < dc) {
    await effect(target, {
      name: `Ferida Profunda — ${actor.name}`,
      img: "icons/svg/blood.svg",
      disabled: false,
      duration: { rounds: 1 },
      flags: { [MODULE_ID]: { subclassEffect: "deepWound", sourceActorUuid: actor.uuid, appliedTurn: turnKey() } }
    });
    await card(actor, "Ferida Profunda", `${target.name} obteve <strong>${save.total}</strong> contra CD <strong>${dc}</strong> e não pode recuperar PV até o início do próximo turno do Ladino.`);
  } else if (save) {
    await card(actor, "Ferida Profunda", `${target.name} obteve <strong>${save.total}</strong> contra CD <strong>${dc}</strong> e resistiu ao efeito.`);
  }
  if (actor.getFlag(MODULE_ID, "mortalPatience")) await actor.unsetFlag(MODULE_ID, "mortalPatience");
  Hooks.callAll("novaEraSubclassChanged", { actor, target });
}

export async function useMortalBreach(actor = selectedActor(), target = selectedTarget(), amount = 1) {
  if (!actor || !target) return ui.notifications.warn("Nova Era: selecione o Ladino e exatamente um alvo válido.");
  if (game.user.isGM || target.isOwner) return executeMortalBreach(actor, target, amount);
  game.socket.emit(`module.${MODULE_ID}`, {
    type: "subclassFeature",
    feature: "mortalBreach",
    sourceActorUuid: actor.uuid,
    targetActorUuid: target.uuid,
    amount
  });
}

export async function choosePrey(actor = selectedActor(), target = selectedTarget()) {
  if (!requireActors(actor, target, "instinto-caca") || ExposureStore.get(target, actor) < 1) return;
  await actor.setFlag(MODULE_ID, "trackerPrey", target.uuid);
  const pressure = Math.min(1, ExposureStore.get(target, actor));
  await actor.setFlag(MODULE_ID, "trackerPressure", pressure);
  await actor.setFlag(MODULE_ID, "trackerLastExposure", ExposureStore.get(target, actor));
  await card(actor, "Instinto de Caça", `${target.name} tornou-se sua Presa. Pressão atual: <strong>${pressure}</strong>.`);
  Hooks.callAll("novaEraSubclassChanged", { actor, target });
}

export async function abandonPrey(actor = selectedActor()) {
  if (!actor) return;
  await actor.unsetFlag(MODULE_ID, "trackerPrey");
  await actor.unsetFlag(MODULE_ID, "trackerPressure");
  await actor.unsetFlag(MODULE_ID, "trackerLastExposure");
  await card(actor, "Caçada Encerrada", "A Presa e toda a Pressão foram removidas.");
  Hooks.callAll("novaEraSubclassChanged", { actor });
}

export function trackerState(actor = selectedActor(), target = selectedTarget()) {
  const preyUuid = actor?.getFlag(MODULE_ID, "trackerPrey");
  return {
    isPrey: !!actor && !!target && preyUuid === target.uuid,
    pressure: Number(actor?.getFlag(MODULE_ID, "trackerPressure") ?? 0)
  };
}

export async function usePressureDamage(actor = selectedActor(), target = selectedTarget()) {
  const state = trackerState(actor, target);
  if (!actor || !target || !state.isPrey || state.pressure < 1) return ui.notifications.warn("Nova Era: selecione sua Presa com Pressão ativa.");
  const current = game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
  if (current && actor.getFlag(MODULE_ID, "pressureDamageTurn") === current) return ui.notifications.warn("Nova Era: o dano de Pressão já foi usado neste turno.");
  const rhythm = state.pressure === 3 && ExposureStore.get(target, actor) === 3 && hasFeature(actor, "ritmo-caca");
  const dice = rhythm && hasFeature(actor, "predador-implacavel") ? 4 : state.pressure;
  if (current) await actor.setFlag(MODULE_ID, "pressureDamageTurn", current);
  const roll = await new Roll(`${dice}d6`, actor.getRollData()).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Pressão da Caçada ${state.pressure} — ${target.name}` });
  await actor.setFlag(MODULE_ID, "pressureMaintainedTurn", current ?? turnKey());
  Hooks.callAll("novaEraSubclassChanged", { actor, target });
}

export async function usePersistentHunt(actor = selectedActor(), target = selectedTarget()) {
  const state = trackerState(actor, target);
  if (!state.isPrey || !hasFeature(actor, "cacada-persistente")) return ui.notifications.warn("Nova Era: selecione sua Presa e confirme que possui Caçada Persistente.");
  const full = hasFeature(actor, "ritmo-caca") && state.pressure === 3 && ExposureStore.get(target, actor) === 3;
  await actor.setFlag(MODULE_ID, "persistentHuntRound", roundKey() ?? turnKey());
  await actor.setFlag(MODULE_ID, "pressureMaintainedTurn", actor.getFlag(MODULE_ID, "trackerActiveTurn") ?? turnKey());
  await card(actor, "Caçada Persistente", `Mova até <strong>${full ? "todo o seu deslocamento" : "metade do seu deslocamento"}</strong> em direção a ${target.name}, sem provocar ataque de oportunidade dela.`);
  Hooks.callAll("novaEraSubclassChanged", { actor, target });
}

export async function maintainPressure(actor = selectedActor(), target = selectedTarget()) {
  const state = trackerState(actor, target);
  if (!state.isPrey || state.pressure < 1) return ui.notifications.warn("Nova Era: selecione sua Presa com Pressão ativa.");
  const activeTurn = actor.getFlag(MODULE_ID, "trackerActiveTurn") ?? turnKey();
  await actor.setFlag(MODULE_ID, "pressureMaintainedTurn", activeTurn);
  await card(actor, "Pressão Ininterrupta", `Pressão mantida contra ${target.name}. Confirme uma condição válida: rastreamento bem-sucedido, distância de até 3m ou uso de Caçada Persistente.`);
}

export async function recycleExposure(actor = selectedActor(), target = selectedTarget()) {
  const state = trackerState(actor, target);
  if (!state.isPrey || !hasFeature(actor, "predador-implacavel") || !actor.getFlag(MODULE_ID, "trackerRecycleAvailable")) {
    return ui.notifications.warn("Nova Era: Leitura Incansável não possui uma Exposição elegível para recuperar.");
  }
  await ExposureStore.add(target, actor, 1);
  await actor.unsetFlag(MODULE_ID, "trackerRecycleAvailable");
  await actor.setFlag(MODULE_ID, "trackerLastExposure", ExposureStore.get(target, actor));
  await card(actor, "Leitura Incansável", `1 Exposição contra ${target.name} foi recuperada. Ela não conta como uma nova Exposição para aumentar Pressão.`);
}

async function updateTrackerPressure({ sourceActor, targetActor, value }) {
  if (!hasFeature(sourceActor, "instinto-caca") || sourceActor.getFlag(MODULE_ID, "trackerPrey") !== targetActor.uuid) return;
  const previousExposure = Number(sourceActor.getFlag(MODULE_ID, "trackerLastExposure") ?? 0);
  let pressure = Number(sourceActor.getFlag(MODULE_ID, "trackerPressure") ?? 0);
  if (value > previousExposure) pressure += 1;
  if (value < previousExposure && hasFeature(sourceActor, "predador-implacavel") && pressure === 3 && previousExposure === 3) {
    await sourceActor.setFlag(MODULE_ID, "trackerRecycleAvailable", true);
  }
  pressure = Math.clamp(pressure, 0, value);
  await sourceActor.setFlag(MODULE_ID, "trackerLastExposure", value);
  await sourceActor.setFlag(MODULE_ID, "trackerPressure", pressure);
  Hooks.callAll("novaEraSubclassChanged", { actor: sourceActor, target: targetActor });
}

async function updateTrackerTurns(combat) {
  if (!combat?.started) return;
  const current = `${combat.id}:${combat.round}:${combat.turn}`;
  const activeActor = combat.combatant?.actor;
  if (activeActor) {
    for (const target of game.actors) {
      const expired = target.effects.filter(entry => {
        const sourceUuid = entry.getFlag(MODULE_ID, "sourceActorUuid");
        const appliedTurn = entry.getFlag(MODULE_ID, "appliedTurn");
        return entry.getFlag(MODULE_ID, "subclassEffect") === "deepWound"
          && sourceUuid === activeActor.uuid && appliedTurn !== current;
      });
      if (expired.length) await target.deleteEmbeddedDocuments("ActiveEffect", expired.map(entry => entry.id));
    }
  }
  for (const actor of game.actors.filter(entry => hasFeature(entry, "instinto-caca"))) {
    const trackedTurn = actor.getFlag(MODULE_ID, "trackerActiveTurn");
    if (trackedTurn && trackedTurn !== current) {
      if (actor.getFlag(MODULE_ID, "pressureMaintainedTurn") !== trackedTurn) {
        const pressure = Math.max(0, Number(actor.getFlag(MODULE_ID, "trackerPressure") ?? 0) - 1);
        await actor.setFlag(MODULE_ID, "trackerPressure", pressure);
        if (pressure > 0) ui.notifications.info(`${actor.name}: Pressão reduzida para ${pressure}.`);
      }
      await actor.unsetFlag(MODULE_ID, "trackerActiveTurn");
      await actor.unsetFlag(MODULE_ID, "trackerRecycleAvailable");
    }
    if (activeActor?.uuid === actor.uuid && actor.getFlag(MODULE_ID, "trackerActiveTurn") !== current) {
      await actor.setFlag(MODULE_ID, "trackerActiveTurn", current);
    }
  }
  Hooks.callAll("novaEraSubclassChanged", { actor: activeActor });
}

function blockDeepWoundHealing(actor, changed) {
  const wounded = actor.effects.some(entry => entry.getFlag(MODULE_ID, "subclassEffect") === "deepWound");
  if (!wounded) return true;
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  const current = Number(actor.system.attributes?.hp?.value ?? 0);
  if (next == null || Number(next) <= current) return true;
  ui.notifications.warn(`Nova Era: Ferida Profunda impede ${actor.name} de recuperar pontos de vida.`);
  return false;
}

async function resetLongRest(actor, result, config) {
  const recovered = result?.longRest === true || config?.type === "long";
  if (!actor || !recovered) return;
  await actor.unsetFlag(MODULE_ID, "ghostFormUsed");
  await actor.unsetFlag(MODULE_ID, "mortalPatience");
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== "subclassFeature") return;
  const actor = await fromUuid(payload.sourceActorUuid);
  const target = await fromUuid(payload.targetActorUuid);
  if (actor && target && payload.feature === "mortalBreach") await executeMortalBreach(actor, target, payload.amount);
}

export function registerSubclassAutomation() {
  Hooks.on("novaEraExposureChanged", data => void updateTrackerPressure(data));
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void resetLongRest(actor, result, config));
  Hooks.on("updateCombat", combat => void updateTrackerTurns(combat));
  Hooks.on("preUpdateActor", blockDeepWoundHealing);
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
}

export const subclassMacroApi = {
  unreachablePresence: useUnreachablePresence,
  fade: useFade,
  ghostForm: toggleGhostForm,
  mortalBreachOne: (actor, target) => useMortalBreach(actor ?? selectedActor(), target ?? selectedTarget(), 1),
  mortalBreachTwo: (actor, target) => useMortalBreach(actor ?? selectedActor(), target ?? selectedTarget(), 2),
  mortalPatience: prepareMortalPatience,
  choosePrey,
  abandonPrey,
  pressureDamage: usePressureDamage,
  persistentHunt: usePersistentHunt,
  maintainPressure,
  recycleExposure
};
