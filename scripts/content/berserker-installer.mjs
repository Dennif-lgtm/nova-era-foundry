import { MODULE_ID } from "../constants.mjs";
import { BERSERKER_CLASS, BERSERKER_FEATURES, BERSERKER_LEGACIES, BERSERKER_MUTATIONS, BERSERKER_TECHNIQUES } from "./berserker-data.mjs";

const CONTENT_VERSION = "2";
const ICON_ROOT = `modules/${MODULE_ID}/assets/icons/berserker`;
const DEFAULT_ICON = `${ICON_ROOT}/coracao-com-sangue-v1.png`;

function stableId(seed) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of seed) {
    first = Math.imul(first ^ character.charCodeAt(0), 0x01000193);
    second = Math.imul(second ^ character.charCodeAt(0), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function iconFor(entry) {
  if (entry.key === "berserker-frenesi") return `${ICON_ROOT}/coracao-frenesi-v1.png`;
  if (entry.key === "berserker-sangue-massacre") return `${ICON_ROOT}/coracao-com-sangue-v1.png`;
  if (entry.key === "berserker") return `${ICON_ROOT}/coracao-sem-sangue-v1.png`;
  return DEFAULT_ICON;
}

function grant(level, entries, byKey, ownerKey) {
  return {
    _id: stableId(`${ownerKey}-grant-${level}`),
    type: "ItemGrant",
    configuration: { items: entries.map(entry => ({ uuid: byKey.get(entry.key).uuid, optional: false })), optional: false, spell: null },
    value: {}, level, title: `Características de ${level}º nível`
  };
}

function grantsByLevel(entries, byKey, ownerKey) {
  const levels = new Map();
  for (const entry of entries) levels.set(entry.level, [...(levels.get(entry.level) ?? []), entry]);
  return [...levels.entries()].sort(([a], [b]) => a - b).map(([level, features]) => grant(level, features, byKey, ownerKey));
}

function itemSource(entry, folder, type = "feat") {
  const system = { description: { value: entry.description, chat: "" } };
  if (type === "class") Object.assign(system, { identifier: "berserker-nova-era", hitDice: "d12" });
  if (type === "subclass") Object.assign(system, { identifier: entry.key, classIdentifier: "berserker-nova-era" });
  return {
    name: entry.name,
    type,
    img: iconFor(entry),
    folder: folder.id,
    system,
    flags: { [MODULE_ID]: { contentKey: entry.key, level: entry.level ?? 0, group: entry.group ?? "berserker", bloodCost: entry.bloodCost ?? 0, sacrifice: entry.sacrifice ?? false, trigger: entry.trigger ?? "", contentVersion: CONTENT_VERSION } }
  };
}

async function upsert(source) {
  const key = source.flags[MODULE_ID].contentKey;
  const existing = game.items.find(item => item.getFlag(MODULE_ID, "contentKey") === key);
  if (!existing) return Item.create(source);
  await existing.update(foundry.utils.deepClone(source));
  return existing;
}

async function itemFolder(name, parent = null) {
  const parentId = parent?.id ?? null;
  let folder = game.folders.find(entry => entry.type === "Item" && entry.name === name && ((entry.folder?.id ?? entry.folder ?? null) === parentId));
  folder ??= await Folder.create({ name, type: "Item", sorting: "a", ...(parentId ? { folder: parentId } : {}) });
  return folder;
}

async function configureAdvancement(byKey) {
  await byKey.get(BERSERKER_CLASS.key).update({
    "system.advancement": [
      { _id: stableId("berserker-hit-points"), type: "HitPoints", configuration: {}, value: {}, title: "Pontos de Vida" },
      ...grantsByLevel(BERSERKER_FEATURES, byKey, BERSERKER_CLASS.key),
      { _id: stableId("berserker-legado"), type: "Subclass", configuration: {}, value: {}, level: 3, title: "Legado de Sangue" }
    ]
  });
  for (const legacy of BERSERKER_LEGACIES) {
    await byKey.get(legacy.key).update({ "system.advancement": grantsByLevel(legacy.features, byKey, legacy.key) });
  }
}

async function updateActorCopies(sources) {
  const byKey = new Map(sources.map(source => [source.flags[MODULE_ID].contentKey, source]));
  for (const actor of game.actors) {
    const updates = actor.items.flatMap(item => {
      const source = byKey.get(item.getFlag(MODULE_ID, "contentKey"));
      if (!source) return [];
      return [{
        _id: item.id,
        name: source.name,
        img: source.img,
        "system.description": source.system.description,
        [`flags.${MODULE_ID}.level`]: source.flags[MODULE_ID].level,
        [`flags.${MODULE_ID}.group`]: source.flags[MODULE_ID].group,
        [`flags.${MODULE_ID}.bloodCost`]: source.flags[MODULE_ID].bloodCost,
        [`flags.${MODULE_ID}.sacrifice`]: source.flags[MODULE_ID].sacrifice,
        [`flags.${MODULE_ID}.trigger`]: source.flags[MODULE_ID].trigger,
        [`flags.${MODULE_ID}.contentVersion`]: CONTENT_VERSION
      }];
    });
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

export async function installBerserkerContent({ notify = true } = {}) {
  if (!game.user.isGM) return [];
  const root = await itemFolder("Nova Era — Berserker");
  const classFolder = await itemFolder("Classe e Legados", root);
  const techniqueRoot = await itemFolder("Técnicas de Sangue", root);
  const carnageFolder = await itemFolder("Carnificina", techniqueRoot);
  const hemotechFolder = await itemFolder("Hemotecnia", techniqueRoot);
  const mutationFolder = await itemFolder("Mutações Bestiais", root);
  const legacyFolders = new Map();
  for (const legacy of BERSERKER_LEGACIES) legacyFolders.set(legacy.key, await itemFolder(legacy.name, classFolder));

  const sources = [
    itemSource(BERSERKER_CLASS, classFolder, "class"),
    ...BERSERKER_FEATURES.map(entry => itemSource(entry, classFolder)),
    ...BERSERKER_LEGACIES.flatMap(legacy => [
      itemSource(legacy, legacyFolders.get(legacy.key), "subclass"),
      ...legacy.features.map(entry => itemSource(entry, legacyFolders.get(legacy.key)))
    ]),
    ...BERSERKER_MUTATIONS.map(entry => itemSource(entry, mutationFolder)),
    ...BERSERKER_TECHNIQUES.map(entry => itemSource(entry, entry.group.endsWith("hemotecnia") ? hemotechFolder : carnageFolder))
  ];
  const items = [];
  for (const source of sources) items.push(await upsert(source));
  const byKey = new Map(items.map(item => [item.getFlag(MODULE_ID, "contentKey"), item]));
  await configureAdvancement(byKey);
  await updateActorCopies(sources);
  await game.settings.set(MODULE_ID, "berserkerContentVersion", CONTENT_VERSION);
  Hooks.callAll("novaEraBerserkerContentReady");
  if (notify) ui.notifications.info(`Nova Era: Berserker instalado/atualizado (${items.length} itens).`);
  return items;
}

export async function ensureBerserkerContent() {
  if (!game.user.isGM) return;
  if (game.settings.get(MODULE_ID, "berserkerContentVersion") !== CONTENT_VERSION) await installBerserkerContent();
}
