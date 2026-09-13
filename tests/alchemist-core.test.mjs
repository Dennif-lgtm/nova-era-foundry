import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.mjs";
import { alchemistCanOperate, alchemistState, applyAlchemistDamage, configureAlchemistEngineering, planAlchemistExperiment } from "../scripts/alchemist/core-automation.mjs";
import { registerAlchemistTriggerAutomation } from "../scripts/alchemist/trigger-automation.mjs";
import { applyAlchemistContainment } from "../scripts/alchemist/containment-automation.mjs";
import { applyAlchemistDamageInterception } from "../scripts/alchemist/damage-interception.mjs";

Math.clamp ??= (value,min,max)=>Math.max(min,Math.min(max,value));
const player={id:"player",active:true,isGM:false};
const gm={id:"gm",active:true,isGM:true};
globalThis.game={user:player,users:Object.assign([player,gm],{activeGM:gm}),combat:null,time:{worldTime:0}};
globalThis.CONST={ACTIVE_EFFECT_MODES:{ADD:2}};
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

test("Matriz Adaptativa não registra duas vezes o mesmo evento de dano",async()=>{
  game.user=gm;
  const target=makeActor({hp:20});let created=0;
  target.effects=[{id:"matrix-guard",uuid:"matrix-guard",disabled:false,img:"matrix.webp",getFlag:(scope,key)=>key==="alchemistAdaptiveMatrix"?true:key==="sourceUuid"?"Actor.Matriz":null}];
  target.createEmbeddedDocuments=async()=>{created++;};
  game.actors??=[];game.actors.get=()=>null;
  const damageItem={damageDetail:[{type:"fire",value:8}],details:[]};
  applyAlchemistDamageInterception({actor:target},{damageItem,force:true});
  applyAlchemistDamageInterception({actor:target},{damageItem,force:true});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(created,1);
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

test("Experimentação guarda alcance favorável para não permitir nova rolagem ao cancelar",async()=>{
  game.user=player;
  const formula={projectKey:"alchemist-project-charge",projectName:"Carga Alquímica",container:"flask",modifiers:[],cost:1,improvised:true};
  const actor=makeActor({state:{improvised:formula}});
  const project={getFlag(scope,key){return key==="contentKey"?"alchemist-project-charge":null;}};
  let rolls=0;
  globalThis.Roll=class{constructor(){this.total=5;rolls++;}async evaluate(){return this;}async toMessage(){}};
  globalThis.Dialog={prompt:async()=>"range"};
  assert.deepEqual(await planAlchemistExperiment(actor,alchemistState(actor).improvised,project),{result:5,choice:"range"});
  assert.deepEqual(await planAlchemistExperiment(actor,alchemistState(actor).improvised,project),{result:5,choice:"range"});
  assert.equal(rolls,1);
  assert.equal(alchemistState(actor).improvised.experimentChoice,"range");
});

test("Descoberta permite Potencialização apenas quando há dano ou cura imediatos",async()=>{
  game.user=player;
  const formula={projectKey:"alchemist-project-charge",projectName:"Carga Alquímica",container:"flask",modifiers:[],cost:1,improvised:true};
  const actor=makeActor({state:{improvised:formula}});
  const project={getFlag(scope,key){return key==="contentKey"?"alchemist-project-charge":null;}};
  globalThis.Roll=class{constructor(){this.total=6;}async evaluate(){return this;}async toMessage(){}};
  globalThis.Dialog={prompt:async()=>"potential"};
  assert.deepEqual(await planAlchemistExperiment(actor,alchemistState(actor).improvised,project),{result:6,choice:"potential"});
  assert.equal(alchemistState(actor).improvised.experimentResult,6);
});

test("Fórmula improvisada expira ao terminar o próximo turno do Alquimista",async()=>{
  game.user=player;
  const actor=makeActor({state:{improvised:{projectKey:"alchemist-project-charge",container:"flask",modifiers:[],cost:1,experimentCombatId:"combat-test",experimentExpiryRound:3}}});
  game.actors=[actor];
  const combat={id:"combat-test",started:true,round:3,turn:0,combatant:{actor}};
  game.combat=combat;
  for(const callback of Hooks.handlers.get("preUpdateCombat")??[])callback(combat,{turn:1});
  combat.turn=1;
  combat.combatant={actor:null};
  for(const callback of Hooks.handlers.get("updateCombat")??[])callback(combat,{turn:1});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(alchemistState(actor).improvised,null);
  game.combat=null;
});

test("Desestabilizador ignora só a resistência escolhida para a Fórmula do criador",async()=>{
  game.user=gm;
  const source=makeActor(),outsider=makeActor();
  const target=makeActor({hp:30,traits:{dr:{value:new Set(["fire","cold"])}}});
  target.effects=[{disabled:false,getFlag(scope,key){return key==="alchemistDestabilizerType"?"fire":key==="sourceUuid"?source.uuid:null;}}];
  await applyAlchemistDamage(target,10,"fire",source);
  assert.equal(target.system.attributes.hp.value,20);
  await applyAlchemistDamage(target,10,"cold",source);
  assert.equal(target.system.attributes.hp.value,15);
  await applyAlchemistDamage(target,10,"fire",outsider);
  assert.equal(target.system.attributes.hp.value,10);
});

test("Contenção oferece a Reação preparada uma vez e só reduz o dano compatível",async()=>{
  game.user=player;game.combat=null;
  const source=makeActor({state:{points:5,prepared:[{projectKey:"alchemist-project-containment",option:"fire",container:"none",cost:2}]}});
  const target=makeActor();
  const sourceToken={actor:source,center:{x:0,y:0}},targetToken={actor:target,center:{x:3,y:0}};
  source.getActiveTokens=()=>[sourceToken];target.getActiveTokens=()=>[targetToken];
  game.actors=[source,target];
  globalThis.canvas={grid:{measurePath:([from,to])=>({distance:Math.abs(from.x-to.x)})}};
  globalThis.Dialog={confirm:async()=>true};
  globalThis.Roll=class{constructor(){this.total=10;}async evaluate(){return this;}async toMessage(){}};
  const damageItem={damageDetail:[{type:"fire",value:12},{type:"poison",value:4}]};
  assert.equal(await applyAlchemistContainment(targetToken,{damageItem}),true);
  assert.deepEqual(damageItem.damageDetail.map(part=>part.value),[2,4]);
  assert.equal(alchemistState(source).points,3);
  const again={damageDetail:[{type:"fire",value:12}]};
  assert.equal(await applyAlchemistContainment(targetToken,{damageItem:again}),false);
  assert.equal(again.damageDetail[0].value,12);
});

test("Agente Condutor propaga dano ao vizinho uma vez por rodada e consome carga",async()=>{
  game.user=player;game.combat=null;
  const source=makeActor(),target=makeActor({hp:30}),secondary=makeActor({hp:20});
  const targetToken={actor:target,name:"Alvo",center:{x:0,y:0},document:{uuid:"Scene.Token.ConductorTarget"}};
  const secondaryToken={actor:secondary,name:"Vizinho",center:{x:2,y:0},document:{uuid:"Scene.Token.ConductorNeighbor"}};
  target.getActiveTokens=()=>[targetToken];secondary.getActiveTokens=()=>[secondaryToken];
  game.actors=[source,target,secondary];
  globalThis.canvas={grid:{measurePath:([from,to])=>({distance:Math.abs(from.x-to.x)})},tokens:{placeables:[targetToken,secondaryToken]}};
  const flags={alchemistConductorType:"fire",alchemistConductorCharges:2,sourceUuid:source.uuid};
  const active={id:"conductor-effect",uuid:"conductor-effect",disabled:false,getFlag(scope,key){return flags[key];},async setFlag(scope,key,value){flags[key]=value;}};
  target.effects=Object.assign([active],{get:id=>id===active.id?active:null});
  globalThis.Dialog={prompt:async()=>secondaryToken.document.uuid};
  globalThis.Roll=class{constructor(){this.total=4;}async evaluate(){return this;}async toMessage(){}};
  await applyAlchemistDamage(target,8,"fire",source);
  assert.equal(target.system.attributes.hp.value,22);
  assert.equal(secondary.system.attributes.hp.value,16);
  assert.equal(flags.alchemistConductorCharges,1);
  await applyAlchemistDamage(target,8,"fire",source);
  assert.equal(secondary.system.attributes.hp.value,16);
});
