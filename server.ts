import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import type {
  Analyst,
  ChatwootBridgePayload,
  ClarificationMessage,
  ClientMapping,
  HandoverAcceptance,
  HandoverVersionSnapshot,
  JiraReference,
  NocWorkspaceState,
  Operation,
  PendenciaItem,
  ShiftCode,
  ShiftHandover,
  TeamsNotificationLog,
} from './src/types/noc.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'noc-store.json');

const acceptanceLocks = new Set<string>();

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function minutesFromNowIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function nextShiftCode(code: ShiftCode): ShiftCode {
  if (code === 'A') return 'B';
  if (code === 'B') return 'C';
  return 'A';
}

export function parseJiraInput(rawInput: string, jiraBaseUrl: string): JiraReference | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const keyMatch = trimmed.toUpperCase().match(/([A-Z][A-Z0-9]+-\d+)/);
  if (!keyMatch) return null;

  const key = keyMatch[1];
  const projectKey = key.split('-')[0];
  const cleanBase = jiraBaseUrl.replace(/\/+$/, '');
  const url = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `${cleanBase}/browse/${key}`;

  return {
    key,
    url,
    summary: `Chamado ${key} vinculado ao atendimento operacional`,
    status: 'Em Atendimento',
    projectKey,
  };
}

function buildSeedState(): NocWorkspaceState {
  const operations: Operation[] = [
    {
      id: 'op-vivo-core',
      code: 'NOC-CORE',
      name: 'Backbone Core & Trânsito IP',
      teamsWebhookUrl: 'https://teams.webhook.telco.local/incoming/noc-core-handover',
      teamsChannelLabel: '#noc-core-passagem',
      simulateWebhookFailure: false,
      jiraProjectKey: 'NOC',
      chatwootInboxName: 'NOC Enterprise Core',
    },
    {
      id: 'op-mpls-corp',
      code: 'NOC-MPLS',
      name: 'Conectividade Corporativa MPLS',
      teamsWebhookUrl: 'https://teams.webhook.telco.local/incoming/noc-mpls-handover',
      teamsChannelLabel: '#noc-mpls-turnos',
      simulateWebhookFailure: false,
      jiraProjectKey: 'MPLS',
      chatwootInboxName: 'MPLS Corporativo',
    },
    {
      id: 'op-metro-sdwan',
      code: 'NOC-SDWAN',
      name: 'Metro Fiber & SD-WAN Edge',
      teamsWebhookUrl: 'https://teams.webhook.telco.local/incoming/noc-sdwan-handover',
      teamsChannelLabel: '#noc-sdwan-b2b',
      simulateWebhookFailure: true,
      jiraProjectKey: 'EDGE',
      chatwootInboxName: 'SD-WAN Atendimento',
    },
  ];

  const clients: ClientMapping[] = [
    {
      id: 'cli-itau-dc',
      operationId: 'op-vivo-core',
      name: 'Banco Itaú — DC Tatuapé',
      segment: 'Financeiro Crítico',
      circuitPrefix: 'CKT-SP-ITAU',
      chatwootConversationId: 4821,
      chatwootAccountUrl: 'https://chatwoot.telco.local/app/accounts/1/conversations/4821',
      chatwootContactName: 'Mesa Infraestrutura Itaú',
    },
    {
      id: 'cli-b3-coloc',
      operationId: 'op-vivo-core',
      name: 'B3 Colocation — Santana de Parnaíba',
      segment: 'Mercado Financeiro',
      circuitPrefix: 'CKT-SP-B3',
      chatwootConversationId: 4890,
      chatwootAccountUrl: 'https://chatwoot.telco.local/app/accounts/1/conversations/4890',
      chatwootContactName: 'Operações Baixa Latência B3',
    },
    {
      id: 'cli-magalu-cd',
      operationId: 'op-mpls-corp',
      name: 'Magazine Luiza — CD Louveira',
      segment: 'Varejo & Logística',
      circuitPrefix: 'CKT-CPS-MGLU',
      chatwootConversationId: 5104,
      chatwootAccountUrl: 'https://chatwoot.telco.local/app/accounts/1/conversations/5104',
      chatwootContactName: 'NOC Varejo Magalu',
    },
    {
      id: 'cli-sirio-hosp',
      operationId: 'op-mpls-corp',
      name: 'Hospital Sírio-Libanês — Bela Vista',
      segment: 'Saúde Alta Disponibilidade',
      circuitPrefix: 'CKT-SP-HSL',
      chatwootConversationId: 5139,
      chatwootAccountUrl: 'https://chatwoot.telco.local/app/accounts/1/conversations/5139',
      chatwootContactName: 'TI Assistencial HSL',
    },
    {
      id: 'cli-localiza-hq',
      operationId: 'op-metro-sdwan',
      name: 'Localiza Fleet — Matriz BH',
      segment: 'Mobilidade & SD-WAN',
      circuitPrefix: 'CKT-MG-LOCZ',
      chatwootConversationId: 5302,
      chatwootAccountUrl: 'https://chatwoot.telco.local/app/accounts/1/conversations/5302',
      chatwootContactName: 'Suporte Redes Localiza',
    },
  ];

  const analysts: Analyst[] = [
    {
      id: 'an-carlos',
      name: 'Carlos Mendes',
      initials: 'CM',
      email: 'carlos.mendes@telconet.com.br',
      role: 'Analista NOC N2 (Saída)',
      shiftCode: 'B',
      authorizedOperations: ['op-vivo-core', 'op-mpls-corp', 'op-metro-sdwan'],
    },
    {
      id: 'an-marina',
      name: 'Marina Silva',
      initials: 'MS',
      email: 'marina.silva@telconet.com.br',
      role: 'Analista NOC N2 (Entrada)',
      shiftCode: 'C',
      authorizedOperations: ['op-vivo-core', 'op-mpls-corp'],
    },
    {
      id: 'an-rafael',
      name: 'Rafael Costa',
      initials: 'RC',
      email: 'rafael.costa@telconet.com.br',
      role: 'Especialista Backbone N3 (Entrada)',
      shiftCode: 'C',
      authorizedOperations: ['op-vivo-core', 'op-metro-sdwan'],
    },
    {
      id: 'an-juliana',
      name: 'Juliana Ferreira',
      initials: 'JF',
      email: 'juliana.ferreira@telconet.com.br',
      role: 'Analista NOC N1 (Turno A)',
      shiftCode: 'A',
      authorizedOperations: ['op-vivo-core', 'op-mpls-corp', 'op-metro-sdwan'],
    },
    {
      id: 'an-thiago',
      name: 'Thiago Nogueira',
      initials: 'TN',
      email: 'thiago.nogueira@telconet.com.br',
      role: 'Coordenador de Operações',
      shiftCode: 'A',
      authorizedOperations: ['op-vivo-core', 'op-mpls-corp', 'op-metro-sdwan'],
    },
  ];

  const pendencias: PendenciaItem[] = [
    {
      id: 'PND-101',
      operationId: 'op-vivo-core',
      clientId: 'cli-itau-dc',
      clientName: 'Banco Itaú — DC Tatuapé',
      title: 'Perda de pacotes intermitente no enlace DWDM 100G primário',
      severity: 'P0',
      status: 'AGUARDANDO_OPERADORA',
      jiraRefs: [
        {
          key: 'NOC-4091',
          url: 'https://jira.telco.local/browse/NOC-4091',
          summary: 'Atenuação óptica RX -24.8 dBm no trecho SP-TATUAPE-01',
          status: 'Em Atendimento N3',
          projectKey: 'NOC',
        },
        {
          key: 'NOC-4094',
          url: 'https://jira.telco.local/browse/NOC-4094',
          summary: 'Desvio BGP preventivo via rota redundante Osasco',
          status: 'Em Monitoramento',
          projectKey: 'NOC',
        },
      ],
      circuitId: 'CKT-SP-ITAU-100G-01',
      latencyMs: 28.4,
      packetLossPct: 1.85,
      lastAction:
        'Tráfego migrado preventivamente para o caminho secundário via Osasco às 21:15. Protocolo de campo aberto com equipe óptica (OS #88412) para inspeção de emenda no km 14.',
      nextAction:
        'Cobrar retorno da equipe de fibra às 23:00 e validar estabilidade do nível óptico antes de retornar BGP ao caminho principal.',
      followUpTime: '23:00',
      externalUpdate:
        'Identificamos degradação física no enlace principal do DC Tatuapé. O tráfego foi redirecionado preventivamente para a rota secundária sem perda de conectividade, e a equipe de campo atua na normalização do trecho óptico. Próxima atualização prevista às 23:00.',
      shareWithClient: true,
      keepOpen: true,
      originShiftCode: 'A',
      carryoverCount: 1,
      createdAt: minutesAgoIso(420),
      updatedAt: minutesAgoIso(18),
      history: [
        {
          id: 'hist-101-1',
          timestamp: minutesAgoIso(420),
          shiftCode: 'A',
          authorName: 'Juliana Ferreira',
          actionSummary: 'Abertura da pendência P0 por alarme de CRC e atenuação RX no DWDM.',
        },
        {
          id: 'hist-101-2',
          timestamp: minutesAgoIso(45),
          shiftCode: 'B',
          authorName: 'Carlos Mendes',
          actionSummary: 'Agrupado chamado NOC-4094 referente ao desvio BGP e acionada equipe externa.',
        },
      ],
    },
    {
      id: 'PND-102',
      operationId: 'op-vivo-core',
      clientId: 'cli-itau-dc',
      clientName: 'Banco Itaú — DC Tatuapé',
      title: 'Janela de atualização firmware roteador PE-SP-04 agendada',
      severity: 'NORMAL',
      status: 'MONITORANDO',
      jiraRefs: [
        {
          key: 'NOC-4102',
          url: 'https://jira.telco.local/browse/NOC-4102',
          summary: 'RDM-9921 Janela controlada PE-SP-04 (02:00 - 03:30)',
          status: 'Aprovado CAB',
          projectKey: 'NOC',
        },
      ],
      circuitId: 'CKT-SP-ITAU-PE04',
      latencyMs: 4.1,
      packetLossPct: 0.0,
      lastAction:
        'RDM aprovada pelo cliente e pré-check de sessões BGP concluído sem divergências de tabela.',
      nextAction:
        'Acompanhar início da janela às 02:00 junto ao analista N3 de plantão e confirmar reconvergência.',
      followUpTime: '02:00',
      externalUpdate:
        'Confirmamos que a janela de manutenção preventiva no roteador PE-SP-04 permanece programada para 02:00 com duração estimada de 90 minutos.',
      shareWithClient: false,
      keepOpen: true,
      originShiftCode: 'B',
      carryoverCount: 0,
      createdAt: minutesAgoIso(190),
      updatedAt: minutesAgoIso(32),
      history: [
        {
          id: 'hist-102-1',
          timestamp: minutesAgoIso(190),
          shiftCode: 'B',
          authorName: 'Carlos Mendes',
          actionSummary: 'Registrado acompanhamento de janela RDM-9921 para Turno C.',
        },
      ],
    },
    {
      id: 'PND-103',
      operationId: 'op-vivo-core',
      clientId: 'cli-b3-coloc',
      clientName: 'B3 Colocation — Santana de Parnaíba',
      title: 'Flapping em sessão BGP IPv6 peer secundário Equinix SP3',
      severity: 'P1',
      status: 'EM_ANDAMENTO',
      jiraRefs: [
        {
          key: 'NOC-4108',
          url: 'https://jira.telco.local/browse/NOC-4108',
          summary: 'Hold timer expired intermitente na sessão AS265122',
          status: 'Em Análise',
          projectKey: 'NOC',
        },
      ],
      circuitId: 'CKT-SP-B3-EQX3',
      latencyMs: 1.9,
      packetLossPct: 0.12,
      lastAction:
        'Coletados logs de BFD e capturado pcap da porta TenGigE0/0/2/1. Encaminhado pedido de validação de MTU ao NOC do peer.',
      nextAction:
        'Validar resposta do peer sobre configuração de BFD timers e confirmar zero drops após ajuste.',
      followUpTime: '22:45',
      externalUpdate:
        'Seguimos atuando na estabilização da sessão BGP IPv6 secundária em Santana de Parnaíba. O tráfego principal permanece operando normalmente sem impacto nas aplicações.',
      shareWithClient: true,
      keepOpen: true,
      originShiftCode: 'B',
      carryoverCount: 0,
      createdAt: minutesAgoIso(140),
      updatedAt: minutesAgoIso(12),
      history: [
        {
          id: 'hist-103-1',
          timestamp: minutesAgoIso(140),
          shiftCode: 'B',
          authorName: 'Carlos Mendes',
          actionSummary: 'Identificado flap de sessão IPv6 via alerta SNMP e aberto NOC-4108.',
        },
      ],
    },
    {
      id: 'PND-104',
      operationId: 'op-mpls-corp',
      clientId: 'cli-magalu-cd',
      clientName: 'Magazine Luiza — CD Louveira',
      title: 'Queda de enlace última milha Embratel — contingência LTE ativa',
      severity: 'P0',
      status: 'AGUARDANDO_OPERADORA',
      jiraRefs: [
        {
          key: 'MPLS-881',
          url: 'https://jira.telco.local/browse/MPLS-881',
          summary: 'Rompimento fibra acesso CD Louveira (LOS porta WAN0)',
          status: 'Chamado Operadora',
          projectKey: 'MPLS',
        },
      ],
      circuitId: 'CKT-CPS-MGLU-09',
      latencyMs: 64.2,
      packetLossPct: 0.4,
      lastAction:
        'SD-WAN assumiu contingência via link secundário + LTE sem parada do WMS. Protocolo Embratel #20261113-994 em deslocamento.',
      nextAction:
        'Solicitar previsão atualizada de emenda no protocolo Embratel às 23:15 e informar mesa logística do cliente.',
      followUpTime: '23:15',
      externalUpdate:
        'O circuito principal do CD Louveira sofreu indisponibilidade física e opera em contingência automática sem parada de faturamento. A operadora parceira já está com equipe em campo; nova atualização às 23:15.',
      shareWithClient: true,
      keepOpen: true,
      originShiftCode: 'B',
      carryoverCount: 0,
      createdAt: minutesAgoIso(210),
      updatedAt: minutesAgoIso(25),
      history: [
        {
          id: 'hist-104-1',
          timestamp: minutesAgoIso(210),
          shiftCode: 'B',
          authorName: 'Carlos Mendes',
          actionSummary: 'Confirmado LOS na CPE e validado failover automático para contingência.',
        },
      ],
    },
    {
      id: 'PND-105',
      operationId: 'op-mpls-corp',
      clientId: 'cli-sirio-hosp',
      clientName: 'Hospital Sírio-Libanês — Bela Vista',
      title: 'Latência elevada no túnel IPSec unidade Jardins',
      severity: 'P1',
      status: 'AGUARDANDO_CLIENTE',
      jiraRefs: [
        {
          key: 'MPLS-887',
          url: 'https://jira.telco.local/browse/MPLS-887',
          summary: 'Saturação de upload 96% no horário comercial',
          status: 'Aguardando Retorno',
          projectKey: 'MPLS',
        },
      ],
      circuitId: 'CKT-SP-HSL-03',
      latencyMs: 39.5,
      packetLossPct: 0.05,
      lastAction:
        'Enviado relatório NetFlow demonstrando pico de backup PACS fora de janela consumindo banda contratada.',
      nextAction:
        'Confirmar com TI do hospital se política de QoS para PACS será aplicada amanhã.',
      followUpTime: '08:00',
      externalUpdate:
        'Encaminhamos a evidência de utilização de banda do enlace Jardins para validação interna de QoS pela equipe do hospital.',
      shareWithClient: true,
      keepOpen: true,
      originShiftCode: 'A',
      carryoverCount: 1,
      createdAt: minutesAgoIso(520),
      updatedAt: minutesAgoIso(65),
      history: [
        {
          id: 'hist-105-1',
          timestamp: minutesAgoIso(520),
          shiftCode: 'A',
          authorName: 'Juliana Ferreira',
          actionSummary: 'Coleta NetFlow anexada ao MPLS-887.',
        },
      ],
    },
    {
      id: 'PND-106',
      operationId: 'op-metro-sdwan',
      clientId: 'cli-localiza-hq',
      clientName: 'Localiza Fleet — Matriz BH',
      title: 'Troca preventiva de transceiver SFP+ concluída na borda BH',
      severity: 'NORMAL',
      status: 'MONITORANDO',
      jiraRefs: [
        {
          key: 'EDGE-312',
          url: 'https://jira.telco.local/browse/EDGE-312',
          summary: 'Substituição SFP+ porta ge-0/0/1 com RX normalizado (-7.2 dBm)',
          status: 'Em Observação',
          projectKey: 'EDGE',
        },
      ],
      circuitId: 'CKT-MG-LOCZ-01',
      latencyMs: 11.3,
      packetLossPct: 0.0,
      lastAction:
        'Módulo óptico substituído às 20:05. Sem erros de FEC ou CRC nas últimas 2 horas.',
      nextAction:
        'Se permanecer estável por mais 4 horas, encerrar chamado e remover da passagem.',
      followUpTime: '00:30',
      externalUpdate:
        'Substituição preventiva do módulo óptico concluída com sucesso na Matriz BH. Circuito operando dentro dos parâmetros nominais.',
      shareWithClient: true,
      keepOpen: true,
      originShiftCode: 'B',
      carryoverCount: 0,
      createdAt: minutesAgoIso(180),
      updatedAt: minutesAgoIso(40),
      history: [
        {
          id: 'hist-106-1',
          timestamp: minutesAgoIso(180),
          shiftCode: 'B',
          authorName: 'Carlos Mendes',
          actionSummary: 'Substituição de SFP+ validada com técnico local.',
        },
      ],
    },
  ];

  // Historical published & accepted handover (Turno A -> Turno B) for audit/history screen
  const prevSnapshotItems = pendencias
    .filter((p) => p.operationId === 'op-vivo-core' && p.originShiftCode === 'A')
    .map((p) => ({ ...p }));

  const historicalHandover: ShiftHandover = {
    id: 'ho-core-prev-01',
    operationId: 'op-vivo-core',
    outgoingShiftCode: 'A',
    incomingShiftCode: 'B',
    expectedIncomingStartIso: minutesAgoIso(480),
    authorId: 'an-juliana',
    authorName: 'Juliana Ferreira',
    state: 'ACEITA',
    currentVersion: 1,
    publishedVersions: [
      {
        version: 1,
        publishedAt: minutesAgoIso(472),
        publishedById: 'an-juliana',
        publishedByName: 'Juliana Ferreira',
        items: prevSnapshotItems,
      },
    ],
    acceptance: {
      id: 'acc-core-prev-01',
      handoverId: 'ho-core-prev-01',
      version: 1,
      acceptedById: 'an-carlos',
      acceptedByName: 'Carlos Mendes',
      acceptedAt: minutesAgoIso(468),
      withReservation: false,
    },
    createdAt: minutesAgoIso(495),
    updatedAt: minutesAgoIso(468),
  };

  // Active Turno B -> Turno C draft for Backbone Core (ready to review/publish)
  // Plus a published Turno B -> Turno C handover for MPLS (waiting acceptance)
  // Plus a published Turno B -> Turno C handover with simulated Teams failure for SD-WAN
  const activeCoreHandover: ShiftHandover = {
    id: 'ho-core-curr-02',
    operationId: 'op-vivo-core',
    outgoingShiftCode: 'B',
    incomingShiftCode: 'C',
    expectedIncomingStartIso: minutesAgoIso(22), // 22 min past start vs 15 min tolerance -> shows real SLA delay!
    authorId: 'an-carlos',
    authorName: 'Carlos Mendes',
    state: 'RASCUNHO',
    currentVersion: 0,
    publishedVersions: [],
    acceptance: null,
    createdAt: minutesAgoIso(45),
    updatedAt: minutesAgoIso(12),
  };

  const mplsSnapshotItems = pendencias
    .filter((p) => p.operationId === 'op-mpls-corp')
    .map((p) => ({ ...p }));

  const activeMplsHandover: ShiftHandover = {
    id: 'ho-mpls-curr-01',
    operationId: 'op-mpls-corp',
    outgoingShiftCode: 'B',
    incomingShiftCode: 'C',
    expectedIncomingStartIso: minutesAgoIso(8), // within 15m tolerance
    authorId: 'an-carlos',
    authorName: 'Carlos Mendes',
    state: 'PUBLICADA',
    currentVersion: 1,
    publishedVersions: [
      {
        version: 1,
        publishedAt: minutesAgoIso(6),
        publishedById: 'an-carlos',
        publishedByName: 'Carlos Mendes',
        items: mplsSnapshotItems,
      },
    ],
    acceptance: null,
    createdAt: minutesAgoIso(35),
    updatedAt: minutesAgoIso(6),
  };

  const sdwanSnapshotItems = pendencias
    .filter((p) => p.operationId === 'op-metro-sdwan')
    .map((p) => ({ ...p }));

  const activeSdwanHandover: ShiftHandover = {
    id: 'ho-sdwan-curr-01',
    operationId: 'op-metro-sdwan',
    outgoingShiftCode: 'B',
    incomingShiftCode: 'C',
    expectedIncomingStartIso: minutesFromNowIso(12),
    authorId: 'an-carlos',
    authorName: 'Carlos Mendes',
    state: 'PUBLICADA',
    currentVersion: 1,
    publishedVersions: [
      {
        version: 1,
        publishedAt: minutesAgoIso(4),
        publishedById: 'an-carlos',
        publishedByName: 'Carlos Mendes',
        items: sdwanSnapshotItems,
      },
    ],
    acceptance: null,
    createdAt: minutesAgoIso(25),
    updatedAt: minutesAgoIso(4),
  };

  const clarifications: ClarificationMessage[] = [
    {
      id: 'clr-1',
      handoverId: 'ho-core-curr-02',
      itemId: 'PND-101',
      authorId: 'an-marina',
      authorName: 'Marina Silva',
      authorShift: 'C',
      type: 'question',
      text: 'O cliente já recebeu o protocolo OS #88412 ou aguardamos o retorno das 23:00 antes de enviar nova atualização no Chatwoot?',
      createdAt: minutesAgoIso(10),
      resolved: false,
    },
    {
      id: 'clr-2',
      handoverId: 'ho-mpls-curr-01',
      itemId: 'PND-104',
      authorId: 'an-marina',
      authorName: 'Marina Silva',
      authorShift: 'C',
      type: 'question',
      text: 'A contingência LTE está com banda suficiente para o faturamento noturno do CD Louveira?',
      createdAt: minutesAgoIso(3),
      resolved: false,
    },
  ];

  const notifications: TeamsNotificationLog[] = [
    {
      id: 'ntf-prev-1',
      handoverId: 'ho-core-prev-01',
      version: 1,
      operationId: 'op-vivo-core',
      channelLabel: '#noc-core-passagem',
      webhookUrl: 'https://teams.webhook.telco.local/incoming/noc-core-handover',
      attemptNumber: 1,
      status: 'SUCCESS',
      httpStatus: 200,
      payloadCard: buildTeamsCardPayload(operations[0], historicalHandover, prevSnapshotItems),
      sentAt: minutesAgoIso(472),
    },
    {
      id: 'ntf-mpls-1',
      handoverId: 'ho-mpls-curr-01',
      version: 1,
      operationId: 'op-mpls-corp',
      channelLabel: '#noc-mpls-turnos',
      webhookUrl: 'https://teams.webhook.telco.local/incoming/noc-mpls-handover',
      attemptNumber: 1,
      status: 'SUCCESS',
      httpStatus: 200,
      payloadCard: buildTeamsCardPayload(operations[1], activeMplsHandover, mplsSnapshotItems),
      sentAt: minutesAgoIso(6),
    },
    {
      id: 'ntf-sdwan-1',
      handoverId: 'ho-sdwan-curr-01',
      version: 1,
      operationId: 'op-metro-sdwan',
      channelLabel: '#noc-sdwan-b2b',
      webhookUrl: 'https://teams.webhook.telco.local/incoming/noc-sdwan-handover',
      attemptNumber: 1,
      status: 'FAILED',
      httpStatus: 503,
      errorMessage: 'Teams Webhook HTTP 503: Upstream gateway timeout (passagem permanece publicada).',
      payloadCard: buildTeamsCardPayload(operations[2], activeSdwanHandover, sdwanSnapshotItems),
      sentAt: minutesAgoIso(4),
    },
  ];

  return {
    serverTimeIso: new Date().toISOString(),
    nextPendenciaSeq: 107,
    operations,
    clients,
    analysts,
    settings: {
      toleranceMinutes: 15,
      shifts: [
        { shiftCode: 'A', label: 'Turno A (Manhã)', windowLabel: '06:00 – 14:00', expectedStartHour: '06:00' },
        { shiftCode: 'B', label: 'Turno B (Tarde)', windowLabel: '14:00 – 22:00', expectedStartHour: '14:00' },
        { shiftCode: 'C', label: 'Turno C (Madrugada)', windowLabel: '22:00 – 06:00', expectedStartHour: '22:00' },
      ],
      jiraBaseUrl: 'https://jira.telco.local',
      jiraMode: 'DATA_CENTER',
    },
    pendencias,
    handovers: [activeCoreHandover, activeMplsHandover, activeSdwanHandover, historicalHandover],
    clarifications,
    notifications,
  };
}

