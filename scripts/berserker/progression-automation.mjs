import { MODULE_ID } from "../constants.mjs";
import { BERSERKER_LEGACIES, BERSERKER_MUTATIONS, BERSERKER_TECHNIQUES } from "../content/berserker-data.mjs";
import { berserkerLevel, isNovaEraBerserker } from "./core-automation.mjs";

const PROMPT_LOCKS = new Set();

function contentKey(item) { return item?.getFlag?.(MODULE_ID, "contentKey") ?? ""; }
function mayChoose(actor) {
  const owners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return owners[0]?.id === game.user.id || (!owners.length && game.user.isGM && game.users.activeGM?.id === game.user.id);
}
function worldItem(key) { return game.items.find(item => contentKey(item) === key); }
function knownKeys(actor, prefix) { return new Set(actor.items.filter(item => contentKey(item).startsWith(prefix)).map(contentKey)); }
function techniqueSlots(level) { return level < 2 ? 0 : 2 + Number(level >= 5) + Number(level >= 9) + Number(level >= 13) + Number(level >= 17); }
function mutationSlots(level) { return Number(level >= 6) + Number(level >= 14) + Number(level >= 18); }
function hasBeastLegacy(actor) { return actor.items.some(item => item.type === "subclass" && contentKey(item) === "legado-besta"); }

async function chooseEntry(title, text, entries) {
  if (!entries.length) return null;
  return Dialog.prompt({
    title,
    content: `<form class="nova-era berserker-choice"><p>${text}</p><div class="form-group"><label>Escolha</label><select name="key">${entries.map(entry => `<option value="${entry.key}">${entry.name}${entry.level ? ` — nível ${entry.level}` : ""}</option>`).join("")}</select></div></form>`,
    label: "Adicionar à ficha",
    callback: html => String(html.find("[name='key']").val()),
    rejectClose: false
  });
}

async function grant(actor, key, reason) {
  const source = worldItem(key);
  if (!source) {
    ui.notifications.warn(`Nova Era: o item ${key} não foi encontrado. Peça ao Mestre para reinstalar o conteúdo do Berserker.`);
    return false;
  }
  const data = source.toObject();
  delete data._id;
  data.folder = null;
  await actor.createEmbeddedDocuments("Item", [data]);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era berserker-chat"><h2>${reason}</h2><p><strong>${actor.name}</strong> acrescentou <strong>${source.name}</strong> ao próprio legado de sangue.</p></section>` });
  return true;
}

async function chooseLegacy(actor) {
  if (berserkerLevel(actor) < 3 || actor.items.some(item => item.type === "subclass" && String(item.system?.classIdentifier ?? "") === "berserker-nova-era")) return false;
  const key = await chooseEntry("Legado de Sangue", "O sangue recorda aquilo que você decidiu se tornar.", BERSERKER_LEGACIES);
  return key ? grant(actor, key, "O Legado desperta") : false;
}

async function chooseTechniques(actor) {
  const level = berserkerLevel(actor);
  const known = knownKeys(actor, "berserker-tecnica-");
  const missing = techniqueSlots(level) - known.size;
  if (missing <= 0) return false;
  const available = BERSERKER_TECHNIQUES.filter(entry => entry.level <= level && !known.has(entry.key));
  const key = await chooseEntry("Nova Técnica de Sangue", `Você ainda pode aprender ${missing} Técnica${missing === 1 ? "" : "s"}.`, available);
  return key ? grant(actor, key, "Uma nova Técnica é gravada no sangue") : false;
}

async function chooseMutations(actor) {
  const level = berserkerLevel(actor);
  if (!hasBeastLegacy(actor)) return false;
  const known = knownKeys(actor, "berserker-mutacao-");
  const missing = mutationSlots(level) - known.size;
  if (missing <= 0) return false;
  const available = BERSERKER_MUTATIONS.filter(entry => !known.has(entry.key));
  const key = await chooseEntry("Mutação Bestial", `A Forma Predatória aceita ${missing} nova Mutação${missing === 1 ? "" : "ões"}.`, available);
  return key ? grant(actor, key, "A carne escolhe uma nova forma") : false;
}

export async function offerBerserkerProgression(actor) {
  if (!isNovaEraBerserker(actor) || !mayChoose(actor) || PROMPT_LOCKS.has(actor.uuid)) return;
  PROMPT_LOCKS.add(actor.uuid);
  try {
    if (await chooseLegacy(actor)) return setTimeout(() => void offerBerserkerProgression(actor), 250);
    if (await chooseTechniques(actor)) return setTimeout(() => void offerBerserkerProgression(actor), 250);
    if (await chooseMutations(actor)) return setTimeout(() => void offerBerserkerProgression(actor), 250);
  } finally {
    PROMPT_LOCKS.delete(actor.uuid);
  }
}

function classChanged(item, changed) {
  if (item.type !== "class" || item.system?.identifier !== "berserker-nova-era") return;
  if (foundry.utils.getProperty(changed, "system.levels") === undefined) return;
  setTimeout(() => void offerBerserkerProgression(item.parent), 300);
}

export function registerBerserkerProgressionAutomation() {
  Hooks.on("updateItem", classChanged);
  Hooks.on("createItem", item => { if (isNovaEraBerserker(item.parent)) setTimeout(() => void offerBerserkerProgression(item.parent), 350); });
  for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderActorSheet5eCharacter", "renderActorSheet5eCharacter2"]) {
    Hooks.on(hook, app => setTimeout(() => void offerBerserkerProgression(app.actor ?? app.document), 250));
  }
  Hooks.on("novaEraBerserkerContentReady", () => {
    for (const actor of game.actors.filter(isNovaEraBerserker)) void offerBerserkerProgression(actor);
  });
  setTimeout(() => {
    for (const actor of game.actors.filter(isNovaEraBerserker)) void offerBerserkerProgression(actor);
  }, 1800);
}
