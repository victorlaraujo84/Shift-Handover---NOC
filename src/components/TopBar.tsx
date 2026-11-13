import type { HandoverState } from '../types/noc';

export type ActiveTab = 'passagem' | 'fila' | 'compartilhamento' | 'historico' | 'configuracoes';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onPrimaryPublish: () => void;
  canPublish: boolean;
  isPublishing: boolean;
  activeHandoverState?: HandoverState;
  activeVersion?: number;
}

const NAV_ITEMS: { id: ActiveTab; label: string }[] = [
  { id: 'passagem', label: 'Passagem Ativa' },
  { id: 'fila', label: 'Fila & Pendências' },
  { id: 'compartilhamento', label: 'Compartilhamento' },
  { id: 'historico', label: 'Histórico & Turnos' },
  { id: 'configuracoes', label: 'Configurações' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  onPrimaryPublish,
  canPublish,
  isPublishing,
  activeHandoverState,
  activeVersion = 0,
}: TopBarProps) {
  const publishLabel = isPublishing
    ? 'Publicando...'
    : activeHandoverState === 'RASCUNHO'
      ? 'Publicar Passagem'
      : `Publicar v${activeVersion + 1}`;

  return (
    <header className="sticky top-0 z-30 border-b border-[#283244] bg-[#0F131D]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1680px] items-center justify-between gap-8 px-4 lg:px-6">
        {/* Zone 1: Single-element Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('passagem')}
          className="cursor-pointer whitespace-nowrap shrink-0 text-left font-[family-name:var(--font-display)] text-[17px] font-bold tracking-tight text-[#DFE2F1] hover:text-[#89CEFF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] transition-colors"
        >
          ShiftPulse NOC
        </button>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav className="flex items-center gap-5 overflow-x-auto no-scrollbar" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative cursor-pointer whitespace-nowrap shrink-0 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] ${
                  isActive
                    ? 'text-[#89CEFF]'
                    : 'text-[#BEC8D2] hover:text-[#DFE2F1]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[11px] h-[2px] bg-[#0EA5E9]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="shrink-0">
          <button
            type="button"
            disabled={!canPublish || isPublishing}
            onClick={onPrimaryPublish}
            className="cursor-pointer whitespace-nowrap shrink-0 rounded-md bg-[#0EA5E9] px-4 py-2 text-[13px] font-semibold text-[#041B29] hover:bg-[#38BDF8] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] transition-colors"
          >
            {publishLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