function buildTeamsCardPayload(
  operation: Operation,
  handover: ShiftHandover,
  items: PendenciaItem[],
): Record<string, unknown> {
  const p0Count = items.filter((i) => i.severity === 'P0').length;
  const p1Count = items.filter((i) => i.severity === 'P1').length;
  const reviewUrl = `/?handoverId=${encodeURIComponent(handover.id)}&operationId=${encodeURIComponent(operation.id)}`;

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              size: 'Medium',
              weight: 'Bolder',
              text: `[${operation.code}] Passagem de Turno ${handover.outgoingShiftCode} → ${handover.incomingShiftCode} (v${handover.currentVersion || 1})`,
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Operação', value: operation.name },
                { title: 'Autor (Saída)', value: handover.authorName },
                { title: 'Pendências Abertas', value: `${items.length} itens (${p0Count} P0 · ${p1Count} P1)` },
              ],
            },
            ...items.slice(0, 4).map((item) => ({
              type: 'TextBlock',
              wrap: true,
              spacing: 'Small',
              text: `• [${item.id}] ${item.clientName} — ${item.title} (${item.jiraRefs.map((j) => j.key).join(', ') || 'Sem Jira'})`,
            })),
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Revisar e Aceitar Passagem',
              url: reviewUrl,
            },
          ],
        },
      },
    ],
  };
}

