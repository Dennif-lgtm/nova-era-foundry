# Matriz de fechamento — Alquimista

Esta matriz registra **efeitos mecânicos reais**, não apenas itens instalados ou mensagens no chat. Estados: `auto` = alteração de estado já implementada; `guiado` = escolha/validação do GM é parte da regra; `pendente` = ainda não pronto para publicação como automação completa.

As proteções reativas implementadas interceptam tanto dano do Midi QOL quanto dano causado diretamente pelas Fórmulas do módulo. O fluxo de arma/ataque externo ainda requer Midi QOL ativo.

| Bloco | Auto | Guiado | Pendente |
| --- | --- | --- | --- |
| Classe básica | PR, capacidade, preparação, dano/cura básicos, descanso, Fórmula Perfeita, Reservas, Retardado, Recalibração, Engenharia | escolhas de progressão | Experimento (todas as opções) |
| Grau I | Carga, Restaurador, Estimulante, Supressor, Neutralizante (redução reativa com Midi QOL); Revestimento de arma/armadura/escudo com Midi QOL | Preparado de Campo | Controle, Revestimento de três munições |
| Grau II | Catalisador Reativo, Coagulante, Inibidor Regenerativo, Névoa Terapêutica | Mimetizador | Contenção, Condutor, Desestabilizador |
| Grau III | Conversor e Matriz Adaptativa (interceptação Midi QOL); Catalisador Simbiótico (PV temporários e +2 salvaguarda) | Reconstituidor, Transmutador de Propriedade, movimento da Simbiose Estimulante | Mutagênico (parcial), Cadeia, Interferente |
| Grau IV | Transposição (básica) | Compatibilidade, Dissociador, Estabilizador | Reconstituição, Recursivo, Transferência, Estase |
| Biomante | Anatomia; Soro de Regeneração; Inibidor Neural; Adaptações Muscular, Dérmica, Sensorial, Regenerativa e Predatória; Forma Quimérica (aplicar/trocar/recuperar uso) | Metabólica, Anfíbia | Engenharia da Vida, Muscular, Hemorreagente; validar Carapaça |
| Artífice Bélico | Granada Fragmentária; escolha/aprendizado de Módulos, Plataformas, compatibilidade de equipamento, espaços, Reconfiguração/limites, Blindagem Reativa com Midi QOL; Injetor no acerto Midi QOL; Lançador +6 m; Câmara Catalítica/limite por Descanso Longo | — | Reativo, Propulsor, Estabilizador, Dispersor, Vetor, Sobrecarga, Mina, Cobertura, Brecha; testes no Foundry |
| Transmutador Arcano | Cristal Prismático (interceptação Midi QOL); Conversão Elemental; escolha/limites dos Princípios; Condutividade, Densidade, Leveza e Endurecimento; Reprogramação e Matriz Perfeita (usos/tempo) | Fragilidade, Maleabilidade, Expansão, Compressão e Faseamento exigem confirmar alteração física na cena | efeitos físicos desses Princípios, demais Projetos de Escola; testes no Foundry |
| Homúnculo | ficha, criação, limite de ordem por turno, Fórmula carregada, alcance de entrega, recuperação, reconstrução com custo | movimento e interação no mapa | Esquiva automática e validação de tempo de carregamento; testes no Foundry |
| Grandes Obras | custos/tempo e registro de progresso | validação de materiais e resultado pelo GM | efeitos mecânicos permanentes específicos |

O patch só deve ser chamado de conclusão da classe depois que cada `pendente` receber automação real ou uma decisão explícita e visível de arbitragem do GM quando a regra não for determinística.
