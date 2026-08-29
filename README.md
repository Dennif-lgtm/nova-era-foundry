# Nova Era / KY'rassel para Foundry VTT

Módulo de regras e automações para:

- Foundry VTT 13.351
- D&D5e 5.3.3

## Estado atual

Esta versão oferece armazenamento de Exposição por alvo e por Ladino, automatiza a ação **Analisar**, adiciona um painel de Exposição à ficha e instala no mundo a pasta **Nova Era — Ladino**, contendo a classe, as três subclasses e todas as características consolidadas por nível.

## Instalação pelo Foundry

Na tela **Instalar Módulo**, cole no campo **URL do Manifesto**:

```text
https://github.com/Dennif-lgtm/nova-era-foundry/releases/latest/download/module.json
```

## Instalação de desenvolvimento

Copie a pasta `nova-era` para a pasta `Data/modules` do Foundry e ative o módulo no mundo D&D5e.

## API inicial

```js
const ladino = game.actors.getName("Nome do Ladino");
const alvo = game.actors.getName("Nome do Alvo");

await game.novaEra.exposure.add(alvo, ladino, 1);
game.novaEra.exposure.get(alvo, ladino);
await game.novaEra.exposure.consume(alvo, ladino, 1);
await game.novaEra.exposure.postCard({
  sourceActor: ladino,
  targetActor: alvo,
  value: game.novaEra.exposure.get(alvo, ladino),
  reason: "Analisar"
});
```

Um Mestre também pode reconstruir ou atualizar os itens de conteúdo pelo console:

```js
await game.novaEra.content.installRogue();
```

## Analisar

Selecione exatamente um token como alvo e use a atividade **Analisar** dentro da característica **Exposição**. O módulo realiza Investigação contra CD 10 + nível/ND do alvo e registra até 3 Exposições em caso de sucesso.

O painel **Nova Era — Exposição** na ficha mostra o alvo selecionado, a quantidade atual de Exposição e um botão rápido para Analisar.

Depois de confirmar um acerto contra uma criatura Exposta, o botão **Ataque Furtivo** rola automaticamente o dano adequado ao nível do Ladino. Ele é passivo, não consome Exposição e continua limitado a uma vez por turno.

A partir do nível 6, **Exploração Técnica** permite consumir 2 Exposições no Ataque Furtivo e escolher Perfuração Precisa, Quebra de Ritmo ou Corte de Passo. Os efeitos temporários são acompanhados pelo módulo até o início do turno correspondente.

A ficha do Ladino possui tema próprio em grafite, preto e dourado envelhecido. O painel também acompanha Lâmina de Teste, Ponto Cego, Evasão, Leitura Completa e Golpe Decifrado conforme essas características entram na progressão.

A versão 0.10.0 instala a pasta **Nova Era — Macros do Ladino** e adiciona gatilhos de efeitos secundários. Leitura Completa pode preparar +2 para o próximo ataque ou resistência; Antecipar Golpe aplica +4 CA temporário; Antecipar Técnica aplica +4 à próxima resistência; Antecipar Movimento registra a Reação. Os efeitos de ataque e resistência são removidos depois da rolagem correspondente.

A versão 0.11.0 alinha o módulo às regras consolidadas: Ataque Furtivo passivo e gratuito; Evasão padrão do D&D; Ponto Cego liberado ao gerar ou gastar Exposição, com escolha entre Hide e Disengage; Exploração Técnica com custo próprio de 2 Exposições; Brecha Mortal e Falha Fatal adaptadas ao novo núcleo. A migração também atualiza as descrições já presentes nas fichas.

A versão 0.12.0 amplia a pasta **Nova Era — Macros do Ladino** para 31 macros e adiciona controles de subclasse ao painel. O Fantasma recebe Presença Inalcançável, Desvanecer e Forma Fantasma; o Assassino recebe Brecha Mortal de 1 ou 2 Exposições e Paciência Mortal; o Rastreador recebe escolha de Presa, Pressão, dano de Pressão, Caçada Persistente, Pressão Ininterrupta, Leitura Incansável e abandono da caçada. A inicialização do painel também fica isolada das migrações, evitando que um item antigo esconda a interface inteira.

Movimentos que dependem do tabuleiro e decisões do Mestre são apresentados como resoluções guiadas no chat; dados, custos, efeitos, limites de turno, Descanso Longo, Exposição e Pressão são tratados pelo módulo.

A versão 0.13.0 redesenha o painel como uma interface premium de jogo: cabeçalho próprio, cartão de alvo, gemas animadas de Exposição, ações primárias hierarquizadas, seções recolhíveis, cores dinâmicas para cada subclasse e barra de estados. Grupos sem habilidades disponíveis são ocultados automaticamente e o indicador de Reação reflete o estado real de Antecipação.

A versão 0.13.1 calibra o painel a partir do teste em ficha real: aumenta a coluna, tipografia e botões; separa os numerais das gemas; melhora a leitura dos estados bloqueados; e reduz a altura inicial mantendo os grupos secundários recolhidos. A migração deixa de substituir diretamente a coleção interna de atividades do D&D5e em itens existentes, evitando a falha de atualização observada em alguns mundos.
