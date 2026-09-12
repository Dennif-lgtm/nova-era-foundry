const p = (...parts) => parts.map(text => `<p>${text}</p>`).join("");
const feature = (key, name, level, description, group = "alchemist") => ({ key, name, level, description, group });
const project = (key, name, grade, cost, role, description, extra = {}) => ({ key, name, grade, cost, role, description, group: `projects-grade-${grade}`, ...extra });

export const ALCHEMIST_PR = [0,4,5,6,7,10,11,12,13,14,16,17,19,20,21,22,24,25,26,28,30];

export const ALCHEMIST_CLASS = {
  key: "alchemist",
  name: "Alquimista — Nova Era",
  description: `<h2>Alquimista</h2><blockquote>“Conhecimento transformado em matéria. Preparar. Adaptar. Catalisar.”</blockquote>${p("Especialista de Inteligência que registra Projetos no Diário de Pesquisa, estabiliza Fórmulas no Laboratório Portátil e paga Pontos de Reagente para ativá-las.", "Dado de Vida: d8. Resistências: Inteligência e Constituição. Armaduras leves; armas simples e bestas leves; Kit de Alquimia e Kit de Herbalismo.", "CD Alquímica = 8 + Proficiência + INT. Ataque de Fórmula = Proficiência + INT.")}`
};

const improvement = level => feature(`alchemist-improvement-${level}`, `Talento / Aumento de Atributo — Nível ${level}`, level, p("Receba um Talento ou Aumento de Atributo conforme as regras gerais. Amplie também o Diário de Pesquisa conforme Aprendizado e Graus."));

