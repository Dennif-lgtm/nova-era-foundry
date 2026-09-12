import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.mjs";
import { alchemistCanOperate, alchemistState, applyAlchemistDamage, configureAlchemistEngineering } from "../scripts/alchemist/core-automation.mjs";
import { registerAlchemistTriggerAutomation } from "../scripts/alchemist/trigger-automation.mjs";

Math.clamp ??= (value,min,max)=>Math.max(min,Math.min(max,value));
const player={id:"player",active:true,isGM:false};
const gm={id:"gm",active:true,isGM:true};
globalThis.game={user:player,users:Object.assign([player,gm],{activeGM:gm}),combat:null,time:{worldTime:0}};
globalThis.fromUuid=async uuid=>documents.get(uuid);
globalThis.foundry={utils:{getProperty:(object,path)=>path.split(".").reduce((value,key)=>value?.[key],object),setProperty:(object,path,value)=>{const parts=path.split(".");const leaf=parts.pop();const parent=parts.reduce((part,key)=>part[key]??=( {} ),object);parent[leaf]=value;},escapeHTML:value=>String(value),randomID:()=>"test-id"}};
globalThis.Hooks={handlers:new Map(),on(name,callback){this.handlers.set(name,[...(this.handlers.get(name)??[]),callback]);},callAll(){}};
globalThis.ChatMessage={getSpeaker:()=>({}),create:async()=>({})};
globalThis.Roll=class{constructor(formula){this.formula=formula;this.total=String(formula).startsWith("1d20")?20:5;}async evaluate(){return this;}async toMessage(){}};
globalThis.ui={notifications:{warn(){},error(){}}};
const documents=new Map();

function makeActor({level=9,hp=20,traits={},state={}}={}){
  const actor={uuid:`Actor.${documents.size+1}`,documentName:"Actor",isOwner:true,name:"Teste",items:[{type:"class",system:{identifier:"alchemist-nova-era",levels:level},getFlag(){return null;}}],system:{attributes:{prof:4,hp:{value:hp,max:hp,temp:0}},traits},flags:{[MODULE_ID]:{alchemistState:state}},testUserPermission(user){return user.id==="player";},getFlag(scope,key){return this.flags[scope]?.[key];},async setFlag(scope,key,value){(this.flags[scope]??={})[key]=value;},getRollData(){return{};},async update(changed){for(const [path,value]of Object.entries(changed)){if(path==="system.attributes.hp.value")this.system.attributes.hp.value=value;if(path==="system.attributes.hp.temp")this.system.attributes.hp.temp=value;}}};
  documents.set(actor.uuid,actor);return actor;
}

test("Reservas Catalíticas ocupam a capacidade do laboratório",()=>{
  const actor=makeActor({state:{prepared:[{projectKey:"a"},{projectKey:"b"},{projectKey:"c"},{projectKey:"d"}],reserves:2}});
  const state=alchemistState(actor);
  assert.equal(state.capacity,7);
  assert.equal(state.reserves,2);
  actor.flags[MODULE_ID].alchemistState.prepared.push({projectKey:"e"},{projectKey:"f"});
  assert.equal(alchemistState(actor).reserves,1);
});

test("GM pode operar a ficha mesmo com o jogador dono conectado",()=>{
  const actor=makeActor();
  game.user=gm;assert.equal(alchemistCanOperate(actor),true);
  game.user=player;assert.equal(alchemistCanOperate(actor),true);
});

test("dano alquímico respeita resistência, imunidade e vulnerabilidade",async()=>{
  game.user=gm;
  const resistant=makeActor({traits:{dr:{value:new Set(["fire"])}}});
  await applyAlchemistDamage(resistant,12,"fire");assert.equal(resistant.system.attributes.hp.value,14);
  const immune=makeActor({traits:{di:{value:new Set(["poison"])}}});
  await applyAlchemistDamage(immune,12,"poison");assert.equal(immune.system.attributes.hp.value,20);
  const vulnerable=makeActor({traits:{dv:{value:new Set(["cold"])}}});
  await applyAlchemistDamage(vulnerable,5,"cold");assert.equal(vulnerable.system.attributes.hp.value,10);
});

