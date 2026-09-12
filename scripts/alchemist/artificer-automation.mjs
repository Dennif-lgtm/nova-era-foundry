import { MODULE_ID } from "../constants.mjs";
import { activateAlchemistFormula, alchemistCanOperate, alchemistLevel, alchemistProficiency, alchemistResponsible, alchemistState, hasAlchemistFeature, postAlchemist } from "./core-automation.mjs";

const BASIC={injector:"Injetor",reactive:"Reativo",propulsor:"Propulsor",launcher:"Lançador",stabilizer:"Estabilizador"};
const ADVANCED={chamber:"Câmara Catalítica",disperser:"Dispersor",reactiveArmor:"Blindagem Reativa",impact:"Vetor de Impacto"};
const escape=value=>foundry.utils.escapeHTML(String(value??""));
function platforms(actor){const stored=actor?.getFlag?.(MODULE_ID,"alchemistPlatforms");return Array.isArray(stored)?stored:[];}
function isPlatformItem(item){return item?.type==="weapon"||item?.type==="equipment"&&["light","medium","heavy","shield"].includes(item.system?.type?.value??item.system?.type);}
function kind(item){return item.type==="weapon"?"weapon":(item.system?.type?.value??item.system?.type)==="shield"?"shield":"armor";}
function compatible(module,item){const type=kind(item);if(["injector","launcher","impact"].includes(module))return type==="weapon";if(["reactive","reactiveArmor"].includes(module))return type!=="weapon";if(module==="propulsor")return type==="armor";return true;}
function choose(title,prompt,entries){if(!entries.length)return Promise.resolve(null);return Dialog.prompt({title,content:'<form class="nova-era alchemist-choice"><p>'+escape(prompt)+'</p><select name="choice">'+entries.map(([id,label])=>'<option value="'+escape(id)+'">'+escape(label)+'</option>').join("")+'</select></form>',label:"Escolher",callback:html=>String(html.find("[name='choice']").val()),rejectClose:false});}
function knownLimit(level){return level>=19?9:level>=15?9:level>=11?7:level>=7?5:3;}

async function ensureKnown(actor){
  const level=alchemistLevel(actor),available={...BASIC,...(level>=11?ADVANCED:{})};
  if(level>=19){await actor.setFlag(MODULE_ID,"alchemistKnownModules",Object.keys(available));return Object.keys(available);}
  const known=Array.isArray(actor.getFlag(MODULE_ID,"alchemistKnownModules"))?[...actor.getFlag(MODULE_ID,"alchemistKnownModules")]:[];
  const limit=knownLimit(level);
  while(known.length<limit){
    const id=await choose("Módulos Bélicos","Aprenda o Módulo "+(known.length+1)+" de "+limit+".",Object.entries(available).filter(([key])=>!known.includes(key)));
    if(!id)return null;known.push(id);
  }
  await actor.setFlag(MODULE_ID,"alchemistKnownModules",known);
  return known;
}

