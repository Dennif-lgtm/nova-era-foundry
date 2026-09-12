import { MODULE_ID } from "../constants.mjs";
import { alchemistCanOperate, alchemistDocumentAction, alchemistLevel, alchemistProficiency, alchemistResponsible, hasAlchemistFeature, postAlchemist } from "./core-automation.mjs";

const ICON=`modules/${MODULE_ID}/assets/icons/alchemist/transmutador-arcano.webp`;
const ELEMENTS={acid:"Ácido",lightning:"Elétrico",fire:"Fogo",cold:"Frio"};
const BASIC={conductivity:"Condutividade",density:"Densidade",lightness:"Leveza",fragility:"Fragilidade",malleability:"Maleabilidade"};
const SUPERIOR={expansion:"Expansão",compression:"Compressão",hardening:"Endurecimento",phasing:"Faseamento Parcial"};
const now=()=>Number(game.time?.worldTime??0);
const escape=value=>foundry.utils.escapeHTML(String(value??""));
function turnKey(){return game.combat?.started?`${game.combat.id}:${game.combat.round}:${game.combat.turn}`:`free:${Math.floor(Date.now()/6000)}`;}
function known(actor){return alchemistLevel(actor)>=11?Object.keys(BASIC):actor.getFlag(MODULE_ID,"alchemistPrinciplesKnown")??[];}
function activeMatrix(actor){return [...(actor.effects??[])].some(effect=>!effect.disabled&&effect.getFlag(MODULE_ID,"alchemistPerfectMatrix")===true);}
function compatible(id,role,elemental,target){
  if(id==="conductivity")return elemental&&["damage","debuff"].includes(role)&&!!target;
  if(id==="density")return ["damage","debuff","control"].includes(role)&&!!target;
  if(["lightness","expansion","compression","hardening","phasing"].includes(id))return ["healing","support","defense","utility"].includes(role)&&!!target;
  return ["utility","control"].includes(role);
}
function select(title,description,entries){return Dialog.prompt({title,content:`<form class="nova-era alchemist-choice"><p>${escape(description)}</p><select name="id">${entries.map(([id,label])=>`<option value="${escape(id)}">${escape(label)}</option>`).join("")}</select></form>`,label:"Escolher",callback:html=>String(html.find("[name='id']").val()),rejectClose:false});}

export async function configureAlchemistPrinciples(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-transmuter-principles"))return false;
  if(alchemistLevel(actor)>=11){ui.notifications.info("Nova Era: você já conhece todos os Princípios Básicos.");return true;}
  const selected=[];
  for(let index=0;index<3;index++){const id=await select("Princípios Básicos",`Escolha o Princípio ${index+1} de 3.`,Object.entries(BASIC).filter(([key])=>!selected.includes(key)));if(!id)return false;selected.push(id);}
  await actor.setFlag(MODULE_ID,"alchemistPrinciplesKnown",selected);
  await postAlchemist(actor,"Princípios Básicos",`Princípios registrados: ${selected.map(id=>escape(BASIC[id])).join(", ")}.`);
  return true;
}

export async function activateAlchemistPerfectMatrix(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-transmuter-perfect-matrix"))return false;
  if(actor.getFlag(MODULE_ID,"alchemistPerfectMatrixUsed")){ui.notifications.warn("Nova Era: Matriz Perfeita já usada desde o Descanso Longo.");return false;}
  const accepted=await Dialog.confirm({title:"Matriz de Transmutação Perfeita",content:"<p>Ativar por 1 minuto como Ação Bônus? Até três Princípios por Fórmula, reprogramação gratuita uma vez por turno e Conversão sem custo adicional.</p>",yes:()=>true,no:()=>false,defaultYes:false});
  if(!accepted)return false;
  await actor.setFlag(MODULE_ID,"alchemistPerfectMatrixUsed",true);
  await alchemistDocumentAction(actor,"effect",{effect:{name:"Matriz de Transmutação Perfeita",img:ICON,origin:actor.uuid,disabled:false,duration:{seconds:60,rounds:10,startTime:now(),startRound:game.combat?.round,startTurn:game.combat?.turn},changes:[],flags:{[MODULE_ID]:{alchemistEffect:"perfect-matrix",alchemistPerfectMatrix:true}}}});
  await postAlchemist(actor,"Matriz de Transmutação Perfeita","Os Princípios entram em ressonância por 1 minuto.");
  return true;
}

