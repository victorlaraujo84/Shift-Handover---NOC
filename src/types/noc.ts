export type ShiftCode = 'A' | 'B' | 'C';

export type SeverityLevel = 'P0' | 'P1' | 'NORMAL';

export type PendenciaStatus =
  | 'EM_ANDAMENTO'
  | 'AGUARDANDO_CLIENTE'
  | 'AGUARDANDO_OPERADORA'
  | 'MONITORANDO'
  | 'ENCERRADO';

export type HandoverState =
  | 'RASCUNHO'
  | 'PUBLICADA'
  | 'ACEITA'
  | 'ACEITA_COM_RESSALVA';

export interface Operation {
  id: string;
  code: string;
  name: string;
  teamsWebhookUrl: string;
  teamsChannelLabel: string;
  simulateWebhookFailure: boolean;
  jiraProjectKey: string;
  chatwootInboxName: string;
}

export interface ClientMapping {
  id: string;
  operationId: string;
  name: string;
  segment: string;
  circuitPrefix: string;
  chatwootConversationId: number;
  chatwootAccountUrl: string;
  chatwootContactName: string;
}

export interface Analyst {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: string;
  shiftCode: ShiftCode;
  authorizedOperations: string[];
}

export interface ShiftConfig {
  shiftCode: ShiftCode;
  label: string;
  windowLabel: string;
  expectedStartHour: string; // HH:mm
}

export interface JiraReference {
  key: string;
  url: string;
  summary: string;
  status: string;
  projectKey: string;
}

export interface PendenciaHistoryEntry {
  id: string;
  timestamp: string;
  shiftCode: ShiftCode;
  authorName: string;
  actionSummary: string;
}

export interface PendenciaItem {
  id: string; // Persistent across consecutive shift handovers (e.g. PND-101)
  operationId: string;
  clientId: string;
  clientName: string;
  title: string;
  severity: SeverityLevel;
  status: PendenciaStatus;
  jiraRefs: JiraReference[];
  circuitId: string;
  latencyMs: number;
  packetLossPct: number;
  lastAction: string;
  nextAction: string;
  followUpTime: string; // e.g. "16:30" or ""
  externalUpdate: string;
  shareWithClient: boolean;
  keepOpen: boolean;
  originShiftCode: ShiftCode;
  carryoverCount: number;
  createdAt: string;
  updatedAt: string;
  history: PendenciaHistoryEntry[];
}

export interface ClarificationMessage {
  id: string;
  handoverId: string;
  itemId: string;
  authorId: string;
  authorName: string;
  authorShift: ShiftCode;
  type: 'question' | 'answer';
  text: string;
  createdAt: string;
  resolved: boolean;
}

export interface TeamsNotificationLog {
  id: string;
  handoverId: string;
  version: number;
  operationId: string;
  channelLabel: string;
  webhookUrl: string;
  attemptNumber: number;
  status: 'SUCCESS' | 'FAILED';
  httpStatus: number;
  errorMessage?: string;
  payloadCard: Record<string, unknown>;
  sentAt: string;
}

export interface HandoverAcceptance {
  id: string;
  handoverId: string;
  version: number;
  acceptedById: string;
  acceptedByName: string;
  acceptedAt: string;
  withReservation: boolean;
  reservationNote?: string;
}

export interface HandoverVersionSnapshot {
  version: number;
  publishedAt: string;
  publishedById: string;
  publishedByName: string;
  items: PendenciaItem[];
}

export interface ShiftHandover {
  id: string;
  operationId: string;
  outgoingShiftCode: ShiftCode;
  incomingShiftCode: ShiftCode;
  expectedIncomingStartIso: string;
  authorId: string;
  authorName: string;
  state: HandoverState;
  currentVersion: number;
  publishedVersions: HandoverVersionSnapshot[];
  acceptance: HandoverAcceptance | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalSettings {
  toleranceMinutes: number;
  shifts: ShiftConfig[];
  jiraBaseUrl: string;
  jiraMode: 'CLOUD' | 'DATA_CENTER';
}

export interface NocWorkspaceState {
  serverTimeIso: string;
  nextPendenciaSeq: number;
  operations: Operation[];
  clients: ClientMapping[];
  analysts: Analyst[];
  settings: GlobalSettings;
  pendencias: PendenciaItem[];
  handovers: ShiftHandover[];
  clarifications: ClarificationMessage[];
  notifications: TeamsNotificationLog[];
}

export interface ChatwootBridgePayload {
  operationId: string;
  operationName: string;
  clientId: string;
  clientName: string;
  conversationId: number;
  conversationUrl: string;
  contactName: string;
  includedItemIds: string[];
  messageText: string;
  checks: {
    sessionAuthenticated: boolean;
    conversationMatchesTarget: boolean;
    existingDraftDetected: boolean;
    editorReadyState: 'Preparado no Chatwoot' | 'Revisar rascunho existente';
  };
}
