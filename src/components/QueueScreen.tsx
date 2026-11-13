import { useState } from 'react';
import { ArrowUpRight, ExternalLink, Plus } from 'lucide-react';
import type { Operation, PendenciaItem, SeverityLevel } from '../types/noc';
import { formatDateTimeShort, getPendenciaStatusLabel, getSeverityMeta } from '../utils/nocHelpers';

interface QueueScreenProps {
  operations: Operation[];
  selectedOperationId: string;
  pendencias: PendenciaItem[];
  searchQuery: string;
  onOpenNewPendencia: () => void;
  onInspectInHandover: (operationId: string) => void;
  onToggleEncerrado: (item: PendenciaItem) => Promise<void>;
}

export function QueueScreen({
  operations,
  selectedOperationId,
  pendencias,
  searchQuery,
  onOpenNewPendencia,
  onInspectInHandover,
  onToggleEncerrado,
}: QueueScreenProps) {
  const [scopeFilter, setScopeFilter] = useState<'OP' | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | SeverityLevel>('ALL');
  const [showClosed, setShowClosed] = useState(false);

  const opMap = new Map(operations.map((o) => [o.id, o]));

  const rows = pendencias.filter((item) => {
    if (scopeFilter === 'OP' && item.operationId !== selectedOperationId) return false;
    if (severityFilter !== 'ALL' && item.severity !== severityFilter) return false;
    if (!showClosed && item.status === 'ENCERRADO') return false;

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

  const totalOpen = pendencias.filter((p) => p.status !== 'ENCERRADO').length;
  const totalP0 = pendencias.filter((p) => p.status !== 'ENCERRADO' && p.severity === 'P0').length;
  const totalCarryover = pendencias.filter((p) => p.status !== 'ENCERRADO' && p.carryoverCount > 0).length;

  return (
    <div className="mx-auto max-w-[1680px] space-y-4 px-4 py-4 lg:px-6">
      {/* Header summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[#283244] bg-[#111827] px-4 py-3">
        <div>
          <h1 className="text-[18px] font-semibold text-[#DFE2F1]">
            Fila Global NOC & Telemetria de Pendências
          </h1>
          <p className="mt-0.5 text-[12px] text-[#88929B]">
            <span className="font-mono tabular-nums text-[#DFE2F1]">{totalOpen}</span> pendências abertas
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums text-[#F87171]">{totalP0}</span> críticas (P0)
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums text-[#FBBF24]">{totalCarryover}</span> herdadas de turnos anteriores
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center rounded-md border border-[#283244] bg-[#0F131D] p-0.5 text-[12px]">
            <button
              type="button"
              onClick={() => setScopeFilter('ALL')}
              className={`cursor-pointer rounded px-2.5 py-1 font-medium ${
                scopeFilter === 'ALL' ? 'bg-[#262A35] text-[#89CEFF]' : 'text-[#88929B]'
              }`}
            >
              Todas Operações
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('OP')}
              className={`cursor-pointer rounded px-2.5 py-1 font-medium ${
                scopeFilter === 'OP' ? 'bg-[#262A35] text-[#89CEFF]' : 'text-[#88929B]'
              }`}
            >
              Operação Ativa
            </button>
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'ALL' | SeverityLevel)}
            className="h-8 rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[12px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
          >
            <option value="ALL">Todas severidades</option>
            <option value="P0">P0 Crítico</option>
            <option value="P1">P1 Alto</option>
            <option value="NORMAL">Normal</option>
          </select>

          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-[#BEC8D2]">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="accent-[#0EA5E9]"
            />
            Exibir encerradas
          </label>

          <button
            type="button"
            onClick={onOpenNewPendencia}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#0EA5E9] px-3.5 py-1.5 text-[12px] font-semibold text-[#041B29] hover:bg-[#38BDF8]"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova Pendência
          </button>
        </div>
      </div>

      {/* High-density Telemetry Table */}
      <div className="overflow-x-auto rounded-md border border-[#283244] bg-[#111827]">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#374151] bg-[#0F131D] font-mono text-[11px] font-medium text-[#88929B]">
              <th className="px-3.5 py-2.5">ID</th>
              <th className="px-3 py-2.5">Operação</th>
              <th className="px-3 py-2.5">Cliente & Pendência</th>
              <th className="px-3 py-2.5">Sev.</th>
              <th className="px-3 py-2.5">Chamados Jira</th>
              <th className="px-3 py-2.5 text-right">Circuito / RTT</th>
              <th className="px-3 py-2.5">Situação</th>
              <th className="px-3 py-2.5">Acompanhamento</th>
              <th className="px-3.5 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#283244]/80 text-[12px]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-[#88929B]">
                  Nenhuma pendência corresponde aos filtros atuais.
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const op = opMap.get(item.operationId);
                const sev = getSeverityMeta(item.severity);
                return (
                  <tr
                    key={item.id}
                    className="h-11 transition-colors hover:bg-[#1C1F2A]"
                  >
                    <td className="px-3.5 py-2 font-mono text-[12px] font-semibold text-[#89CEFF] whitespace-nowrap">
                      {item.id}
                      {item.carryoverCount > 0 && (
                        <div className="text-[10px] font-normal text-[#FBBF24]">
                          +{item.carryoverCount} troca
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#BEC8D2] whitespace-nowrap">
                      {op?.code || item.operationId}
                    </td>
                    <td className="max-w-[320px] px-3 py-2">
                      <div className="truncate font-medium text-[#DFE2F1]" title={item.title}>
                        {item.title}
                      </div>
                      <div className="truncate text-[11px] text-[#88929B]">
                        {item.clientName}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${sev.bgClass} ${sev.textClass} ${sev.borderClass}`}
                      >
                        {sev.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {item.jiraRefs.length === 0 ? (
                          <span className="font-mono text-[11px] text-[#6B7280]">—</span>
                        ) : (
                          item.jiraRefs.map((j) => (
                            <a
                              key={j.key}
                              href={j.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 rounded border border-[#3B82F6]/35 bg-[#2563EB]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#89CEFF] hover:underline"
                            >
                              {j.key}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] tabular-nums whitespace-nowrap">
                      <div className="text-[#DFE2F1]">{item.circuitId}</div>
                      <div className={item.packetLossPct > 0.5 ? 'text-[#F87171]' : 'text-[#88929B]'}>
                        {item.latencyMs.toFixed(1)}ms · {item.packetLossPct.toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#BEC8D2]">
                      {getPendenciaStatusLabel(item.status)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#BEC8D2] whitespace-nowrap">
                      <div>{item.followUpTime || 'S/ hor.'}</div>
                      <div className="text-[10px] text-[#88929B]">
                        {formatDateTimeShort(item.updatedAt)}
                      </div>
                    </td>
                    <td className="px-3.5 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onInspectInHandover(item.operationId)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded border border-[#374151] bg-[#0F131D] px-2 py-1 text-[11px] font-medium text-[#89CEFF] hover:border-[#0EA5E9]"
                        >
                          Editar
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleEncerrado(item)}
                          className="cursor-pointer rounded border border-[#374151] bg-[#0F131D] px-2 py-1 text-[11px] text-[#BEC8D2] hover:border-[#4B5563]"
                        >
                          {item.status === 'ENCERRADO' ? 'Reabrir' : 'Encerrar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
