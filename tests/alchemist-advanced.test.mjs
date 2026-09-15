import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.mjs";
import { activateAlchemistCompatibility, activateAlchemistFormula, activateAlchemistRecursiveEcho, activateAlchemistTransposition, resolveAlchemistControl, resolveAlchemistTransfer } from "../scripts/alchemist/core-automation.mjs";
import { handleAlchemistChainReaction, handleAlchemistEthericInterference } from "../scripts/alchemist/trigger-automation.mjs";
import { markAlchemistCoatedAmmunition } from "../scripts/alchemist/damage-interception.mjs";

Math.clamp ??= (value,min,max)=>Math.max(min,Math.min(max,value));
const gm={id:"gm",active:true,isGM:true};
globalThis.game={user:gm,users:Object.assign([gm],{activeGM:gm}),actors:[],items:[],combat:null,time:{worldTime:0}};
gm.targets=new Set();
globalThis.foundry={utils:{escapeHTML:value=>String(value),getProperty:(object,path)=>path.split(".").reduce((value,key)=>value?.[key],object)}};
globalThis.CONST={ACTIVE_EFFECT_MODES:{ADD:2}};
globalThis.ChatMessage={getSpeaker:()=>({}),create:async()=>({})};
globalThis.Hooks={callAll(){}};
globalThis.Roll=class{constructor(formula){this.total=String(formula).startsWith("3d6")?9:6;}async evaluate(){return this;}async toMessage(){}};
globalThis.ui={notifications:{warn(){},error(){}}};
const documents=new Map();
globalThis.fromUuid=async uuid=>documents.get(uuid);

function actor(name,{hp=30,save=0,alchemist=false}={}){
  const effects=[];effects.get=id=>effects.find(effect=>effect.id===id);
  const value={uuid:`Actor.${name}`,name,documentName:"Actor",isOwner:true,items:alchemist?[{type:"class",system:{identifier:"alchemist-nova-era",levels:9},getFlag:()=>null}]:[],effects,flags:{[MODULE_ID]:{}},system:{attributes:{hp:{value:hp,max:hp,temp:0},ac:{value:10},prof:4},abilities:{int:{mod:3}},traits:{}},testUserPermission:()=>false,getFlag(scope,key){return this.flags[scope]?.[key];},async setFlag(scope,key,data){(this.flags[scope]??={})[key]=data;},async unsetFlag(scope,key){delete this.flags[scope]?.[key];},getRollData:()=>({}),rollSavingThrow:async()=>({total:save}),getActiveTokens:()=>[],async update(changes){if(changes["system.attributes.hp.value"]!==undefined)this.system.attributes.hp.value=changes["system.attributes.hp.value"];},async createEmbeddedDocuments(type,entries){for(const entry of entries){const flags=entry.flags?.[MODULE_ID]??{};const effect={id:`effect-${effects.length+1}`,name:entry.name,disabled:false,getFlag:(scope,key)=>flags[key],async setFlag(scope,key,data){flags[key]=data;},async delete(){effects.splice(effects.indexOf(effect),1);}};effects.push(effect);}return effects;}};
  documents.set(value.uuid,value);game.actors.push(value);return value;
}

test("Agente de Controle aplica redução no alvo que falha e registra a área",async()=>{
  const source=actor("Controlador",{alchemist:true}),target=actor("Alvo",{save:4});
  const project={name:"Agente de Controle"};
  const result=await resolveAlchemistControl(source,project,[{actor:target}],{controlMode:"adhesive"});
  assert.equal(result.length,1);
  assert.equal(target.effects.length,1);
  assert.equal(target.effects[0].name,"Agente de Controle — Adesivo");
});

test("Reação em Cadeia dispara uma vez ao receber Fórmula diferente",async()=>{
  const source=actor("Cadeia",{alchemist:true}),target=actor("Marcado",{hp:30});
  const flags={alchemistChainReaction:{compound:"igneous",sourceUuid:source.uuid,projectKey:"alchemist-project-chain-reaction"}};
  const mark={id:"chain-mark",disabled:false,getFlag:(scope,key)=>flags[key],async delete(){target.effects.splice(target.effects.indexOf(mark),1);}};
  target.effects.push(mark);
  await handleAlchemistChainReaction({actor:source,formula:{projectKey:"alchemist-project-charge"},targets:[{actor:target}]});
  assert.equal(target.system.attributes.hp.value,21);
  assert.equal(target.effects.length,0);
  await handleAlchemistChainReaction({actor:source,formula:{projectKey:"alchemist-project-charge"},targets:[{actor:target}]});
  assert.equal(target.system.attributes.hp.value,21);
});

