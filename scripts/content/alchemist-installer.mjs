import { MODULE_ID } from "../constants.mjs";
import { ALCHEMIST_CLASS, ALCHEMIST_COMPONENTS, ALCHEMIST_FEATURES, ALCHEMIST_GREAT_WORKS, ALCHEMIST_PROJECTS, ALCHEMIST_SCHOOLS } from "./alchemist-data.mjs";

const CONTENT_VERSION = "1";
const DEFAULT_ICON = "icons/tools/laboratory/mortar-powder-green.webp";
const GROUP_ICONS = {
  alchemist: "icons/consumables/potions/bottle-corked-labeled-green.webp",
  containers: "icons/containers/bags/case-leather-tan.webp",
  compounds: "icons/consumables/potions/bottle-bulb-corked-green.webp",
  modifiers: "icons/magic/symbols/runes-star-pentagon-orange.webp",
  "great-works": "icons/magic/symbols/runes-star-pentagon-gold.webp",
  "school-biomancer": "icons/magic/life/heart-cross-strong-green.webp",
  "school-war-artificer": "icons/tools/smithing/anvil.webp",
  "school-arcane-transmuter": "icons/magic/symbols/elements-air-earth-fire-water.webp",
  homunculus: "icons/creatures/magical/construct-golem-stone-blue.webp"
};

function stableId(seed) {
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (const character of seed) { first = Math.imul(first ^ character.charCodeAt(0), 0x01000193); second = Math.imul(second ^ character.charCodeAt(0), 0x85ebca6b); }
  return `${(first >>> 0).toString(16).padStart(8,"0")}${(second >>> 0).toString(16).padStart(8,"0")}`;
}

function iconFor(entry) {
  if (entry.key === "alchemist") return GROUP_ICONS.alchemist;
  if (entry.key.includes("charge") || entry.role === "damage") return "icons/magic/fire/explosion-fireball-small-orange.webp";
  if (entry.role === "healing") return "icons/magic/life/heart-cross-green.webp";
  if (entry.role === "defense") return "icons/magic/defensive/shield-barrier-glowing-green.webp";
  if (entry.role === "control" || entry.role === "debuff") return "icons/magic/acid/dissolve-bone-skull.webp";
  if (entry.role === "movement") return "icons/magic/movement/trail-streak-zigzag-yellow.webp";
  return GROUP_ICONS[entry.group] ?? GROUP_ICONS[entry.school] ?? DEFAULT_ICON;
}

function itemSource(entry, folder, type = "feat") {
  const system = { description: { value: entry.description, chat: "" } };
  if (type === "class") Object.assign(system, { identifier: "alchemist-nova-era", hitDice: "d8" });
  if (type === "subclass") Object.assign(system, { identifier: entry.key, classIdentifier: "alchemist-nova-era" });
  return {
    name: entry.name, type, img: iconFor(entry), folder: folder.id, system,
    flags: { [MODULE_ID]: {
      contentKey: entry.key, contentVersion: CONTENT_VERSION, group: entry.group ?? "alchemist", level: entry.level ?? 0,
      grade: entry.grade ?? 0, reagentCost: entry.cost ?? 0, role: entry.role ?? "", dice: entry.dice ?? "",
      containers: entry.containers ?? [], compounds: entry.compounds ?? [], school: entry.school ?? ""
    } }
  };
}

async function upsert(source) {
  const key = source.flags[MODULE_ID].contentKey;
  const existing = game.items.find(item => item.getFlag(MODULE_ID,"contentKey") === key);
  if (!existing) return Item.create(source);
  await existing.update(foundry.utils.deepClone(source));
  return existing;
}

async function itemFolder(name, parent = null) {
  const parentId = parent?.id ?? null;
  let folder = game.folders.find(entry => entry.type === "Item" && entry.name === name && ((entry.folder?.id ?? entry.folder ?? null) === parentId));
  folder ??= await Folder.create({ name, type:"Item", sorting:"a", ...(parentId ? { folder:parentId } : {}) });
  return folder;
}

function grant(level, entries, byKey, ownerKey) {
  return { _id:stableId(`${ownerKey}-grant-${level}`), type:"ItemGrant", configuration:{ items:entries.map(entry => ({ uuid:byKey.get(entry.key).uuid, optional:false })), optional:false, spell:null }, value:{}, level, title:`Características de ${level}º nível` };
}

function grantsByLevel(entries, byKey, ownerKey) {
  const levels = new Map();
  for (const entry of entries) levels.set(entry.level, [...(levels.get(entry.level) ?? []), entry]);
  return [...levels.entries()].sort(([a],[b]) => a-b).map(([level, list]) => grant(level,list,byKey,ownerKey));
}

