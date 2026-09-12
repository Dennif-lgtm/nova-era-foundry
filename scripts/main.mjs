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
import { registerChronomancerParadoxAutomation } from "./chronomancer/paradox-automation.mjs";
import { registerChronomancerEffectEngine } from "./chronomancer/effect-engine.mjs";
import { registerChronomancerFeatureAutomation } from "./chronomancer/feature-automation.mjs";
import { registerChronomancerConfluenceAutomation } from "./chronomancer/confluence-automation.mjs";
import { activateChronomancerFeature, registerChronomancerAdvancedFeatureAutomation } from "./chronomancer/advanced-feature-automation.mjs";
import { registerBaseFeatureAutomation } from "./features/base-features.mjs";
import { registerAdvancedBaseFeatureAutomation } from "./features/advanced-base-features.mjs";
import { registerSecondaryEffects, secondaryMacroApi } from "./features/secondary-effects.mjs";
import { baseMacroApi } from "./features/macro-actions.mjs";
import { registerSubclassAutomation, subclassMacroApi } from "./features/subclass-features.mjs";
import { ensureRogueContent, installRogueContent } from "./content/rogue-installer.mjs";
import { ensureRogueMacros, installRogueMacros } from "./content/macro-installer.mjs";
import { ensureChronomancerContent, installChronomancerContent } from "./content/chronomancer-installer.mjs";
import { ensureBerserkerContent, installBerserkerContent } from "./content/berserker-installer.mjs";
import { ensureNecromancerContent, installNecromancerContent } from "./content/necromancer-installer.mjs";
import { ensureAlchemistContent, installAlchemistContent } from "./content/alchemist-installer.mjs";
import { gainBlood, registerBerserkerAutomation, setBloodPoints, spendBlood, useBloodTechnique, useBrutalStrike } from "./berserker/core-automation.mjs";
import { openBerserkerPanel, registerBerserkerPanel } from "./ui/berserker-panel.mjs";
import { registerBerserkerTechniqueAutomation } from "./berserker/technique-automation.mjs";
import { registerBerserkerAdvancedTechniqueAutomation } from "./berserker/advanced-technique-automation.mjs";
import { registerBerserkerProgressionAutomation } from "./berserker/progression-automation.mjs";
import { registerBerserkerLegacyAutomation } from "./berserker/legacy-automation.mjs";
import { cadavericState, gainCadavericEssence, registerNecromancerAutomation, setCadavericEssence, spendCadavericEssence, useCorpseExplosion, useDeathMark, useLesserReanimation, useProfaneSacrifice, useProfaneTouch } from "./necromancer/core-automation.mjs";
import { activateNecromancerFeature, issueNecromanticOrder, registerNecromancerAdvancedAutomation } from "./necromancer/advanced-automation.mjs";
import { openNecromancerPanel, registerNecromancerPanel } from "./ui/necromancer-panel.mjs";
import { activateAlchemistFormula, alchemistState, buildAlchemistFormula, gainReagentPoints, prepareAlchemistFormula, prepareDangerousExperiment, registerAlchemistAutomation, setReagentPoints, spendReagentPoints } from "./alchemist/core-automation.mjs";
import { offerAlchemistProgression, registerAlchemistProgressionAutomation } from "./alchemist/progression-automation.mjs";
import { openAlchemistPanel, registerAlchemistPanel } from "./ui/alchemist-panel.mjs";

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

  game.settings.register(MODULE_ID, "berserkerContentVersion", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "necromancerContentVersion", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "alchemistContentVersion", {
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
      installChronomancer: installChronomancerContent,
      installBerserker: installBerserkerContent,
      installNecromancer: installNecromancerContent,
      installAlchemist: installAlchemistContent
    },
    chronomancer: {
      openClock: openChronomancerClock,
      activateFeature: activateChronomancerFeature
    },
    berserker: {
      openPanel: openBerserkerPanel,
      setBlood: setBloodPoints,
      gainBlood,
      spendBlood,
      useTechnique: useBloodTechnique,
      brutalStrike: useBrutalStrike
    },
    necromancer: {
      openPanel: openNecromancerPanel,
      state: cadavericState,
      setEssence: setCadavericEssence,
      gainEssence: gainCadavericEssence,
      spendEssence: spendCadavericEssence,
      mark: useDeathMark,
      profaneTouch: useProfaneTouch,
      sacrifice: useProfaneSacrifice,
      reanimate: useLesserReanimation,
      corpseExplosion: useCorpseExplosion,
      activateFeature: activateNecromancerFeature,
      order: issueNecromanticOrder
    },
    alchemist: {
      openPanel: openAlchemistPanel,
      state: alchemistState,
      setReagents: setReagentPoints,
      gainReagents: gainReagentPoints,
      spendReagents: spendReagentPoints,
      buildFormula: buildAlchemistFormula,
      prepareFormula: prepareAlchemistFormula,
      experiment: prepareDangerousExperiment,
      activateFormula: activateAlchemistFormula,
      offerProgression: offerAlchemistProgression
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
  registerChronomancerParadoxAutomation();
  registerChronomancerEffectEngine();
  registerChronomancerFeatureAutomation();
  registerChronomancerConfluenceAutomation();
  registerChronomancerAdvancedFeatureAutomation();
  registerBerserkerAutomation();
  registerBerserkerTechniqueAutomation();
  registerBerserkerAdvancedTechniqueAutomation();
  registerBerserkerProgressionAutomation();
  registerBerserkerLegacyAutomation();
  registerBerserkerPanel();
  registerNecromancerAutomation();
  registerNecromancerAdvancedAutomation();
  registerNecromancerPanel();
  registerAlchemistAutomation();
  registerAlchemistProgressionAutomation();
  registerAlchemistPanel();
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

  try {
    await ensureBerserkerContent();
  } catch (error) {
    console.error(`${MODULE_ID} | Falha ao atualizar o conteudo do Berserker`, error);
    if (game.user.isGM) {
      ui.notifications.error("Nova Era: não foi possível atualizar alguns itens do Berserker. Consulte o console para detalhes.");
    }
  }

  try {
    await ensureNecromancerContent();
  } catch (error) {
    console.error(`${MODULE_ID} | Falha ao atualizar o conteudo do Necromante`, error);
    if (game.user.isGM) {
      ui.notifications.error("Nova Era: não foi possível atualizar alguns itens do Necromante. Consulte o console para detalhes.");
    }
  }

  try {
    await ensureAlchemistContent();
  } catch (error) {
    console.error(`${MODULE_ID} | Falha ao atualizar o conteúdo do Alquimista`, error);
    if (game.user.isGM) {
      ui.notifications.error("Nova Era: não foi possível atualizar alguns itens do Alquimista. A Maleta de Síntese continua disponível; consulte o console para detalhes.");
    }
  }

  console.info(`${MODULE_ID} | API disponível em game.novaEra`);
});

Hooks.on("deleteCombat", async () => {
  if (!game.user.isGM) return;
  if (!game.settings.get(MODULE_ID, "clearExposureWhenCombatEnds")) return;
  await ExposureStore.clearAll();
});
