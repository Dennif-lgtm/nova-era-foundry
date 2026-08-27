import { MODULE_ID } from "../constants.mjs";
import { ROGUE_CLASS, ROGUE_FEATURES, ROGUE_SUBCLASSES } from "./rogue-data.mjs";

const CONTENT_VERSION = "1";

function itemSource({ key, name, type = "feat", description, level = 0, group = "base" }, folder) {
  const system = { description: { value: description, chat: "" } };
  if (type === "class") Object.assign(system, { identifier: "ladino-nova-era", hitDice: "d8" });
  if (type === "subclass") Object.assign(system, { identifier: key, classIdentifier: "ladino-nova-era" });
  return {
    name,
    type,
    folder: folder.id,
    system,
    flags: { [MODULE_ID]: { contentKey: key, level, group, contentVersion: CONTENT_VERSION } }
  };
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
  await game.settings.set(MODULE_ID, "rogueContentVersion", CONTENT_VERSION);
  if (notify) ui.notifications.info(`Nova Era: Ladino completo instalado/atualizado (${results.length} itens).`);
  return results;
}

export async function ensureRogueContent() {
  if (!game.user.isGM) return;
  const installed = game.settings.get(MODULE_ID, "rogueContentVersion");
  if (installed !== CONTENT_VERSION) await installRogueContent();
}