export const ALCHEMIST_FEATURES = [
  feature("alchemist-research-journal", "Diário de Pesquisa", 1, p("Registra seus Projetos conhecidos, sem limite total. Você começa com Carga Alquímica e escolhe três Projetos Fundamentais de Grau I. Novos Projetos vêm de progressão, professores, documentos, laboratórios, criaturas, exploração e pesquisa.")),
  feature("alchemist-portable-lab", "Laboratório Portátil", 1, p("Capacidade de 3 + Proficiência Fórmulas. Cada espaço guarda uma configuração completa de Projeto, Composto, Recipiente e Modificadores. Ativar não remove a Fórmula; reutilizá-la exige pagar novamente PR e materiais.")),
  feature("alchemist-reagent-points", "Pontos de Reagente", 1, p("Seu máximo segue a tabela da classe. Recupere tudo em Descanso Longo. Uma vez entre Descansos Longos, ao terminar Descanso Curto, recupere metade do máximo, arredondada para baixo.", "Uma ativação voluntária por turno; máximo Proficiência de Preparações Ativas; uma única Redução Catalítica por Fórmula.")),
  feature("alchemist-kit", "Kit de Alquimia", 1, p("Coleta, extração, preservação, análise e procedimentos químicos mundanos não gastam PR e não substituem Projetos. Em 10 minutos, processe até Proficiência Doses.")),
  feature("alchemist-dangerous-experiment", "Experimentação Perigosa", 2, p("Ação Bônus: crie uma Fórmula improvisada com Projeto e componentes conhecidos. Não ocupa Laboratório e dura até o fim do próximo turno.", "Depois de ativar, role 1d6: 1 perde 1 PR adicional; 2–4 estável; 5 recupera 1 PR ou +3 m de alcance; 6 recupera até 2 PR gastos ou adiciona um dado a uma rolagem de dano/cura.")),
  improvement(4),
  feature("alchemist-improved-synthesis", "Síntese Aprimorada", 5, p("Ao processar uma Dose de Suprimento Comum, produza duas Doses de um Composto Fundamental compatível. Não duplica materiais especiais de raridade Incomum ou superior.")),
  feature("alchemist-modifiers", "Modificadores de Fórmula", 5, p("Aprenda dois Modificadores no nível 5 e use um por Fórmula. No nível 10, use até dois diferentes e aprenda mais um. Modificadores de custo 0 ainda ocupam limite e nunca podem ser repetidos.")),
  feature("alchemist-reactive-recalibration", "Recalibração Reativa", 6, p("Durante Experimentação Perigosa, antes de ativar, substitua Recipiente ou Modificador por outro compatível conhecido. Custos anteriores não são devolvidos; pague custos novos. O Projeto não muda.")),
  improvement(8),
  feature("alchemist-modular-lab", "Laboratório Modular", 9, p("Até dois espaços viram Reservas Catalíticas. Como Ação, finalize uma Reserva em qualquer Fórmula que poderia preparar. A Reserva não cria componentes especiais ausentes.")),
  feature("alchemist-advanced-modification", "Modificação Avançada", 10, p("Use até dois Modificadores diferentes por Fórmula e aprenda mais um.")),
  feature("alchemist-homunculus", "Homúnculo Alquímico", 10, p("Construto Pequeno: CA 12 + Proficiência; PV 5 + 4 × nível; deslocamento 9 m; imune a Veneno e Envenenado. Carrega uma Fórmula preparada e a entrega usando seus PR, CD e limite de Catalisação.", "Comande como Ação Bônus a 18 m. Em 0 PV fica Inerte. Descanso Longo restaura todos os PV; reconstrução custa 25 PO × Proficiência."), "homunculus"),
  improvement(12),
  feature("alchemist-engineering", "Engenharia Alquímica", 14, p("Escolha dois Modificadores conhecidos de custo-base 1+. Proficiência vezes por Descanso Longo, reduza em 1 PR um deles, mínimo 0. Conta como sua única Redução Catalítica.")),
  improvement(16),
  feature("alchemist-great-works", "Grandes Obras", 17, p("Registre uma Grande Obra Fundamental. Obras não são Fórmulas e não recebem Recipientes, Modificadores, Experimentação, Reservas, Engenharia, Fórmula Perfeita ou efeitos de Escola, salvo texto expresso.")),
  feature("alchemist-master-lab", "Laboratório Magistral", 18, p("Reservas Catalíticas sobem para três; uma vez por turno, finalize Reserva como Ação Bônus. Com Domínio dos Modificadores, aprenda os nove Modificadores Fundamentais.")),
  improvement(19),
  feature("alchemist-masterwork", "Obra-Prima Alquímica", 20, p("Crie com o Mestre um Projeto Autor único que quebra uma regra fundamental específica. Não remove PR máximo, Catalisação, máximo de Modificadores nem progressão de Grau.")),
  feature("alchemist-perfect-formula", "Fórmula Perfeita", 20, p("Após Descanso Longo, escolha uma Fórmula preparada I–IV. Na primeira ativação, Projeto e Modificadores custam 0 PR. Outros custos e materiais permanecem. É uma Redução Catalítica."))
];

