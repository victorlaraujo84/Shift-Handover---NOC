import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, MessageSquare, Send, X } from 'lucide-react';
import type { ChatwootBridgePayload } from '../types/noc';

interface ChatwootBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  operationId: string;
  clientId: string;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export function ChatwootBridgeModal({
  isOpen,
  onClose,
  operationId,
  clientId,
  onToast,
}: ChatwootBridgeModalProps) {
  const [payload, setPayload] = useState<ChatwootBridgePayload | null>(null);
  const [editorText, setEditorText] = useState('');
  const [simulateExistingDraft, setSimulateExistingDraft] = useState(false);
  const [simulateDivergentConversation, setSimulateDivergentConversation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [manualSentConfirm, setManualSentConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen || !operationId || !clientId) return;
    let cancelled = false;
    setManualSentConfirm(false);
    setIsLoading(true);

    fetch('/api/chatwoot/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId,
        clientId,
        simulateExistingDraft,
        simulateDivergentConversation,
      }),
    })
      .then((res) => res.json())
      .then((data: ChatwootBridgePayload) => {
        if (cancelled) return;
        setPayload(data);
        setEditorText(data.messageText || '');
      })
      .catch(() => {
        if (!cancelled) onToast('Falha ao preparar destino Chatwoot.', 'error');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, operationId, clientId, simulateExistingDraft, simulateDivergentConversation, onToast]);

  if (!isOpen) return null;

  async function handleCopy() {
    if (!editorText.trim()) return;
    await navigator.clipboard.writeText(editorText);
    onToast('Texto da passagem do cliente copiado.', 'success');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chatwoot-bridge-title"
    >
      <div className="w-full max-w-3xl rounded-lg border border-[#374151] bg-[#111827] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#283244] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#6366F1]/40 bg-[#6366F1]/15 text-[#A5B4FC]">
              <MessageSquare className="h-4 w-4" />
            </span>
            <div>
              <h2 id="chatwoot-bridge-title" className="text-[15px] font-semibold text-[#DFE2F1]">
                Ponte Chatwoot · Resposta Pública
              </h2>
              <p className="font-mono text-[11px] text-[#88929B]">
                {payload ? `Conversa #${payload.conversationId} · ${payload.clientName}` : 'Carregando destino...'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar ponte Chatwoot"
            className="cursor-pointer rounded-md p-1.5 text-[#88929B] hover:bg-[#1C1F2A] hover:text-[#DFE2F1]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Diagnostic verification bar (Pilot Step 3 checks) */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#283244] bg-[#0F131D] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-3 text-[12px]">
              <span className="inline-flex items-center gap-1.5 text-[#34D399]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Sessão autenticada
              </span>
              <span aria-hidden="true" className="text-[#374151]">·</span>
              <span
                className={`inline-flex items-center gap-1.5 ${
                  payload?.checks.conversationMatchesTarget ? 'text-[#34D399]' : 'text-[#F87171]'
                }`}
              >
                {payload?.checks.conversationMatchesTarget ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {payload?.checks.conversationMatchesTarget
                  ? 'Conversa confirmada'
                  : 'Conversa divergente detectada'}
              </span>
              <span aria-hidden="true" className="text-[#374151]">·</span>
              <span
                className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${
                  payload?.checks.editorReadyState === 'Preparado no Chatwoot'
                    ? 'border-[#10B981]/35 bg-[#10B981]/15 text-[#34D399]'
                    : 'border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#FBBF24]'
                }`}
              >
                {payload?.checks.editorReadyState || 'Verificando...'}
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-[#88929B]">
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={simulateExistingDraft}
                  onChange={(e) => setSimulateExistingDraft(e.target.checked)}
                  className="accent-[#F59E0B]"
                />
                Simular rascunho existente
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={simulateDivergentConversation}
                  onChange={(e) => setSimulateDivergentConversation(e.target.checked)}
                  className="accent-[#EF4444]"
                />
                Simular conversa divergente
              </label>
            </div>
          </div>

          {payload?.checks.conversationMatchesTarget === false && (
            <div className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3.5 py-2.5 text-[12px] text-[#FCA5A5]">
              A conversa aberta no navegador não corresponde ao destino cadastrado (#{payload.conversationId}). O preenchimento automático foi bloqueado para evitar envio ao cliente errado — use a cópia manual após validar a aba.
            </div>
          )}

          {payload?.checks.existingDraftDetected && payload?.checks.conversationMatchesTarget && (
            <div className="rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3.5 py-2.5 text-[12px] text-[#FDE68A]">
              Rascunho anterior detectado no editor do Chatwoot. Revise o conteúdo abaixo antes de substituir ou enviar manualmente.
            </div>
          )}

          {/* Simulated Chatwoot Target & Editable Public Reply Box */}
          <div className="rounded-md border border-[#374151] bg-[#0B0F19]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#283244] px-3.5 py-2 text-[12px]">
              <div className="flex items-center gap-2 font-mono text-[#BEC8D2]">
                <span>Destino:</span>
                <span className="text-[#89CEFF]">{payload?.conversationUrl || '—'}</span>
              </div>
              <span className="text-[11px] text-[#88929B]">
                Contato: {payload?.contactName || '—'} · Itens incluídos: {payload?.includedItemIds.join(', ') || 'Nenhum'}
              </span>
            </div>

            <div className="p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] text-[#A5B4FC]">
                  Editor de Resposta Pública (Editável — envio manual pelo analista)
                </span>
                <span className="font-mono text-[11px] text-[#88929B]">
                  {editorText.length} caracteres
                </span>
              </div>
              {isLoading ? (
                <div className="h-44 animate-pulse rounded border border-[#283244] bg-[#171B26]" />
              ) : (
                <textarea
                  rows={8}
                  value={editorText}
                  onChange={(e) => setEditorText(e.target.value)}
                  disabled={payload?.checks.conversationMatchesTarget === false}
                  placeholder="Nenhum item marcado para compartilhar com este cliente."
                  className="w-full rounded-md border border-[#374151] bg-[#111827] p-3 font-sans text-[13px] leading-relaxed text-[#DFE2F1] focus:border-[#6366F1] focus:outline-none disabled:opacity-50"
                />
              )}
            </div>
          </div>

          {manualSentConfirm && (
            <div className="rounded-md border border-[#10B981]/40 bg-[#10B981]/10 px-3.5 py-2.5 text-[12px] text-[#6EE7B7]">
              Envio manual registrado na sessão de prova do Chatwoot para {payload?.clientName}.
            </div>
          )}

          {/* Footer actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#283244] pt-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!editorText.trim()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#374151] bg-[#1C1F2A] px-3 py-2 text-[12px] font-medium text-[#DFE2F1] hover:border-[#4B5563] disabled:opacity-45"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar texto manual
              </button>
              {payload?.conversationUrl && (
                <a
                  href={payload.conversationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#374151] bg-[#111827] px-3 py-2 text-[12px] font-medium text-[#89CEFF] hover:bg-[#1C1F2A]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  URL da Conversa
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-md border border-[#374151] bg-[#1C1F2A] px-3.5 py-2 text-[12px] font-medium text-[#BEC8D2] hover:text-[#DFE2F1]"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={!editorText.trim() || payload?.checks.conversationMatchesTarget === false}
                onClick={() => {
                  setManualSentConfirm(true);
                  onToast(`Mensagem enviada manualmente para ${payload?.clientName} no Chatwoot.`, 'success');
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#6366F1] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-45"
              >
                <Send className="h-3.5 w-3.5" />
                Confirmar Envio Manual
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
