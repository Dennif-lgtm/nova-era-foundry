import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.mjs";
import { planAlchemistTransmutation } from "../scripts/alchemist/transmuter-automation.mjs";

globalThis.game={time:{worldTime:0},combat:null};
globalThis.foundry={utils:{escapeHTML:value=>String(value)}};
const actor={items:[{type:"class",system:{identifier:"alchemist-nova-era",levels:7},getFlag:()=>null},...(["alchemist-transmuter-principles","alchemist-transmuter-conversion"].map(key=>({getFlag:(scope,field)=>field==="contentKey"?key:null})))],effects:[],getFlag:(scope,key)=>key==="alchemistPrinciplesKnown"?["conductivity","density","lightness"]:null};
const project={getFlag:(scope,key)=>key==="role"?"damage":null};

test("Conversão Elemental em ativação cobra 1 PR e incorpora um Princípio conhecido",async()=>{
  const answers=["lightning","conductivity"];
  globalThis.Dialog={confirm:async()=>true,prompt:async()=>answers.shift()};
  const plan=await planAlchemistTransmutation(actor,{compound:"igneous",convertedType:""},project,[{actor:{}}]);
  assert.equal(plan.conversionType,"lightning");
  assert.equal(plan.extraCost,1);
  assert.deepEqual(plan.principles,["conductivity"]);
});

test("sem Princípio conhecido nem conversão não cria custo extra",async()=>{
  const ordinary={...actor,items:actor.items.slice(0,1)};
  const plan=await planAlchemistTransmutation(ordinary,{compound:"igneous",convertedType:""},project,[{actor:{}}]);
  assert.deepEqual(plan,{principles:[],extraCost:0,conversionType:""});
});
