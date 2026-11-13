import { useState, type FormEvent } from 'react';
import { Link2, Plus, X } from 'lucide-react';
import type {
  Analyst,
  ClientMapping,
  JiraReference,
  Operation,
  PendenciaStatus,
  SeverityLevel,
} from '../types/noc';

interface NewPendenciaModalProps {
  isOpen: boolean;
  onClose: () => void;
  operation: Operation;
  clients: ClientMapping[];
  currentAnalyst: Analyst;
  onCreated: () => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export function NewPendenciaModal({
  isOpen,
  onClose,
  operation,
  clients,
  currentAnalyst,
  onCreated,
  onToast,
}: NewPendenciaModalProps) {
  const opClients = clients.filter((c) => c.operationId === operation.id);

  const [clientId, setClientId] = useState(opClients[0]?.id || '');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>('P1');
  const [status, setStatus] = useState<PendenciaStatus>('EM_ANDAMENTO');
  const [circuitId, setCircuitId] = useState('');
  const [jiraInput, setJiraInput] = useState('');
  const [jiraRefs, setJiraRefs] = useState<JiraReference[]>([]);
  const [lastAction, setLastAction] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [followUpTime, setFollowUpTime] = useState('');
  const [externalUpdate, setExternalUpdate] = useState('');
  const [shareWithClient, setShareWithClient] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLookingUpJira, setIsLookingUpJira] = useState(false);

  if (!isOpen) return null;

  const effectiveClientId = opClients.some((c) => c.id === clientId)
    ? clientId
    : opClients[0]?.id || '';

