import { useEffect, useRef } from 'react';
import { Clock, Search, ShieldCheck, Users } from 'lucide-react';
import type { Analyst, GlobalSettings, Operation, ShiftHandover } from '../types/noc';
import { calculateShiftDelay } from '../utils/nocHelpers';

interface WorkspaceToolbarProps {
  operations: Operation[];
  selectedOperationId: string;
  onSelectOperation: (opId: string) => void;
  analysts: Analyst[];
  currentAnalystId: string;
  onSelectAnalyst: (analystId: string) => void;
  activeHandover?: ShiftHandover;
  settings: GlobalSettings;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  nowMs: number;
}

export function WorkspaceToolbar({
  operations,
  selectedOperationId,
  onSelectOperation,
  analysts,
  currentAnalystId,
  onSelectAnalyst,
  activeHandover,
  settings,
  searchQuery,
  onSearchChange,
  nowMs,
}: WorkspaceToolbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentAnalyst = analysts.find((a) => a.id === currentAnalystId) || analysts[0];
  const delayInfo = calculateShiftDelay(activeHandover, settings, nowMs);

  const isAuthorizedForIncoming =
    activeHandover &&
    currentAnalyst &&
    currentAnalyst.shiftCode === activeHandover.incomingShiftCode &&
    currentAnalyst.authorizedOperations.includes(activeHandover.operationId);

  return (
    <div className="border-b border-[#283244] bg-[#111827]">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 lg:px-6">
        {/* Left group: Operation + Shift Context */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="op-selector" className="text-[12px] font-medium text-[#88929B] whitespace-nowrap">
              Operação
            </label>
            <select
              id="op-selector"
              value={selectedOperationId}
              onChange={(e) => onSelectOperation(e.target.value)}
              className="h-9 rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[13px] font-medium text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
            >
              {operations.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.code} · {op.name}
                </option>
              ))}
            </select>
          </div>

          {activeHandover && (
            <div className="flex items-center gap-2 rounded-md border border-[#283244] bg-[#0F131D] px-2.5 py-1.5 text-[12px]">
              <span className="font-mono text-[#BEC8D2]">
                Turno {activeHandover.outgoingShiftCode} → {activeHandover.incomingShiftCode}
              </span>
              <span aria-hidden="true" className="text-[#374151]">|</span>
              <Clock className="h-3.5 w-3.5 text-[#88929B]" />
              <span
                className={`font-mono tabular-nums font-medium ${
                  delayInfo.status === 'DELAYED'
                    ? 'text-[#F87171]'
                    : delayInfo.status === 'WITHIN_TOLERANCE'
                      ? 'text-[#FBBF24]'
                      : 'text-[#34D399]'
                }`}
              >
                {delayInfo.label}
              </span>
            </div>
          )}
        </div>

        {/* Right group: Search + Active Analyst Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#88929B]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar Jira, PND, cliente ou circuito..."
              className="h-9 w-64 rounded-md border border-[#374151] bg-[#0F131D] pl-8 pr-12 text-[12px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none sm:w-72"
            />
            <kbd className="pointer-events-none absolute right-2 rounded border border-[#374151] bg-[#1C1F2A] px-1.5 py-0.5 font-mono text-[10px] text-[#88929B]">
              ⌘K
            </kbd>
          </div>

          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-[#88929B]" />
            <label htmlFor="analyst-selector" className="sr-only">
              Analista ativo na sessão
            </label>
            <select
              id="analyst-selector"
              value={currentAnalystId}
              onChange={(e) => onSelectAnalyst(e.target.value)}
              className="h-9 rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[12px] font-medium text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
            >
              {analysts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · Turno {a.shiftCode}
                </option>
              ))}
            </select>
            {activeHandover && (
              <span
                title={
                  isAuthorizedForIncoming
                    ? 'Autorizado para aceitar a passagem de entrada'
                    : 'Operador de saída ou outra escala (somente leitura para aceite)'
                }
                className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-[11px] whitespace-nowrap ${
                  isAuthorizedForIncoming
                    ? 'border-[#10B981]/35 bg-[#10B981]/15 text-[#34D399]'
                    : 'border-[#374151] bg-[#1C1F2A] text-[#BEC8D2]'
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                {isAuthorizedForIncoming ? 'Apto p/ aceite' : `Turno ${currentAnalyst?.shiftCode}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