export async function configureAlchemistPlatforms(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-artificer-platform"))return false;
  const epoch=Number(actor.getFlag(MODULE_ID,"alchemistPlatformRestEpoch")??0);
  if(actor.getFlag(MODULE_ID,"alchemistPlatformConfiguredEpoch")===epoch){ui.notifications.warn("Nova Era: a Plataforma já foi configurada após este Descanso Longo. Use Reconfiguração de Campo para trocar um Módulo.");return false;}
  const known=await ensureKnown(actor);if(!known)return false;
  const count=alchemistLevel(actor)>=15?2:1,slots=alchemistLevel(actor)>=11?3:2,available=actor.items.filter(isPlatformItem);
  if(available.length<count){ui.notifications.warn("Nova Era: inclua na ficha uma arma, armadura ou escudo para cada Plataforma.");return false;}
  const configured=[],installed=new Set();
  for(let number=0;number<count;number++){
    const itemId=await choose("Plataforma Bélica","Escolha o equipamento da Plataforma "+(number+1)+".",available.filter(item=>!configured.some(entry=>entry.itemUuid===item.uuid)&&known.filter(key=>!installed.has(key)&&compatible(key,item)).length>=slots).map(item=>[item.uuid,item.name]));
    if(!itemId)return false;
    const item=available.find(value=>value.uuid===itemId),modules=[];
    for(let slot=0;slot<slots;slot++){
      const id=await choose("Módulo da Plataforma",item.name+" — espaço "+(slot+1)+" de "+slots,known.filter(key=>!modules.includes(key)&&!installed.has(key)&&compatible(key,item)).map(key=>[key,BASIC[key]??ADVANCED[key]]));
      if(!id)return false;modules.push(id);installed.add(id);
    }
    configured.push({itemUuid:item.uuid,modules});
  }
  await actor.setFlag(MODULE_ID,"alchemistPlatforms",configured);
  await actor.setFlag(MODULE_ID,"alchemistPlatformConfiguredEpoch",epoch);
  await postAlchemist(actor,"Plataforma Bélica",configured.map(entry=>{const item=actor.items.find(value=>value.uuid===entry.itemUuid);return "<strong>"+escape(item?.name)+"</strong>: "+entry.modules.map(id=>escape(BASIC[id]??ADVANCED[id])).join(", ");}).join("<br>"));
  return true;
}

export async function reconfigureAlchemistPlatform(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-artificer-reconfigure"))return false;
  const current=platforms(actor),known=await ensureKnown(actor);if(!current.length||!known)return false;
  const used=Number(actor.getFlag(MODULE_ID,"alchemistReconfigureUsed")??0),maximum=alchemistProficiency(actor);
  if(used>=maximum){ui.notifications.warn("Nova Era: Reconfigurações de Campo esgotadas até o Descanso Longo.");return false;}
  const indexChoice=await choose("Reconfiguração de Campo","Escolha uma Plataforma.",current.map((entry,i)=>[String(i),actor.items.find(item=>item.uuid===entry.itemUuid)?.name??"Plataforma"]));if(indexChoice===null)return false;
  const index=Number(indexChoice);
  if(!Number.isInteger(index)||index<0||index>=current.length)return false;
  const entry=current[index],item=actor.items.find(value=>value.uuid===entry.itemUuid);
  const slotChoice=await choose("Módulo instalado","Escolha o espaço a substituir.",entry.modules.map((id,i)=>[String(i),BASIC[id]??ADVANCED[id]]));if(slotChoice===null)return false;
  const slot=Number(slotChoice);
  if(!Number.isInteger(slot)||slot<0||slot>=entry.modules.length)return false;
  const elsewhere=current.flatMap((value,i)=>i===index?value.modules.filter((_,position)=>position!==slot):value.modules);
  const next=await choose("Novo Módulo","Escolha um Módulo conhecido e compatível.",known.filter(id=>!elsewhere.includes(id)&&id!==entry.modules[slot]&&compatible(id,item)).map(id=>[id,BASIC[id]??ADVANCED[id]]));
  if(!next)return false;
  const changed=current.map((value,i)=>i===index?{...value,modules:value.modules.map((id,position)=>position===slot?next:id)}:value);
  await actor.setFlag(MODULE_ID,"alchemistPlatforms",changed);
  await actor.setFlag(MODULE_ID,"alchemistReconfigureUsed",used+1);
  await postAlchemist(actor,"Reconfiguração de Campo",escape(item.name)+" agora usa "+escape(BASIC[next]??ADVANCED[next])+". Restam "+(maximum-used-1)+" usos.");
  return true;
}

export function alchemistHasPlatformModule(actor,module,{equipped=true}={}){
  return platforms(actor).some(entry=>entry.modules.includes(module)&&(actor.items??[]).some(item=>item.uuid===entry.itemUuid&&(!equipped||item.system?.equipped!==false)));
}

