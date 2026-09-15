import { MODULE_ID } from "../constants.mjs";
import { HERALD_CLASS, HERALD_FEATURES, HERALD_PATHS } from "./herald-data.mjs";

const CONTENT_VERSION = "1";
const ICON_ROOT = `modules/${MODULE_ID}/assets/ui/herald`;
const DEFAULT_ICON = `${ICON_ROOT}/tres-cristais.png`;
const GROUP_ICONS = {
  "path-life": "icons/magic/life/heart-cross-green.webp",
  "path-balance": "icons/magic/control/buff-flight-wings-runes-blue.webp",
  "path-rupture": "icons/magic/fire/explosion-embers-evade-silhouette.webp"
};

function stableId(seed) {
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (const character of seed) {
    first = Math.imul(first ^ character.charCodeAt(0), 0x01000193);
    second = Math.imul(second ^ character.charCodeAt(0), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function itemSource(entry, folder, type = "feat") {
  const system = { description: { value: entry.description, chat: "" } };
  if (type === "class") Object.assign(system, { identifier: "herald-resonances-nova-era", hitDice: "d8", spellcasting: { progression: "full", ability: "wis" } });
  if (type === "subclass") Object.assign(system, { identifier: entry.key, classIdentifier: "herald-resonances-nova-era" });
  return {
    name: entry.name, type, img: GROUP_ICONS[entry.group] ?? DEFAULT_ICON, folder: folder.id, system,
    flags: { [MODULE_ID]: { contentKey: entry.key, contentVersion: CONTENT_VERSION, group: entry.group ?? "herald", level: entry.level ?? 0, affinity: entry.affinity ?? "" } }
  };
}

async function itemFolder(name, parent = null) {
  const parentId = parent?.id ?? null;
  let folder = game.folders.find(entry => entry.type === "Item" && entry.name === name && ((entry.folder?.id ?? entry.folder ?? null) === parentId));
  folder ??= await Folder.create({ name, type: "Item", sorting: "a", ...(parentId ? { folder: parentId } : {}) });
  return folder;
}

async function upsert(source) {
  const key = source.flags[MODULE_ID].contentKey;
  const existing = game.items.find(item => item.getFlag(MODULE_ID, "contentKey") === key);
  if (!existing) return Item.create(source);
  await existing.update(foundry.utils.deepClone(source));
  return existing;
}

function grant(level, entries, byKey, ownerKey) {
  return { _id: stableId(`${ownerKey}-grant-${level}`), type: "ItemGrant", configuration: { items: entries.map(entry => ({ uuid: byKey.get(entry.key).uuid, optional: false })), optional: false, spell: null }, value: {}, level, title: `Características de ${level}º nível` };
}

function grantsByLevel(entries, byKey, ownerKey) {
  const levels = new Map();
  for (const entry of entries) levels.set(entry.level, [...(levels.get(entry.level) ?? []), entry]);
  return [...levels.entries()].sort(([left], [right]) => left - right).map(([level, entriesAtLevel]) => grant(level, entriesAtLevel, byKey, ownerKey));
}

async function configureAdvancement(byKey) {
  await byKey.get(HERALD_CLASS.key).update({ "system.advancement": [
    { _id: stableId("herald-hit-points"), type: "HitPoints", configuration: {}, value: {}, title: "Pontos de Vida" },
    ...grantsByLevel(HERALD_FEATURES, byKey, HERALD_CLASS.key),
    { _id: stableId("herald-path-choice"), type: "Subclass", configuration: {}, value: {}, level: 3, title: "Caminho Ressonante" }
  ] });
  for (const path of HERALD_PATHS) await byKey.get(path.key).update({ "system.advancement": grantsByLevel(path.features, byKey, path.key) });
}

async function updateActorCopies(sources) {
  const byKey = new Map(sources.map(source => [source.flags[MODULE_ID].contentKey, source]));
  for (const actor of game.actors) {
    const updates = actor.items.flatMap(item => {
      const source = byKey.get(item.getFlag(MODULE_ID, "contentKey"));
      if (!source) return [];
      return [{ _id: item.id, name: source.name, img: source.img, "system.description": source.system.description, [`flags.${MODULE_ID}`]: source.flags[MODULE_ID] }];
    });
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

export async function installHeraldContent({ notify = true } = {}) {
  if (!game.user.isGM) return [];
  const root = await itemFolder("Nova Era — Arauto das Ressonâncias");
  const classFolder = await itemFolder("Classe", root);
  const pathsRoot = await itemFolder("Caminhos Ressonantes", root);
  const pathFolders = new Map();
  for (const path of HERALD_PATHS) pathFolders.set(path.key, await itemFolder(path.name, pathsRoot));
  const sources = [
    itemSource(HERALD_CLASS, classFolder, "class"),
    ...HERALD_FEATURES.map(entry => itemSource(entry, classFolder)),
    ...HERALD_PATHS.flatMap(path => [itemSource(path, pathFolders.get(path.key), "subclass"), ...path.features.map(entry => itemSource(entry, pathFolders.get(path.key)))])
  ];
  const items = [];
  for (const source of sources) items.push(await upsert(source));
  const byKey = new Map(items.map(item => [item.getFlag(MODULE_ID, "contentKey"), item]));
  await configureAdvancement(byKey);
  await updateActorCopies(sources);
  await game.settings.set(MODULE_ID, "heraldContentVersion", CONTENT_VERSION);
  Hooks.callAll("novaEraHeraldContentReady");
  if (notify) ui.notifications.info(`Nova Era: Arauto das Ressonâncias instalado/atualizado (${items.length} itens).`);
  return items;
}

export async function ensureHeraldContent() {
  if (!game.user.isGM) return;
  if (game.settings.get(MODULE_ID, "heraldContentVersion") !== CONTENT_VERSION) await installHeraldContent();
}
