import { MODULE_ID } from "../constants.mjs";
import { ROGUE_CLASS, ROGUE_FEATURES, ROGUE_SUBCLASSES } from "./rogue-data.mjs";

const CONTENT_VERSION = "5";
const ANALYZE_ACTIVITY_ID = "novaeraAnalyze01";

const CONTENT_ICONS = {
  ladino: "modules/nova-era/assets/icons/ladino.png",
  fantasma: "modules/nova-era/assets/icons/fantasma.png",
  assassino: "modules/nova-era/assets/icons/assassino.png",
  rastreador: "modules/nova-era/assets/icons/rastreador.png"
};

function stableId(seed) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of seed) {
    first = Math.imul(first ^ character.charCodeAt(0), 0x01000193);
    second = Math.imul(second ^ character.charCodeAt(0), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function itemGrant(level, entries, itemsByKey, ownerKey) {
  return {
    _id: stableId(`${ownerKey}-grant-${level}`),
    type: "ItemGrant",
    configuration: {
      items: entries.map(entry => ({ uuid: itemsByKey.get(entry.key).uuid, optional: false })),
      optional: false,
      spell: null
    },
    value: {},
    level,
    title: `Características de ${level}º nível`
  };
}

function grantsByLevel(entries, itemsByKey, ownerKey) {
  const levels = new Map();
  for (const entry of entries) {
    const features = levels.get(entry.level) ?? [];
    features.push(entry);
    levels.set(entry.level, features);
  }
  return [...levels.entries()]
    .sort(([left], [right]) => left - right)
    .map(([level, features]) => itemGrant(level, features, itemsByKey, ownerKey));
}

async function configureAdvancement(itemsByKey) {
  const rogue = itemsByKey.get(ROGUE_CLASS.key);
  const classAdvancement = [
    {
      _id: stableId("ladino-hit-points"),
      type: "HitPoints",
      configuration: {},
      value: {},
      title: "Pontos de Vida"
    },
    ...grantsByLevel(ROGUE_FEATURES, itemsByKey, ROGUE_CLASS.key),
    {
      _id: stableId("ladino-subclass"),
      type: "Subclass",
      configuration: {},
      value: {},
      level: 3,
      title: "Arquétipo de Ladino"
    }
  ];
  await rogue.update({ "system.advancement": classAdvancement });

  for (const subclass of ROGUE_SUBCLASSES) {
    const subclassItem = itemsByKey.get(subclass.key);
    await subclassItem.update({
      "system.advancement": grantsByLevel(subclass.features, itemsByKey, subclass.key)
    });
  }
}

function itemSource({ key, name, type = "feat", description, level = 0, group = "base" }, folder) {
  const system = { description: { value: description, chat: "" } };
  if (key === "exposicao") {
    system.activities = {
      [ANALYZE_ACTIVITY_ID]: {
        _id: ANALYZE_ACTIVITY_ID,
        type: "utility",
        name: "Analisar",
        activation: { type: "bonus", value: 1, override: true },
        description: { chatFlavor: "Analisa uma criatura escolhida como alvo." },
        roll: { formula: "", name: "", prompt: false, visible: false }
      }
    };
  }
  if (type === "class") Object.assign(system, { identifier: "ladino-nova-era", hitDice: "d8" });
  if (type === "subclass") Object.assign(system, { identifier: key, classIdentifier: "ladino-nova-era" });
  return {
    name,
    type,
    ...(CONTENT_ICONS[key] ? { img: CONTENT_ICONS[key] } : {}),
    folder: folder.id,
    system,
    flags: { [MODULE_ID]: { contentKey: key, level, group, contentVersion: CONTENT_VERSION } }
  };
}

async function updateEmbeddedIdentityIcons() {
  for (const actor of game.actors) {
    const updates = actor.items
      .filter(item => CONTENT_ICONS[item.getFlag(MODULE_ID, "contentKey")])
      .map(item => ({
        _id: item.id,
        img: CONTENT_ICONS[item.getFlag(MODULE_ID, "contentKey")]
      }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

async function upsertItem(source) {
  const key = source.flags[MODULE_ID].contentKey;
  const existing = game.items.find(item => item.getFlag(MODULE_ID, "contentKey") === key);
  if (existing) {
    await existing.update(source);
    return existing;
  }
  return Item.create(source);
}

async function updateEmbeddedExposureItems(source) {
  for (const actor of game.actors) {
    const items = actor.items.filter(item => item.getFlag(MODULE_ID, "contentKey") === "exposicao");
    for (const item of items) {
      await item.update({
        "system.activities": source.system.activities,
        [`flags.${MODULE_ID}.contentVersion`]: CONTENT_VERSION
      });
    }
  }
}

export async function installRogueContent({ notify = true } = {}) {
  if (!game.user.isGM) return [];
  let folder = game.folders.find(entry => entry.type === "Item" && entry.name === "Nova Era — Ladino");
  folder ??= await Folder.create({ name: "Nova Era — Ladino", type: "Item", sorting: "a" });

  const sources = [
    itemSource({ ...ROGUE_CLASS, type: "class" }, folder),
    ...ROGUE_FEATURES.map(entry => itemSource(entry, folder)),
    ...ROGUE_SUBCLASSES.flatMap(subclass => [
      itemSource({ ...subclass, type: "subclass" }, folder),
      ...subclass.features.map(entry => itemSource(entry, folder))
    ])
  ];

  const results = [];
  for (const source of sources) results.push(await upsertItem(source));
  const itemsByKey = new Map(results.map(item => [item.getFlag(MODULE_ID, "contentKey"), item]));
  await configureAdvancement(itemsByKey);
  await updateEmbeddedExposureItems(sources.find(source => source.flags[MODULE_ID].contentKey === "exposicao"));
  await updateEmbeddedIdentityIcons();
  await game.settings.set(MODULE_ID, "rogueContentVersion", CONTENT_VERSION);
  if (notify) ui.notifications.info(`Nova Era: Ladino completo instalado/atualizado (${results.length} itens).`);
  return results;
}

export async function ensureRogueContent() {
  if (!game.user.isGM) return;
  const installed = game.settings.get(MODULE_ID, "rogueContentVersion");
  if (installed !== CONTENT_VERSION) await installRogueContent();
}
