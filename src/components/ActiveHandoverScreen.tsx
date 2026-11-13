import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  Users,
} from 'lucide-react';
import type {
  Analyst,
  ClarificationMessage,
  ClientMapping,
  JiraReference,
  Operation,
  PendenciaItem,
  PendenciaStatus,
  SeverityLevel,
  ShiftHandover,
  TeamsNotificationLog,
} from '../types/noc';
import {
  buildClientExternalPreview,
  formatDateTimeShort,
  getHandoverStateMeta,
  getPendenciaStatusLabel,
  getSeverityMeta,
} from '../utils/nocHelpers';

interface ActiveHandoverScreenProps {
  operation: Operation;
  handover: ShiftHandover | undefined;
  pendencias: PendenciaItem[];
  clients: ClientMapping[];
  analysts: Analyst[];
  currentAnalyst: Analyst;
  clarifications: ClarificationMessage[];
  notifications: TeamsNotificationLog[];
  searchQuery: string;
  onRefreshState: () => Promise<void>;
  onOpenNewPendencia: () => void;
  onOpenChatwoot: (clientId: string) => void;
  onPublishHandover: () => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

type LeftFilter = 'ALL' | 'P0' | 'P1' | 'SHARE';

export function ActiveHandoverScreen({
  operation,
  handover,
  pendencias,
  clients,
  analysts,
  currentAnalyst,
  clarifications,
  notifications,
  searchQuery,
  onRefreshState,
  onOpenNewPendencia,
  onOpenChatwoot,
  onPublishHandover,
  onToast,
}: ActiveHandoverScreenProps) {
  const opClients = clients.filter((c) => c.operationId === operation.id);

  // Filter pendencias for this operation
  const opItems = pendencias.filter((p) => p.operationId === operation.id);
  const [leftFilter, setLeftFilter] = useState<LeftFilter>('ALL');
  const [selectedItemId, setSelectedItemId] = useState<string>(opItems[0]?.id || '');

  const filteredItems = opItems.filter((item) => {
    if (item.status === 'ENCERRADO' && leftFilter !== 'ALL') return false;
    if (leftFilter === 'P0' && item.severity !== 'P0') return false;
    if (leftFilter === 'P1' && item.severity !== 'P1') return false;
    if (leftFilter === 'SHARE' && !item.shareWithClient) return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      item.id.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.clientName.toLowerCase().includes(q) ||
      item.circuitId.toLowerCase().includes(q) ||
      item.jiraRefs.some((j) => j.key.toLowerCase().includes(q))
    );
  });

  const selectedItem =
    opItems.find((i) => i.id === selectedItemId) || filteredItems[0] || opItems[0];

