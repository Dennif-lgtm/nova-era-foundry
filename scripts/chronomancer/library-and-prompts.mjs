import { MODULE_ID } from "../constants.mjs";
import { CHRONOMANCER_INTERVENTIONS } from "../content/chronomancer-data.mjs";
import { activateChronomancerIntervention, chronomancerInterventionData, chronomancerState, updateChronomancerState } from "../ui/chronomancer-panel.mjs";

const LEVEL_CHOICES = [
  { level: 1, category: "Fundamento", count: 2 },
  { level: 2, category: "Fundamento", count: 1 },
  { level: 5, category: "Fundamento", count: 1 },
  { level: 9, category: "Fundamento", count: 1 },
  { level: 11, category: "Disciplina", count: 1 },
  { level: 17, category: "Grande Teoria", count: 1 },
  { level: 20, category: "Paradoxo", count: 1 }
];

const previousLevels = new Map();
const openLibraryDialogs = new Set();
const offeredEvents = new Set();
const movedCombatants = new Set();
const previousCombatants = new Map();
const previousHitPoints = new Map();

function isChronomancerClass(item) {
  return item?.type === "class" && (item.system?.identifier === "cronomante-nova-era" || item.getFlag(MODULE_ID, "contentKey") === "cronomante");
}

function ownedChronomancer(actor) {
  return actor?.type === "character" && actor.items?.some(isChronomancerClass);
}

function classLevel(actor) {
  return Number(actor.items.find(isChronomancerClass)?.system?.levels ?? 0);
}

function contentKey(document) {
  return document?.getFlag?.(MODULE_ID, "contentKey") ?? document?.flags?.[MODULE_ID]?.contentKey ?? "";
}

function interventionCategory(source) {
  const group = source.group ?? source.flags?.[MODULE_ID]?.group ?? "";
  if (group.includes("Grande Teoria")) return "Grande Teoria";
  if (group.includes("Disciplina")) return "Disciplina";
  if (group.includes("Paradoxo")) return "Paradoxo";
  if (group.includes("Fundamento")) return "Fundamento";
  return chronomancerInterventionData(source).category;
}

function knownKeys(actor) {
  return new Set(actor.items.map(contentKey).filter(Boolean));
}

function entitlement(level, category) {
  return LEVEL_CHOICES.filter(entry => entry.level <= level && entry.category === category).reduce((sum, entry) => sum + entry.count, 0);
}

function knownCount(actor, category) {
  return actor.items.filter(item => contentKey(item).startsWith("crono-intervencao-") && chronomancerInterventionData(item).category === category).length;
}

function pendingCategories(actor) {
  const level = classLevel(actor);
  return ["Fundamento", "Disciplina", "Grande Teoria", "Paradoxo"].flatMap(category =>
    Array(Math.max(0, entitlement(level, category) - knownCount(actor, category))).fill(category)
  );
}

function activeResponsibleUser(actor) {
  const players = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER"));
  return players.sort((a, b) => a.id.localeCompare(b.id))[0] ?? (game.user.isGM ? game.user : null);
}

function mayPrompt(actor) {
  return actor?.isOwner && activeResponsibleUser(actor)?.id === game.user.id;
}

function sourceFor(entry) {
  return {
    name: entry.name,
    type: "feat",
    img: "icons/magic/time/clock-spinning-gold-pink.webp",
    system: {
      description: { value: entry.description, chat: "" }
    },
    flags: { [MODULE_ID]: { contentKey: entry.key, level: 0, group: entry.group, contentVersion: "library-choice-1" } }
  };
}