test("Interferente Etérico causa dano apenas no primeiro feitiço da rodada",async()=>{
  const source=actor("Interferente",{alchemist:true}),target=actor("Conjurador",{hp:30});
  const flags={alchemistEthericInterference:true,sourceUuid:source.uuid};
  target.effects.push({id:"interference",disabled:false,getFlag:(scope,key)=>flags[key],async setFlag(scope,key,value){flags[key]=value;}});
  const workflow={actor:target,item:{type:"spell"}};
  await handleAlchemistEthericInterference(workflow);
  await handleAlchemistEthericInterference(workflow);
  assert.equal(target.system.attributes.hp.value,24);
  assert.ok(flags.alchemistEthericInterferenceTurn);
});

test("Transferência conserva o estado do efeito ao mover entre voluntários",async()=>{
  const source=actor("Transferidor",{alchemist:true}),origin=actor("Origem"),destination=actor("Destino");
  const data={name:"Estimulante",duration:{seconds:60,startTime:0},flags:{[MODULE_ID]:{alchemistEffect:"alchemist-project-stimulant"}}};
  const active={id:"effect-transfer",name:data.name,origin:source.uuid,disabled:false,toObject:()=>structuredClone(data),async delete(){origin.effects.splice(origin.effects.indexOf(active),1);}};
  origin.effects.push(active);
  await resolveAlchemistTransfer(source,[{actor:origin,name:origin.name},{actor:destination,name:destination.name}],{transferEffectId:active.id});
  assert.equal(origin.effects.length,0);
  assert.equal(destination.effects[0].name,"Estimulante");
});

test("Eco Recursivo usa efeito-base sem PR e some depois do uso",async()=>{
  const source=actor("Eco",{alchemist:true}),target=actor("AlvoEco",{hp:30});
  source.items.push({name:"Carga Alquímica",getFlag:(scope,key)=>key==="contentKey"?"alchemist-project-charge":key==="role"?"damage":key==="dice"?"2d6":null});
  source.flags[MODULE_ID].alchemistRecursiveEcho={formula:{label:"Carga",projectKey:"alchemist-project-charge",projectName:"Carga Alquímica",compound:"igneous",container:"flask",modifiers:["catalyzed"],cost:2},expiresAt:12,combatId:"",expiryRound:0};
  source.flags[MODULE_ID].alchemistState={points:5};
  gm.targets=new Set([{actor:target,name:target.name}]);
  globalThis.Dialog={confirm:async()=>true};
  globalThis.Roll=class{constructor(formula){this.total=String(formula).startsWith("1d20")?20:6;}async evaluate(){return this;}async toMessage(){}};
  assert.equal(await activateAlchemistRecursiveEcho(source),true);
  assert.equal(target.system.attributes.hp.value,24);
  assert.equal(source.flags[MODULE_ID].alchemistState.points,5);
  assert.equal(source.getFlag(MODULE_ID,"alchemistRecursiveEcho"),undefined);
});

test("Transposição mantém a ligação quando o Mestre recusa um destino inválido",async()=>{
  const source=actor("Transpositor",{alchemist:true});
  const scene={id:"S"};
  const token=(name,x)=>{const document={uuid:`Scene.S.Token.${name}`,id:name,name,parent:scene,documentName:"Token",isOwner:true,x,y:0,async update(change){this.x=change.x;this.y=change.y;}};document.object={document,get center(){return{x:document.x,y:document.y};}};documents.set(document.uuid,document);return document;};
  const first=token("Primeiro",0),second=token("Segundo",9);
  source.flags[MODULE_ID].alchemistTranspositionLink={first:first.uuid,second:second.uuid};
  globalThis.canvas={grid:{measurePath:([a,b])=>({distance:Math.abs(a.x-b.x)})}};
  globalThis.Dialog={confirm:async()=>false};
  assert.equal(await activateAlchemistTransposition(source),false);
  assert.ok(source.getFlag(MODULE_ID,"alchemistTranspositionLink"));
  globalThis.Dialog={confirm:async()=>true};
  assert.equal(await activateAlchemistTransposition(source),true);
  assert.deepEqual([first.x,second.x],[9,0]);
  assert.equal(source.getFlag(MODULE_ID,"alchemistTranspositionLink"),undefined);
});