  // Center pane editable draft state synced to selectedItem
  const [draftTitle, setDraftTitle] = useState('');
  const [draftClientId, setDraftClientId] = useState('');
  const [draftSeverity, setDraftSeverity] = useState<SeverityLevel>('P1');
  const [draftStatus, setDraftStatus] = useState<PendenciaStatus>('EM_ANDAMENTO');
  const [draftCircuit, setDraftCircuit] = useState('');
  const [draftLastAction, setDraftLastAction] = useState('');
  const [draftNextAction, setDraftNextAction] = useState('');
  const [draftFollowUp, setDraftFollowUp] = useState('');
  const [draftExternal, setDraftExternal] = useState('');
  const [draftShare, setDraftShare] = useState(false);
  const [draftJiraRefs, setDraftJiraRefs] = useState<JiraReference[]>([]);
  const [jiraInput, setJiraInput] = useState('');
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isAddingJira, setIsAddingJira] = useState(false);

  // Clarification input state
  const [clarificationText, setClarificationText] = useState('');
  const [clarificationType, setClarificationType] = useState<'question' | 'answer'>('question');
  const [isPostingClarification, setIsPostingClarification] = useState(false);

  // Right pane client sharing & acceptance state
  const [selectedShareClientId, setSelectedShareClientId] = useState(opClients[0]?.id || '');
  const [withReservation, setWithReservation] = useState(false);
  const [reservationNote, setReservationNote] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRetryingTeams, setIsRetryingTeams] = useState(false);
  const [isStartingNextShift, setIsStartingNextShift] = useState(false);

  useEffect(() => {
    if (!selectedItem) return;
    setDraftTitle(selectedItem.title);
    setDraftClientId(selectedItem.clientId);
    setDraftSeverity(selectedItem.severity);
    setDraftStatus(selectedItem.status);
    setDraftCircuit(selectedItem.circuitId);
    setDraftLastAction(selectedItem.lastAction);
    setDraftNextAction(selectedItem.nextAction);
    setDraftFollowUp(selectedItem.followUpTime);
    setDraftExternal(selectedItem.externalUpdate);
    setDraftShare(selectedItem.shareWithClient);
    setDraftJiraRefs(selectedItem.jiraRefs);
    setSelectedShareClientId((prev) =>
      opClients.some((c) => c.id === prev) ? prev : selectedItem.clientId,
    );
  }, [selectedItem?.id, selectedItem?.updatedAt, operation.id]);

  const effectiveShareClientId = opClients.some((c) => c.id === selectedShareClientId)
    ? selectedShareClientId
    : opClients[0]?.id || '';
  const activeShareClient = opClients.find((c) => c.id === effectiveShareClientId);
  const clientPreviewText = buildClientExternalPreview(operation.name, activeShareClient, pendencias);

  const itemClarifications = clarifications.filter(
    (c) =>
      c.itemId === selectedItem?.id &&
      (!handover || c.handoverId === handover.id),
  );

  const latestNotification = handover
    ? notifications.find(
        (n) => n.handoverId === handover.id && n.version === handover.currentVersion,
      ) || notifications.find((n) => n.handoverId === handover.id)
    : undefined;

  const authorizedIncomingAnalysts = handover
    ? analysts.filter(
        (a) =>
          a.shiftCode === handover.incomingShiftCode &&
          a.authorizedOperations.includes(operation.id),
      )
    : [];

  const isCurrentAnalystAuthorized = Boolean(
    handover &&
      currentAnalyst.shiftCode === handover.incomingShiftCode &&
      currentAnalyst.authorizedOperations.includes(operation.id),
  );

  async function handleSaveItem() {
    if (!selectedItem) return;
    setIsSavingItem(true);
    try {
      const res = await fetch(`/api/pendencias/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle,
          clientId: draftClientId,
          severity: draftSeverity,
          status: draftStatus,
          circuitId: draftCircuit,
          lastAction: draftLastAction,
          nextAction: draftNextAction,
          followUpTime: draftFollowUp,
          externalUpdate: draftExternal,
          shareWithClient: draftShare,
          jiraRefs: draftJiraRefs,
          authorName: currentAnalyst.name,
          shiftCode: currentAnalyst.shiftCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Erro ao salvar pendência.', 'error');
        return;
      }
      onToast(`${selectedItem.id} atualizado no rascunho.`, 'success');
      await onRefreshState();
    } finally {
      setIsSavingItem(false);
    }
  }

  async function handleToggleShareQuick(item: PendenciaItem) {
    const res = await fetch(`/api/pendencias/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shareWithClient: !item.shareWithClient,
        authorName: currentAnalyst.name,
        shiftCode: currentAnalyst.shiftCode,
        note: !item.shareWithClient
          ? 'Marcado para compartilhamento externo com cliente.'
          : 'Removido do compartilhamento externo.',
      }),
    });
    if (res.ok) {
      await onRefreshState();
    }
  }

  async function handleAttachJira() {
    if (!jiraInput.trim() || !selectedItem) return;
    setIsAddingJira(true);
    try {
      const res = await fetch('/api/jira/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: jiraInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Chave Jira inválida.', 'error');
        return;
      }
      const nextRefs = draftJiraRefs.some((j) => j.key === data.jiraRef.key)
        ? draftJiraRefs
        : [...draftJiraRefs, data.jiraRef];
      setDraftJiraRefs(nextRefs);
      setJiraInput('');

      await fetch(`/api/pendencias/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jiraRefs: nextRefs,
          authorName: currentAnalyst.name,
          shiftCode: currentAnalyst.shiftCode,
          note: `Chamado Jira ${data.jiraRef.key} vinculado à pendência.`,
        }),
      });
      onToast(`Chamado ${data.jiraRef.key} vinculado.`, 'success');
      await onRefreshState();
    } finally {
      setIsAddingJira(false);
    }
  }

  async function handleRemoveJira(key: string) {
    if (!selectedItem) return;
    const nextRefs = draftJiraRefs.filter((j) => j.key !== key);
    setDraftJiraRefs(nextRefs);
    await fetch(`/api/pendencias/${selectedItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jiraRefs: nextRefs,
        authorName: currentAnalyst.name,
        shiftCode: currentAnalyst.shiftCode,
        note: `Chamado Jira ${key} desvinculado.`,
      }),
    });
    await onRefreshState();
  }

  async function handlePostClarification() {
    if (!selectedItem || !handover || !clarificationText.trim()) return;
    setIsPostingClarification(true);
    try {
      const res = await fetch('/api/clarifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoverId: handover.id,
          itemId: selectedItem.id,
          authorId: currentAnalyst.id,
          type: clarificationType,
          text: clarificationText,
        }),
      });
      if (res.ok) {
        setClarificationText('');
        onToast(
          clarificationType === 'question'
            ? 'Pedido de esclarecimento registrado.'
            : 'Resposta registrada no item.',
          'success',
        );
        await onRefreshState();
      }
    } finally {
      setIsPostingClarification(false);
    }
  }

  async function handleToggleClarificationResolved(id: string, resolved: boolean) {
    const res = await fetch(`/api/clarifications/${id}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    });
    if (res.ok) await onRefreshState();
  }

  async function handleRetryTeams() {
    if (!handover) return;
    setIsRetryingTeams(true);
    try {
      const res = await fetch(`/api/handovers/${handover.id}/retry-teams`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        if (data.notification?.status === 'SUCCESS') {
          onToast(`Cartão Teams reenviado (#${data.notification.attemptNumber}) com sucesso.`, 'success');
        } else {
          onToast(data.notification?.errorMessage || 'Webhook Teams falhou novamente.', 'error');
        }
        await onRefreshState();
      } else {
        onToast(data.error || 'Erro ao reenviar Teams.', 'error');
      }
    } finally {
      setIsRetryingTeams(false);
    }
  }

  async function handleAcceptHandover() {
    if (!handover) return;
    setIsAccepting(true);
    try {
      const res = await fetch(`/api/handovers/${handover.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analystId: currentAnalyst.id,
          withReservation,
          reservationNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Não foi possível aceitar a passagem.', 'error');
        return;
      }
      onToast(
        withReservation
          ? `Passagem v${handover.currentVersion} aceita com ressalva por ${currentAnalyst.name}.`
          : `Passagem v${handover.currentVersion} aceita por ${currentAnalyst.name}.`,
        'success',
      );
      setReservationNote('');
      setWithReservation(false);
      await onRefreshState();
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleSimulateConcurrentAccept() {
    if (!handover) return;
    const incomingAnalysts = authorizedIncomingAnalysts;
    const first = incomingAnalysts[0] || currentAnalyst;
    const second = incomingAnalysts[1] || incomingAnalysts[0] || currentAnalyst;

    const [r1, r2] = await Promise.all([
      fetch(`/api/handovers/${handover.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analystId: first.id, withReservation: false }),
      }),
      fetch(`/api/handovers/${handover.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analystId: second.id, withReservation: false }),
      }),
    ]);

    const okCount = [r1.ok, r2.ok].filter(Boolean).length;
    const conflictCount = [r1.status, r2.status].filter((s) => s === 409).length;
    onToast(
      `Teste de concorrência: ${okCount} aceite gravado, ${conflictCount} requisição bloqueada (HTTP 409).`,
      okCount === 1 ? 'success' : 'info',
    );
    await onRefreshState();
  }

  async function handleStartNextShift() {
    if (!handover) return;
    setIsStartingNextShift(true);
    try {
      const res = await fetch(`/api/handovers/${handover.id}/next-shift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId: currentAnalyst.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Não foi possível abrir o próximo turno.', 'error');
        return;
      }
      onToast(
        `Novo turno ${data.handover.outgoingShiftCode}→${data.handover.incomingShiftCode} aberto. ${data.carriedOverIds.length} itens mantidos com os mesmos IDs.`,
        'success',
      );
      await onRefreshState();
    } finally {
      setIsStartingNextShift(false);
    }
  }

  async function handleCopyClientPreview() {
    if (!clientPreviewText) return;
    await navigator.clipboard.writeText(clientPreviewText);
    onToast(`Passagem de ${activeShareClient?.name} copiada para a área de transferência.`, 'success');
  }

  const handoverMeta = handover ? getHandoverStateMeta(handover.state) : null;
  const openItemsCount = opItems.filter((i) => i.status !== 'ENCERRADO').length;
  const p0Count = opItems.filter((i) => i.status !== 'ENCERRADO' && i.severity === 'P0').length;
  const openQuestionsCount = clarifications.filter(
    (c) => c.handoverId === handover?.id && c.type === 'question' && !c.resolved,
  ).length;

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* LEFT PANE: Checklist & Queue */}
        <section
          aria-label="Fila de pendências da passagem"
          className="flex flex-col rounded-md border border-[#283244] bg-[#111827] lg:col-span-3"
        >
          <div className="flex items-center justify-between border-b border-[#283244] px-3.5 py-3">
            <div>
              <h1 className="text-[14px] font-semibold text-[#DFE2F1]">
                Pendências · {operation.code}
              </h1>
              <p className="font-mono text-[11px] text-[#88929B]">
                {openItemsCount} abertas · {p0Count} P0 · {openQuestionsCount} dúvidas
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenNewPendencia}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#374151] bg-[#1C1F2A] px-2.5 py-1.5 text-[12px] font-medium text-[#89CEFF] hover:border-[#0EA5E9]/60"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova
            </button>
          </div>

          {/* Segmented filter bar */}
          <div className="grid grid-cols-4 gap-1 border-b border-[#283244] bg-[#0F131D] p-1.5">
            {(
              [
                ['ALL', 'Todas'],
                ['P0', 'P0'],
                ['P1', 'P1'],
                ['SHARE', 'Cliente'],
              ] as [LeftFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLeftFilter(key)}
                className={`cursor-pointer rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  leftFilter === key
                    ? 'bg-[#262A35] text-[#89CEFF]'
                    : 'text-[#88929B] hover:text-[#DFE2F1]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Items list */}
          <div className="max-h-[calc(100vh-260px)] divide-y divide-[#283244]/70 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-[#88929B]">
                Nenhuma pendência encontrada neste filtro.
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const sev = getSeverityMeta(item.severity);
                const itemQuestions = clarifications.filter(
                  (c) =>
                    c.itemId === item.id &&
                    c.handoverId === handover?.id &&
                    c.type === 'question' &&
                    !c.resolved,
                ).length;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedItemId(item.id);
                      }
                    }}
                    className={`cursor-pointer px-3.5 py-2.5 transition-colors ${
                      isSelected
                        ? 'bg-[#1C1F2A] ring-1 ring-inset ring-[#0EA5E9]/50'
                        : 'hover:bg-[#171B26]'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-[#89CEFF]">
                          {item.id}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${sev.bgClass} ${sev.textClass} ${sev.borderClass}`}
                        >
                          {sev.label}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-[#88929B]">
                        {item.followUpTime || 'S/ hor.'}
                      </span>
                    </div>

                    <p className="line-clamp-2 text-[13px] font-medium text-[#DFE2F1]">
                      {item.title}
                    </p>

                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[#88929B]">
                      <span className="truncate">{item.clientName}</span>
                      {item.carryoverCount > 0 && (
                        <span className="shrink-0 font-mono text-[10px] text-[#FBBF24]">
                          +{item.carryoverCount} turno
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {item.jiraRefs.map((j) => (
                          <span
                            key={j.key}
                            className="rounded border border-[#3B82F6]/35 bg-[#2563EB]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#89CEFF]"
                          >
                            {j.key}
                          </span>
                        ))}
                        {itemQuestions > 0 && (
                          <span className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#FBBF24]">
                            {itemQuestions} dúvida
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleShareQuick(item);
                        }}
                        className={`cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                          item.shareWithClient
                            ? 'border-[#6366F1]/50 bg-[#6366F1]/20 text-[#C7D2FE]'
                            : 'border-[#374151] bg-[#0F131D] text-[#88929B] hover:text-[#DFE2F1]'
                        }`}
                        title="Alternar visibilidade na mensagem externa do cliente"
                      >
                        {item.shareWithClient ? 'Cliente: Sim' : 'Interno'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* CENTER PANE: Operational Editor + Telemetry + Clarifications */}
        <section
          aria-label="Detalhes da pendência selecionada"
          className="flex flex-col rounded-md border border-[#283244] bg-[#111827] lg:col-span-5"
        >
          {!selectedItem ? (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <p className="text-[14px] font-medium text-[#DFE2F1]">
                Nenhuma pendência selecionada para {operation.name}
              </p>
              <p className="mt-1 text-[12px] text-[#88929B]">
                Abra uma nova pendência ou altere o filtro da fila ao lado.
              </p>
              <button
                type="button"
                onClick={onOpenNewPendencia}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#0EA5E9] px-4 py-2 text-[13px] font-semibold text-[#041B29]"
              >
                <Plus className="h-4 w-4" />
                Abrir Primeira Pendência
              </button>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[#283244]">
              {/* Item Telemetry Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="rounded border border-[#0EA5E9]/40 bg-[#0EA5E9]/15 px-2 py-0.5 font-mono text-[12px] font-semibold text-[#89CEFF]">
                    {selectedItem.id}
                  </span>
                  <div className="text-[12px] text-[#88929B]">
                    <span>Origem Turno {selectedItem.originShiftCode}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono">
                      Atualizado {formatDateTimeShort(selectedItem.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono text-[11px] text-[#BEC8D2]">
                  <span>RTT {selectedItem.latencyMs.toFixed(1)}ms</span>
                  <span aria-hidden="true" className="text-[#374151]">|</span>
                  <span className={selectedItem.packetLossPct > 0.5 ? 'text-[#F87171]' : 'text-[#34D399]'}>
                    Perda {selectedItem.packetLossPct.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Operational Form */}
              <div className="space-y-3.5 p-4">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#88929B]">
                    Título operacional
                  </label>
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-3 text-[13px] font-medium text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#88929B]">
                      Cliente confirmado
                    </label>
                    <select
                      value={draftClientId}
                      onChange={(e) => setDraftClientId(e.target.value)}
                      className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[12px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                    >
                      {opClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#88929B]">
                      Severidade
                    </label>
                    <select
                      value={draftSeverity}
                      onChange={(e) => setDraftSeverity(e.target.value as SeverityLevel)}
                      className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[12px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                    >
                      <option value="P0">P0 Crítico</option>
                      <option value="P1">P1 Alto</option>
                      <option value="NORMAL">Normal</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#88929B]">
                      Situação
                    </label>
                    <select
                      value={draftStatus}
                      onChange={(e) => setDraftStatus(e.target.value as PendenciaStatus)}
                      className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[12px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                    >
                      <option value="EM_ANDAMENTO">Em andamento</option>
                      <option value="AGUARDANDO_OPERADORA">Aguardando operadora</option>
                      <option value="AGUARDANDO_CLIENTE">Aguardando cliente</option>
                      <option value="MONITORANDO">Monitorando</option>
                      <option value="ENCERRADO">Encerrado (não reaparece)</option>
                    </select>
                  </div>
                </div>

                {/* Jira Ticket Grouping & Circuit */}
                <div className="rounded-md border border-[#283244] bg-[#0F131D] p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[#BEC8D2]">
                      Chamados Jira agrupados ({draftJiraRefs.length})
                    </span>
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#88929B]">
                      <span>Circuito:</span>
                      <input
                        type="text"
                        value={draftCircuit}
                        onChange={(e) => setDraftCircuit(e.target.value)}
                        className="w-36 rounded border border-[#374151] bg-[#111827] px-2 py-0.5 font-mono text-[11px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {draftJiraRefs.map((j) => (
                      <span
                        key={j.key}
                        className="inline-flex items-center gap-1.5 rounded border border-[#3B82F6]/40 bg-[#2563EB]/15 px-2 py-0.5 font-mono text-[11px] text-[#89CEFF]"
                      >
                        <a
                          href={j.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                          title={j.summary}
                        >
                          {j.key}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveJira(j.key)}
                          className="cursor-pointer text-[#89CEFF]/70 hover:text-white"
                          aria-label={`Desvincular ${j.key}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={jiraInput}
                      onChange={(e) => setJiraInput(e.target.value)}
                      placeholder="Adicionar chave ou link Jira (ex: NOC-4130)"
                      className="h-8 flex-1 rounded border border-[#374151] bg-[#111827] px-2.5 font-mono text-[12px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isAddingJira || !jiraInput.trim()}
                      onClick={handleAttachJira}
                      className="inline-flex cursor-pointer items-center gap-1 rounded border border-[#3B82F6]/40 bg-[#2563EB]/20 px-2.5 text-[11px] font-medium text-[#89CEFF] hover:bg-[#2563EB]/30 disabled:opacity-45"
                    >
                      <Link2 className="h-3 w-3" />
                      {isAddingJira ? 'Validando...' : 'Vincular'}
                    </button>
                  </div>
                </div>

                {/* Actions & Follow-up */}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#88929B]">
                    Última ação (interna NOC)
                  </label>
                  <textarea
                    rows={2}
                    value={draftLastAction}
                    onChange={(e) => setDraftLastAction(e.target.value)}
                    className="w-full rounded-md border border-[#374151] bg-[#0F131D] p-2.5 text-[13px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-[11px] font-medium text-[#88929B]">
                      Próximo passo
                    </label>
                    <input
                      type="text"
                      value={draftNextAction}
                      onChange={(e) => setDraftNextAction(e.target.value)}
                      className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-3 text-[13px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#88929B]">
                      Acompanhamento
                    </label>
                    <input
                      type="text"
                      value={draftFollowUp}
                      onChange={(e) => setDraftFollowUp(e.target.value)}
                      placeholder="23:00"
                      className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-3 font-mono text-[12px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                    />
                  </div>
                </div>

                {/* External Update for Client */}
                <div className="rounded-md border border-[#283244] bg-[#0F131D] p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="text-[11px] font-medium text-[#BEC8D2]">
                      Atualização externa revisada (usada em Copiar / Chatwoot)
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-[#C7D2FE]">
                      <input
                        type="checkbox"
                        checked={draftShare}
                        onChange={(e) => setDraftShare(e.target.checked)}
                        className="accent-[#6366F1]"
                      />
                      Compartilhar c/ cliente
                    </label>
                  </div>
                  <textarea
                    rows={2}
                    value={draftExternal}
                    onChange={(e) => setDraftExternal(e.target.value)}
                    className="w-full rounded-md border border-[#374151] bg-[#111827] p-2.5 text-[12px] text-[#DFE2F1] focus:border-[#6366F1] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-[#88929B]">
                    Situação atual: <strong className="text-[#BEC8D2]">{getPendenciaStatusLabel(draftStatus)}</strong>
                  </span>
                  <button
                    type="button"
                    disabled={isSavingItem}
                    onClick={handleSaveItem}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#0EA5E9] px-4 py-2 text-[12px] font-semibold text-[#041B29] hover:bg-[#38BDF8] disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSavingItem ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>

              {/* Clarification Q&A Thread */}
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold text-[#DFE2F1]">
                    Esclarecimentos do Item ({itemClarifications.length})
                  </h2>
                  <span className="text-[11px] text-[#88929B]">
                    Permanece aberto mesmo após o aceite
                  </span>
                </div>

                {itemClarifications.length > 0 && (
                  <div className="space-y-2">
                    {itemClarifications.map((msg) => (
                      <div
                        key={msg.id}
                        className="rounded-md border border-[#283244] bg-[#0F131D] p-2.5 text-[12px]"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#DFE2F1]">{msg.authorName}</span>
                            <span className="font-mono text-[10px] text-[#88929B]">
                              Turno {msg.authorShift} · {msg.type === 'question' ? 'Pergunta' : 'Resposta'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-[#88929B]">
                              {formatDateTimeShort(msg.createdAt)}
                            </span>
                            {msg.type === 'question' && (
                              <button
                                type="button"
                                onClick={() => handleToggleClarificationResolved(msg.id, !msg.resolved)}
                                className={`cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                                  msg.resolved
                                    ? 'border-[#10B981]/35 bg-[#10B981]/15 text-[#34D399]'
                                    : 'border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#FBBF24]'
                                }`}
                              >
                                {msg.resolved ? 'Resolvido' : 'Marcar resolvido'}
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[#BEC8D2]">{msg.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={clarificationType}
                    onChange={(e) => setClarificationType(e.target.value as 'question' | 'answer')}
                    className="h-9 rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[12px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                  >
                    <option value="question">Pedir esclarecimento</option>
                    <option value="answer">Responder turno</option>
                  </select>
                  <input
                    type="text"
                    value={clarificationText}
                    onChange={(e) => setClarificationText(e.target.value)}
                    placeholder="Escreva uma dúvida ou resposta para o outro turno..."
                    className="h-9 flex-1 rounded-md border border-[#374151] bg-[#0F131D] px-3 text-[12px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={isPostingClarification || !clarificationText.trim()}
                    onClick={handlePostClarification}
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[#374151] bg-[#1C1F2A] px-3 py-2 text-[12px] font-medium text-[#DFE2F1] hover:border-[#4B5563] disabled:opacity-45"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT PANE: Teams Bridge, Client Preview / Chatwoot & Acceptance */}
        <aside
          aria-label="Publicação Teams, Chatwoot e Aceite"
          className="flex flex-col gap-3 lg:col-span-4"
        >
          {/* Module 1: Handover Lifecycle & Teams Delivery */}
          <div className="rounded-md border border-[#283244] bg-[#111827] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-semibold text-[#DFE2F1]">
                  Ciclo da Passagem · {operation.code}
                </h2>
                <p className="mt-0.5 font-mono text-[11px] text-[#88929B]">
                  {handover
                    ? `Turno ${handover.outgoingShiftCode} → ${handover.incomingShiftCode} · v${handover.currentVersion}`
                    : 'Sem ciclo ativo'}
                </p>
              </div>
              {handoverMeta && (
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${handoverMeta.bgClass} ${handoverMeta.textClass} ${handoverMeta.borderClass}`}
                >
                  {handoverMeta.label}
                </span>
              )}
            </div>

            {/* Teams Notification status */}
            <div className="mt-3 rounded-md border border-[#283244] bg-[#0F131D] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-[#BEC8D2]">
                  Envio Microsoft Teams ({operation.teamsChannelLabel})
                </span>
                {latestNotification ? (
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                      latestNotification.status === 'SUCCESS'
                        ? 'border-[#10B981]/35 bg-[#10B981]/15 text-[#34D399]'
                        : 'border-[#EF4444]/40 bg-[#EF4444]/15 text-[#F87171]'
                    }`}
                  >
                    {latestNotification.status === 'SUCCESS'
                      ? `Enviado (#${latestNotification.attemptNumber})`
                      : `Falha HTTP ${latestNotification.httpStatus}`}
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-[#88929B]">Não enviado</span>
                )}
              </div>

              {latestNotification?.status === 'FAILED' && (
                <p className="mt-2 text-[11px] text-[#FCA5A5]">
                  {latestNotification.errorMessage}
                </p>
              )}

              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPublishHandover}
                  className="flex-1 cursor-pointer rounded-md bg-[#0EA5E9] px-3 py-1.5 text-[12px] font-semibold text-[#041B29] hover:bg-[#38BDF8]"
                >
                  {handover?.currentVersion === 0
                    ? 'Publicar Passagem'
                    : `Publicar Nova Versão (v${(handover?.currentVersion || 0) + 1})`}
                </button>
                {handover && handover.currentVersion > 0 && (
                  <button
                    type="button"
                    disabled={isRetryingTeams}
                    onClick={handleRetryTeams}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#374151] bg-[#1C1F2A] px-2.5 py-1.5 text-[12px] font-medium text-[#89CEFF] hover:border-[#3B82F6] disabled:opacity-45"
                    title="Reenviar cartão Teams sem alterar a publicação"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRetryingTeams ? 'animate-spin' : ''}`} />
                    Retomar Teams
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Module 2: Per-Client External Sharing & Chatwoot */}
          <div className="rounded-md border border-[#283244] bg-[#111827] p-4">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold text-[#DFE2F1]">
                Comunicação por Cliente
              </h2>
              <span className="font-mono text-[11px] text-[#A5B4FC]">
                Chatwoot #{activeShareClient?.chatwootConversationId || '—'}
              </span>
            </div>

            <select
              value={effectiveShareClientId}
              onChange={(e) => setSelectedShareClientId(e.target.value)}
              className="mb-2.5 h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[12px] text-[#DFE2F1] focus:border-[#6366F1] focus:outline-none"
            >
              {opClients.map((c) => {
                const count = opItems.filter(
                  (p) => p.clientId === c.id && p.status !== 'ENCERRADO' && p.shareWithClient,
                ).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({count} {count === 1 ? 'item marcado' : 'itens marcados'})
                  </option>
                );
              })}
            </select>

            <div className="rounded-md border border-[#283244] bg-[#0B0F19] p-2.5">
              {clientPreviewText ? (
                <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-[#BEC8D2]">
                  {clientPreviewText}
                </pre>
              ) : (
                <p className="py-4 text-center text-[12px] text-[#88929B]">
                  Nenhum item marcado para compartilhar com este cliente nesta operação.
                </p>
              )}
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!clientPreviewText}
                onClick={handleCopyClientPreview}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[#374151] bg-[#1C1F2A] px-2.5 py-2 text-[12px] font-medium text-[#DFE2F1] hover:border-[#4B5563] disabled:opacity-45"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar passagem do cliente
              </button>
              <button
                type="button"
                disabled={!activeShareClient}
                onClick={() => activeShareClient && onOpenChatwoot(activeShareClient.id)}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[#6366F1] px-2.5 py-2 text-[12px] font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-45"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Abrir no Chatwoot
              </button>
            </div>
          </div>

          {/* Module 3: Incoming Shift Acceptance & Consecutive Turno Carryover */}
          <div className="rounded-md border border-[#283244] bg-[#111827] p-4">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold text-[#DFE2F1]">
                Aceite do Turno de Entrada
              </h2>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#88929B]">
                <Users className="h-3.5 w-3.5" />
                Turno {handover?.incomingShiftCode || '—'}
              </span>
            </div>

            {handover?.acceptance ? (
              <div className="space-y-3">
                <div
                  className={`rounded-md border p-3 text-[12px] ${
                    handover.acceptance.withReservation
                      ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FDE68A]'
                      : 'border-[#10B981]/35 bg-[#10B981]/10 text-[#6EE7B7]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    {handover.acceptance.withReservation ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {handover.acceptance.withReservation
                      ? 'Passagem aceita com ressalva'
                      : 'Passagem aceita'}
                  </div>
                  <div className="mt-1.5 space-y-0.5 font-mono text-[11px]">
                    <div>Analista: {handover.acceptance.acceptedByName}</div>
                    <div>
                      Versão v{handover.acceptance.version} · {formatDateTimeShort(handover.acceptance.acceptedAt)}
                    </div>
                  </div>
                  {handover.acceptance.reservationNote && (
                    <p className="mt-2 rounded bg-[#0B0F19]/60 p-2 text-[12px] text-[#DFE2F1]">
                      Ressalva: {handover.acceptance.reservationNote}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isStartingNextShift}
                  onClick={handleStartNextShift}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[#0EA5E9]/50 bg-[#0EA5E9]/15 px-3 py-2 text-[12px] font-semibold text-[#89CEFF] hover:bg-[#0EA5E9]/25 disabled:opacity-50"
                >
                  <ArrowRight className="h-4 w-4" />
                  {isStartingNextShift
                    ? 'Abrindo próximo turno...'
                    : `Abrir Próximo Turno (${handover.incomingShiftCode} → ${
                        handover.incomingShiftCode === 'A'
                          ? 'B'
                          : handover.incomingShiftCode === 'B'
                            ? 'C'
                            : 'A'
                      })`}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-[#283244] bg-[#0F131D] p-2.5 text-[11px] text-[#88929B]">
                  <div>
                    Autorizados (Turno {handover?.incomingShiftCode}):{' '}
                    <span className="text-[#DFE2F1]">
                      {authorizedIncomingAnalysts.map((a) => a.name).join(', ') || 'Nenhum'}
                    </span>
                  </div>
                  {!isCurrentAnalystAuthorized && handover && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[#FBBF24]">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Você está como {currentAnalyst.name} (Turno {currentAnalyst.shiftCode}). Troque para um analista do Turno {handover.incomingShiftCode} no topo para aceitar.
                      </span>
                    </div>
                  )}
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-[#BEC8D2]">
                  <input
                    type="checkbox"
                    checked={withReservation}
                    onChange={(e) => setWithReservation(e.target.checked)}
                    className="accent-[#F59E0B]"
                  />
                  Registrar aceite com ressalva
                </label>

                {withReservation && (
                  <textarea
                    rows={2}
                    value={reservationNote}
                    onChange={(e) => setReservationNote(e.target.value)}
                    placeholder="Descreva a ressalva operacional (ex: aguardando retorno da OS #88412)..."
                    className="w-full rounded-md border border-[#F59E0B]/40 bg-[#0F131D] p-2 text-[12px] text-[#DFE2F1] focus:border-[#F59E0B] focus:outline-none"
                  />
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={
                      isAccepting ||
                      !handover ||
                      handover.state === 'RASCUNHO' ||
                      !isCurrentAnalystAuthorized
                    }
                    onClick={handleAcceptHandover}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[#10B981] px-3 py-2 text-[12px] font-semibold text-[#022C22] hover:bg-[#34D399] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" />
                    {handover?.state === 'RASCUNHO'
                      ? 'Publique antes de aceitar'
                      : withReservation
                        ? 'Aceitar com Ressalva'
                        : 'Aceitar Passagem'}
                  </button>

                  {handover && handover.state === 'PUBLICADA' && (
                    <button
                      type="button"
                      onClick={handleSimulateConcurrentAccept}
                      className="cursor-pointer rounded-md border border-[#374151] bg-[#1C1F2A] px-3 py-1.5 font-mono text-[11px] text-[#BEC8D2] hover:border-[#4B5563]"
                    >
                      Testar dois aceites simultâneos
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