  async function handleAddJira() {
    if (!jiraInput.trim()) return;
    setIsLookingUpJira(true);
    try {
      const res = await fetch('/api/jira/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: jiraInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Chave Jira inválida', 'error');
        return;
      }
      if (!jiraRefs.some((j) => j.key === data.jiraRef.key)) {
        setJiraRefs((prev) => [...prev, data.jiraRef]);
      }
      setJiraInput('');
    } finally {
      setIsLookingUpJira(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!effectiveClientId || !title.trim()) {
      onToast('Confirme o cliente e informe o título da pendência.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/pendencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: operation.id,
          clientId: effectiveClientId,
          title,
          severity,
          status,
          circuitId,
          jiraRefs,
          jiraInput: jiraInput.trim() || undefined,
          lastAction,
          nextAction,
          followUpTime,
          externalUpdate: externalUpdate || lastAction,
          shareWithClient,
          authorName: currentAnalyst.name,
          shiftCode: currentAnalyst.shiftCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Falha ao criar pendência.', 'error');
        return;
      }
      onToast(`Pendência ${data.item.id} adicionada à fila.`, 'success');
      setTitle('');
      setCircuitId('');
      setJiraInput('');
      setJiraRefs([]);
      setLastAction('');
      setNextAction('');
      setFollowUpTime('');
      setExternalUpdate('');
      await onCreated();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-pendencia-title"
    >
      <div className="w-full max-w-2xl rounded-lg border border-[#374151] bg-[#111827] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#283244] px-5 py-3.5">
          <div>
            <h2 id="new-pendencia-title" className="text-[16px] font-semibold text-[#DFE2F1]">
              Nova Pendência · {operation.code}
            </h2>
            <p className="text-[12px] text-[#88929B]">
              Vincule chamados Jira por chave ou URL e confirme o cliente atendido.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="cursor-pointer rounded-md p-1.5 text-[#88929B] hover:bg-[#1C1F2A] hover:text-[#DFE2F1]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[80vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#BEC8D2]">
                Cliente (confirmação obrigatória)
              </label>
              <select
                value={effectiveClientId}
                onChange={(e) => setClientId(e.target.value)}
                className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-3 text-[13px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
              >
                {opClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#BEC8D2]">
                  Severidade
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                  className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[13px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                >
                  <option value="P0">P0 Crítico</option>
                  <option value="P1">P1 Alto</option>
                  <option value="NORMAL">Normal</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#BEC8D2]">
                  Situação
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PendenciaStatus)}
                  className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-2.5 text-[13px] text-[#DFE2F1] focus:border-[#0EA5E9] focus:outline-none"
                >
                  <option value="EM_ANDAMENTO">Em andamento</option>
                  <option value="AGUARDANDO_OPERADORA">Aguardando operadora</option>
                  <option value="AGUARDANDO_CLIENTE">Aguardando cliente</option>
                  <option value="MONITORANDO">Monitorando</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-[#BEC8D2]">
                Título da pendência
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Degradação óptica no enlace primário 100G"
                className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-3 text-[13px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#BEC8D2]">
                Circuito / ID
              </label>
              <input
                type="text"
                value={circuitId}
                onChange={(e) => setCircuitId(e.target.value)}
                placeholder="CKT-BR-SP-09"
                className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-3 font-mono text-[12px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none"
              />
            </div>
          </div>

          {/* Jira linking */}
          <div className="rounded-md border border-[#283244] bg-[#0F131D] p-3">
            <label className="mb-1.5 block text-[12px] font-medium text-[#BEC8D2]">
              Vincular chamados Jira (chave ou URL completa)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={jiraInput}
                onChange={(e) => setJiraInput(e.target.value)}
                placeholder="NOC-4125 ou https://jira.telco.local/browse/NOC-4125"
                className="h-9 flex-1 rounded-md border border-[#374151] bg-[#111827] px-3 font-mono text-[12px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddJira}
                disabled={isLookingUpJira || !jiraInput.trim()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#3B82F6]/40 bg-[#2563EB]/20 px-3 text-[12px] font-medium text-[#89CEFF] hover:bg-[#2563EB]/30 disabled:opacity-45"
              >
                <Link2 className="h-3.5 w-3.5" />
                {isLookingUpJira ? 'Validando...' : 'Adicionar Jira'}
              </button>
            </div>
            {jiraRefs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {jiraRefs.map((j) => (
                  <span
                    key={j.key}
                    className="inline-flex items-center gap-1.5 rounded border border-[#3B82F6]/40 bg-[#2563EB]/15 px-2 py-0.5 font-mono text-[11px] text-[#89CEFF]"
                  >
                    {j.key}
                    <button
                      type="button"
                      onClick={() => setJiraRefs((prev) => prev.filter((item) => item.key !== j.key))}
                      className="cursor-pointer text-[#89CEFF]/70 hover:text-white"
                      aria-label={`Remover ${j.key}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-[#BEC8D2]">
                Última ação (interna)
              </label>
              <textarea
                rows={2}
                value={lastAction}
                onChange={(e) => setLastAction(e.target.value)}
                placeholder="Descreva a atuação realizada no turno atual..."
                className="w-full rounded-md border border-[#374151] bg-[#0F131D] p-2.5 text-[13px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#BEC8D2]">
                Horário de acompanhamento
              </label>
              <input
                type="text"
                value={followUpTime}
                onChange={(e) => setFollowUpTime(e.target.value)}
                placeholder="Ex: 23:30"
                className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-3 font-mono text-[12px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#BEC8D2]">
              Próximo passo (turno de entrada)
            </label>
            <input
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Ação esperada do próximo turno..."
              className="h-9 w-full rounded-md border border-[#374151] bg-[#0F131D] px-3 text-[13px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[12px] font-medium text-[#BEC8D2]">
                Atualização externa revisada (cliente / Chatwoot)
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-[#BEC8D2]">
                <input
                  type="checkbox"
                  checked={shareWithClient}
                  onChange={(e) => setShareWithClient(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#0EA5E9]"
                />
                Compartilhar com cliente
              </label>
            </div>
            <textarea
              rows={2}
              value={externalUpdate}
              onChange={(e) => setExternalUpdate(e.target.value)}
              placeholder="Texto limpo para envio ao cliente (se vazio, usará a última ação)."
              className="w-full rounded-md border border-[#374151] bg-[#0F131D] p-2.5 text-[13px] text-[#DFE2F1] placeholder:text-[#6B7280] focus:border-[#0EA5E9] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-[#283244] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-[#374151] bg-[#1C1F2A] px-4 py-2 text-[13px] font-medium text-[#BEC8D2] hover:text-[#DFE2F1]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#0EA5E9] px-4 py-2 text-[13px] font-semibold text-[#041B29] hover:bg-[#38BDF8] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {isSubmitting ? 'Salvando...' : 'Criar Pendência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
