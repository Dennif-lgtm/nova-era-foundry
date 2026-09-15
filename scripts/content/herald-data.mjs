const paragraphs = (...parts) => parts.map(text => `<p>${text}</p>`).join("");
const feature = (key, name, level, description, group = "herald") => ({ key, name, level, description, group });

export const HERALD_CLASS = {
  key: "herald-resonances",
  name: "Arauto das Ressonâncias — Nova Era",
  description: `<h2>Arauto das Ressonâncias</h2><blockquote>“Arautos não controlam a magia. Eles a escutam.”</blockquote>${paragraphs("Conjurador completo de Sabedoria que percebe, conserva e combina os ecos deixados pelas próprias magias.", "Dado de Vida: d8. Papel: suporte e controle, com cura e dano adaptativos. Recurso: Ressonâncias de Vida, Equilíbrio e Ruptura.", "CD de magia = 8 + Proficiência + Sabedoria. Ataque mágico = Proficiência + Sabedoria.")}`
};

const improvement = level => feature(`herald-improvement-${level}`, `Aumento de Atributo — Nível ${level}`, level, paragraphs("Receba um Talento ou Aumento de Atributo conforme as regras gerais do sistema."));

export const HERALD_FEATURES = [
  feature("herald-resonant-spellcasting", "Conjuração Ressonante", 1, paragraphs("Após resolver uma magia ou truque do Arauto, gere 1 Ressonância da Afinidade da conjuração. Uma conjuração gera apenas uma Ressonância, mesmo com vários alvos, ataques ou instâncias de dano.", "A Ressonância surge após a resolução e não pode pagar um efeito aplicado à própria magia que a gerou, salvo indicação expressa.")),
  feature("herald-resonance-system", "Sistema de Ressonâncias", 1, paragraphs("Armazene até 5 Ressonâncias em qualquer combinação. Cada uma dura até o fim do seu segundo turno após o turno em que foi gerada e mantém contagem própria.", "Ao terminar o turno com 4 ou mais, faça teste de Sabedoria, CD 10 + quantidade acima de 3. Em falha, sofra 1d4 de dano psíquico por Ressonância excedente e a mais antiga perde 1 turno de duração.")),
  feature("herald-satz-aurora", "Satz Aurora", 1, paragraphs("Como Ação Bônus, uma vez por turno, Afine 1 Ressonância para outro tipo conservando sua duração, ou Dissipe até 2 Ressonâncias.", "Para cada eco dissipado, recupere 1d4 PV ou receba PV temporários iguais à Proficiência. Satz Aurora não recupera Mana.")),
  feature("herald-resonant-echo", "Eco Ressonante", 2, paragraphs("Uma vez por turno, ao gerar uma frequência diferente de outra armazenada, ative uma Concordância sem consumir os ecos. Ela dura até o início do seu próximo turno e apenas uma pode permanecer ativa.", "Vida + Equilíbrio: Harmonia Vital. Equilíbrio + Ruptura: Interferência Disruptiva. Vida + Ruptura: Paradoxo Vital.")),
  feature("herald-natural-affinity", "Afinidade Natural", 3, paragraphs("Uma vez por turno, ao gerar a frequência do seu Caminho, renove até o máximo atual a duração de uma Ressonância armazenada do mesmo tipo. Isso não cria nem consome outro eco.")),
  improvement(4),
  feature("herald-pure-resonance", "Ressonância Pura", 5, paragraphs("Ao conjurar uma magia, consuma exatamente 3 Ressonâncias iguais à Afinidade escolhida, uma vez por turno.", "Vida: cura ou PV temporários adicionais de 2d6 + SAB. Equilíbrio: vantagem para uma criatura aliada ou desvantagem para uma inimiga na próxima jogada válida. Ruptura: +3d6 de dano mágico a uma criatura danificada.")),
  feature("herald-resonant-modulation", "Modulação Ressonante", 6, paragraphs("Ao conjurar uma magia, consuma 1 Ressonância, uma vez por turno.", "Vida: uma criatura recebe PV temporários iguais à Proficiência. Equilíbrio: +1 para aliada ou -1 para inimiga na próxima jogada válida. Ruptura: dano adicional igual à Proficiência.")),
  feature("herald-flow-improvement", "Aprimoramento de Fluxo", 7, paragraphs("Ao gerar uma Ressonância, pode gerar uma segunda do mesmo tipo. Use até Proficiência vezes por Descanso Longo e no máximo uma vez por turno. O eco adicional respeita limite e duração.")),
  improvement(8),
  feature("herald-superior-tuning", "Afinação Superior", 9, paragraphs("Ao Afinar com Satz Aurora, converta até 2 Ressonâncias. Elas podem virar tipos diferentes e conservam suas durações.")),
  feature("herald-resonant-triad", "Tríade Ressonante", 10, paragraphs("Ao conjurar, consuma 1 Vida + 1 Equilíbrio + 1 Ruptura, uma vez por turno.", "Vida: +2d6 de cura e remova uma condição negativa menor. Equilíbrio: duas criaturas recebem +1d4 ou -1d4 na próxima jogada válida. Ruptura: +2d6 de dano e ignore resistência ao primeiro tipo de dano da magia.")),
  feature("herald-stable-flow", "Fluxo Estável", 11, paragraphs("Ressonâncias passam a durar até o fim do terceiro turno após serem geradas. Sobrecarga acontece apenas com 5 ou mais, CD 10 + quantidade acima de 4, e causa 1d4 por Ressonância excedente em falha.")),
  improvement(12),
  feature("herald-resonant-counterpoint", "Contraponto Ressonante", 13, paragraphs("Mantenha duas Concordâncias diferentes do Eco Ressonante ao mesmo tempo. Cada uma conserva sua própria duração e seus gatilhos.")),
  feature("herald-improved-resonance", "Ressonância Aprimorada", 14, paragraphs("Modulação de Vida também cura 1d6 PV. O modificador de Equilíbrio se torna +2 ou -2. Ruptura passa a causar Proficiência + 1d6 de dano adicional.")),
  feature("herald-supreme-resonance", "Ressonância Suprema", 15, paragraphs("Ressonância Pura de Vida se torna 4d6 + SAB, com excedente virando PV temporários até Proficiência + SAB. Equilíbrio pode alcançar duas criaturas e dura até o fim do próximo turno. Ruptura se torna +5d6.")),
  improvement(16),
  feature("herald-resonance-mastery", "Domínio das Ressonâncias", 17, paragraphs("O armazenamento aumenta para 7. Quando estiver cheio, uma Ressonância que seria gerada causa Transbordamento uma vez por turno em criatura a até 18 m.", "Vida cura 2d6 + SAB; Equilíbrio concede +2 CA até o início do próximo turno; Ruptura causa 2d6 + SAB de dano mágico.")),
  feature("herald-echoing-will", "Vontade Ecoante", 18, paragraphs("Uma vez por turno, quando consumir 2 ou mais Ressonâncias simultaneamente, escolha uma das gastas. Ao fim da resolução, ela retorna com duração de 1 turno, respeitando o limite.")),
  improvement(19),
  feature("herald-resonance-ascension", "Ascensão das Ressonâncias", 20, paragraphs("Seu limite aumenta para 10. Você se torna imune ao dano psíquico das próprias características do Arauto e deixa de sofrer Sobrecarga Ressonante.", "Harmonia Absoluta: uma vez por Descanso Longo, como Ação Bônus, suas Ressonâncias não expiram por 1 minuto; gere 1 eco de qualquer tipo no início de cada turno; custos caem em 1, mínimo 1; e a primeira magia de cada turno que causar dano ou curar recebe +2d6."))
];