test("Fórmula alquímica também aciona a proteção reativa do alvo",async()=>{
  game.user=gm;
  const target=makeActor({hp:20});let deleted=false;
  target.effects=[{uuid:"ward-direct-formula",isOwner:true,disabled:false,getFlag:(scope,key)=>key==="alchemistDamageWard"?"prism":key==="alchemistWardAmount"?5:null,delete:async()=>{deleted=true;}}];
  await applyAlchemistDamage(target,10,"fire");
  assert.equal(target.system.attributes.hp.value,15);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(deleted,true);
});

test("Coagulante dispara quando o alvo cruza metade dos PV, uma única vez",async()=>{
  game.user=player;game.time.worldTime=0;
  const target=makeActor({hp:20});target.items=[];
  const alchemist=makeActor({state:{active:[{id:"coagulant-1",kind:"coagulant",targetActorUuid:target.uuid,charges:1,expiresAt:3600}]}});
  game.actors=[alchemist,target];
  registerAlchemistTriggerAutomation();
  const changed={system:{attributes:{hp:{value:6}}}};
  for(const callback of Hooks.handlers.get("preUpdateActor")??[])callback(target,changed,{});
  target.system.attributes.hp.value=6;
  for(const callback of Hooks.handlers.get("updateActor")??[])callback(target,changed,{});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(target.system.attributes.hp.value,11);
  assert.equal(alchemistState(alchemist).active.length,0);
});

test("Retardado resolve no tempo programado sem nova cobrança de PR",async()=>{
  game.user=player;game.time.worldTime=7;
  const target=makeActor({hp:20});target.items=[];target.system.attributes.ac={value:10};
  const token={uuid:"Scene.Token.Test",actor:target,object:{actor:target,name:"Alvo"}};documents.set(token.uuid,token);
  const formula={label:"Carga Ígnea Retardada",projectKey:"alchemist-project-charge",projectName:"Carga Alquímica",compound:"igneous",container:"flask",modifiers:["delayed"],cost:2};
  const alchemist=makeActor({state:{points:10,active:[{id:"delay-1",kind:"delayed",formula,targetActorUuid:target.uuid,targetTokenUuid:token.uuid,dueAt:6,charges:1,expiresAt:3600}]}});
  alchemist.items.push({name:"Carga Alquímica",getFlag(scope,key){return key==="contentKey"?"alchemist-project-charge":key==="dice"?"2d6":key==="role"?"damage":null;}});
  game.actors=[alchemist,target];
  for(const callback of Hooks.handlers.get("updateWorldTime")??[])callback();
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(target.system.attributes.hp.value,15);
  assert.equal(alchemistState(alchemist).points,10);
  assert.equal(alchemistState(alchemist).active.length,0);
});

test("Engenharia exige dois Modificadores e registra escolhas sem gastar PR",async()=>{
  game.user=player;
  const actor=makeActor({level:14,state:{points:12}});
  for(const [key,cost] of [["alchemist-engineering",0],["alchemist-modifier-expanded",1],["alchemist-modifier-penetrating",1]])actor.items.push({name:key,getFlag(scope,field){return field==="contentKey"?key:field==="group"?key.startsWith("alchemist-modifier-")?"modifiers":"alchemist":field==="reagentCost"?cost:null;}});
  const picks=["expanded","penetrating"];
  globalThis.Dialog={prompt:async()=>picks.shift()};
  assert.equal(await configureAlchemistEngineering(actor),true);
  assert.deepEqual(actor.getFlag(MODULE_ID,"alchemistEngineeredModifiers"),["expanded","penetrating"]);
  assert.equal(alchemistState(actor).points,12);
});
