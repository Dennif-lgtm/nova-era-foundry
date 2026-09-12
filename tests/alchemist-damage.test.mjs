import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.mjs";
import { applyAlchemistDamageInterception } from "../scripts/alchemist/damage-interception.mjs";

globalThis.game={user:{id:"player",isGM:false},users:[{id:"player",active:true,isGM:false}],combat:{id:"combat",round:1,started:true},actors:{get:()=>null}};
const deleted=[];
function effect(id,flags){return{uuid:id,disabled:false,img:"",getFlag:(scope,key)=>scope===MODULE_ID?flags[key]:null,delete:async()=>deleted.push(id),setFlag:async(scope,key,value)=>{flags[key]=value;}};}
function actor(effects){return{effects,system:{attributes:{prof:3}},testUserPermission:user=>user.id==="player"};}

test("Cristal Prismático reduz apenas dano elegível e consome uma vez",async()=>{
  const ward=effect("prism-1",{alchemistDamageWard:"prism",alchemistWardAmount:5});
  const target=actor([ward]);
  const item={damageDetail:[{type:"fire",value:8},{type:"slashing",value:4}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:item});
  assert.deepEqual(item.damageDetail.map(part=>part.value),[3,4]);
  applyAlchemistDamageInterception({actor:target},{damageItem:item});
  assert.deepEqual(item.damageDetail.map(part=>part.value),[3,4]);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(deleted,["prism-1"]);
});

test("Epiderme Mutagênica reduz uma única vez por rodada",()=>{
  const skin=effect("skin-1",{alchemistMutagen:"skin"});
  const target=actor([skin]);
  const first={damageDetail:[{type:"slashing",value:8}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:first});
  assert.equal(first.damageDetail[0].value,5);
  const second={damageDetail:[{type:"piercing",value:8}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:second});
  assert.equal(second.damageDetail[0].value,8);
  game.combat.round=2;
  applyAlchemistDamageInterception({actor:target},{damageItem:second});
  assert.equal(second.damageDetail[0].value,5);
});

test("Condutividade amplifica o próximo dano elemental apenas uma vez",async()=>{
  const principle=effect("principle-conductivity",{alchemistConductivity:3});
  const target=actor([principle]);
  const first={damageDetail:[{type:"fire",value:5}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:first});
  assert.equal(first.damageDetail[0].value,8);
  const second={damageDetail:[{type:"cold",value:5}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:second});
  assert.equal(second.damageDetail[0].value,5);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(deleted.includes("principle-conductivity"));
});

test("Endurecimento reduz dano físico uma vez na rodada",()=>{
  const principle=effect("principle-hardening",{alchemistHardening:3});
  const target=actor([principle]);
  game.combat.round=3;
  const first={damageDetail:[{type:"bludgeoning",value:7}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:first});
  assert.equal(first.damageDetail[0].value,4);
  const second={damageDetail:[{type:"slashing",value:7}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:second});
  assert.equal(second.damageDetail[0].value,7);
});

test("Blindagem Reativa da Plataforma reduz dano elemental uma vez na rodada",()=>{
  const target=actor([]);target.uuid="Actor.Armor";
  target.items=[{uuid:"Actor.Armor.Item.Shield",system:{equipped:true}}];
  target.getFlag=(scope,key)=>key==="alchemistPlatforms"?[{itemUuid:"Actor.Armor.Item.Shield",modules:["reactiveArmor"]}]:null;
  game.combat.round=4;
  const first={damageDetail:[{type:"fire",value:9}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:first});
  assert.equal(first.damageDetail[0].value,6);
  const second={damageDetail:[{type:"cold",value:9}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:second});
  assert.equal(second.damageDetail[0].value,9);
});

test("Revestimento Protetor só reduz dano com o escudo equipado e é consumido",async()=>{
  const ward=effect("coating-shield",{alchemistDamageWard:"coating",alchemistCoatingType:"cold",alchemistCoatingItemUuid:"Actor.Coating.Item.Shield",alchemistWardAmount:5});
  const target=actor([ward]);target.items=[{uuid:"Actor.Coating.Item.Shield",system:{equipped:false}}];
  const first={damageDetail:[{type:"cold",value:8}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:first});
  assert.equal(first.damageDetail[0].value,8);
  target.items[0].system.equipped=true;
  const second={damageDetail:[{type:"cold",value:8}]};
  applyAlchemistDamageInterception({actor:target},{damageItem:second});
  assert.equal(second.damageDetail[0].value,3);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(deleted.includes("coating-shield"));
});