export const ALCHEMIST_COMPONENTS = [
  ...[
    ["flask","Frasco",0,"Ação; alvo único a 9 m. Hostil usa Ataque de Fórmula."], ["grenade","Granada",1,"Ação; 12 m; esfera de 3 m; Destreza, metade do dano no sucesso."],
    ["syringe","Seringa",0,"Toque; aplicação direta. Hostil usa Ataque de Fórmula corpo a corpo."], ["dart","Dardo",0,"Munição; usa o ataque e alcance da arma; entrega uma Fórmula no acerto."],
    ["ointment","Unguento",0,"Ação; toque em criatura, objeto ou superfície; efeito aderente."], ["mine","Mina",1,"Ação para instalar; esfera de 3 m; gatilho físico simples; Preparação Ativa."],
    ["diffuser","Difusor",1,"Instalar ou arremessar a 9 m; esfera de 3 m; exige Projeto persistente; Preparação Ativa."]
  ].map(([id,name,cost,text]) => ({ key:`alchemist-container-${id}`, name, cost, description:p(text), group:"containers" })),
  ...[
    ["igneous","Ígneo","Fogo, calor e combustão"], ["cryogenic","Criogênico","Frio e supressão térmica"], ["corrosive","Corrosivo","Ácido e dissolução"], ["toxic","Tóxico","Veneno e contaminação"],
    ["restorative","Restaurador","Recuperação e reparo biológico"], ["invigorating","Revigorante","Estímulo e fortalecimento"], ["numbing","Entorpecente","Supressão funcional"], ["luminescent","Luminescente","Luz, marcação e revelação"]
  ].map(([id,name,text]) => ({ key:`alchemist-compound-${id}`, name, cost:0, description:p(text), group:"compounds" })),
  ...[
    ["penetrating","Penetrante",1,"Ignora meia cobertura e trata três quartos como meia."], ["expanded","Ampliado",1,"Aumenta em 1,5 m o raio de uma área existente."],
    ["persistent","Persistente",1,"Dobra duração; efeitos em turnos recebem +1 rodada."], ["delayed","Retardado",1,"Adia o efeito de uma rodada a dez minutos."],
    ["catalyzed","Catalisado",1,"Adiciona um dado ao primeiro efeito principal de dano ou cura."], ["unstable","Instável",0,"Adiciona um dado principal; em 1–2 no d6, o Alquimista sofre 1d6 por Grau."],
    ["stable","Estável",1,"Role duas vezes um risco alquímico e use o resultado mais favorável."], ["silent","Silencioso",0,"Reduz sinais secundários e concede vantagem para ocultar o uso."],
    ["fragmentation","Fragmentação",1,"Um alvo que falhou na salvaguarda de área sofre +1 dado principal."]
  ].map(([id,name,cost,text]) => ({ key:`alchemist-modifier-${id}`, name, cost, description:p(text), group:"modifiers" }))
];

