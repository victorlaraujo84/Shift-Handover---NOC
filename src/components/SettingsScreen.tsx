import { useState, type FormEvent } from 'react';
import { Plus, RotateCcw, Save } from 'lucide-react';
import type {
  Analyst,
  ClientMapping,
  GlobalSettings,
  Operation,
  ShiftCode,
} from '../types/noc';

interface SettingsScreenProps {
  operations: Operation[];
  clients: ClientMapping[];
  analysts: Analyst[];
  settings: GlobalSettings;
  onRefreshState: () => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export function SettingsScreen({
  operations,
  clients,
  analysts,
  settings,
  onRefreshState,
  onToast,
}: SettingsScreenProps) {
  const [tolerance, setTolerance] = useState(settings.toleranceMinutes);
  const [jiraBaseUrl, setJiraBaseUrl] = useState(settings.jiraBaseUrl);
  const [jiraMode, setJiraMode] = useState(settings.jiraMode);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // New client mapping state
  const [newCliOpId, setNewCliOpId] = useState(operations[0]?.id || '');
  const [newCliName, setNewCliName] = useState('');
  const [newCliConvId, setNewCliConvId] = useState('5410');
  const [newCliSegment, setNewCliSegment] = useState('Corporativo B2B');
  const [isAddingClient, setIsAddingClient] = useState(false);

  async function handleSaveGlobal(e: FormEvent) {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toleranceMinutes: Number(tolerance) || 15,
          jiraBaseUrl,
          jiraMode,
        }),
      });
      if (res.ok) {
        onToast('Configurações globais de SLA e Jira atualizadas.', 'success');
        await onRefreshState();
      }
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleUpdateOperationWebhook(op: Operation, webhookUrl: string, simulateWebhookFailure: boolean) {
    const res = await fetch(`/api/operations/${op.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamsWebhookUrl: webhookUrl, simulateWebhookFailure }),
    });
    if (res.ok) {
      onToast(`Configuração Teams de ${op.code} atualizada.`, 'success');
      await onRefreshState();
    }
  }

  async function handleAddClient(e: FormEvent) {
    e.preventDefault();
    if (!newCliName.trim()) return;
    setIsAddingClient(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: newCliOpId,
          name: newCliName,
          segment: newCliSegment,
          chatwootConversationId: Number(newCliConvId) || 5410,
        }),
      });
      if (res.ok) {
        setNewCliName('');
        onToast('Cliente e destino Chatwoot cadastrados.', 'success');
        await onRefreshState();
      }
    } finally {
      setIsAddingClient(false);
    }
  }

  async function handleUpdateAnalystShift(analyst: Analyst, shiftCode: ShiftCode) {
    const res = await fetch(`/api/analysts/${analyst.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftCode }),
    });
    if (res.ok) {
      onToast(`${analyst.name} movido para Turno ${shiftCode}.`, 'info');
      await onRefreshState();
    }
  }

  async function handleToggleAnalystOp(analyst: Analyst, opId: string) {
    const has = analyst.authorizedOperations.includes(opId);
    const nextOps = has
      ? analyst.authorizedOperations.filter((id) => id !== opId)
      : [...analyst.authorizedOperations, opId];
    const res = await fetch(`/api/analysts/${analyst.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizedOperations: nextOps }),
    });
    if (res.ok) {
      await onRefreshState();
    }
  }

  async function handleResetDemo() {
    const res = await fetch('/api/reset-demo', { method: 'POST' });
    if (res.ok) {
      onToast('Cenário piloto restaurado para o estado inicial.', 'info');
      await onRefreshState();
    }
  }

  const opMap = new Map(operations.map((o) => [o.id, o]));

  return (
    <div className="mx-auto max-w-[1680px] space-y-4 px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#283244] bg-[#111827] px-4 py-3">
        <div>
          <h1 className="text-[18px] font-semibold text-[#DFE2F1]">
            Configurações do Piloto NOC Telco/Jira
          </h1>
          <p className="mt-0.5 text-[12px] text-[#88929B]">
            Tolerância global de atraso, webhooks Teams por operação, destinos Chatwoot e escala autorizada.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetDemo}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#374151] bg-[#1C1F2A] px-3 py-1.5 text-[12px] font-medium text-[#BEC8D2] hover:border-[#4B5563]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar Cenário Piloto
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Global SLA & Jira Integration Settings */}
        <section className="rounded-md border border-[#283244] bg-[#111827] p-4 lg:col-span-5">
          <h2 className="text-[15px] font-semibold text-[#DFE2F1]">
            Parâmetros Globais de Turno & Jira
          </h2>
          <form onSubmit={handleSaveGlobal} className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-[12px] text-[#BEC8D2]">
                Tolerância global de atraso na troca de turno (minutos)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="h-9 w-36 rounded-md border border-[#374151] bg-[#0F131D] px-3 font-mono text-[13px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[12px] text-[#BEC8D2]">
                  URL Base Jira
                </label>
                <input
                  type="text"
                  value={jiraBaseUrl}
                  onChange={(e) => setJiraBaseUrl(e.target.value)}
                  className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-3 font-mono text-[12px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-[#BEC8D2]">
                  Ambiente Jira
                </label>
                <select
                  value={jiraMode}
                  onChange={(e) => setJiraMode(e.target.value as 'CLOUD' | 'DATA_CENTER')}
                  className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[12px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                >
                  <option value="DATA_CENTER">Data Center</option>
                  <option value="CLOUD">Jira Cloud</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingSettings}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#0EA5E9] px-4 py-2 text-[12px] font-semibold text-[#041B29] hover:bg-[#38BDF8]"
            >
              <Save className="h-3.5 w-3.5" />
              {isSavingSettings ? 'Salvando...' : 'Salvar Parâmetros'}
            </button>
          </form>

          {/* Operations & Teams Webhooks */}
          <div className="mt-5 border-t border-[#283244] pt-4">
            <h3 className="mb-2.5 text-[14px] font-semibold text-[#DFE2F1]">
              Webhooks Teams por Operação (Resolvidos no Servidor)
            </h3>
            <div className="space-y-2.5">
              {operations.map((op) => (
                <div key={op.id} className="rounded-md border border-[#283244] bg-[#0F131D] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] font-semibold text-[#89CEFF]">
                      {op.code} · {op.name}
                    </span>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-[#BEC8D2]">
                      <input
                        type="checkbox"
                        checked={op.simulateWebhookFailure}
                        onChange={(e) =>
                          handleUpdateOperationWebhook(op, op.teamsWebhookUrl, e.target.checked)
                        }
                        className="accent-[#EF4444]"
                      />
                      Simular falha
                    </label>
                  </div>
                  <div className="mt-1.5 font-mono text-[11px] text-[#88929B] truncate">
                    {op.teamsWebhookUrl}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Client -> Chatwoot Mappings & Authorized Analysts */}
        <section className="space-y-4 lg:col-span-7">
          {/* Clients & Chatwoot */}
          <div className="rounded-md border border-[#283244] bg-[#111827] p-4">
            <h2 className="text-[15px] font-semibold text-[#DFE2F1]">
              Operação, Clientes e Destino Chatwoot ({clients.length})
            </h2>

            <form onSubmit={handleAddClient} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12">
              <select
                value={newCliOpId}
                onChange={(e) => setNewCliOpId(e.target.value)}
                className="h-9 rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[12px] text-[#DFE2F1] sm:col-span-3"
              >
                {operations.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.code}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newCliName}
                onChange={(e) => setNewCliName(e.target.value)}
                placeholder="Nome do cliente (ex: XP Investimentos)"
                className="h-9 rounded-md border border-[#374151] bg-[#0F131D] px-3 text-[12px] text-[#DFE2F1] sm:col-span-4"
              />
              <input
                type="text"
                value={newCliSegment}
                onChange={(e) => setNewCliSegment(e.target.value)}
                placeholder="Segmento"
                className="h-9 rounded-md border border-[#374151] bg-[#0F131D] px-3 text-[12px] text-[#DFE2F1] sm:col-span-2"
              />
              <input
                type="number"
                value={newCliConvId}
                onChange={(e) => setNewCliConvId(e.target.value)}
                placeholder="ID CW"
                className="h-9 rounded-md border border-[#374151] bg-[#0F131D] px-2.5 font-mono text-[12px] text-[#DFE2F1] sm:col-span-1"
              />
              <button
                type="submit"
                disabled={isAddingClient || !newCliName.trim()}
                className="inline-flex h-9 cursor-pointer items-center justify-center gap-1 rounded-md bg-[#6366F1] px-3 text-[12px] font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-45 sm:col-span-2"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            </form>

            <div className="mt-3 overflow-x-auto rounded-md border border-[#283244]">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#374151] bg-[#0F131D] font-mono text-[11px] text-[#88929B]">
                    <th className="px-3 py-2">Operação</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Conversa Chatwoot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#283244]">
                  {clients.map((c) => (
                    <tr key={c.id} className="hover:bg-[#171B26]">
                      <td className="px-3 py-2 font-mono text-[11px] text-[#89CEFF]">
                        {opMap.get(c.operationId)?.code}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#DFE2F1]">{c.name}</div>
                        <div className="text-[11px] text-[#88929B]">{c.segment}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-[#A5B4FC]">
                        #{c.chatwootConversationId} · {c.chatwootAccountUrl}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Analysts & Shift Authorization */}
          <div className="rounded-md border border-[#283244] bg-[#111827] p-4">
            <h2 className="mb-3 text-[15px] font-semibold text-[#DFE2F1]">
              Escala de Turno e Autorização para Aceite
            </h2>
            <div className="overflow-x-auto rounded-md border border-[#283244]">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#374151] bg-[#0F131D] font-mono text-[11px] text-[#88929B]">
                    <th className="px-3 py-2">Analista</th>
                    <th className="px-3 py-2">Turno Escalado</th>
                    <th className="px-3 py-2">Operações Autorizadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#283244]">
                  {analysts.map((a) => (
                    <tr key={a.id} className="hover:bg-[#171B26]">
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#DFE2F1]">{a.name}</div>
                        <div className="text-[11px] text-[#88929B]">{a.role}</div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={a.shiftCode}
                          onChange={(e) => handleUpdateAnalystShift(a, e.target.value as ShiftCode)}
                          className="h-8 rounded border border-[#374151] bg-[#0F131D] px-2 font-mono text-[11px] text-[#DFE2F1]"
                        >
                          <option value="A">Turno A (06:00)</option>
                          <option value="B">Turno B (14:00)</option>
                          <option value="C">Turno C (22:00)</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {operations.map((op) => {
                            const active = a.authorizedOperations.includes(op.id);
                            return (
                              <button
                                key={op.id}
                                type="button"
                                onClick={() => handleToggleAnalystOp(a, op.id)}
                                className={`cursor-pointer rounded border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                                  active
                                    ? 'border-[#10B981]/35 bg-[#10B981]/15 text-[#34D399]'
                                    : 'border-[#374151] bg-[#0F131D] text-[#6B7280]'
                                }`}
                              >
                                {op.code}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
