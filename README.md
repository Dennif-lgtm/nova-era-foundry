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

Depois de confirmar um acerto, o botão **Ataque Furtivo** consome 1 Exposição e rola automaticamente o dano adequado ao nível do Ladino. Durante o combate, o botão permite apenas um uso por turno.

A partir do nível 6, **Exploração Técnica** permite consumir 2 Exposições no Ataque Furtivo e escolher Perfuração Precisa, Quebra de Ritmo ou Corte de Passo. Os efeitos temporários são acompanhados pelo módulo até o início do turno correspondente.

A ficha do Ladino possui tema próprio em grafite, preto e dourado envelhecido. O painel também acompanha Lâmina de Teste, Ponto Cego, Evasão Calculada, Leitura Completa e Golpe Decifrado conforme essas características entram na progressão.

## Próximo marco

Integrar o consumo de Exposição ao Ataque Furtivo.
