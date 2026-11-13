# NOC Telco · Passagem de turno

## Versão integrada

A interface segue a identidade escura e a navegação do ShiftPulse NOC. A passagem ativa reúne a fila de pendências, a busca e a mensagem por cliente. **Histórico e turnos** abre as passagens anteriores e **Configurações** mostra a tolerância, as integrações habilitadas e os destinos cadastrados. A tela de configuração é de consulta. O administrador mantém os valores no servidor e no arquivo de cadastro.

A versão integrada usa PostgreSQL. Instalações do protótipo anterior que tenham registros em `.data/noc-store.json` precisam validar e migrar esses registros antes da troca de versão. O piloto pode começar com um banco novo e dados fictícios.

Piloto local com React, Vite, TypeScript, Express e PostgreSQL. O servidor usa PGlite para execução local ou PostgreSQL externo quando `DATABASE_URL` está configurada.

## Executar

Use Node.js 24 e pnpm. Para usar as configurações opcionais, copie `.env.example` para `.env`.

```sh
pnpm install
pnpm dev
```

Abra http://127.0.0.1:3000. A aplicação usa dois clientes e dois perfis de teste fixos. O servidor escuta em loopback. O piloto pressupõe dados fictícios até a integração do login corporativo e da escala.

## Exercitar o fluxo

1. Crie uma passagem com o horário de entrada em Brasília e adicione pendências de Cliente X e Cliente Y. A referência Jira é manual.
2. Marque os itens para compartilhar e escreva a atualização externa. Publique e prepare a cópia de um cliente. O texto pode ser colado na conversa do cliente no Chatwoot.
3. Troque para **Analista de entrada**, registre um esclarecimento e aceite com ou sem ressalva.
4. Crie a passagem do turno seguinte. Os itens em aberto reaparecem com seu histórico.

O webhook do Teams Workflows é opcional. Use `TEAMS_WEBHOOK_URL` e configure `PUBLIC_BASE_URL` com o endereço pelo qual o destinatário abre o app. O servidor registra a resposta HTTP do webhook. Para testar o cartão em um ambiente compartilhado, será necessário publicar o app com autenticação.

## Configurar as integrações

- **Jira**. Configure `JIRA_BASE_URL`, `JIRA_API_TOKEN` e `JIRA_PROJECTS` (projetos separados por vírgulas). Jira Cloud também exige `JIRA_EMAIL`. A consulta exibe situação e resumo e usa uma conta de leitura. O cliente continua sendo confirmado pelo analista.
- **Chatwoot**. Copie `handover.config.example.json` para `handover.config.json`, cadastre a URL exata de cada conversa e aponte `HANDOVER_CONFIG_FILE` para o arquivo. Instale a pasta `extension` como extensão MV3 no Chrome ou Edge e preencha `VITE_CHATWOOT_EXTENSION_ID`. Ajuste os domínios em `host_permissions` e `externally_connectable.matches` no manifesto se usar Chatwoot próprio ou aplicativo compartilhado. Reinicie o modo de desenvolvimento ou gere o build novamente. O botão só preenche quando confirma a conversa e detecta um editor público vazio. Verifique os seletores com a instalação real. A cópia manual continua disponível.

## Uso compartilhado

Execute o build com `HANDOVER_AUTH_MODE=proxy`, `DATABASE_URL`, `PUBLIC_BASE_URL` (HTTPS), `HANDOVER_CONFIG_FILE` e um segredo aleatório em `HANDOVER_PROXY_TOKEN` (mínimo de 32 caracteres). O servidor continua em loopback. O proxy autenticado deve remover os cabeçalhos de entrada `X-Handover-Subject` e `X-Handover-Proxy-Token` e injetar seus próprios valores após o login corporativo. O primeiro contém o identificador estável da conta no SSO e o segundo o segredo compartilhado com a aplicação. Mantenha esse segredo fora da interface e dos logs. Restrinja o acesso direto ao processo da aplicação.

Todos os analistas cadastrados têm acesso ao NOC Telco. Para aceitar uma passagem, o início do turno de entrada precisa constar na escala `startsAt` daquele analista. Atualize o cadastro e reinicie o servidor quando a escala mudar. Os horários do cadastro podem usar UTC ou o deslocamento de Brasília.

Antes de operar com dados reais, valide o proxy de SSO e o PostgreSQL de destino, faça uma publicação no Teams e confirme o preenchimento em uma conversa de teste no Chatwoot. Consulte [PLANO.md](PLANO.md) para o escopo operacional.

### Homologar o piloto

1. Use dois analistas no SSO, um escalado para o turno de entrada e outro com acesso ao NOC fora daquele turno. Acesso sem login deve ser bloqueado pelo proxy. O analista fora da escala deve conseguir consultar a passagem, enquanto o escalado deve conseguir aceitar.
2. Abra o mesmo rascunho em duas sessões. Salve uma atualização na primeira e tente publicar pela segunda. A publicação deve pedir que o analista atualize e revise a passagem antes de tentar novamente.
3. Publique uma passagem fictícia e abra o cartão do Teams a partir da estação do próximo turno. Confirme que o link abre a passagem publicada após o login.
4. Consulte um chamado Jira de teste e prepare uma mensagem de cada cliente. Confirme o resumo no Jira, o destinatário e o campo público no Chatwoot. Verifique também o comportamento com rascunho existente.
5. Rode uma segunda troca e confirme que uma pendência aberta mantém o identificador e o histórico. Faça backup do PostgreSQL e registre quem opera a escala, o proxy e as integrações.

`pnpm check` verifica TypeScript. `pnpm build` gera a interface de produção. Depois do build, `pnpm smoke` testa duas trocas, o aceite simultâneo e o texto por cliente com dados em memória. `pnpm start` serve a interface gerada localmente.
