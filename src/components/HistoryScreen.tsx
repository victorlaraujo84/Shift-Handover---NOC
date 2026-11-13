import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileCheck2, MessageCircle } from 'lucide-react';
import type {
  ClarificationMessage,
  GlobalSettings,
  Operation,
  ShiftHandover,
} from '../types/noc';
import {
  calculateShiftDelay,
  formatDateTimeShort,
  getHandoverStateMeta,
  getPendenciaStatusLabel,
  getSeverityMeta,
} from '../utils/nocHelpers';

interface HistoryScreenProps {
  operations: Operation[];
  handovers: ShiftHandover[];
  clarifications: ClarificationMessage[];
  settings: GlobalSettings;
  nowMs: number;
  onRefreshState: () => Promise<void>;
  onSelectHandoverOperation: (operationId: string) => void;
}

export function HistoryScreen({
  operations,
  handovers,
  clarifications,
  settings,
  nowMs,
  onRefreshState,
  onSelectHandoverOperation,
}: HistoryScreenProps) {
  const [selectedHandoverId, setSelectedHandoverId] = useState<string>(handovers[0]?.id || '');
  const opMap = new Map(operations.map((o) => [o.id, o]));

  const selectedHandover =
    handovers.find((h) => h.id === selectedHandoverId) || handovers[0];
  const latestSnapshot = selectedHandover?.publishedVersions[0];
  const handoverClarifications = clarifications.filter(
    (c) => c.handoverId === selectedHandover?.id,
  );

  async function handleToggleResolved(id: string, resolved: boolean) {
    const res = await fetch(`/api/clarifications/${id}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    });
    if (res.ok) await onRefreshState();
  }

  return (
    <div className="mx-auto max-w-[1680px] space-y-4 px-4 py-4 lg:px-6">
      <div className="rounded-md border border-[#283244] bg-[#111827] px-4 py-3">
        <h1 className="text-[18px] font-semibold text-[#DFE2F1]">
          Histórico de Passagens, Versões Publicadas & Aceites
        </h1>
        <p className="mt-0.5 text-[12px] text-[#88929B]">
          Auditoria de trocas de turno, cálculo de atraso com tolerância global ({settings.toleranceMinutes} min) e esclarecimentos pós-aceite.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Handovers list */}
        <section className="overflow-x-auto rounded-md border border-[#283244] bg-[#111827] lg:col-span-7">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#374151] bg-[#0F131D] font-mono text-[11px] font-medium text-[#88929B]">
                <th className="px-3.5 py-2.5">Operação</th>
                <th className="px-3 py-2.5">Turnos</th>
                <th className="px-3 py-2.5">Versão</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Atraso / SLA</th>
                <th className="px-3.5 py-2.5">Aceite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#283244] text-[12px]">
              {handovers.map((h) => {
                const op = opMap.get(h.operationId);
                const stateMeta = getHandoverStateMeta(h.state);
                const delay = calculateShiftDelay(h, settings, nowMs);
                const isSelected = selectedHandover?.id === h.id;

                return (
                  <tr
                    key={h.id}
                    onClick={() => setSelectedHandoverId(h.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#1C1F2A]' : 'hover:bg-[#171B26]'
                    }`}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono text-[12px] font-semibold text-[#89CEFF]">
                        {op?.code || h.operationId}
                      </div>
                      <div className="text-[11px] text-[#88929B]">{h.authorName}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-[#DFE2F1] whitespace-nowrap">
                      {h.outgoingShiftCode} → {h.incomingShiftCode}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-[#BEC8D2]">
                      {h.currentVersion > 0 ? `v${h.currentVersion}` : 'Rascunho'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${stateMeta.bgClass} ${stateMeta.textClass} ${stateMeta.borderClass}`}
                      >
                        {stateMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap">
                      <span
                        className={
                          delay.status === 'DELAYED'
                            ? 'text-[#F87171]'
                            : delay.status === 'WITHIN_TOLERANCE'
                              ? 'text-[#FBBF24]'
                              : 'text-[#34D399]'
                        }
                      >
                        {delay.label}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-[11px]">
                      {h.acceptance ? (
                        <div>
                          <div className="font-medium text-[#DFE2F1]">
                            {h.acceptance.acceptedByName}
                          </div>
                          <div className="font-mono text-[10px] text-[#88929B]">
                            {formatDateTimeShort(h.acceptance.acceptedAt)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#88929B]">Pendente</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Snapshot & Audit Inspector */}
        <section className="space-y-3 rounded-md border border-[#283244] bg-[#111827] p-4 lg:col-span-5">
          {!selectedHandover ? (
            <p className="text-[12px] text-[#88929B]">Selecione uma passagem para inspecionar.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#283244] pb-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#DFE2F1]">
                    Auditoria · {opMap.get(selectedHandover.operationId)?.code} (Turno{' '}
                    {selectedHandover.outgoingShiftCode} → {selectedHandover.incomingShiftCode})
                  </h2>
                  <p className="mt-0.5 font-mono text-[11px] text-[#88929B]">
                    ID: {selectedHandover.id} · {selectedHandover.publishedVersions.length} versões publicadas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectHandoverOperation(selectedHandover.operationId)}
                  className="cursor-pointer rounded-md border border-[#374151] bg-[#1C1F2A] px-2.5 py-1 text-[11px] font-medium text-[#89CEFF] hover:border-[#0EA5E9]"
                >
                  Abrir Operação
                </button>
              </div>

              {/* Acceptance block */}
              {selectedHandover.acceptance ? (
                <div
                  className={`rounded-md border p-3 text-[12px] ${
                    selectedHandover.acceptance.withReservation
                      ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FDE68A]'
                      : 'border-[#10B981]/35 bg-[#10B981]/10 text-[#6EE7B7]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    {selectedHandover.acceptance.withReservation ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Aceite único registrado na versão v{selectedHandover.acceptance.version}
                  </div>
                  <div className="mt-1 font-mono text-[11px]">
                    Por {selectedHandover.acceptance.acceptedByName} em{' '}
                    {formatDateTimeShort(selectedHandover.acceptance.acceptedAt)}
                  </div>
                  {selectedHandover.acceptance.reservationNote && (
                    <p className="mt-1.5 rounded bg-[#0B0F19]/60 p-2 text-[#DFE2F1]">
                      Ressalva: {selectedHandover.acceptance.reservationNote}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-[#283244] bg-[#0F131D] p-3 text-[12px] text-[#BEC8D2]">
                  <Clock className="h-4 w-4 text-[#88929B]" />
                  Aguardando primeiro aceite válido do turno de entrada.
                </div>
              )}

              {/* Frozen Snapshot Items */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#DFE2F1]">
                  <FileCheck2 className="h-4 w-4 text-[#89CEFF]" />
                  {latestSnapshot
                    ? `Itens congelados na versão v${latestSnapshot.version} (${latestSnapshot.items.length})`
                    : 'Nenhuma versão publicada ainda (rascunho)'}
                </h3>

                {latestSnapshot ? (
                  <div className="max-h-60 space-y-2 overflow-y-auto">
                    {latestSnapshot.items.map((item) => {
                      const sev = getSeverityMeta(item.severity);
                      return (
                        <div
                          key={item.id}
                          className="rounded-md border border-[#283244] bg-[#0F131D] p-2.5 text-[12px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-[#89CEFF]">
                                {item.id}
                              </span>
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${sev.bgClass} ${sev.textClass} ${sev.borderClass}`}
                              >
                                {sev.shortLabel}
                              </span>
                            </div>
                            <span className="text-[11px] text-[#88929B]">
                              {getPendenciaStatusLabel(item.status)}
                            </span>
                          </div>
                          <p className="mt-1 font-medium text-[#DFE2F1]">{item.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#88929B]">
                            <span>{item.clientName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[#89CEFF]">
                              {item.jiraRefs.map((j) => j.key).join(', ') || 'Sem Jira'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Clarifications audit */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#DFE2F1]">
                  <MessageCircle className="h-4 w-4 text-[#FBBF24]" />
                  Esclarecimentos vinculados ({handoverClarifications.length})
                </h3>
                {handoverClarifications.length === 0 ? (
                  <p className="text-[12px] text-[#88929B]">
                    Nenhuma pergunta ou resposta registrada nesta passagem.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {handoverClarifications.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-md border border-[#283244] bg-[#0F131D] p-2.5 text-[12px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-[#89CEFF]">
                            {c.itemId} · {c.authorName} (Turno {c.authorShift})
                          </span>
                          {c.type === 'question' && (
                            <button
                              type="button"
                              onClick={() => handleToggleResolved(c.id, !c.resolved)}
                              className={`cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                                c.resolved
                                  ? 'border-[#10B981]/35 bg-[#10B981]/15 text-[#34D399]'
                                  : 'border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#FBBF24]'
                              }`}
                            >
                              {c.resolved ? 'Resolvido' : 'Em aberto'}
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-[#BEC8D2]">{c.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
