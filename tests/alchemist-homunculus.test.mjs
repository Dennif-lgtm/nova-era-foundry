import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.mjs";
import { alchemistHomunculusDeliveryReady } from "../scripts/alchemist/homunculus-automation.mjs";

function servant(flags){return{getFlag:(scope,key)=>scope===MODULE_ID?flags[key]:undefined};}

test("Homúnculo só entrega a Fórmula na rodada seguinte",()=>{
  const loaded=servant({alchemistCarriedReadyAt:106,alchemistCarriedReadyRound:4,alchemistCarriedCombatId:"combat-1"});
  assert.equal(alchemistHomunculusDeliveryReady(loaded,{worldTime:100,combat:{id:"combat-1",started:true,round:3}}),false);
  assert.equal(alchemistHomunculusDeliveryReady(loaded,{worldTime:100,combat:{id:"combat-1",started:true,round:4}}),true);
});

test("fora de combate, o carregamento do Homúnculo leva seis segundos",()=>{
  const loaded=servant({alchemistCarriedReadyAt:106,alchemistCarriedReadyRound:0,alchemistCarriedCombatId:""});
  assert.equal(alchemistHomunculusDeliveryReady(loaded,{worldTime:105,combat:null}),false);
  assert.equal(alchemistHomunculusDeliveryReady(loaded,{worldTime:106,combat:null}),true);
});
