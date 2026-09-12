import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.mjs";
import { alchemistHasPlatformModule, configureAlchemistPlatforms } from "../scripts/alchemist/artificer-automation.mjs";

const player={id:"player",active:true,isGM:false};
globalThis.game={user:player,users:[player],combat:null};
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