async function readStore(): Promise<NocWorkspaceState> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as NocWorkspaceState;
    parsed.serverTimeIso = new Date().toISOString();
    return parsed;
  } catch {
    const seed = buildSeedState();
    await writeStore(seed);
    return seed;
  }
}

async function writeStore(state: NocWorkspaceState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const next = { ...state, serverTimeIso: new Date().toISOString() };
  const tmpPath = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), 'utf-8');
  await fs.rename(tmpPath, STORE_PATH);
}

async function dispatchTeamsNotification(
  operation: Operation,
  handover: ShiftHandover,
  items: PendenciaItem[],
  attemptNumber: number,
  version: number,
): Promise<TeamsNotificationLog> {
  const payloadCard = buildTeamsCardPayload(operation, handover, items);
  const sentAt = new Date().toISOString();

  if (operation.simulateWebhookFailure) {
    return {
      id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      handoverId: handover.id,
      version,
      operationId: operation.id,
      channelLabel: operation.teamsChannelLabel,
      webhookUrl: operation.teamsWebhookUrl,
      attemptNumber,
      status: 'FAILED',
      httpStatus: 503,
      errorMessage:
        'Falha simulada no webhook Teams (HTTP 503). A passagem continua publicada e pode ser reenviada.',
      payloadCard,
      sentAt,
    };
  }

  // If user configured a real non-local webhook URL, attempt actual HTTP POST with short timeout
  const isLocalDemoUrl =
    operation.teamsWebhookUrl.includes('.local') ||
    !operation.teamsWebhookUrl.startsWith('http');

  if (!isLocalDemoUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(operation.teamsWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadCard),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          handoverId: handover.id,
          version,
          operationId: operation.id,
          channelLabel: operation.teamsChannelLabel,
          webhookUrl: operation.teamsWebhookUrl,
          attemptNumber,
          status: 'FAILED',
          httpStatus: res.status,
          errorMessage: `Webhook retornou HTTP ${res.status} (${res.statusText}).`,
          payloadCard,
          sentAt,
        };
      }
    } catch (err) {
      return {
        id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        handoverId: handover.id,
        version,
        operationId: operation.id,
        channelLabel: operation.teamsChannelLabel,
        webhookUrl: operation.teamsWebhookUrl,
        attemptNumber,
        status: 'FAILED',
        httpStatus: 504,
        errorMessage: `Erro de conexão com webhook Teams: ${err instanceof Error ? err.message : 'Timeout'}`,
        payloadCard,
        sentAt,
      };
    }
  }

  return {
    id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    handoverId: handover.id,
    version,
    operationId: operation.id,
    channelLabel: operation.teamsChannelLabel,
    webhookUrl: operation.teamsWebhookUrl,
    attemptNumber,
    status: 'SUCCESS',
    httpStatus: 200,
    payloadCard,
    sentAt,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Ensure store exists on boot
  await readStore();

  app.get('/api/state', async (_req, res) => {
    const state = await readStore();
    res.json(state);
  });

  app.post('/api/reset-demo', async (_req, res) => {
    const seed = buildSeedState();
    await writeStore(seed);
    res.json(seed);
  });

  app.post('/api/jira/lookup', async (req, res) => {
    const { input } = req.body as { input?: string };
    const state = await readStore();
    const parsed = parseJiraInput(input ?? '', state.settings.jiraBaseUrl);
    if (!parsed) {
      res.status(400).json({ error: 'Informe uma chave Jira válida (ex: NOC-4120) ou URL completa.' });
      return;
    }

    // Enrich with realistic read-only pilot validation metadata
    const sampleStatuses = ['Em Atendimento', 'Aguardando Campo', 'Em Análise N3', 'Monitoramento'];
    const hash = parsed.key.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    parsed.status = sampleStatuses[hash % sampleStatuses.length];
    parsed.summary = `[${state.settings.jiraMode}] ${parsed.key} — Incidente operacional validado via leitura`;

    res.json({
      jiraRef: parsed,
      mode: state.settings.jiraMode,
      validatedAt: new Date().toISOString(),
    });
  });

  app.post('/api/pendencias', async (req, res) => {
    const body = req.body as Partial<PendenciaItem> & { jiraInput?: string; authorName?: string; shiftCode?: ShiftCode };
    const state = await readStore();

    const client = state.clients.find((c) => c.id === body.clientId);
    if (!client) {
      res.status(400).json({ error: 'Cliente inválido para esta operação.' });
      return;
    }

    const id = `PND-${state.nextPendenciaSeq}`;
    state.nextPendenciaSeq += 1;

    const jiraRefs: JiraReference[] = Array.isArray(body.jiraRefs) ? [...body.jiraRefs] : [];
    if (body.jiraInput) {
      const parsed = parseJiraInput(body.jiraInput, state.settings.jiraBaseUrl);
      if (parsed && !jiraRefs.some((j) => j.key === parsed.key)) {
        jiraRefs.push(parsed);
      }
    }

    const now = new Date().toISOString();
    const newItem: PendenciaItem = {
      id,
      operationId: body.operationId || client.operationId,
      clientId: client.id,
      clientName: client.name,
      title: (body.title || 'Nova pendência operacional').trim(),
      severity: body.severity || 'P1',
      status: body.status || 'EM_ANDAMENTO',
      jiraRefs,
      circuitId: (body.circuitId || `${client.circuitPrefix}-01`).trim(),
      latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : 14.2,
      packetLossPct: typeof body.packetLossPct === 'number' ? body.packetLossPct : 0,
      lastAction: (body.lastAction || '').trim(),
      nextAction: (body.nextAction || '').trim(),
      followUpTime: (body.followUpTime || '').trim(),
      externalUpdate: (body.externalUpdate || '').trim(),
      shareWithClient: Boolean(body.shareWithClient),
      keepOpen: body.status !== 'ENCERRADO',
      originShiftCode: body.shiftCode || 'B',
      carryoverCount: 0,
      createdAt: now,
      updatedAt: now,
      history: [
        {
          id: `hist-${Date.now()}`,
          timestamp: now,
          shiftCode: body.shiftCode || 'B',
          authorName: body.authorName || 'Analista NOC',
          actionSummary: `Pendência ${id} aberta para ${client.name}.`,
        },
      ],
    };

    state.pendencias.unshift(newItem);
    await writeStore(state);
    res.status(201).json({ item: newItem, state });
  });

  app.patch('/api/pendencias/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body as Partial<PendenciaItem> & { authorName?: string; shiftCode?: ShiftCode; note?: string };
    const state = await readStore();
    const idx = state.pendencias.findIndex((p) => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pendência não encontrada.' });
      return;
    }

    const current = state.pendencias[idx];
    let clientName = current.clientName;
    if (updates.clientId && updates.clientId !== current.clientId) {
      const cli = state.clients.find((c) => c.id === updates.clientId);
      if (cli) clientName = cli.name;
    }

    const now = new Date().toISOString();
    const nextStatus = updates.status ?? current.status;
    const updatedItem: PendenciaItem = {
      ...current,
      ...updates,
      clientName,
      keepOpen: nextStatus !== 'ENCERRADO' && (updates.keepOpen ?? true),
      updatedAt: now,
      history: [
        ...current.history,
        {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: now,
          shiftCode: updates.shiftCode || current.originShiftCode,
          authorName: updates.authorName || 'Analista NOC',
          actionSummary:
            updates.note ||
            (updates.status && updates.status !== current.status
              ? `Situação alterada para ${updates.status}.`
              : 'Atualização operacional registrada no rascunho.'),
        },
      ],
    };

    state.pendencias[idx] = updatedItem;
    await writeStore(state);
    res.json({ item: updatedItem, state });
  });

  app.post('/api/handovers/:id/publish', async (req, res) => {
    const { id } = req.params;
    const { authorId } = req.body as { authorId?: string };
    const state = await readStore();

    const hIdx = state.handovers.findIndex((h) => h.id === id);
    if (hIdx === -1) {
      res.status(404).json({ error: 'Passagem não encontrada.' });
      return;
    }

    const handover = state.handovers[hIdx];
    const operation = state.operations.find((o) => o.id === handover.operationId);
    if (!operation) {
      res.status(404).json({ error: 'Operação não encontrada.' });
      return;
    }

    const author = state.analysts.find((a) => a.id === authorId) || {
      id: handover.authorId,
      name: handover.authorName,
    };

    const nextVersion = handover.currentVersion + 1;
    const now = new Date().toISOString();

    const activeItems = state.pendencias
      .filter((p) => p.operationId === handover.operationId && p.status !== 'ENCERRADO')
      .map((p) => JSON.parse(JSON.stringify(p)) as PendenciaItem);

    const snapshot: HandoverVersionSnapshot = {
      version: nextVersion,
      publishedAt: now,
      publishedById: author.id,
      publishedByName: author.name,
      items: activeItems,
    };

    const updatedHandover: ShiftHandover = {
      ...handover,
      authorId: author.id,
      authorName: author.name,
      state: handover.acceptance ? handover.state : 'PUBLICADA',
      currentVersion: nextVersion,
      publishedVersions: [snapshot, ...handover.publishedVersions],
      updatedAt: now,
    };

    state.handovers[hIdx] = updatedHandover;

    const existingAttempts = state.notifications.filter(
      (n) => n.handoverId === handover.id && n.version === nextVersion,
    ).length;

    const notificationLog = await dispatchTeamsNotification(
      operation,
      updatedHandover,
      activeItems,
      existingAttempts + 1,
      nextVersion,
    );

    state.notifications.unshift(notificationLog);
    await writeStore(state);

    res.json({
      handover: updatedHandover,
      notification: notificationLog,
      state,
    });
  });

  app.post('/api/handovers/:id/retry-teams', async (req, res) => {
    const { id } = req.params;
    const state = await readStore();
    const handover = state.handovers.find((h) => h.id === id);
    if (!handover || handover.currentVersion === 0) {
      res.status(400).json({ error: 'Publique a passagem antes de reenviar ao Teams.' });
      return;
    }

    const operation = state.operations.find((o) => o.id === handover.operationId);
    if (!operation) {
      res.status(404).json({ error: 'Operação não encontrada.' });
      return;
    }

    const latestSnapshot = handover.publishedVersions[0];
    const items = latestSnapshot ? latestSnapshot.items : [];
    const existingAttempts = state.notifications.filter(
      (n) => n.handoverId === handover.id && n.version === handover.currentVersion,
    ).length;

    const notificationLog = await dispatchTeamsNotification(
      operation,
      handover,
      items,
      existingAttempts + 1,
      handover.currentVersion,
    );

    state.notifications.unshift(notificationLog);
    await writeStore(state);

    res.json({ notification: notificationLog, state });
  });

  app.post('/api/handovers/:id/accept', async (req, res) => {
    const { id } = req.params;
    const { analystId, withReservation, reservationNote } = req.body as {
      analystId?: string;
      withReservation?: boolean;
      reservationNote?: string;
    };

    if (acceptanceLocks.has(id)) {
      res.status(409).json({
        error: 'Aceite concorrente bloqueado: outra requisição de aceite já está em processamento para esta passagem.',
      });
      return;
    }

    acceptanceLocks.add(id);
    try {
      const state = await readStore();
      const hIdx = state.handovers.findIndex((h) => h.id === id);
      if (hIdx === -1) {
        res.status(404).json({ error: 'Passagem não encontrada.' });
        return;
      }

      const handover = state.handovers[hIdx];
      if (handover.currentVersion === 0 || handover.state === 'RASCUNHO') {
        res.status(400).json({ error: 'A passagem precisa ser publicada antes de receber aceite.' });
        return;
      }

      if (handover.acceptance) {
        res.status(409).json({
          error: `Passagem já aceita por ${handover.acceptance.acceptedByName} na versão v${handover.acceptance.version}.`,
          existingAcceptance: handover.acceptance,
        });
        return;
      }

      const analyst = state.analysts.find((a) => a.id === analystId);
      if (!analyst) {
        res.status(403).json({ error: 'Analista não identificado.' });
        return;
      }

      if (analyst.shiftCode !== handover.incomingShiftCode) {
        res.status(403).json({
          error: `Apenas analistas escalados no Turno ${handover.incomingShiftCode} podem aceitar esta passagem (analista atual: Turno ${analyst.shiftCode}).`,
        });
        return;
      }

      if (!analyst.authorizedOperations.includes(handover.operationId)) {
        res.status(403).json({
          error: `${analyst.name} não possui autorização cadastrada para esta operação.`,
        });
        return;
      }

      if (withReservation && !(reservationNote || '').trim()) {
        res.status(400).json({ error: 'Informe o motivo da ressalva para registrar o aceite.' });
        return;
      }

      const now = new Date().toISOString();
      const acceptance: HandoverAcceptance = {
        id: `acc-${Date.now()}`,
        handoverId: handover.id,
        version: handover.currentVersion,
        acceptedById: analyst.id,
        acceptedByName: analyst.name,
        acceptedAt: now,
        withReservation: Boolean(withReservation),
        reservationNote: withReservation ? (reservationNote || '').trim() : undefined,
      };

      const updated: ShiftHandover = {
        ...handover,
        state: withReservation ? 'ACEITA_COM_RESSALVA' : 'ACEITA',
        acceptance,
        updatedAt: now,
      };

      state.handovers[hIdx] = updated;
      await writeStore(state);

      res.json({ acceptance, handover: updated, state });
    } finally {
      acceptanceLocks.delete(id);
    }
  });

  app.post('/api/handovers/:id/next-shift', async (req, res) => {
    const { id } = req.params;
    const { authorId } = req.body as { authorId?: string };
    const state = await readStore();

    const prevHandover = state.handovers.find((h) => h.id === id);
    if (!prevHandover) {
      res.status(404).json({ error: 'Passagem anterior não encontrada.' });
      return;
    }

    if (!prevHandover.acceptance) {
      res.status(400).json({ error: 'Registre o aceite da passagem atual antes de abrir o próximo turno.' });
      return;
    }

    const newOutgoing = prevHandover.incomingShiftCode;
    const newIncoming = nextShiftCode(newOutgoing);

    // Check if a draft for the new shift already exists
    const existingDraft = state.handovers.find(
      (h) =>
        h.operationId === prevHandover.operationId &&
        h.outgoingShiftCode === newOutgoing &&
        h.state === 'RASCUNHO',
    );
    if (existingDraft) {
      res.json({ handover: existingDraft, carriedOverIds: [], state });
      return;
    }

    const fallbackAuthor =
      state.analysts.find((a) => a.id === authorId) ||
      state.analysts.find(
        (a) => a.shiftCode === newOutgoing && a.authorizedOperations.includes(prevHandover.operationId),
      ) ||
      state.analysts[0];

    // Carry over open items preserving their exact persistent PND-xxx IDs
    const carriedOverIds: string[] = [];
    const now = new Date().toISOString();
    state.pendencias = state.pendencias.map((item) => {
      if (item.operationId === prevHandover.operationId && item.status !== 'ENCERRADO') {
        carriedOverIds.push(item.id);
        return {
          ...item,
          carryoverCount: item.carryoverCount + 1,
          updatedAt: now,
          history: [
            ...item.history,
            {
              id: `hist-${Date.now()}-${item.id}`,
              timestamp: now,
              shiftCode: newOutgoing,
              authorName: fallbackAuthor.name,
              actionSummary: `Item mantido na troca de turno (${prevHandover.outgoingShiftCode}→${newOutgoing}) preservando ID ${item.id}.`,
            },
          ],
        };
      }
      return item;
    });

    const newHandover: ShiftHandover = {
      id: `ho-${prevHandover.operationId}-${Date.now()}`,
      operationId: prevHandover.operationId,
      outgoingShiftCode: newOutgoing,
      incomingShiftCode: newIncoming,
      expectedIncomingStartIso: minutesFromNowIso(480),
      authorId: fallbackAuthor.id,
      authorName: fallbackAuthor.name,
      state: 'RASCUNHO',
      currentVersion: 0,
      publishedVersions: [],
      acceptance: null,
      createdAt: now,
      updatedAt: now,
    };

    state.handovers.unshift(newHandover);
    await writeStore(state);

    res.status(201).json({ handover: newHandover, carriedOverIds, state });
  });

  app.post('/api/clarifications', async (req, res) => {
    const { handoverId, itemId, authorId, type, text } = req.body as {
      handoverId: string;
      itemId: string;
      authorId: string;
      type: 'question' | 'answer';
      text: string;
    };

    if (!text?.trim()) {
      res.status(400).json({ error: 'Digite o texto do esclarecimento.' });
      return;
    }

    const state = await readStore();
    const author = state.analysts.find((a) => a.id === authorId) || state.analysts[0];

    const msg: ClarificationMessage = {
      id: `clr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      handoverId,
      itemId,
      authorId: author.id,
      authorName: author.name,
      authorShift: author.shiftCode,
      type: type === 'answer' ? 'answer' : 'question',
      text: text.trim(),
      createdAt: new Date().toISOString(),
      resolved: false,
    };

    state.clarifications.push(msg);
    await writeStore(state);
    res.status(201).json({ message: msg, state });
  });

  app.patch('/api/clarifications/:id/resolve', async (req, res) => {
    const { id } = req.params;
    const { resolved } = req.body as { resolved?: boolean };
    const state = await readStore();
    const msg = state.clarifications.find((c) => c.id === id);
    if (!msg) {
      res.status(404).json({ error: 'Esclarecimento não encontrado.' });
      return;
    }
    msg.resolved = resolved ?? !msg.resolved;
    await writeStore(state);
    res.json({ message: msg, state });
  });

  app.post('/api/chatwoot/prepare', async (req, res) => {
    const { operationId, clientId, simulateExistingDraft, simulateDivergentConversation } = req.body as {
      operationId: string;
      clientId: string;
      simulateExistingDraft?: boolean;
      simulateDivergentConversation?: boolean;
    };

    const state = await readStore();
    const operation = state.operations.find((o) => o.id === operationId);
    const client = state.clients.find((c) => c.id === clientId && c.operationId === operationId);

    if (!operation || !client) {
      res.status(404).json({ error: 'Vínculo entre operação e cliente não encontrado no cadastro.' });
      return;
    }

    const selectedItems = state.pendencias.filter(
      (p) =>
        p.operationId === operationId &&
        p.clientId === clientId &&
        p.status !== 'ENCERRADO' &&
        p.shareWithClient,
    );

    const lines = [
      `Atualização Operacional NOC — ${client.name}`,
      `Operação: ${operation.name}`,
      '',
      ...selectedItems.map((item, idx) => {
        const jiraPart = item.jiraRefs.length > 0 ? ` (${item.jiraRefs.map((j) => j.key).join(', ')})` : '';
        const followPart = item.followUpTime ? ` | Próxima atualização: ${item.followUpTime}` : '';
        const text = item.externalUpdate.trim() || item.lastAction.trim() || item.title;
        return `${idx + 1}. [${item.id}]${jiraPart} ${item.title}\n   ${text}${followPart}`;
      }),
    ];

    const payload: ChatwootBridgePayload = {
      operationId: operation.id,
      operationName: operation.name,
      clientId: client.id,
      clientName: client.name,
      conversationId: client.chatwootConversationId,
      conversationUrl: client.chatwootAccountUrl,
      contactName: client.chatwootContactName,
      includedItemIds: selectedItems.map((i) => i.id),
      messageText: selectedItems.length > 0 ? lines.join('\n') : '',
      checks: {
        sessionAuthenticated: true,
        conversationMatchesTarget: !simulateDivergentConversation,
        existingDraftDetected: Boolean(simulateExistingDraft),
        editorReadyState:
          simulateExistingDraft || simulateDivergentConversation
            ? 'Revisar rascunho existente'
            : 'Preparado no Chatwoot',
      },
    };

    res.json(payload);
  });

  app.patch('/api/settings', async (req, res) => {
    const body = req.body as Partial<NocWorkspaceState['settings']>;
    const state = await readStore();
    state.settings = {
      ...state.settings,
      ...body,
    };
    await writeStore(state);
    res.json({ settings: state.settings, state });
  });

  app.patch('/api/operations/:id', async (req, res) => {
    const { id } = req.params;
    const body = req.body as Partial<Operation>;
    const state = await readStore();
    const idx = state.operations.findIndex((o) => o.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Operação não encontrada.' });
      return;
    }
    state.operations[idx] = { ...state.operations[idx], ...body };
    await writeStore(state);
    res.json({ operation: state.operations[idx], state });
  });

  app.post('/api/clients', async (req, res) => {
    const body = req.body as Partial<ClientMapping>;
    const state = await readStore();
    if (!body.name?.trim() || !body.operationId) {
      res.status(400).json({ error: 'Informe nome do cliente e operação.' });
      return;
    }
    const convId = Number(body.chatwootConversationId) || Math.floor(5400 + Math.random() * 500);
    const newClient: ClientMapping = {
      id: `cli-${Date.now()}`,
      operationId: body.operationId,
      name: body.name.trim(),
      segment: (body.segment || 'Corporativo B2B').trim(),
      circuitPrefix: (body.circuitPrefix || 'CKT-BR-SP').trim(),
      chatwootConversationId: convId,
      chatwootAccountUrl:
        body.chatwootAccountUrl?.trim() ||
        `https://chatwoot.telco.local/app/accounts/1/conversations/${convId}`,
      chatwootContactName: (body.chatwootContactName || `NOC ${body.name.trim()}`).trim(),
    };
    state.clients.push(newClient);
    await writeStore(state);
    res.status(201).json({ client: newClient, state });
  });

  app.patch('/api/clients/:id', async (req, res) => {
    const { id } = req.params;
    const body = req.body as Partial<ClientMapping>;
    const state = await readStore();
    const idx = state.clients.findIndex((c) => c.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    state.clients[idx] = { ...state.clients[idx], ...body };
    await writeStore(state);
    res.json({ client: state.clients[idx], state });
  });

  app.patch('/api/analysts/:id', async (req, res) => {
    const { id } = req.params;
    const body = req.body as Partial<Analyst>;
    const state = await readStore();
    const idx = state.analysts.findIndex((a) => a.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Analista não encontrado.' });
      return;
    }
    state.analysts[idx] = { ...state.analysts[idx], ...body };
    await writeStore(state);
    res.json({ analyst: state.analysts[idx], state });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ShiftPulse NOC server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