export function alchemistPlatformModules(actor,itemUuid){
  const entry=platforms(actor).find(value=>value.itemUuid===itemUuid),item=(actor.items??[]).find(value=>value.uuid===itemUuid);
  return entry&&item&&item.system?.equipped!==false?entry.modules:[];
}

export async function activateAlchemistThroughPlatform(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-artificer-platform"))return false;
  const entries=platforms(actor).map(value=>({item:actor.items.find(item=>item.uuid===value.itemUuid),modules:value.modules})).filter(value=>value.item&&value.item.system?.equipped!==false);
  if(!entries.length){ui.notifications.warn("Nova Era: configure e equipe uma Plataforma antes de ativar uma Fórmula por ela.");return false;}
  const itemUuid=await choose("Plataforma Bélica","Escolha a Plataforma usada na ativação.",entries.map(value=>[value.item.uuid,value.item.name]));if(!itemUuid)return false;
  const modules=alchemistPlatformModules(actor,itemUuid),state=alchemistState(actor);
  const formulas=state.prepared.flatMap((formula,index)=>formula&&((modules.includes("launcher")&&["flask","grenade"].includes(formula.container))||(modules.includes("injector")&&formula.container==="syringe"))?[[String(index),(index+1)+". "+formula.label]]:[]);
  if(!formulas.length){ui.notifications.warn("Nova Era: esta Plataforma não possui Fórmula preparada compatível com Lançador ou Injetor.");return false;}
  const slotChoice=await choose("Fórmula da Plataforma","Escolha a Fórmula. O Injetor exige um acerto da arma; o Lançador concede +6 m.",formulas);if(slotChoice===null)return false;
  const slot=Number(slotChoice),formula=state.prepared[slot];
  if(formula.container==="syringe"){
    const hit=await Dialog.confirm({title:"Injetor",content:"<p>O ataque desta arma acertou o alvo selecionado? A Fórmula usa esse acerto e não faz um segundo ataque.</p>",yes:()=>true,no:()=>false,defaultYes:false});if(!hit)return false;
  }
  return activateAlchemistFormula(actor,slot,{platformItemUuid:itemUuid,deliveryConfirmed:formula.container==="syringe"});
}

async function injectorOnHit(workflow){
  const actor=workflow?.actor??workflow?.item?.actor,item=workflow?.item;
  if(!actor||!item||!alchemistResponsible(actor)||!alchemistPlatformModules(actor,item.uuid).includes("injector"))return;
  const hit=[...(workflow.hitTargets??[])][0];if(!hit)return;
  const state=alchemistState(actor),formulas=state.prepared.flatMap((formula,index)=>formula?.container==="syringe"?[[String(index),(index+1)+". "+formula.label]]:[]);
  if(!formulas.length)return;
  const use=await Dialog.confirm({title:"Injetor da Plataforma",content:"<p>O ataque acertou. Entregar uma Fórmula preparada por esta arma, pagando seus PR?</p>",yes:()=>true,no:()=>false,defaultYes:false});if(!use)return;
  const slot=await choose("Fórmula do Injetor","Escolha uma Fórmula de Seringa.",formulas);if(slot===null)return;
  await activateAlchemistFormula(actor,Number(slot),{targetsOverride:[hit],platformItemUuid:item.uuid,deliveryConfirmed:true});
}

export function registerAlchemistArtificerAutomation(){
  Hooks.on("midi-qol.DamageRollComplete",workflow=>void injectorOnHit(workflow));
  Hooks.on("dnd5e.restCompleted",(actor,result,config)=>{
    if(!alchemistResponsible(actor)||!(result?.longRest===true||result?.type==="long"||config?.type==="long"))return;
    void actor.setFlag(MODULE_ID,"alchemistPlatformRestEpoch",Number(actor.getFlag(MODULE_ID,"alchemistPlatformRestEpoch")??0)+1);
    void actor.setFlag(MODULE_ID,"alchemistReconfigureUsed",0);
    void actor.setFlag(MODULE_ID,"alchemistChamberUsed",0);
  });
}
