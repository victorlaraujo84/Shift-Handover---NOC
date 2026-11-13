import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  MessageSquare,
  RefreshCw,
  Send,
  Webhook,
} from 'lucide-react';
import type {
  ClientMapping,
  Operation,
  PendenciaItem,
  ShiftHandover,
  TeamsNotificationLog,
} from '../types/noc';
import {
  buildClientExternalPreview,
  formatDateTimeShort,
  getSeverityMeta,
} from '../utils/nocHelpers';

interface SharingScreenProps {
  operation: Operation;
  handover: ShiftHandover | undefined;
  clients: ClientMapping[];
  pendencias: PendenciaItem[];
  notifications: TeamsNotificationLog[];
  onRefreshState: () => Promise<void>;
  onPublishHandover: () => Promise<void>;
  onOpenChatwoot: (clientId: string) => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export function SharingScreen({
  operation,
  handover,
  clients,
  pendencias,
  notifications,
  onRefreshState,
  onPublishHandover,
  onOpenChatwoot,
  onToast,
}: SharingScreenProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isTogglingFail, setIsTogglingFail] = useState(false);

  const opClients = clients.filter((c) => c.operationId === operation.id);
  const opItems = pendencias.filter(
    (p) => p.operationId === operation.id && p.status !== 'ENCERRADO',
  );
  const opNotifications = notifications.filter((n) => n.operationId === operation.id);

