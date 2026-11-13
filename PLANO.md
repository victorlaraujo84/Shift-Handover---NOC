# Passagem de turno NOC Telco/Jira

## Ponto de partida

O Teams Communicator usa React, Vite e TypeScript na interface e Express no servidor. O editor de comunicados, o histórico visual, as notificações e a montagem de cartões do Teams servem de referência. A rota de envio recebe a URL do webhook do cliente e o histórico de webhooks recebidos fica em memória. No handover, o servidor deve resolver o destino a partir da operação cadastrada, guardar as tentativas no banco e verificar o acesso de cada analista.

Referências de código. [Dependências](https://github.com/victorlaraujo84/Teams-Communicator/blob/main/package.json), [interface](https://github.com/victorlaraujo84/Teams-Communicator/blob/main/src/App.tsx) e [servidor](https://github.com/victorlaraujo84/Teams-Communicator/blob/main/server.ts).

## Fluxo do piloto

1. O analista abre a passagem NOC/Telco. O rascunho apresenta as pendências abertas e permite adicionar chamados Jira por chave ou link. O analista confirma o cliente e informa a última ação, o próximo passo e o horário de acompanhamento, quando houver.
2. Ao publicar, o sistema salva uma versão da passagem e registra o envio ao Teams. O cartão interno traz um resumo e o link para revisar e aceitar. A publicação permanece disponível durante falhas no Teams e o envio pode ser retomado separadamente.
3. Em cada cliente, **Copiar passagem do cliente** gera uma prévia apenas com os itens marcados para compartilhar daquela combinação de operação e cliente. O texto usa a atualização externa revisada pelo analista. **Abrir no Chatwoot** usa o mesmo texto e a conversa cadastrada, com envio manual pelo analista.
4. Qualquer analista autorizado do turno de entrada pode pedir esclarecimento em um item e aceitar a passagem da operação, inclusive com ressalva. O primeiro aceite válido registra autor, hora e versão recebida. Perguntas abertas continuam disponíveis depois do aceite.
5. As pendências que continuam abertas reaparecem no próximo turno com os mesmos identificadores e histórico. O painel calcula atraso a partir do início previsto do turno de entrada e da tolerância global configurada.

## Dados e responsabilidades

| Registro | O que guarda |
|---|---|
| Operação e cliente | Vínculo entre operação e cliente e destino cadastrado no Chatwoot. |
| Turno e autorização | Início previsto, operação e analistas autorizados naquele turno. |
| Pendência | ID interno, operação, cliente, referências Jira, situação, atualização interna, próxima ação, horário e texto externo. Um item pode agrupar chamados do mesmo cliente. |
| Passagem | Operação, turnos de saída e entrada, autor, estado, versão publicada e itens daquela versão. |
| Aceite e esclarecimentos | Um aceite por passagem, com restrição no banco. Perguntas e respostas vinculadas ao item e à passagem. |
| Notificação | Canal, versão publicada, tentativas, resultado e erro disponível para acompanhamento. |

O Jira mantém os chamados. O handover mantém as ações entre turnos e o histórico do aceite. Para o piloto, a referência Jira pode ser registrada manualmente. A consulta automática começa em leitura após confirmar Jira Cloud ou Data Center, acesso aos projetos e campo que identifica o cliente. A evolução do chamado e o fim do acompanhamento de turno são registrados conforme a rotina operacional.

## Tecnologia candidata

| Opção | Quando faz sentido | Custo de adoção |
|---|---|---|
| React + Vite + TypeScript, Express e PostgreSQL | A equipe pode operar Node.js e banco relacional e quer reaproveitar componentes e cartões do Teams Communicator. | Adicionar autenticação corporativa, migrations, regras do servidor e implantação. |
| React e ASP.NET Core com banco relacional | A TI já mantém aplicações .NET e tem infraestrutura e práticas de autenticação prontas. | Reimplementar o servidor de notificações e reaproveitar a interface e o formato dos cartões onde fizer sentido. |

Minha escolha provisória é React/Vite e Express com PostgreSQL, em uma única aplicação web. Confirmar com a TI o ambiente de hospedagem, o banco disponível e o provedor de login. Confirmar também de onde virá a escala usada para autorizar o aceite e qual será a tolerância global. O webhook do Teams fica na configuração do servidor por operação. A extensão do Chatwoot é um componente de navegador com acesso restrito aos domínios envolvidos.

## Ordem de implementação e critérios do piloto

1. **Base do handover.** Criar a fila do NOC, cadastro de clientes, vínculo manual Jira, rascunho, publicação, aceite e histórico. Em duas trocas consecutivas, um item aberto mantém o ID e aparece no turno seguinte. Dois aceites simultâneos deixam um único registro.
2. **Compartilhamento.** Gerar o cartão interno do Teams e a prévia externa por cliente. Testar dois clientes na mesma passagem, um incidente com chamados agrupados e uma falha de webhook seguida de reenvio. Cada mensagem externa contém apenas os itens selecionados do cliente escolhido.
3. **Prova do Chatwoot, em paralelo.** Em uma conversa de teste, validar que o clique abre o destino cadastrado e preenche o editor de resposta pública pelo HTML. Verificar login, carregamento, conversa divergente e rascunho existente. O estado **Preparado no Chatwoot** indica que o texto está editável. A cópia continua disponível para uso manual.
4. **Consulta Jira.** Com acesso de teste e um projeto representativo, validar chave, situação, cliente e permissões antes de ligar a consulta ao formulário.