export const ALCHEMIST_PROJECTS = [
  project("alchemist-project-charge","Carga Alquímica",1,1,"damage",p("1 Dose compatível. Cause 2d6; Ígneo = Fogo, Criogênico = Frio, Corrosivo = Ácido, Tóxico = Veneno. Frasco, Dardo ou Granada."),{dice:"2d6",containers:["flask","dart","grenade"],compounds:["igneous","cryogenic","corrosive","toxic"]}),
  project("alchemist-project-restorative","Preparado Restaurador",1,1,"healing",p("Restaurador; Frasco, Seringa ou Unguento. Uma criatura recupera 1d8 + INT PV; não pode virar área."),{dice:"1d8",containers:["flask","syringe","ointment"],compounds:["restorative"]}),
  project("alchemist-project-stimulant","Estimulante",1,1,"support",p("Revigorante; Frasco ou Seringa; 1 minuto. +2 em testes e perícias de um atributo escolhido; não altera ataques, Defesa ou salvaguardas."),{containers:["flask","syringe"],compounds:["invigorating"]}),
  project("alchemist-project-suppressor","Supressor",1,1,"debuff",p("Entorpecente; Frasco, Dardo ou Seringa. -2 em testes e perícias de um atributo; CON ao fim do turno encerra."),{containers:["flask","dart","syringe"],compounds:["numbing"]}),
  project("alchemist-project-control","Agente de Controle",1,1,"control",p("Granada ou Mina. Escolha Adesivo, Fumígeno ou Escorregadio em área de 3 m. Cria terreno difícil/obscurecido e efeitos de movimento conforme a escolha."),{containers:["grenade","mine"]}),
  project("alchemist-project-neutralizer","Neutralizante",1,1,"defense",p("Frasco ou Seringa. Antídoto permite nova salvaguarda contra Veneno com +2; Profilático dá +2 contra Veneno por 10 minutos e reduz o primeiro dano em 1d6 + INT."),{containers:["flask","syringe"]}),
  project("alchemist-project-field","Preparado de Campo",1,1,"utility",p("Revelador em Difusor evidencia rastros por 10 minutos e dá +2 ao próximo teste de Investigação/Sobrevivência; Solvente em Frasco/Unguento dissolve adesivos e resíduos mundanos."),{containers:["diffuser","flask","ointment"]}),
  project("alchemist-project-coating","Revestimento Alquímico",1,1,"equipment",p("Unguento; 1 minuto. Arma ou três munições recebem +1d4 elemental no primeiro acerto por turno, ou armadura/escudo reduz o primeiro dano escolhido em 1d6 + INT."),{containers:["ointment"]}),
  project("alchemist-project-reactive-catalyst","Catalisador Reativo",2,2,"trigger",p("Preparação Ativa por 8 horas. Vincule uma Fórmula a gatilho físico simples; quando ocorrer, ative e pague seus custos. Não se aplica a Mina.")),
  project("alchemist-project-emergency-coagulant","Coagulante de Emergência",2,2,"healing",p("Restaurador; Frasco ou Seringa; Preparação Ativa por 1 hora. Ao cair à metade dos PV, recupere 2d8 + INT e termine."),{dice:"2d8",containers:["flask","syringe"],compounds:["restorative"]}),
  project("alchemist-project-regeneration-inhibitor","Inibidor Regenerativo",2,2,"debuff",p("Frasco, Dardo ou Seringa; 1 minuto. Toda recuperação de PV do alvo é reduzida em 2 × Proficiência; CON ao fim do turno encerra."),{containers:["flask","dart","syringe"]}),
  project("alchemist-project-containment","Reação de Contenção",2,2,"reaction",p("Reação a 9 m. Reduza 2d8 + INT de dano de Fogo, Ácido ou Veneno, ou neutralize fenômeno/Fórmula compatível."),{dice:"2d8"}),
  project("alchemist-project-conductor","Agente Condutor",2,2,"damage",p("1 minuto. Escolha Ácido, Elétrico, Fogo ou Frio. A primeira vez por rodada que o alvo sofrer esse tipo, outra criatura a 3 m sofre 1d6; termina após Proficiência ativações."),{dice:"1d6",containers:["flask","dart","syringe","ointment"]}),
  project("alchemist-project-healing-mist","Névoa Terapêutica",2,2,"healing",p("Restaurador; Difusor; esfera 3 m; 3 cargas. No início do turno de voluntário na área, gaste carga para curar 1d6 + INT."),{dice:"1d6",containers:["diffuser"],compounds:["restorative"]}),
  project("alchemist-project-destabilizer","Desestabilizador",2,2,"debuff",p("Escolha uma Resistência conhecida. Até o fim do próximo turno, sua próxima Fórmula ignora essa Resistência. Não remove Imunidade."),{containers:["flask","dart","syringe"]}),
  project("alchemist-project-mimic","Mimetizador Químico",2,2,"utility",p("Frasco ou Seringa; 1 hora. Adaptação a calor/frio ambiental, fumaça, cheiro ou toxina específica; não concede Resistência a dano."),{containers:["flask","syringe"]}),
  project("alchemist-project-converter","Conversor Alquímico",3,3,"defense",p("Voluntário; 1 minuto. Uma vez por rodada reduza 2d6 + INT de Ácido, Elétrico, Fogo ou Frio e armazene energia; próximo dano pode liberar +2d6 do tipo."),{dice:"2d6"}),
  project("alchemist-project-adaptive-matrix","Matriz Adaptativa",3,3,"defense",p("Voluntário; 1 minuto. Ao sofrer ao menos Proficiência de Ácido, Fogo, Frio ou Veneno, recebe Resistência ao tipo até o fim do próximo turno.")),
  project("alchemist-project-mutagen","Agente Mutagênico",3,3,"support",p("Frasco ou Seringa; voluntário; 10 minutos. Escolha Musculatura, Reflexos, Epiderme, Órgãos Adaptativos ou Sentidos Predatórios."),{containers:["flask","syringe"]}),
  project("alchemist-project-structural-rebuilder","Reconstituidor Estrutural",3,3,"utility",p("Reconstrua até 1 m³ de objeto/estrutura danificada se metade do original existir. Forneça matéria ausente; não cria valor nem propriedades mágicas.")),
  project("alchemist-project-symbiotic-catalyst","Catalisador Simbiótico",3,3,"support",p("Voluntário; 1 minuto. Fórmulas podem conceder PV temporários, movimento de 1,5 m sem oportunidade ou +2 na próxima salvaguarda, uma vez por rodada.")),
  project("alchemist-project-chain-reaction","Reação em Cadeia",3,3,"damage",p("Marque alvo/ponto por 1 minuto. A primeira Fórmula diferente ali dispara 3d6 do Composto da Cadeia e termina; não recebe componentes da Fórmula disparadora."),{dice:"3d6"}),
  project("alchemist-project-etheric-interference","Interferente Etérico",3,3,"debuff",p("Frasco, Dardo ou Seringa; CON; 1 minuto. Ao conjurar ou usar efeito mágico, sofre 2d6 de Força uma vez por rodada; CON ao fim do turno encerra."),{dice:"2d6",containers:["flask","dart","syringe"]}),
  project("alchemist-project-property-transmuter","Transmutador de Propriedade",3,3,"utility",p("Objeto não mágico Médio ou menor; 1 hora. Dureza, Flexibilidade, Leveza, Densidade, Condutividade ou Isolamento; não cria valor ou magia.")),
  project("alchemist-project-compatibility","Matriz de Compatibilidade",4,4,"meta",p("Na próxima ativação vinculada, ignore uma incompatibilidade técnica, nunca proibição fundamental, pagando todos os custos.")),
  project("alchemist-project-reconstitution","Reconstituição Alquímica",4,4,"support",p("Seringa ou Unguento; voluntário; 1 hora. Restaure temporariamente membro, sentido, mobilidade ou função orgânica; não recupera PV."),{containers:["syringe","ointment"]}),
  project("alchemist-project-recursive","Catalisador Recursivo",4,4,"meta",p("Vincule Fórmula I–III; até o fim do próximo turno, um Eco por 0 PR reproduz somente efeito-base e respeita Catalisação.")),
  project("alchemist-project-transfer","Matriz de Transferência",4,4,"support",p("Voluntário; 1 minuto. Reação transfere somente efeito de Projeto benéfico ativo para outro voluntário a 9 m, mantendo duração/cargas.")),
  project("alchemist-project-stasis","Campo de Estase",4,4,"control",p("Esfera 3 m; até 1 minuto; Preparação Ativa. Processos físicos e alquímicos contínuos não progridem na área; retomam ao sair.")),
  project("alchemist-project-dissociator","Dissociador Material",4,4,"utility",p("Até 1 m³ por 1 minuto. Matéria não mágica fica fácil de cortar/quebrar com ferramentas; não afeta criaturas ou itens mágicos.")),
  project("alchemist-project-state-stabilizer","Estabilizador de Estado",4,4,"control",p("Voluntário ou objeto; 1 minuto. Propriedade física/alquímica temporária não pode ser alterada por interferência equivalente ou inferior.")),
  project("alchemist-project-transposition","Matriz de Transposição",4,4,"movement",p("Ligue dois alvos voluntários ou objetos Médios a 18 m. Como Ação, troque suas posições e termine; espaços devem comportá-los."))
];

