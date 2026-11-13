import type {
  ClientMapping,
  GlobalSettings,
  HandoverState,
  PendenciaItem,
  PendenciaStatus,
  SeverityLevel,
  ShiftHandover,
} from '../types/noc';

export function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--/-- --:--';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getSeverityMeta(severity: SeverityLevel): {
  label: string;
  shortLabel: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  switch (severity) {
    case 'P0':
      return {
        label: 'P0 Crítico',
        shortLabel: 'P0',
        bgClass: 'bg-[#EF4444]/15',
        textClass: 'text-[#F87171]',
        borderClass: 'border-[#EF4444]/40',
      };
    case 'P1':
      return {
        label: 'P1 Alto',
        shortLabel: 'P1',
        bgClass: 'bg-[#F59E0B]/15',
        textClass: 'text-[#FBBF24]',
        borderClass: 'border-[#F59E0B]/40',
      };
    default:
      return {
        label: 'Normal',
        shortLabel: 'NOM',
        bgClass: 'bg-[#10B981]/15',
        textClass: 'text-[#34D399]',
        borderClass: 'border-[#10B981]/35',
      };
  }
}

export function getPendenciaStatusLabel(status: PendenciaStatus): string {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'Em andamento';
    case 'AGUARDANDO_CLIENTE':
      return 'Aguardando cliente';
    case 'AGUARDANDO_OPERADORA':
      return 'Aguardando operadora';
    case 'MONITORANDO':
      return 'Monitorando';
    case 'ENCERRADO':
      return 'Encerrado';
  }
}

export function getHandoverStateMeta(state: HandoverState): {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  switch (state) {
    case 'RASCUNHO':
      return {
        label: 'Rascunho em edição',
        bgClass: 'bg-[#1F2937]',
        textClass: 'text-[#BEC8D2]',
        borderClass: 'border-[#374151]',
      };
    case 'PUBLICADA':
      return {
        label: 'Publicada · Aguardando aceite',
        bgClass: 'bg-[#0EA5E9]/15',
        textClass: 'text-[#89CEFF]',
        borderClass: 'border-[#0EA5E9]/40',
      };
    case 'ACEITA':
      return {
        label: 'Aceita pelo turno',
        bgClass: 'bg-[#10B981]/15',
        textClass: 'text-[#34D399]',
        borderClass: 'border-[#10B981]/35',
      };
    case 'ACEITA_COM_RESSALVA':
      return {
        label: 'Aceita com ressalva',
        bgClass: 'bg-[#F59E0B]/15',
        textClass: 'text-[#FBBF24]',
        borderClass: 'border-[#F59E0B]/40',
      };
  }
}

export function calculateShiftDelay(
  handover: ShiftHandover | undefined,
  settings: GlobalSettings,
  nowMs: number,
): {
  status: 'ON_TIME' | 'WITHIN_TOLERANCE' | 'DELAYED';
  delayMinutes: number;
  label: string;
} {
  if (!handover) {
    return { status: 'ON_TIME', delayMinutes: 0, label: 'Sem passagem ativa' };
  }

  const expectedMs = new Date(handover.expectedIncomingStartIso).getTime();
  const referenceMs = handover.acceptance
    ? new Date(handover.acceptance.acceptedAt).getTime()
    : nowMs;

  const rawDiffMinutes = Math.round((referenceMs - expectedMs) / 60_000);
  if (rawDiffMinutes <= 0) {
    return {
      status: 'ON_TIME',
      delayMinutes: 0,
      label: `No prazo · início ${formatTimeShort(handover.expectedIncomingStartIso)}`,
    };
  }

  if (rawDiffMinutes <= settings.toleranceMinutes) {
    return {
      status: 'WITHIN_TOLERANCE',
      delayMinutes: rawDiffMinutes,
      label: `+${rawDiffMinutes}m (tolerância ${settings.toleranceMinutes}m)`,
    };
  }

  return {
    status: 'DELAYED',
    delayMinutes: rawDiffMinutes,
    label: `Atraso +${rawDiffMinutes}m (limite ${settings.toleranceMinutes}m)`,
  };
}

export function buildClientExternalPreview(
  operationName: string,
  client: ClientMapping | undefined,
  items: PendenciaItem[],
): string {
  if (!client) return '';
  const shared = items.filter(
    (p) =>
      p.operationId === client.operationId &&
      p.clientId === client.id &&
      p.status !== 'ENCERRADO' &&
      p.shareWithClient,
  );

  if (shared.length === 0) return '';

  const lines = [
    `Atualização Operacional NOC — ${client.name}`,
    `Operação: ${operationName}`,
    '',
    ...shared.map((item, idx) => {
      const jiraPart =
        item.jiraRefs.length > 0 ? ` (${item.jiraRefs.map((j) => j.key).join(', ')})` : '';
      const followPart = item.followUpTime ? ` | Próxima atualização: ${item.followUpTime}` : '';
      const text = item.externalUpdate.trim() || item.lastAction.trim() || item.title;
      return `${idx + 1}. [${item.id}]${jiraPart} ${item.title}\n   ${text}${followPart}`;
    }),
  ];

  return lines.join('\n');
}
