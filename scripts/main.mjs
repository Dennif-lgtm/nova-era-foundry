import { MODULE_ID } from "./constants.mjs";
import { ExposureStore } from "./exposure/exposure-store.mjs";
import { postExposureCard } from "./exposure/exposure-chat.mjs";
import { registerAnalyzeAutomation } from "./exposure/analyze.mjs";
import { registerSneakAttackAutomation } from "./exposure/sneak-attack.mjs";
import { registerExposurePanel } from "./ui/exposure-panel.mjs";
import { registerBaseFeatureAutomation } from "./features/base-features.mjs";
import { ensureRogueContent, installRogueContent } from "./content/rogue-installer.mjs";

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
    content: { installRogue: installRogueContent }
  };

  await ensureRogueContent();
  registerAnalyzeAutomation();
  registerSneakAttackAutomation();
  registerExposurePanel();
  registerBaseFeatureAutomation();

  console.info(`${MODULE_ID} | API disponível em game.novaEra`);
});

Hooks.on("deleteCombat", async () => {
  if (!game.user.isGM) return;
  if (!game.settings.get(MODULE_ID, "clearExposureWhenCombatEnds")) return;
  await ExposureStore.clearAll();
});
