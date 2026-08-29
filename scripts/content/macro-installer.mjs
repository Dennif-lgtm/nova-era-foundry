import { MODULE_ID } from "../constants.mjs";

const MACRO_VERSION = "2";

const MACROS = [
  ["analisar", "Exposição — Analisar", "analyze", "icons/svg/eye.svg"],
  ["ataque-furtivo", "Ataque Furtivo", "sneakAttack", "icons/svg/blood.svg"],
  ["lamina-teste", "Lâmina de Teste", "testBlade", "icons/svg/sword.svg"],
  ["ponto-cego-hide", "Ponto Cego — Hide", "blindSpotHide", "icons/svg/mystery-man.svg"],
  ["ponto-cego-disengage", "Ponto Cego — Disengage", "blindSpotDisengage", "icons/svg/wingfoot.svg"],
  ["perfuracao-precisa", "Exploração — Perfuração Precisa", "precisePiercing", "icons/svg/sword.svg"],
  ["quebra-ritmo", "Exploração — Quebra de Ritmo", "breakRhythm", "icons/svg/daze.svg"],
  ["corte-passo", "Exploração — Corte de Passo", "cutStride", "icons/svg/downgrade.svg"],
  ["evasao", "Evasão — Resolver", "evasion", "icons/svg/wingfoot.svg"],
  ["golpe-decifrado", "Golpe Decifrado", "decipheredStrike", "icons/svg/target.svg"],
  ["leitura-ataque", "Leitura Completa — Ataque +2", "readingAttack", "icons/svg/sword.svg"],
  ["leitura-resistencia", "Leitura Completa — Resistência +2", "readingSave", "icons/svg/shield.svg"],
  ["antecipar-golpe", "Antecipar Golpe — Aplicar +4 CA", "anticipationArmor", "icons/svg/shield.svg"],
  ["encerrar-antecipar-golpe", "Antecipar Golpe — Remover +4 CA", "clearAnticipationArmor", "icons/svg/cancel.svg"],
  ["antecipar-movimento", "Antecipar Movimento", "anticipationMovement", "icons/svg/wingfoot.svg"],
  ["antecipar-tecnica", "Antecipar Técnica — Resistência +4", "anticipationSave", "icons/svg/aura.svg"],
  ["primeira-impressao", "Olhar do Predador — Primeira Impressão", "firstImpression", "icons/svg/eye.svg"],
  ["nenhum-erro", "Olhar do Predador — Nenhum Erro", "noticedError", "icons/svg/upgrade.svg"],
  ["falha-fatal", "Olhar do Predador — Falha Fatal", "fatalFlaw", "icons/svg/skull.svg"],
  ["presenca-inalcancavel", "Fantasma — Presença Inalcançável", "unreachablePresence", "icons/svg/wingfoot.svg"],
  ["desvanecer", "Fantasma — Desvanecer", "fade", "icons/svg/invisible.svg"],
  ["forma-fantasma", "Fantasma — Forma Fantasma", "ghostForm", "icons/svg/mystery-man.svg"],
  ["brecha-mortal-1", "Assassino — Brecha Mortal −1", "mortalBreachOne", "icons/svg/blood.svg"],
  ["brecha-mortal-2", "Assassino — Brecha Mortal −2", "mortalBreachTwo", "icons/svg/blood.svg"],
  ["paciencia-mortal", "Assassino — Paciência Mortal", "mortalPatience", "icons/svg/clockwork.svg"],
  ["escolher-presa", "Rastreador — Escolher Presa", "choosePrey", "icons/svg/target.svg"],
  ["dano-pressao", "Rastreador — Dano de Pressão", "pressureDamage", "icons/svg/blood.svg"],
  ["cacada-persistente", "Rastreador — Caçada Persistente", "persistentHunt", "icons/svg/wingfoot.svg"],
  ["manter-pressao", "Rastreador — Manter Pressão", "maintainPressure", "icons/svg/clockwork.svg"],
  ["leitura-incansavel", "Rastreador — Leitura Incansável", "recycleExposure", "icons/svg/upgrade.svg"],
  ["abandonar-presa", "Rastreador — Abandonar Presa", "abandonPrey", "icons/svg/cancel.svg"]
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