function stripHtml(value) {
  const node = document.createElement("div");
  node.innerHTML = value ?? "";
  return node.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

async function chooseLibraryEntry(actor, category) {
  const candidates = CHRONOMANCER_INTERVENTIONS.filter(entry => interventionCategory(entry) === category && !knownKeys(actor).has(entry.key));
  if (!candidates.length) return ui.notifications.info(`Nova Era: não há novas Intervenções de ${category} disponíveis.`);
  const dialogKey = `${actor.uuid}:${category}`;
  if (openLibraryDialogs.has(dialogKey)) return;
  openLibraryDialogs.add(dialogKey);
  let added = false;
  await new Promise(resolve => {
    const rows = candidates.map((entry, index) => {
      const data = chronomancerInterventionData(entry);
      return `<label class="ne-library-choice"><input type="radio" name="intervention" value="${entry.key}" ${index === 0 ? "checked" : ""}><span><strong>${entry.name}</strong><small>${data.laws.join(" + ")} • ${data.cost} PT • ${data.execution}</small><em>${stripHtml(entry.description).slice(0, 210)}</em></span></label>`;
    }).join("");
    new Dialog({
      title: `Biblioteca Pessoal — ${category}`,
      content: `<form class="nova-era ne-library-dialog"><header><i class="fa-solid fa-book-open"></i><div><strong>Escolha uma nova Intervenção</strong><small>${actor.name} conquistou uma entrada de ${category}.</small></div></header><div class="ne-library-options">${rows}</div></form>`,
      buttons: {
        add: { icon: '<i class="fa-solid fa-plus"></i>', label: "Adicionar à ficha", callback: async html => {
          const root = html?.[0] ?? html;
          const key = root.querySelector('input[name="intervention"]:checked')?.value;
          const entry = CHRONOMANCER_INTERVENTIONS.find(option => option.key === key);
          if (!entry || knownKeys(actor).has(entry.key)) return;
          await actor.createEmbeddedDocuments("Item", [sourceFor(entry)]);
          added = true;
          ui.notifications.info(`Nova Era: ${entry.name} foi adicionada à Biblioteca de ${actor.name}.`);
        }},
        later: { icon: '<i class="fa-solid fa-hourglass"></i>', label: "Escolher depois" }
      },
      default: "add",
      close: resolve
    }, { width: 640, classes: ["nova-era-library-window"] }).render(true);
  });
  openLibraryDialogs.delete(dialogKey);
  if (added && pendingCategories(actor).length) setTimeout(() => void offerPendingLibraryChoice(actor), 250);
}

export async function offerPendingLibraryChoice(actor) {
  if (!ownedChronomancer(actor) || !mayPrompt(actor)) return;
  const category = pendingCategories(actor)[0];
  if (category) await chooseLibraryEntry(actor, category);
}

function reactionEntry(actor, key) {
  const item = actor.items.find(entry => contentKey(entry) === key);
  return item ? { item, ...chronomancerInterventionData(item) } : null;
}

async function askToUse(actor, entry, trigger, eventKey) {
  if (!entry || !mayPrompt(actor)) return;
  const current = chronomancerState(actor);
  if (!current.reaction || current.points < entry.cost) return;
  const unique = `${game.user.id}:${actor.uuid}:${entry.item.id}:${eventKey}`;
  if (offeredEvents.has(unique)) return;
  offeredEvents.add(unique);
  setTimeout(() => offeredEvents.delete(unique), 15000);
  const use = await Dialog.confirm({
    title: `${entry.item.name} está disponível`,
    content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-hourglass-half"></i><div><strong>${trigger}</strong><p>${entry.cost} PT • ${entry.execution}</p><p>Deseja usar <b>${entry.item.name}</b> agora?</p></div></section>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });
  if (use) await activateChronomancerIntervention(actor, entry);
}

function visibleDistance(observer, subject) {
  const a = observer.getActiveTokens?.()[0];
  const b = subject?.token?.object ?? subject?.getActiveTokens?.()[0];
  if (!a || !b || b.document?.hidden) return null;
  try { return canvas.grid.measurePath([a.center, b.center]).distance; } catch { return null; }
}

function isAlly(left, right) {
  if (left === right) return true;
  const leftToken = left?.getActiveTokens?.()[0]?.document;
  const rightToken = right?.token ?? right?.getActiveTokens?.()[0]?.document;
  if (leftToken && rightToken) return Number(leftToken.disposition) === Number(rightToken.disposition);
  return Boolean(left?.hasPlayerOwner && right?.hasPlayerOwner);
}

function inRange(observer, subject, maximum) {
  const distance = visibleDistance(observer, subject);
  return distance !== null && distance <= maximum ? distance : null;
}

async function offerKnown(actor, key, trigger, eventKey) {
  await askToUse(actor, reactionEntry(actor, key), trigger, eventKey);
}

async function promptTurnStart(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const combatant = combat.combatant;
  if (!combatant?.actor) return;
  const eventKey = `${combat.id}:${combat.round}:${combat.turn}:turn-start`;
  const previousId = previousCombatants.get(combat.id);
  const previous = combat.combatants.get(previousId);
  for (const actor of game.actors.filter(ownedChronomancer)) {
    if (!mayPrompt(actor)) continue;
    const distance = visibleDistance(actor, combatant.actor);
    if (distance !== null && distance <= 9) await offerKnown(actor, "crono-intervencao-acelerar", `${combatant.name} iniciou o turno a ${Math.round(distance)}m.`, eventKey);
    if (isAlly(actor, combatant.actor) && inRange(actor, combatant.actor, 9) !== null) await offerKnown(actor, "crono-intervencao-linha-alternativa", `${combatant.name} iniciou o turno.`, `${eventKey}:linha`);
    if (previous?.actor && isAlly(actor, previous.actor) && inRange(actor, previous.actor, 9) !== null) {
      const endKey = `${combat.id}:${previousId}:${combat.round}:${combat.turn}:turn-end`;
      if (movedCombatants.has(`${combat.id}:${previousId}`)) await offerKnown(actor, "crono-intervencao-reverberacao", `${previous.name} terminou um turno no qual se deslocou.`, `${endKey}:reverberacao`);
      await offerKnown(actor, "crono-intervencao-linha-restaurada", `${previous.name} terminou o turno.`, `${endKey}:restaurada`);
    }
  }
  if (previousId) movedCombatants.delete(`${combat.id}:${previousId}`);
  previousCombatants.set(combat.id, combatant.id);
}

async function promptActivityStart(activity) {
  const attacker = activity?.item?.actor;
  if (!attacker) return;
  const targets = [...(game.user.targets ?? [])].map(token => token.actor).filter(Boolean);
  const eventKey = `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}:${activity.item.uuid}:${Date.now()}`;
  if (activity.type === "attack") {
    for (const target of targets) {
      if (!ownedChronomancer(target) || !mayPrompt(target)) continue;
      const reflexes = target.items.find(entry => contentKey(entry) === "crono-reflexos-temporais");
      if (reflexes) await askToUse(target, { item: reflexes, cost: 2, execution: "Reação", laws: [], category: "Característica", range: "Pessoal" }, `${attacker.name} declarou um ataque contra você.`, `${eventKey}:reflexos`);
    }
  }
  for (const actor of game.actors.filter(ownedChronomancer)) {
    if (!mayPrompt(actor) || inRange(actor, attacker, 18) === null) continue;
    await offerKnown(actor, "crono-intervencao-horizonte-congelado", `${attacker.name} começou a resolver ${activity.item.name}.`, `${eventKey}:horizonte`);
  }
}

async function promptActivityEnd(activity) {
  const origin = activity?.item?.actor;
  if (!origin) return;
  const eventKey = `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}:${activity.item.uuid}:action-end`;
  for (const actor of game.actors.filter(ownedChronomancer)) {
    if (!mayPrompt(actor) || isAlly(actor, origin) || inRange(actor, origin, 9) === null) continue;
    await offerKnown(actor, "crono-intervencao-lacuna-temporal", `${origin.name} terminou uma ação.`, eventKey);
  }
}

function trackMovement(token, change) {
  if (!("x" in change || "y" in change) || !game.combat?.started) return;
  const combatant = game.combat.combatants.find(entry => entry.tokenId === token.id && entry.sceneId === token.parent?.id);
  if (combatant?.id === game.combat.combatant?.id) movedCombatants.add(`${game.combat.id}:${combatant.id}`);
}

function rememberHitPoints(actor, change) {
  const next = foundry.utils.getProperty(change, "system.attributes.hp.value") ?? change["system.attributes.hp.value"];
  if (next !== undefined) previousHitPoints.set(actor.uuid, Number(actor.system?.attributes?.hp?.value ?? 0));
}

async function promptDamage(actor, change) {
  const next = foundry.utils.getProperty(change, "system.attributes.hp.value") ?? change["system.attributes.hp.value"];
  const previous = previousHitPoints.get(actor.uuid);
  previousHitPoints.delete(actor.uuid);
  if (next === undefined || previous === undefined || Number(next) >= previous) return;
  const damage = previous - Number(next);
  const eventKey = `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}:${actor.uuid}:damage:${previous}:${next}`;
  for (const chronomancer of game.actors.filter(ownedChronomancer)) {
    if (!mayPrompt(chronomancer) || inRange(chronomancer, actor, 9) === null) continue;
    await offerKnown(chronomancer, "crono-intervencao-suspensao-temporal", `${actor.name} sofreu ${damage} de dano.`, eventKey);
    if (Number(next) <= 0) await offerFractureRecovery(chronomancer, `${actor.name} foi reduzido a 0 PV.`, `${eventKey}:zero`);
  }
}

function fractureTurnKey(eventKey) {
  return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : eventKey;
}

async function offerFractureRecovery(actor, trigger, eventKey) {
  if (!mayPrompt(actor)) return;
  const current = chronomancerState(actor);
  const turn = fractureTurnKey(eventKey);
  if (current.points >= current.maximum || actor.getFlag(MODULE_ID, "fractureRecoveryTurn") === turn) return;
  const unique = `${game.user.id}:${actor.uuid}:fratura-critica:${eventKey}`;
  if (offeredEvents.has(unique)) return;
  offeredEvents.add(unique);
  const recover = await Dialog.confirm({
    title: "Fratura Crítica",
    content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-burst"></i><div><strong>${trigger}</strong><p>Uma Fratura Crítica se abriu no fluxo.</p><p>Deseja recuperar <b>1 Ponto Temporal</b>?</p></div></section>`,
    yes: () => true,
    no: () => false,
    defaultYes: true
  });
  if (!recover) return;
  await updateChronomancerState(actor, { points: current.points + 1 });
  await actor.setFlag(MODULE_ID, "fractureRecoveryTurn", turn);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era chronomancer-chat ne-temporal-verse"><i class="fa-solid fa-burst"></i><blockquote>“Na ferida do instante, encontro tempo suficiente para continuar.”</blockquote><small>Fratura Crítica — ${actor.name} recupera 1 PT</small></section>` });
}

function naturalTwenty(roll) {
  return roll?.dice?.some(die => Number(die.faces) === 20 && die.results?.some(result => result.active !== false && Number(result.result) === 20));
}

async function promptCritical(rolls, data = {}) {
  if (!rolls?.some(naturalTwenty)) return;
  const origin = data.subject?.actor ?? data.subject ?? data.actor;
  const eventKey = `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}:critical:${data.subject?.uuid ?? Date.now()}`;
  for (const actor of game.actors.filter(ownedChronomancer)) {
    if (!mayPrompt(actor) || (origin && visibleDistance(actor, origin) === null)) continue;
    await offerFractureRecovery(actor, `${origin?.name ?? "Uma criatura visível"} obteve um Acerto Crítico.`, eventKey);
  }
}

function rememberLevel(item, change) {
  if (isChronomancerClass(item) && ("system.levels" in change || foundry.utils.hasProperty(change, "system.levels"))) previousLevels.set(item.uuid, Number(item.system.levels ?? 0));
}

function levelChanged(item) {
  if (!isChronomancerClass(item)) return;
  const previous = previousLevels.get(item.uuid);
  previousLevels.delete(item.uuid);
  if (previous === undefined || Number(item.system.levels ?? 0) <= previous) return;
  setTimeout(() => void offerPendingLibraryChoice(item.parent), 350);
}

export function registerChronomancerLibraryAndPrompts() {
  Hooks.on("preUpdateItem", rememberLevel);
  Hooks.on("updateItem", levelChanged);
  Hooks.on("createItem", item => { if (isChronomancerClass(item)) setTimeout(() => void offerPendingLibraryChoice(item.parent), 500); });
  for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderActorSheet5eCharacter", "renderActorSheet5eCharacter2"]) {
    Hooks.on(hook, app => setTimeout(() => void offerPendingLibraryChoice(app.actor ?? app.document), 300));
  }
  Hooks.on("updateCombat", (combat, changed) => void promptTurnStart(combat, changed));
  Hooks.on("updateToken", trackMovement);
  Hooks.on("preUpdateActor", rememberHitPoints);
  Hooks.on("updateActor", (actor, changed) => void promptDamage(actor, changed));
  Hooks.on("dnd5e.preUseActivity", activity => void promptActivityStart(activity));
  Hooks.on("dnd5e.postUseActivity", activity => void promptActivityEnd(activity));
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => void promptCritical(rolls, data));
}