  async function handleToggleWebhookFailure() {
    setIsTogglingFail(true);
    try {
      const res = await fetch(`/api/operations/${operation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulateWebhookFailure: !operation.simulateWebhookFailure,
        }),
      });
      if (res.ok) {
        onToast(
          !operation.simulateWebhookFailure
            ? `Simulação de falha HTTP 503 ativada para ${operation.code}.`
            : `Webhook Teams restaurado para ${operation.code}.`,
          'info',
        );
        await onRefreshState();
      }
    } finally {
      setIsTogglingFail(false);
    }
  }

  async function handleRetryTeams() {
    if (!handover) return;
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/handovers/${handover.id}/retry-teams`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Falha ao reenviar para o Teams.', 'error');
        return;
      }
      if (data.notification.status === 'SUCCESS') {
        onToast(`Reenvio Teams #${data.notification.attemptNumber} entregue.`, 'success');
      } else {
        onToast(data.notification.errorMessage || 'Webhook Teams falhou novamente.', 'error');
      }
      await onRefreshState();
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleCopyClient(client: ClientMapping, text: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    onToast(`Passagem de ${client.name} copiada.`, 'success');
  }

  const p0Count = opItems.filter((i) => i.severity === 'P0').length;
  const p1Count = opItems.filter((i) => i.severity === 'P1').length;

  return (
    <div className="mx-auto max-w-[1680px] space-y-4 px-4 py-4 lg:px-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* LEFT COLUMN: Microsoft Teams Internal Card & Webhook Delivery Log */}
        <section className="space-y-4 lg:col-span-5">
          <div className="rounded-md border border-[#283244] bg-[#111827] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-[16px] font-semibold text-[#DFE2F1]">
                  Cartão Interno Teams · {operation.code}
                </h1>
                <p className="font-mono text-[11px] text-[#88929B]">
                  Canal {operation.teamsChannelLabel} · Versão v{handover?.currentVersion || 0}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-[#374151] bg-[#0F131D] px-2.5 py-1.5 text-[11px] text-[#BEC8D2]">
                <input
                  type="checkbox"
                  disabled={isTogglingFail}
                  checked={operation.simulateWebhookFailure}
                  onChange={handleToggleWebhookFailure}
                  className="accent-[#EF4444]"
                />
                Simular falha webhook (HTTP 503)
              </label>
            </div>

            {/* Adaptive Card Visual Preview (Teams Communicator style) */}
            <div className="mt-3 rounded-md border border-[#3B82F6]/35 bg-[#0F131D] p-4">
              <div className="flex items-center justify-between gap-2 border-b border-[#283244] pb-2.5">
                <span className="font-semibold text-[#89CEFF]">
                  [{operation.code}] Passagem de Turno{' '}
                  {handover ? `${handover.outgoingShiftCode} → ${handover.incomingShiftCode}` : ''}
                </span>
                <span className="font-mono text-[11px] text-[#88929B]">
                  AdaptiveCard v1.4
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                <div>
                  <div className="text-[11px] text-[#88929B]">Operação</div>
                  <div className="font-medium text-[#DFE2F1]">{operation.name}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#88929B]">Autor (Saída)</div>
                  <div className="font-medium text-[#DFE2F1]">{handover?.authorName || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#88929B]">Pendências</div>
                  <div className="font-mono tabular-nums text-[#DFE2F1]">
                    {opItems.length} ({p0Count} P0 · {p1Count} P1)
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 border-t border-[#283244] pt-3">
                {opItems.slice(0, 4).map((item) => {
                  const sev = getSeverityMeta(item.severity);
                  return (
                    <div key={item.id} className="flex items-start gap-2 text-[12px]">
                      <span className={`font-mono text-[11px] font-semibold ${sev.textClass}`}>
                        [{item.id}]
                      </span>
                      <span className="flex-1 text-[#BEC8D2]">
                        {item.clientName} — {item.title}{' '}
                        <span className="font-mono text-[#89CEFF]">
                          ({item.jiraRefs.map((j) => j.key).join(', ') || 'Sem Jira'})
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3.5 flex items-center justify-between border-t border-[#283244] pt-3">
                <span className="font-mono text-[11px] text-[#88929B]">
                  Link embutido: /?handoverId={handover?.id || '...'}
                </span>
                <span className="rounded bg-[#2563EB] px-2.5 py-1 text-[11px] font-semibold text-white">
                  Revisar e Aceitar Passagem
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onPublishHandover}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#0EA5E9] px-3.5 py-2 text-[12px] font-semibold text-[#041B29] hover:bg-[#38BDF8]"
              >
                <Send className="h-3.5 w-3.5" />
                Publicar & Disparar Teams
              </button>
              <button
                type="button"
                disabled={isRetrying || !handover || handover.currentVersion === 0}
                onClick={handleRetryTeams}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#374151] bg-[#1C1F2A] px-3.5 py-2 text-[12px] font-medium text-[#89CEFF] hover:border-[#3B82F6] disabled:opacity-45"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                Retomar envio ao Teams
              </button>
            </div>
          </div>

          {/* Delivery Attempts Table */}
          <div className="rounded-md border border-[#283244] bg-[#111827] p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-[#DFE2F1]">
                <Webhook className="h-4 w-4 text-[#89CEFF]" />
                Tentativas de Notificação ({opNotifications.length})
              </h2>
              <span className="font-mono text-[11px] text-[#88929B]">
                Resolvido no servidor por operação
              </span>
            </div>

            <div className="space-y-2">
              {opNotifications.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-[#88929B]">
                  Nenhuma tentativa registrada para esta operação.
                </p>
              ) : (
                opNotifications.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-md border border-[#283244] bg-[#0F131D] p-2.5 text-[12px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-[#DFE2F1]">
                          v{log.version} · Tentativa #{log.attemptNumber}
                        </span>
                        <span className="text-[#88929B]">{log.channelLabel}</span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                          log.status === 'SUCCESS'
                            ? 'border-[#10B981]/35 bg-[#10B981]/15 text-[#34D399]'
                            : 'border-[#EF4444]/40 bg-[#EF4444]/15 text-[#F87171]'
                        }`}
                      >
                        {log.status === 'SUCCESS' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        HTTP {log.httpStatus}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#88929B]">
                      {formatDateTimeShort(log.sentAt)} · {log.webhookUrl}
                    </div>
                    {log.errorMessage && (
                      <p className="mt-1.5 text-[11px] text-[#FCA5A5]">{log.errorMessage}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Per-Client External Preview & Chatwoot Proof */}
        <section className="space-y-3 lg:col-span-7">
          <div className="rounded-md border border-[#283244] bg-[#111827] px-4 py-3">
            <h2 className="text-[16px] font-semibold text-[#DFE2F1]">
              Prévia Externa por Cliente & Chatwoot ({opClients.length} clientes)
            </h2>
            <p className="mt-0.5 text-[12px] text-[#88929B]">
              Cada mensagem inclui apenas os itens marcados para compartilhar da combinação operação + cliente.
            </p>
          </div>

          <div className="space-y-3">
            {opClients.map((client) => {
              const clientItems = opItems.filter((i) => i.clientId === client.id);
              const sharedItems = clientItems.filter((i) => i.shareWithClient);
              const preview = buildClientExternalPreview(operation.name, client, pendencias);

              return (
                <article
                  key={client.id}
                  className="rounded-md border border-[#283244] bg-[#111827] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[14px] font-semibold text-[#DFE2F1]">
                        {client.name}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#88929B]">
                        <span>{client.segment}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#A5B4FC]">
                          Chatwoot #{client.chatwootConversationId}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">
                          {sharedItems.length} de {clientItems.length} itens selecionados
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!preview}
                        onClick={() => handleCopyClient(client, preview)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#374151] bg-[#1C1F2A] px-3 py-1.5 text-[12px] font-medium text-[#DFE2F1] hover:border-[#4B5563] disabled:opacity-45"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copiar passagem do cliente
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenChatwoot(client.id)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#6366F1] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#4F46E5]"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Abrir no Chatwoot
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md border border-[#283244] bg-[#0B0F19] p-3">
                    {preview ? (
                      <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-[#BEC8D2]">
                        {preview}
                      </pre>
                    ) : (
                      <p className="text-[12px] text-[#88929B]">
                        Nenhum item deste cliente está marcado com &ldquo;Compartilhar c/ cliente&rdquo; na passagem atual.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