export async function planAlchemistTransmutation(actor,formula,project,targets){
  if(!hasAlchemistFeature(actor,"alchemist-transmuter-principles"))return {principles:[],extraCost:0,conversionType:""};
  const target=targets[0]?.actor,role=project.getFlag(MODULE_ID,"role"),elemental=["igneous","cryogenic","corrosive"].includes(formula.compound)||Object.hasOwn(ELEMENTS,formula.convertedType);
  const plan={principles:[],extraCost:0,conversionType:""};
  if(elemental&&hasAlchemistFeature(actor,"alchemist-transmuter-conversion")){
    const convert=await Dialog.confirm({title:"Conversão Elemental",content:`<p>Alterar o tipo elemental desta ativação? ${activeMatrix(actor)?"Sem custo adicional.":"+1 PR."}</p>`,yes:()=>true,no:()=>false,defaultYes:false});
    if(convert){plan.conversionType=await select("Conversão Elemental","Escolha Ácido, Elétrico, Fogo ou Frio.",Object.entries(ELEMENTS));if(!plan.conversionType)return null;if(!activeMatrix(actor))plan.extraCost++;}
  }
  const available=[...known(actor),...(alchemistLevel(actor)>=11?Object.keys(SUPERIOR):[])].filter(id=>compatible(id,role,elemental,target));
  const maximum=activeMatrix(actor)?3:alchemistLevel(actor)>=11?2:1;
  for(let index=0;index<maximum&&available.length;index++){
    const choices=available.filter(id=>!plan.principles.includes(id)&&(!(id in SUPERIOR)||!plan.principles.some(other=>other in SUPERIOR)));
    if(!choices.length)break;
    const id=await select("Princípio de Transmutação",`Escolha o Princípio ${index+1} de ${maximum}, ou finalize.`,[["","Nenhum / finalizar"],...choices.map(value=>[value,`${BASIC[value]??SUPERIOR[value]}${value in SUPERIOR?" · +1 PR":""}`])]);
    if(!id)break;plan.principles.push(id);if(id in SUPERIOR)plan.extraCost++;
  }
  return plan;
}

export async function applyAlchemistPrinciple(source,target,id,{durationSeconds=null}={}){
  if(!source||!target||!(id in BASIC)&&!(id in SUPERIOR))return false;
  const superior=id in SUPERIOR,duration=durationSeconds??(superior?60:6),changes=[];
  if(id==="density")changes.push({key:"system.attributes.movement.walk",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"-3",priority:20});
  if(id==="lightness")changes.push({key:"system.attributes.movement.walk",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"3",priority:20});
  const flags={alchemistEffect:`principle:${source.uuid}:${id}`,alchemistPrinciple:id,alchemistPrincipleSource:source.uuid};
  if(id==="conductivity")flags.alchemistConductivity=alchemistProficiency(source);
  if(id==="hardening")flags.alchemistHardening=alchemistProficiency(source);
  await alchemistDocumentAction(target,"effect",{effect:{name:`Princípio — ${BASIC[id]??SUPERIOR[id]}`,img:ICON,origin:source.uuid,disabled:false,duration:{seconds:duration,rounds:duration/6,startTime:now(),startRound:game.combat?.round,startTurn:game.combat?.turn},changes,flags:{[MODULE_ID]:flags}}});
  if(["fragility","malleability","expansion","compression","phasing"].includes(id))await postAlchemist(source,`Princípio — ${BASIC[id]??SUPERIOR[id]}`,`Aplicado a ${escape(target.name)}. Confirme na cena a alteração física; não altera atributos, PV, Defesa ou dano além do texto do Princípio.`);
  return true;
}

export async function reprogramAlchemistPrinciple(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-transmuter-reprogram"))return false;
  const target=[...game.user.targets][0]?.actor;if(game.user.targets.size!==1||!target){ui.notifications.warn("Nova Era: selecione um alvo com Princípio ativo.");return false;}
  const active=[...(target.effects??[])].filter(effect=>effect.getFlag(MODULE_ID,"alchemistPrincipleSource")===actor.uuid);
  if(!active.length){ui.notifications.warn("Nova Era: o alvo não possui Princípio seu.");return false;}
  const free=activeMatrix(actor)&&actor.getFlag(MODULE_ID,"alchemistMatrixReprogramTurn")!==turnKey(),used=Number(actor.getFlag(MODULE_ID,"alchemistReprogramUsed")??0);
  if(!free&&used>=alchemistProficiency(actor)){ui.notifications.warn("Nova Era: usos de Reprogramação esgotados.");return false;}
  const old=await select("Matéria Reprogramável","Escolha o Princípio ativo.",active.map(effect=>[effect.id,effect.name]));if(!old)return false;
  const next=await select("Novo Princípio","Escolha um Princípio Básico conhecido.",known(actor).filter(id=>!active.some(effect=>effect.getFlag(MODULE_ID,"alchemistPrinciple")===id)).map(id=>[id,BASIC[id]]));if(!next)return false;
  const previous=active.find(effect=>effect.id===old);
  const remaining=Math.max(1,Number(previous?.duration?.remaining??((previous?.duration?.startTime??now())+(previous?.duration?.seconds??6)-now())));
  await alchemistDocumentAction(target,"effect-delete",{id:old});await applyAlchemistPrinciple(actor,target,next,{durationSeconds:remaining});
  if(free)await actor.setFlag(MODULE_ID,"alchemistMatrixReprogramTurn",turnKey());else await actor.setFlag(MODULE_ID,"alchemistReprogramUsed",used+1);
  return true;
}

export function registerAlchemistTransmuterAutomation(){
  Hooks.on("dnd5e.restCompleted",(actor,result,config)=>{
    if(!alchemistResponsible(actor)||!(result?.longRest===true||result?.type==="long"||config?.type==="long"))return;
    void actor.setFlag(MODULE_ID,"alchemistReprogramUsed",0);
    void actor.unsetFlag(MODULE_ID,"alchemistPerfectMatrixUsed");
    for(const effect of [...(actor.effects??[])].filter(value=>value.getFlag(MODULE_ID,"alchemistPerfectMatrix")))void alchemistDocumentAction(actor,"effect-delete",{id:effect.id});
  });
}
