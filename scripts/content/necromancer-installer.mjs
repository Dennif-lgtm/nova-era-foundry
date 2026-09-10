import { MODULE_ID } from "../constants.mjs";
import { NECROMANCER_CLASS, NECROMANCER_FEATURES, NECROMANCER_PATHS } from "./necromancer-data.mjs";

const CONTENT_VERSION = "1";
const DEFAULT_ICON = "icons/magic/death/skull-humanoid-crown-white-blue.webp";
const ICONS = {
  necromancer: "icons/magic/death/undead-skeleton-energy-green.webp",
  "necromancer-cadaveric-essence": "icons/magic/death/hand-undead-skeleton-fire-green.webp",
  "necromancer-death-mark": "icons/magic/death/skull-horned-worn-fire-blue.webp",
  "necromancer-profane-touch": "icons/magic/death/hand-undead-skeleton-fire-pink.webp",
  "necromancer-lesser-reanimation": "icons/magic/death/undead-zombie-grave-green.webp",
  "necromancer-corpse-explosion": "icons/magic/death/skull-fire-white-yellow.webp",
  "necromancer-death-presence": "icons/magic/death/undead-skeleton-energy-green.webp",
  "necromancer-partial-lich": "icons/magic/death/skull-humanoid-crown-white-blue.webp",
  "necromancer-perfect-reanimation": "icons/magic/death/undead-skeleton-worn-blue.webp",
  "necromancer-dead-field": "icons/magic/death/undead-skeleton-deformed-red.webp",
  "necromancer-infinite-army": "icons/magic/death/undead-skeleton-energy-green.webp",
  "necromancer-death-avatar": "icons/magic/death/skull-humanoid-crown-white-blue.webp",
  "path-soul-bleeder": "icons/magic/life/heart-shadow-red.webp",
  "path-lord-dead": "icons/magic/death/skull-humanoid-crown-white-blue.webp",
  "path-tomb-guardian": "icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp"
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

function iconFor(entry) {
  if (ICONS[entry.key]) return ICONS[entry.key];
  if (entry.group === "path-soul-bleeder") return ICONS["path-soul-bleeder"];
  if (entry.group === "path-lord-dead") return ICONS["path-lord-dead"];
  if (entry.group === "path-tomb-guardian") return ICONS["path-tomb-guardian"];
  if (entry.group === "servants") return "icons/magic/death/undead-zombie-grave-green.webp";
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
  return [...levels.entries()].sort(([a], [b]) => a - b).map(([level, entriesAtLevel]) => grant(level, entriesAtLevel, byKey, ownerKey));
}

function itemSource(entry, folder, type = "feat") {
  const system = { description: { value: entry.description, chat: "" } };
  if (type === "class") Object.assign(system, { identifier: "necromancer-nova-era", hitDice: "d8" });
  if (type === "subclass") Object.assign(system, { identifier: entry.key, classIdentifier: "necromancer-nova-era" });
  return {
    name: entry.name,
    type,
    img: iconFor(entry),
    folder: folder.id,
    system,
    flags: { [MODULE_ID]: { contentKey: entry.key, level: entry.level ?? 0, group: entry.group ?? "necromancer", contentVersion: CONTENT_VERSION } }
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

function proficiencyChoices() {
  return [
    {
      _id: stableId("necromancer-saving-throws"),
      type: "Trait",
      configuration: {
        allowReplacements: false,
        choices: [{ count: 1, pool: ["saves:wis", "saves:con"] }],
        grants: ["saves:int"],
        mode: "default"
      },
      value: { chosen: [] },
      level: 1,
      title: "Resistências do Necromante"
    },
    {
      _id: stableId("necromancer-skills"),
      type: "Trait",
      configuration: {
        allowReplacements: false,
        choices: [{ count: 3, pool: ["skills:arc", "skills:his", "skills:inv", "skills:ins", "skills:med", "skills:nat", "skills:prc", "skills:rel"] }],
        grants: [],
        mode: "default"
      },
      value: { chosen: [] },
      level: 1,
      title: "Perícias do Necromante"
    }
  ];
}

async function configureAdvancement(byKey) {
  await byKey.get(NECROMANCER_CLASS.key).update({
    "system.advancement": [
      { _id: stableId("necromancer-hit-points"), type: "HitPoints", configuration: {}, value: {}, title: "Pontos de Vida" },
      ...proficiencyChoices(),
      ...grantsByLevel(NECROMANCER_FEATURES, byKey, NECROMANCER_CLASS.key),
      { _id: stableId("necromancer-path"), type: "Subclass", configuration: {}, value: {}, level: 3, title: "Caminho da Necromancia" }
    ]
  });
  for (const path of NECROMANCER_PATHS) {
    await byKey.get(path.key).update({ "system.advancement": grantsByLevel(path.features, byKey, path.key) });
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
        [`flags.${MODULE_ID}.contentVersion`]: CONTENT_VERSION
      }];
    });
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

export async function installNecromancerContent({ notify = true } = {}) {
  if (!game.user.isGM) return [];
  const root = await itemFolder("Nova Era — Necromante");
  const classFolder = await itemFolder("Classe", root);
  const servantFolder = await itemFolder("Servos e Reanimações", root);
  const pathRoot = await itemFolder("Caminhos da Necromancia", root);
  const pathFolders = new Map();
  for (const path of NECROMANCER_PATHS) pathFolders.set(path.key, await itemFolder(path.name, pathRoot));

  const sources = [
    itemSource(NECROMANCER_CLASS, classFolder, "class"),
    ...NECROMANCER_FEATURES.map(entry => itemSource(entry, entry.group === "servants" ? servantFolder : classFolder)),
    ...NECROMANCER_PATHS.flatMap(path => [
      itemSource(path, pathFolders.get(path.key), "subclass"),
      ...path.features.map(entry => itemSource(entry, pathFolders.get(path.key)))
    ])
  ];
  const items = [];
  for (const source of sources) items.push(await upsert(source));
  const byKey = new Map(items.map(item => [item.getFlag(MODULE_ID, "contentKey"), item]));
  await configureAdvancement(byKey);
  await updateActorCopies(sources);
  await game.settings.set(MODULE_ID, "necromancerContentVersion", CONTENT_VERSION);
  Hooks.callAll("novaEraNecromancerContentReady");
  if (notify) ui.notifications.info(`Nova Era: Necromante instalado/atualizado (${items.length} itens).`);
  return items;
}

export async function ensureNecromancerContent() {
  if (!game.user.isGM) return;
  if (game.settings.get(MODULE_ID, "necromancerContentVersion") !== CONTENT_VERSION) await installNecromancerContent();
}
