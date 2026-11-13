import { useCallback, useEffect, useState } from 'react';
import { ActiveHandoverScreen } from './components/ActiveHandoverScreen';
import { ChatwootBridgeModal } from './components/ChatwootBridgeModal';
import { HistoryScreen } from './components/HistoryScreen';
import { NewPendenciaModal } from './components/NewPendenciaModal';
import { QueueScreen } from './components/QueueScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { SharingScreen } from './components/SharingScreen';
import { TopBar, type ActiveTab } from './components/TopBar';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import type { NocWorkspaceState, PendenciaItem } from './types/noc';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'error' | 'info';
}

export default function App() {
  const [state, setState] = useState<NocWorkspaceState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('passagem');
  const [selectedOperationId, setSelectedOperationId] = useState<string>('op-vivo-core');
  const [currentAnalystId, setCurrentAnalystId] = useState<string>('an-carlos');
  const [searchQuery, setSearchQuery] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [chatwootClientId, setChatwootClientId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((text: string, tone: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as NocWorkspaceState;
      setState(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar estado do servidor.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const opParam = params.get('operationId');
    if (opParam) setSelectedOperationId(opParam);
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading && !state) {
    return (
      <div className="min-h-screen bg-[#0B0F19] p-6">
        <div className="mx-auto max-w-[1680px] space-y-4">
          <div className="h-14 animate-pulse rounded-md border border-[#283244] bg-[#111827]" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="h-[540px] animate-pulse rounded-md border border-[#283244] bg-[#111827] lg:col-span-3" />
            <div className="h-[540px] animate-pulse rounded-md border border-[#283244] bg-[#111827] lg:col-span-5" />
            <div className="h-[540px] animate-pulse rounded-md border border-[#283244] bg-[#111827] lg:col-span-4" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F19] p-6">
        <div className="max-w-md rounded-md border border-[#EF4444]/40 bg-[#111827] p-6 text-center">
          <h1 className="text-[16px] font-semibold text-[#DFE2F1]">
            Falha ao conectar ao console ShiftPulse NOC
          </h1>
          <p className="mt-1.5 text-[12px] text-[#FCA5A5]">{loadError || 'Estado indisponível.'}</p>
          <button
            type="button"
            onClick={fetchState}
            className="mt-4 cursor-pointer rounded-md bg-[#0EA5E9] px-4 py-2 text-[12px] font-semibold text-[#041B29]"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const activeOperation =
    state.operations.find((o) => o.id === selectedOperationId) || state.operations[0];
  const currentAnalyst =
    state.analysts.find((a) => a.id === currentAnalystId) || state.analysts[0];

  // Pick the active (most recent) handover for the selected operation
  const activeHandover = state.handovers.find((h) => h.operationId === activeOperation.id);

  async function handlePublishActiveHandover() {
    if (!activeHandover) return;
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/handovers/${activeHandover.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId: currentAnalyst.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Erro ao publicar passagem.', 'error');
        return;
      }
      if (data.notification?.status === 'SUCCESS') {
        pushToast(
          `Passagem v${data.handover.currentVersion} publicada e enviada ao Teams.`,
          'success',
        );
      } else {
        pushToast(
          `Passagem v${data.handover.currentVersion} publicada, mas o webhook Teams falhou (HTTP ${data.notification?.httpStatus}). Reenvie na aba Compartilhamento.`,
          'error',
        );
      }
      await fetchState();
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleToggleEncerrado(item: PendenciaItem) {
    const nextStatus = item.status === 'ENCERRADO' ? 'EM_ANDAMENTO' : 'ENCERRADO';
    const res = await fetch(`/api/pendencias/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: nextStatus,
        authorName: currentAnalyst.name,
        shiftCode: currentAnalyst.shiftCode,
        note:
          nextStatus === 'ENCERRADO'
            ? 'Pendência encerrada e removida do próximo turno.'
            : 'Pendência reaberta para acompanhamento.',
      }),
    });
    if (res.ok) {
      pushToast(
        nextStatus === 'ENCERRADO'
          ? `${item.id} encerrada (não reaparecerá no próximo turno).`
          : `${item.id} reaberta.`,
        'info',
      );
      await fetchState();
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#DFE2F1]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onPrimaryPublish={handlePublishActiveHandover}
        canPublish={Boolean(activeHandover)}
        isPublishing={isPublishing}
        activeHandoverState={activeHandover?.state}
        activeVersion={activeHandover?.currentVersion}
      />

      <WorkspaceToolbar
        operations={state.operations}
        selectedOperationId={activeOperation.id}
        onSelectOperation={setSelectedOperationId}
        analysts={state.analysts}
        currentAnalystId={currentAnalyst.id}
        onSelectAnalyst={setCurrentAnalystId}
        activeHandover={activeHandover}
        settings={state.settings}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        nowMs={nowMs}
      />

      <main>
        {activeTab === 'passagem' && (
          <ActiveHandoverScreen
            operation={activeOperation}
            handover={activeHandover}
            pendencias={state.pendencias}
            clients={state.clients}
            analysts={state.analysts}
            currentAnalyst={currentAnalyst}
            clarifications={state.clarifications}
            notifications={state.notifications}
            searchQuery={searchQuery}
            onRefreshState={fetchState}
            onOpenNewPendencia={() => setIsNewModalOpen(true)}
            onOpenChatwoot={(clientId) => setChatwootClientId(clientId)}
            onPublishHandover={handlePublishActiveHandover}
            onToast={pushToast}
          />
        )}

        {activeTab === 'fila' && (
          <QueueScreen
            operations={state.operations}
            selectedOperationId={activeOperation.id}
            pendencias={state.pendencias}
            searchQuery={searchQuery}
            onOpenNewPendencia={() => setIsNewModalOpen(true)}
            onInspectInHandover={(opId) => {
              setSelectedOperationId(opId);
              setActiveTab('passagem');
            }}
            onToggleEncerrado={handleToggleEncerrado}
          />
        )}

        {activeTab === 'compartilhamento' && (
          <SharingScreen
            operation={activeOperation}
            handover={activeHandover}
            clients={state.clients}
            pendencias={state.pendencias}
            notifications={state.notifications}
            onRefreshState={fetchState}
            onPublishHandover={handlePublishActiveHandover}
            onOpenChatwoot={(clientId) => setChatwootClientId(clientId)}
            onToast={pushToast}
          />
        )}

        {activeTab === 'historico' && (
          <HistoryScreen
            operations={state.operations}
            handovers={state.handovers}
            clarifications={state.clarifications}
            settings={state.settings}
            nowMs={nowMs}
            onRefreshState={fetchState}
            onSelectHandoverOperation={(opId) => {
              setSelectedOperationId(opId);
              setActiveTab('passagem');
            }}
          />
        )}

        {activeTab === 'configuracoes' && (
          <SettingsScreen
            operations={state.operations}
            clients={state.clients}
            analysts={state.analysts}
            settings={state.settings}
            onRefreshState={fetchState}
            onToast={pushToast}
          />
        )}
      </main>

      <NewPendenciaModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        operation={activeOperation}
        clients={state.clients}
        currentAnalyst={currentAnalyst}
        onCreated={fetchState}
        onToast={pushToast}
      />

      <ChatwootBridgeModal
        isOpen={Boolean(chatwootClientId)}
        onClose={() => setChatwootClientId(null)}
        operationId={activeOperation.id}
        clientId={chatwootClientId || ''}
        onToast={pushToast}
      />

      {/* Toast stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed right-4 bottom-4 z-50 flex max-w-md flex-col gap-2"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-md border px-3.5 py-2.5 text-[12px] font-medium shadow-xl ${
                t.tone === 'success'
                  ? 'border-[#10B981]/40 bg-[#0F131D] text-[#6EE7B7]'
                  : t.tone === 'error'
                    ? 'border-[#EF4444]/40 bg-[#0F131D] text-[#FCA5A5]'
                    : 'border-[#0EA5E9]/40 bg-[#0F131D] text-[#89CEFF]'
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