export const HERALD_PATHS = [
  {
    key: "herald-path-sentimentalist", name: "Caminho da Vida — Sentimentalista", group: "path-life", affinity: "vida",
    description: paragraphs("O Sentimentalista lê emoções e vínculos na frequência da Vida."),
    features: [
      feature("herald-living-empathy", "Empatia Viva", 3, paragraphs("Sempre que gerar Vida, uma criatura que possa perceber recebe PV temporários iguais à Proficiência, no máximo uma vez por turno por criatura. Ao consumir Vida, uma criatura afetada recebe +1 no próximo teste de resistência até o início do seu próximo turno."), "path-life"),
      feature("herald-vital-bond", "Vínculo Vital", 7, paragraphs("Ação Bônus: consuma 1 Vida para vincular você e uma criatura a até 18 m por 1 minuto. Uma vez por turno, quando uma das vinculadas recuperar PV por magia sua, a outra recebe PV temporários iguais à Proficiência."), "path-life"),
      feature("herald-comforting-presence", "Presença Reconfortante", 11, paragraphs("Enquanto armazenar ao menos 1 Vida, projete aura de 9 m. Aliados recebem +1 em testes de resistência. Uma vez por turno, quem recuperar PV por uma magia sua na aura recebe PV temporários iguais à Proficiência."), "path-life"),
      feature("herald-guided-rebirth", "Renascimento Guiado", 15, paragraphs("Uma vez por Descanso Longo, quando criatura a até 18 m seria reduzida a 0 PV, use sua Reação e consuma 3 Vidas. Ela permanece com 1 PV e recupera 2d6 + SAB PV."), "path-life"),
      feature("herald-unbreakable-life", "Vida Inquebrável", 20, paragraphs("Uma vez por Descanso Longo, como Ação Bônus, crie aura de 9 m por 1 minuto. Na primeira vez em que cada aliado cairia a 0 PV, ele permanece com 1 PV e recupera 3d6 + SAB PV."), "path-life")
    ]
  },
  {
    key: "herald-path-concordant", name: "Caminho do Equilíbrio — Concordante", group: "path-balance", affinity: "equilibrio",
    description: paragraphs("O Concordante rege relações entre frequências e transforma combinações em presença constante no campo."),
    features: [
      feature("herald-perfect-concordance", "Concordância Perfeita", 3, paragraphs("Ao gerar Equilíbrio, escolha outra Ressonância armazenada. Até o início do próximo turno, ela fica Sintonizada e pode ser tratada como Vida ou Ruptura somente para formar uma Concordância."), "path-balance"),
      feature("herald-harmonic-field", "Campo Harmônico", 7, paragraphs("Enquanto tiver Concordância ativa, projete aura de 6 m. Ao ativá-la, escolha Ascendente: aliados recebem +1 em ataques; ou Descendente: inimigos afetados por suas magias recebem -1 na próxima jogada de ataque."), "path-balance"),
      feature("herald-uplifting-rhythm", "Ritmo que Eleva", 11, paragraphs("Uma vez por rodada, quando um aliado começar o turno no Campo Harmônico, ele pode mover até metade do deslocamento sem provocar ataques de oportunidade e sem usar sua ação."), "path-balance"),
      feature("herald-combat-symphony", "Sinfonia de Combate", 15, paragraphs("Ao ativar Concordância, consuma 2 Equilíbrios para mantê-la por 3 turnos como Sinfonia. Escolha Ofensiva: +1d6 de dano uma vez por turno; Defensiva: +2 CA; ou Vital: cura recebida por um aliado aumenta em 1d6 uma vez por turno."), "path-balance"),
      feature("herald-divine-tempo", "Tempo Divino", 20, paragraphs("Uma vez por Descanso Longo, como Ação, escolha até Proficiência aliados a 18 m. Cada um pode reagir para mover, atacar, usar truque ou realizar ação sem recurso limitado. Inimigos no Campo sofrem -2 em resistências até seu próximo turno."), "path-balance")
    ]
  },
  {
    key: "herald-path-executor", name: "Caminho da Ruptura — Executor", group: "path-rupture", affinity: "ruptura",
    description: paragraphs("O Executor identifica pontos frágeis em criaturas, defesas e estruturas mágicas."),
    features: [
      feature("herald-resonant-fracture", "Fratura Ressonante", 3, paragraphs("Ao gerar Ruptura por magia que cause dano, escolha uma criatura danificada. Ela fica Fraturada até o início do próximo turno. Na primeira vez em que sofrer seu dano mágico nesse período, recebe dano adicional igual à Proficiência."), "path-rupture"),
      feature("herald-inevitable-strike", "Golpe Inevitável", 7, paragraphs("Ao usar Modulação da Ruptura contra criatura Fraturada, consuma 1 Ruptura adicional para ignorar meia cobertura e resistência ao primeiro tipo de dano da magia. Imunidade permanece."), "path-rupture"),
      feature("herald-absolute-piercing", "Perfuração Absoluta", 11, paragraphs("Uma vez por Descanso Curto ou Longo, como Ação, consuma 2 Rupturas e projete linha de 9 m. Constituição contra sua CD de magia; falha causa 4d6 + SAB e Fraturada, sucesso causa metade."), "path-rupture"),
      feature("herald-rupture-chain", "Cadeia de Ruptura", 15, paragraphs("Uma vez por turno, ao causar dano mágico a criatura Fraturada, consuma 2 Rupturas. Até duas criaturas a 6 m sofrem 2d6 + SAB; sem outros alvos, a criatura original sofre +2d6."), "path-rupture"),
      feature("herald-final-judgment", "Julgamento Final", 20, paragraphs("No início do combate, escolha um Alvo do Julgamento. A primeira magia sua que lhe causar dano a cada turno recebe +2d6 e ignora resistências, mas não imunidades. Você tem vantagem contra medo, encanto e controle mental originados dele."), "path-rupture")
    ]
  }
];