test("Compatibilidade altera só a ativação vinculada e cobra seus PR",async()=>{
  const source=actor("Compatível",{alchemist:true}),target=actor("AlvoCompatível",{hp:30});
  const base={label:"Carga Ígnea",projectKey:"alchemist-project-charge",projectName:"Carga Alquímica",compound:"igneous",container:"flask",modifiers:[],cost:1};
  source.items.push({name:"Carga Alquímica",getFlag:(scope,key)=>key==="contentKey"?"alchemist-project-charge":key==="role"?"damage":key==="dice"?"2d6":key==="reagentCost"?1:key==="containers"?["flask","dart","grenade"]:null});
  game.items.push({name:"Seringa",getFlag:(scope,key)=>key==="contentKey"?"alchemist-container-syringe":key==="group"?"containers":key==="reagentCost"?0:null});
  source.flags[MODULE_ID].alchemistState={points:5,prepared:[base]};
  source.flags[MODULE_ID].alchemistCompatibilityFormula={slot:0,formula:{...base,container:"syringe",cost:1},note:"recipiente: syringe"};
  gm.targets=new Set([{actor:target,name:target.name}]);
  globalThis.Dialog={confirm:async()=>true};
  assert.equal(await activateAlchemistCompatibility(source),true);
  assert.equal(source.flags[MODULE_ID].alchemistState.points,4);
  assert.equal(target.system.attributes.hp.value,24);
  assert.equal(source.flags[MODULE_ID].alchemistState.prepared[0].compound,"igneous");
  assert.equal(source.getFlag(MODULE_ID,"alchemistCompatibilityFormula"),undefined);
  game.items.length=0;
});

test("Compatibilidade antiga com composto fundamentalmente incompatível não gasta PR",async()=>{
  const source=actor("MatrizInsegura",{alchemist:true}),target=actor("AlvoInseguro",{hp:30});
  const base={label:"Carga Ígnea",projectKey:"alchemist-project-charge",projectName:"Carga Alquímica",compound:"igneous",container:"flask",modifiers:[],cost:1};
  source.items.push({name:"Carga Alquímica",getFlag:(scope,key)=>key==="contentKey"?"alchemist-project-charge":key==="role"?"damage":key==="reagentCost"?1:key==="containers"?["flask","dart","grenade"]:null});
  source.flags[MODULE_ID].alchemistState={points:5,prepared:[base]};
  source.flags[MODULE_ID].alchemistCompatibilityFormula={slot:0,formula:{...base,compound:"restorative",cost:2},note:"composto: restorative"};
  gm.targets=new Set([{actor:target,name:target.name}]);
  assert.equal(await activateAlchemistCompatibility(source),false);
  assert.equal(source.flags[MODULE_ID].alchemistState.points,5);
  assert.equal(target.system.attributes.hp.value,30);
});

test("Carga Alquímica em Dardo exige acerto antes de aplicar o dano",async()=>{
  const source=actor("Dardista",{alchemist:true}),target=actor("AlvoDardo",{hp:30});
  source.items.push({name:"Carga Alquímica",getFlag:(scope,key)=>key==="contentKey"?"alchemist-project-charge":key==="role"?"damage":key==="dice"?"2d6":key==="reagentCost"?1:key==="containers"?["dart"]:null});
  source.flags[MODULE_ID].alchemistState={points:5,prepared:[{label:"Carga Ígnea de Dardo",projectKey:"alchemist-project-charge",projectName:"Carga Alquímica",compound:"igneous",container:"dart",modifiers:[],cost:1}]};
  gm.targets=new Set([{actor:target,name:target.name}]);
  globalThis.Dialog={confirm:async()=>true};
  const totals=[9,20,6],formulas=[];
  globalThis.Roll=class{constructor(formula){this.formula=formula;this.total=totals.shift();formulas.push(formula);}async evaluate(){return this;}async toMessage(){}};
  assert.equal(await activateAlchemistFormula(source,0),true);
  assert.equal(target.system.attributes.hp.value,30);
  assert.equal(formulas.length,1);
  assert.match(formulas[0],/^1d20/);
  assert.equal(await activateAlchemistFormula(source,0),true);
  assert.equal(target.system.attributes.hp.value,24);
  assert.deepEqual(formulas.map(value=>String(value).startsWith("1d20")?"attack":"damage"),["attack","attack","damage"]);
  assert.equal(source.flags[MODULE_ID].alchemistState.points,3);
});

test("Revestimento de munição consome as três peças mesmo sem acerto",async()=>{
  const source=actor("Atirador",{alchemist:true}),ammo={uuid:"Actor.Atirador.Item.Setas"};
  const flags={alchemistCoatingMode:"ammunition",alchemistCoatingItemUuid:ammo.uuid,alchemistCoatingType:"fire",alchemistAmmoCharges:3};
  const active={id:"coating-ammo",uuid:"coating-ammo",disabled:false,getFlag:(scope,key)=>flags[key],async setFlag(scope,key,value){flags[key]=value;},async delete(){source.effects.splice(source.effects.indexOf(active),1);}};
  source.effects.push(active);
  for(let index=0;index<3;index++)assert.equal(await markAlchemistCoatedAmmunition({actor:source,ammunition:ammo}),true);
  assert.equal(source.effects.length,0);
  assert.equal(await markAlchemistCoatedAmmunition({actor:source,ammunition:ammo}),false);
});
