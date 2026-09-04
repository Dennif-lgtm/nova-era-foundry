import { MODULE_ID } from "./constants.mjs";
import { ExposureStore } from "./exposure/exposure-store.mjs";
import { postExposureCard } from "./exposure/exposure-chat.mjs";
import { registerAnalyzeAutomation } from "./exposure/analyze.mjs";
import { registerSneakAttackAutomation } from "./exposure/sneak-attack.mjs";
import { registerExposurePanel } from "./ui/exposure-panel.mjs";
import { openChronomancerClock, registerChronomancerPanel } from "./ui/chronomancer-panel.mjs";
import { registerChronomancerLibraryAndPrompts } from "./chronomancer/library-and-prompts.mjs";
import { registerChronomancerFoundationAutomation } from "./chronomancer/foundation-automation.mjs";
import { registerChronomancerDisciplineAutomation } from "./chronomancer/discipline-automation.mjs";
import { registerChronomancerGreatTheoryAutomation } from "./chronomancer/great-theory-automation.mjs";
import { registerBaseFeatureAutomation } from "./features/base-features.mjs";
import { registerAdvancedBaseFeatureAutomation } from "./features/advanced-base-features.mjs";
import { registerSecondaryEffects, secondaryMacroApi } from "./features/secondary-effects.mjs";
import { baseMacroApi } from "./features/macro-actions.mjs";
import { registerSubclassAutomation, subclassMacroApi } from "./features/subclass-features.mjs";
import { ensureRogueContent, installRogueContent } from "./content/rogue-installer.mjs";
import { ensureRogueMacros, installRogueMacros } from "./content/macro-installer.mjs";
import { ensureChronomancerContent, installChronomancerContent } from "./content/chronomancer-installer.mjs";

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Inicializando Nova Era`);

  game.settings.register(MODULE_ID, "clearExposureWhenCombatEnds", {
    name: "NOVAERA.Settings.ClearExposure.Name",
    hint: "NOVAERA.Settings.ClearExposure.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "rogueContentVersion", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "rogueMacroVersion", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "chronomancerContentVersion", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
});

Hooks.once("ready", async () => {
  game.novaEra = {
    exposure: {
      get: ExposureStore.get.bind(ExposureStore),
      set: ExposureStore.set.bind(ExposureStore),
      add: ExposureStore.add.bind(ExposureStore),
      consume: ExposureStore.consume.bind(ExposureStore),
      clearAll: ExposureStore.clearAll.bind(ExposureStore),
      postCard: postExposureCard
    },
    content: {
      installRogue: installRogueContent,
      installRogueMacros,
      installChronomancer: installChronomancerContent
    },
    chronomancer: {
      openClock: openChronomancerClock
    },
    macros: { ...baseMacroApi, ...secondaryMacroApi, ...subclassMacroApi }
  };

  registerAnalyzeAutomation();
  registerSneakAttackAutomation();
  registerExposurePanel();
  registerChronomancerPanel();
  registerChronomancerLibraryAndPrompts();
  registerChronomancerFoundationAutomation();
  registerChronomancerDisciplineAutomation();
  registerChronomancerGreatTheoryAutomation();
  registerBaseFeatureAutomation();
  registerAdvancedBaseFeatureAutomation();
  registerSecondaryEffects();
  registerSubclassAutomation();

  // A interface e as automacoes precisam continuar disponiveis mesmo quando
  // um documento antigo do mundo impede uma migracao de conteudo.
  try {
    await ensureRogueContent();
  } catch (error) {
    console.error(`${MODULE_ID} | Falha ao atualizar o conteudo do Ladino`, error);
    if (game.user.isGM) {
      ui.notifications.error("Nova Era: não foi possível atualizar alguns itens do Ladino. O painel continua disponível; consulte o console para detalhes.");
    }
  }

  try {
    await ensureRogueMacros();
  } catch (error) {
    console.error(`${MODULE_ID} | Falha ao atualizar as macros do Ladino`, error);
    if (game.user.isGM) {
      ui.notifications.error("Nova Era: não foi possível atualizar algumas macros do Ladino. Consulte o console para detalhes.");
    }
  }

  try {
    await ensureChronomancerContent();
  } catch (error) {
    console.error(`${MODULE_ID} | Falha ao atualizar o conteudo do Cronomante`, error);
    if (game.user.isGM) {
      ui.notifications.error("Nova Era: não foi possível atualizar alguns itens do Cronomante. Consulte o console para detalhes.");
    }
  }

  console.info(`${MODULE_ID} | API disponível em game.novaEra`);
});

Hooks.on("deleteCombat", async () => {
  if (!game.user.isGM) return;
  if (!game.settings.get(MODULE_ID, "clearExposureWhenCombatEnds")) return;
  await ExposureStore.clearAll();
});
