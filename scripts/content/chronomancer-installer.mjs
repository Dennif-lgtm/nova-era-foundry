import { MODULE_ID } from "../constants.mjs";
import {
  CHRONOMANCER_CLASS,
  CHRONOMANCER_FEATURES,
  CHRONOMANCER_INTERVENTIONS,
  CHRONOMANCER_TREATISES
} from "./chronomancer-data.mjs";

const CONTENT_VERSION = "2";
const ICON = "icons/magic/time/clock-stopwatch-white-blue.webp";
const ICON_ROOT = `modules/${MODULE_ID}/assets/icons/chronomancer`;
const ITEM_ICONS = {
  "tratado-precedencia": `${ICON_ROOT}/tratados/precedencia.webp`,
  "tratado-possibilidades": `${ICON_ROOT}/tratados/possibilidades.webp`,
  "tratado-continuidade": `${ICON_ROOT}/tratados/continuidade.webp`,
  "crono-pontos-temporais": `${ICON_ROOT}/sistema/pontos-temporais.webp`,
  "crono-confluencias": `${ICON_ROOT}/sistema/confluencia.webp`,
  "crono-paralelismo-1": `${ICON_ROOT}/sistema/paralelismo-temporal.webp`,
  "crono-paralelismo-2": `${ICON_ROOT}/sistema/paralelismo-temporal.webp`,
  "crono-leitura-fraturas": `${ICON_ROOT}/sistema/fratura-temporal.webp`,
  ...Object.fromEntries([
    "acelerar", "antecipacao", "retardar", "inercia-temporal", "eco-temporal",
    "reverberacao", "ancora-temporal", "permanencia", "colapso", "descontinuidade"
  ].map(key => [`crono-intervencao-${key}`, `${ICON_ROOT}/fundamentos/${key}.webp`]))
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
    img: ITEM_ICONS[key] ?? ITEM_ICONS[group] ?? ICON,
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

  const treatiseFolders = new Map();
  for (const treatise of CHRONOMANCER_TREATISES) {
    const parentId = folder.id;
    let child = game.folders.find(entry => entry.type === "Item" && entry.name === treatise.name && (entry.folder?.id === parentId || entry.folder === parentId));
    child ??= await Folder.create({ name: treatise.name, type: "Item", sorting: "a", folder: parentId });
    treatiseFolders.set(treatise.key, child);
  }

  const sources = [
    itemSource({ ...CHRONOMANCER_CLASS, type: "class" }, folder),
    ...CHRONOMANCER_FEATURES.map(entry => itemSource(entry, folder)),
    ...CHRONOMANCER_TREATISES.flatMap(treatise => [
      itemSource({ ...treatise, type: "subclass", group: "tratado" }, treatiseFolders.get(treatise.key)),
      ...treatise.features.map(entry => itemSource(entry, treatiseFolders.get(treatise.key)))
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
