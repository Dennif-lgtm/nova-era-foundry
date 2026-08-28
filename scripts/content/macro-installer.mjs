import { MODULE_ID } from "../constants.mjs";

const MACRO_VERSION = "1";

const MACROS = [
  ["leitura-ataque", "Leitura Completa — Ataque +2", "readingAttack", "icons/svg/sword.svg"],
  ["leitura-resistencia", "Leitura Completa — Resistência +2", "readingSave", "icons/svg/shield.svg"],
  ["antecipar-golpe", "Antecipar Golpe — Aplicar +4 CA", "anticipationArmor", "icons/svg/shield.svg"],
  ["encerrar-antecipar-golpe", "Antecipar Golpe — Remover +4 CA", "clearAnticipationArmor", "icons/svg/cancel.svg"],
  ["antecipar-movimento", "Antecipar Movimento", "anticipationMovement", "icons/svg/wingfoot.svg"],
  ["antecipar-tecnica", "Antecipar Técnica — Resistência +4", "anticipationSave", "icons/svg/aura.svg"]
];

function macroSource([key, name, method, img], folder) {
  return {
    name,
    type: "script",
    img,
    folder: folder.id,
    scope: "global",
    command: `await game.novaEra.macros.${method}();`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { [MODULE_ID]: { macroKey: key, macroVersion: MACRO_VERSION } }
  };
}

export async function installRogueMacros({ notify = true } = {}) {
  if (!game.user.isGM) return [];
  let folder = game.folders.find(entry => entry.type === "Macro" && entry.name === "Nova Era — Macros do Ladino");
  folder ??= await Folder.create({ name: "Nova Era — Macros do Ladino", type: "Macro", sorting: "a" });
  const results = [];
  for (const definition of MACROS) {
    const source = macroSource(definition, folder);
    const existing = game.macros.find(macro => macro.getFlag(MODULE_ID, "macroKey") === definition[0]);
    results.push(existing ? await existing.update(source) : await Macro.create(source));
  }
  await game.settings.set(MODULE_ID, "rogueMacroVersion", MACRO_VERSION);
  if (notify) ui.notifications.info(`Nova Era: macros do Ladino instaladas/atualizadas (${results.length}).`);
  return results;
}

export async function ensureRogueMacros() {
  if (!game.user.isGM) return;
  if (game.settings.get(MODULE_ID, "rogueMacroVersion") !== MACRO_VERSION) await installRogueMacros();
}