export const ALCHEMIST_GREAT_WORKS = [
  ["rebirth","Renascimento da Carne","8 horas; 10 PR; 500 PO. Reconstrói permanentemente parte anatômica adquirida; não ressuscita."],
  ["metamorphosis","Metamorfose Perfeita","24 horas; 12 PR; 750 PO. Concede uma adaptação biológica permanente compatível."],
  ["forge","Forja Alquímica","12 horas; 10 PR; 500 PO. Produz até 25 kg de material extraordinário com uma propriedade."],
  ["core","Núcleo Catalítico","24 horas; 15 PR; 1.000 PO. Sustenta processo não instantâneo de infraestrutura sem PR por ativação."],
  ["panacea","Panaceia Universal","12 horas; 12 PR; 1.000 PO. Elimina doença, veneno, toxina, contaminação ou mutação adquirida diagnosticada."],
  ["genesis","Gênese Homuncular","7 dias; 20 PR; 1.500 PO. Transforma o Homúnculo em NPC consciente, autônomo e permanente."]
].map(([id,name,text]) => ({ key:`alchemist-great-work-${id}`, name, cost:0, description:p(text), group:"great-works" }));

const schoolFeature = (key,name,level,text,group) => feature(key,name,level,p(text),group);
export const ALCHEMIST_SCHOOLS = [
  { key:"alchemist-school-biomancer", name:"Escola do Biomante", group:"school-biomancer", description:p("Estuda organismos por Análise e Adaptações."), projects:[
    project("alchemist-school-project-regeneration","Soro de Regeneração",1,1,"healing",p("Seringa; 1 minuto. No início de cada turno com 1+ PV, cura 1d4; termina após duas recuperações."),{school:"school-biomancer",dice:"1d4",containers:["syringe"]}),
    project("alchemist-school-project-muscle","Catalisador Muscular",1,1,"support",p("Seringa; 1 minuto. Uma vez por turno, após ataque corpo a corpo, mova 1,5 m sem oportunidade."),{school:"school-biomancer",containers:["syringe"]}),
    project("alchemist-school-project-blood","Hemorreagente",1,1,"support",p("Seringa/Unguento; 1 hora. Vantagem no primeiro teste para estabilizar ou resistir a Sangramento."),{school:"school-biomancer",containers:["syringe","ointment"]}),
    project("alchemist-school-project-neural","Inibidor Neural",1,1,"debuff",p("Seringa/Dardo; CON. Na falha, sem Reações até o início do próximo turno."),{school:"school-biomancer",containers:["syringe","dart"]})
  ], features:[
    schoolFeature("alchemist-biomancer-anatomy","Anatomia Alquímica",3,"Ação Bônus: analise criatura a 9 m. Descubra faixa de PV, Veneno e condições físicas. Suas Fórmulas curam ou causam +Proficiência ao Organismo Analisado, uma vez por turno.","school-biomancer"),
    schoolFeature("alchemist-biomancer-adaptation","Adaptação Induzida",7,"Ao afetar voluntariamente criatura viva com Fórmula Biomântica, conceda por 10 minutos: Muscular (+3 m), Dérmica (+1 CA), Sensorial (+2 Percepção) ou Metabólica (vantagem contra Veneno/Doença).","school-biomancer"),
    schoolFeature("alchemist-biomancer-rewrite","Reescrita Orgânica",11,"Por +1 PR, aplique por 1 minuto Adaptação Superior: Regenerativa, Predatória, Carapaça ou Anfíbia.","school-biomancer"),
    schoolFeature("alchemist-biomancer-life-engineering","Engenharia da Vida",15,"Cada criatura mantém duas Adaptações; ao afetar o Organismo Analisado, troque uma delas.","school-biomancer"),
    schoolFeature("alchemist-biomancer-chimera","Forma Quimérica",19,"Ação, 1/Descanso Longo: por 1 minuto, voluntário recebe três Adaptações conhecidas e pode trocar uma no início do turno.","school-biomancer")
  ]},
  { key:"alchemist-school-war-artificer", name:"Escola do Artífice Bélico", group:"school-war-artificer", description:p("Integra Fórmulas a armas, armaduras e escudos através de Plataformas e Módulos."), projects:[
    project("alchemist-school-project-magnetic-mine","Mina Magnética",1,1,"control",p("Mina; 1 minuto. Criatura com metal faz DES; na falha, deslocamento 0 até o próximo turno."),{school:"school-war-artificer",containers:["mine"]}),
    project("alchemist-school-project-frag-grenade","Granada Fragmentária",1,1,"damage",p("Granada; esfera 3 m; DES; 2d4 perfurante, metade no sucesso."),{school:"school-war-artificer",dice:"2d4",containers:["grenade"]}),
    project("alchemist-school-project-cover","Cápsula de Cobertura",1,1,"control",p("Granada; 1 rodada. Cria segmento opaco de espuma de 3 m que concede meia cobertura."),{school:"school-war-artificer",containers:["grenade"]}),
    project("alchemist-school-project-breach","Carga de Brecha",1,1,"damage",p("Unguento em objeto: após instalação, causa 3d6 de Impacto a estrutura não mágica em contato."),{school:"school-war-artificer",dice:"3d6",containers:["ointment"]})
  ], features:[
    schoolFeature("alchemist-artificer-platform","Plataforma Bélica",3,"Após Descanso Longo, transforme arma, armadura ou escudo em Plataforma com dois espaços. Aprenda três Módulos Básicos e instale dois.","school-war-artificer"),
    schoolFeature("alchemist-artificer-reconfigure","Reconfiguração de Campo",7,"Ação, Proficiência/Descanso Longo: substitua um Módulo conhecido; aprenda mais dois.","school-war-artificer"),
    schoolFeature("alchemist-artificer-integrated","Sistema Integrado",11,"Plataforma passa a três espaços; aprenda dois Módulos e libere Câmara Catalítica, Dispersor, Blindagem Reativa e Vetor de Impacto.","school-war-artificer"),
    schoolFeature("alchemist-artificer-arsenal","Arsenal Modular",15,"Mantenha duas Plataformas com três espaços. Reconfiguração vira Ação Bônus; aprenda dois Módulos.","school-war-artificer"),
    schoolFeature("alchemist-artificer-overload","Sobrecarga Bélica",19,"Ação Bônus, 1/Descanso Longo, 1 minuto: Módulo temporário, troca gratuita por turno e primeira Fórmula pela Plataforma custa −1 PR, mínimo 1.","school-war-artificer")
  ]},
  { key:"alchemist-school-arcane-transmuter", name:"Escola do Transmutador Arcano", group:"school-arcane-transmuter", description:p("Altera propriedades por Princípios de Transmutação e Lei da Conservação."), projects:[
    project("alchemist-school-project-prism","Cristal Prismático",1,1,"defense",p("Luminescente; Frasco/Unguento; 1 minuto. Reduz 1d6 do primeiro dano de Ácido, Fogo ou Frio."),{school:"school-arcane-transmuter",dice:"1d6",containers:["flask","ointment"]}),
    project("alchemist-school-project-metal","Transmutação Metálica",1,1,"utility",p("Unguento; objeto Pequeno; 10 minutos. Metal não mágico torna-se flexível ou rígido."),{school:"school-arcane-transmuter",containers:["ointment"]}),
    project("alchemist-school-project-density","Âncora de Densidade",1,1,"utility",p("Unguento; objeto Pequeno; 1 minuto. Reduza o peso à metade ou dobre-o."),{school:"school-arcane-transmuter",containers:["ointment"]}),
    project("alchemist-school-project-phase","Solução de Fase",1,1,"utility",p("Unguento; objeto Minúsculo; 1 rodada. Atravesse superfície não mágica compatível."),{school:"school-arcane-transmuter",containers:["ointment"]})
  ], features:[
    schoolFeature("alchemist-transmuter-principles","Princípios Básicos",3,"Aprenda três Princípios: Condutividade, Densidade, Leveza, Fragilidade ou Maleabilidade. Fórmula compatível incorpora um sem ocupar Modificador.","school-arcane-transmuter"),
    schoolFeature("alchemist-transmuter-conversion","Conversão Elemental",7,"Ao preparar Fórmula elemental, converta entre Ácido, Elétrico, Fogo e Frio sem custo; mudar na ativação custa +1 PR.","school-arcane-transmuter"),
    schoolFeature("alchemist-transmuter-structure","Transmutação Estrutural",11,"Aprenda todos os Básicos, use até dois e libere um Superior por +1 PR: Expansão, Compressão, Endurecimento ou Faseamento Parcial.","school-arcane-transmuter"),
    schoolFeature("alchemist-transmuter-reprogram","Matéria Reprogramável",15,"Ação Bônus a 18 m, Proficiência/Descanso Longo: substitua Princípio ativo sem reiniciar duração.","school-arcane-transmuter"),
    schoolFeature("alchemist-transmuter-perfect-matrix","Matriz de Transmutação Perfeita",19,"Ação Bônus, 1/Descanso Longo, 1 minuto: até três Princípios, reprogramação gratuita por turno e Conversão sem custo adicional.","school-arcane-transmuter")
  ]}
];
