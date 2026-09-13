import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.mjs";
import { alchemistHasPlatformModule, alchemistPlatformModules, applyAlchemistStabilizer, configureAlchemistPlatforms } from "../scripts/alchemist/artificer-automation.mjs";

const player={id:"player",active:true,isGM:false};
globalThis.game={user:player,users:[player],combat:null,time:{worldTime:0}};
globalThis.foundry={utils:{escapeHTML:value=>String(value)}};
globalThis.ChatMessage={getSpeaker:()=>({}),create:async()=>({})};
globalThis.ui={notifications:{warn(){},info(){}}};
const weapon={uuid:"Actor.A.Item.W",type:"weapon",name:"Espada",system:{equipped:true}};
const actor={id:"A",uuid:"Actor.A",name:"Artífice",isOwner:true,flags:{[MODULE_ID]:{}},items:[{type:"class",system:{identifier:"alchemist-nova-era",levels:3},getFlag:()=>null},{getFlag:(scope,key)=>key==="contentKey"?"alchemist-artificer-platform":null},weapon],getFlag(scope,key){return this.flags[scope]?.[key];},async setFlag(scope,key,value){this.flags[scope][key]=value;},testUserPermission(user){return user.id==="player";}};

test("Plataforma guarda apenas Módulos conhecidos e compatíveis",async()=>{
  const picks=["injector","launcher","stabilizer",weapon.uuid,"injector","launcher"];
  globalThis.Dialog={prompt:async()=>picks.shift()};
  assert.equal(await configureAlchemistPlatforms(actor),true);
  assert.deepEqual(actor.getFlag(MODULE_ID,"alchemistPlatforms"),[{itemUuid:weapon.uuid,modules:["injector","launcher"]}]);
  assert.equal(alchemistHasPlatformModule(actor,"injector"),true);
  assert.equal(alchemistHasPlatformModule(actor,"reactiveArmor"),false);
  weapon.system.equipped=false;
  assert.equal(alchemistHasPlatformModule(actor,"injector"),false);
});

test("Sobrecarga adiciona apenas o Módulo temporário e expira após um minuto",async()=>{
  weapon.system.equipped=true;
  actor.flags[MODULE_ID].alchemistPlatforms=[{itemUuid:weapon.uuid,modules:["injector","launcher"]}];
  actor.flags[MODULE_ID].alchemistOverload={itemUuid:weapon.uuid,module:"impact",expiresAt:60,combatId:"",expiryRound:0};
  assert.deepEqual(alchemistPlatformModules(actor,weapon.uuid),["injector","launcher","impact"]);
  game.time.worldTime=61;
  assert.deepEqual(alchemistPlatformModules(actor,weapon.uuid),["injector","launcher"]);
});

test("Estabilizador remove só a desvantagem por inimigo próximo",()=>{
  game.time.worldTime=0;
  actor.flags[MODULE_ID].alchemistOverload=null;
  actor.flags[MODULE_ID].alchemistPlatforms=[{itemUuid:weapon.uuid,modules:["stabilizer"]}];
  let cleared=0;
  const tracker={attribution:{DIS:{nearbyFoe:"Nearby foe"}},disadvantage:{clear(){cleared++;}}};
  assert.equal(applyAlchemistStabilizer({actor,item:weapon,attackRollModifierTracker:tracker}),true);
  assert.equal(cleared,1);
  tracker.attribution.DIS.invisible="Invisible foe";
  assert.equal(applyAlchemistStabilizer({actor,item:weapon,attackRollModifierTracker:tracker}),false);
  assert.equal(cleared,1);
});
