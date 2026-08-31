import { MODULE_ID } from "../constants.mjs";
import {
  CHRONOMANCER_CLASS,
  CHRONOMANCER_FEATURES,
  CHRONOMANCER_INTERVENTIONS,
  CHRONOMANCER_TREATISES
} from "./chronomancer-data.mjs";

const CONTENT_VERSION = "1";
const ICON = "icons/magic/time/clock-stopwatch-white-blue.webp";

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

function itemSource({ key, name, type = "feat", description, level = 0, group = "cronomante" }, folder) {
  const system = { description: { value: description, chat: "" } };
  if (type === "class") {
    Object.assign(system, {
      identifier: "cronomante-nova-era",
      hitDice: "d8",
      spellcasting: { progression: "full", ability: "int" }
    });
  }
  if (type === "subclass") {
    Object.assign(system, { identifier: key, classIdentifier: "cronomante-nova-era" });
  }
  return {
    name,
    type,
    img: ICON,
    folder: folder.id,
    system,
    flags: { [MODULE_ID]: { contentKey: key, level, group, contentVersion: CONTENT_VERSION } }
  };
}

async function upsertItem(source) {
  const key = source.flags[MODULE_ID].contentKey;
  const existing = game.items.find(item => item.getFlag(MODULE_ID, "contentKey") === key);
  if (existing) {
    await existing.update(foundry.utils.deepClone(source));
    return existing;
  }
  return Item.create(source);
}

async function configureAdvancement(itemsByKey) {
  const classItem = itemsByKey.get(CHRONOMANCER_CLASS.key);
  await classItem.update({
    "system.advancement": [
      {
        _id: stableId("cronomante-hit-points"),
        type: "HitPoints",
        configuration: {},
        value: {},
        title: "Pontos de Vida"
      },
      ...grantsByLevel(CHRONOMANCER_FEATURES, itemsByKey, CHRONOMANCER_CLASS.key),
      {
        _id: stableId("cronomante-tratado"),
        type: "Subclass",
        configuration: {},
        value: {},
        level: 3,
        title: "Tratado da Cronomancia"
      }
    ]
  });

  for (const treatise of CHRONOMANCER_TREATISES) {
    await itemsByKey.get(treatise.key).update({
      "system.advancement": grantsByLevel(treatise.features, itemsByKey, treatise.key)
    });
  }
}

async function updateEmbeddedContentItems(sources) {
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
        [`flags.${MODULE_ID}.contentVersion`]: CONTENT_VERSION
      }];
    });
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

export async function installChronomancerContent({ notify = true } = {}) {
  if (!game.user.isGM) return [];
  let folder = game.folders.find(entry => entry.type === "Item" && entry.name === "Nova Era — Cronomante");
  folder ??= await Folder.create({ name: "Nova Era — Cronomante", type: "Item", sorting: "a" });

  const sources = [
    itemSource({ ...CHRONOMANCER_CLASS, type: "class" }, folder),
    ...CHRONOMANCER_FEATURES.map(entry => itemSource(entry, folder)),
    ...CHRONOMANCER_TREATISES.flatMap(treatise => [
      itemSource({ ...treatise, type: "subclass", group: "tratado" }, folder),
      ...treatise.features.map(entry => itemSource(entry, folder))
    ]),
    ...CHRONOMANCER_INTERVENTIONS.map(entry => itemSource(entry, folder))
  ];

  const results = [];
  for (const source of sources) results.push(await upsertItem(source));
  const itemsByKey = new Map(results.map(item => [item.getFlag(MODULE_ID, "contentKey"), item]));
  await configureAdvancement(itemsByKey);
  await updateEmbeddedContentItems(sources);
  await game.settings.set(MODULE_ID, "chronomancerContentVersion", CONTENT_VERSION);
  if (notify) ui.notifications.info(`Nova Era: Cronomante completo instalado/atualizado (${results.length} itens).`);
  return results;
}

export async function ensureChronomancerContent() {
  if (!game.user.isGM) return;
  const installed = game.settings.get(MODULE_ID, "chronomancerContentVersion");
  if (installed !== CONTENT_VERSION) await installChronomancerContent();
}