async function configureAdvancement(byKey) {
  await byKey.get(ALCHEMIST_CLASS.key).update({ "system.advancement": [
    { _id:stableId("alchemist-hit-points"), type:"HitPoints", configuration:{}, value:{}, title:"Pontos de Vida" },
    { _id:stableId("alchemist-saving-throws"), type:"Trait", configuration:{ allowReplacements:false, choices:[], grants:["saves:int","saves:con"], mode:"default" }, value:{ chosen:[] }, level:1, title:"Resistências do Alquimista" },
    { _id:stableId("alchemist-skills"), type:"Trait", configuration:{ allowReplacements:false, choices:[{ count:3, pool:["skills:arc","skills:inv","skills:med","skills:nat","skills:sur","skills:prc","skills:slt","skills:ins"] }], grants:[], mode:"default" }, value:{ chosen:[] }, level:1, title:"Perícias do Alquimista" },
    ...grantsByLevel(ALCHEMIST_FEATURES,byKey,ALCHEMIST_CLASS.key),
    { _id:stableId("alchemist-school"), type:"Subclass", configuration:{}, value:{}, level:3, title:"Escola de Pesquisa" }
  ] });
  for (const school of ALCHEMIST_SCHOOLS) await byKey.get(school.key).update({ "system.advancement":grantsByLevel(school.features,byKey,school.key) });
}

async function updateActorCopies(sources) {
  const byKey = new Map(sources.map(source => [source.flags[MODULE_ID].contentKey,source]));
  for (const actor of game.actors) {
    const updates = actor.items.flatMap(item => {
      const source = byKey.get(item.getFlag(MODULE_ID,"contentKey"));
      if (!source) return [];
      return [{ _id:item.id, name:source.name, img:source.img, "system.description":source.system.description, [`flags.${MODULE_ID}`]:source.flags[MODULE_ID] }];
    });
    if (updates.length) await actor.updateEmbeddedDocuments("Item",updates);
  }
}

export async function installAlchemistContent({ notify = true } = {}) {
  if (!game.user.isGM) return [];
  const root = await itemFolder("Nova Era — Alquimista");
  const classFolder = await itemFolder("Classe",root);
  const compendium = await itemFolder("Compêndio Alquímico",root);
  const gradeFolders = new Map();
  for (const grade of [1,2,3,4]) gradeFolders.set(grade,await itemFolder(`Projetos Fundamentais — Grau ${["","I","II","III","IV"][grade]}`,compendium));
  const componentFolders = new Map();
  for (const [group,name] of [["containers","Recipientes"],["compounds","Compostos Fundamentais"],["modifiers","Modificadores"],["great-works","Grandes Obras"]]) componentFolders.set(group,await itemFolder(name,compendium));
  const schoolRoot = await itemFolder("Escolas de Pesquisa",root);
  const schoolFolders = new Map();
  for (const school of ALCHEMIST_SCHOOLS) schoolFolders.set(school.key,await itemFolder(school.name,schoolRoot));

  const sources = [
    itemSource(ALCHEMIST_CLASS,classFolder,"class"),
    ...ALCHEMIST_FEATURES.map(entry => itemSource(entry,classFolder)),
    ...ALCHEMIST_COMPONENTS.map(entry => itemSource(entry,componentFolders.get(entry.group))),
    ...ALCHEMIST_PROJECTS.map(entry => itemSource(entry,gradeFolders.get(entry.grade))),
    ...ALCHEMIST_GREAT_WORKS.map(entry => itemSource(entry,componentFolders.get("great-works"))),
    ...ALCHEMIST_SCHOOLS.flatMap(school => [
      itemSource(school,schoolFolders.get(school.key),"subclass"),
      ...school.features.map(entry => itemSource(entry,schoolFolders.get(school.key))),
      ...school.projects.map(entry => itemSource(entry,schoolFolders.get(school.key)))
    ])
  ];
  const items=[];
  for (const source of sources) items.push(await upsert(source));
  const byKey = new Map(items.map(item => [item.getFlag(MODULE_ID,"contentKey"),item]));
  await configureAdvancement(byKey);
  await updateActorCopies(sources);
  await game.settings.set(MODULE_ID,"alchemistContentVersion",CONTENT_VERSION);
  Hooks.callAll("novaEraAlchemistContentReady");
  if (notify) ui.notifications.info(`Nova Era: Alquimista instalado/atualizado (${items.length} itens).`);
  return items;
}

export async function ensureAlchemistContent() {
  if (!game.user.isGM) return;
  if (game.settings.get(MODULE_ID,"alchemistContentVersion") !== CONTENT_VERSION) await installAlchemistContent();
}
