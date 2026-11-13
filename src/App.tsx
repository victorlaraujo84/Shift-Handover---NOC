import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { customerMessage } from './customerMessage';
import './style.css';

const profiles = ['Analista de saída', 'Analista de entrada'];
const formatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
});
const format = (date: string) => formatter.format(new Date(date));

type Details = {
  client: string; jira: string; update: string; next: string;
  followUp: string; external: string; share: boolean; open: boolean;
  severity?: 'P0' | 'P1' | 'P2' | 'P3'; circuit?: string;
};
type Item = { id: number; details: Details };
type Handover = {
  id: number; starts_at: string; published_at: string | null; published_by: string | null;
  snapshot: Item[] | null; accepted_at: string | null; accepted_by: string | null;
  caveat: string | null; teams_status: string; teams_attempted_at: string | null; draft_revision: number;
};
type History = { id: number; item_id: number; created_at: string; actor: string; details: Details };
type Comment = { id: number; handover_id: number; item_id: number; actor: string; body: string };
type Client = { name: string; chatwoot?: string };
type State = {
  handovers: Handover[]; items: Item[]; history: History[]; comments: Comment[]; grace: number;
  clients: Client[]; analyst: { name: string; startsAt: string[] } | null; jiraEnabled: boolean; teamsEnabled: boolean;
  settingsRevision: number; canEditSettings: boolean;
};
const views = ['Passagem ativa', 'Histórico e turnos', 'Configurações'] as const;
const blank: Details = { client: '', jira: '', update: '', next: '', followUp: '', external: '', share: false, open: true };

async function request<T>(path: string, data?: object): Promise<T> {
  const response = await fetch('/api' + path, data && {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Falha ao acessar o servidor.');
  return result as T;
}

function App() {
  const [state, setState] = useState<State>();
  const [selected, setSelected] = useState(Number(new URLSearchParams(location.search).get('passagem')));
  const [actor, setActor] = useState(profiles[0]);
  const [startsAt, setStartsAt] = useState('');
  const [form, setForm] = useState<{ id: number | null; details: Details }>();
  const [caveat, setCaveat] = useState('');
  const [preview, setPreview] = useState<{ client: Client; text: string }>();
  const [jiraIssue, setJiraIssue] = useState<{ key: string; summary: string; status: string; url: string }>();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [view, setView] = useState<typeof views[number]>('Passagem ativa');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    void request<State>('/state').then(setState).catch(e => setError(e.message));
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const handover = selected ? state?.handovers.find(entry => entry.id === selected) : state?.handovers[0];
  const latest = handover?.id === state?.handovers[0]?.id;
  const editable = Boolean(handover && latest && (!handover.published_at || handover.accepted_at));
  const canAccept = state?.analyst
    ? state.analyst.startsAt.some(start => Date.parse(start) === Date.parse(handover?.starts_at ?? ''))
    : actor === profiles[1];
  const items = editable && handover?.accepted_at
    ? state?.items
    : handover?.snapshot ?? state?.items.filter(item => item.details.open);
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = items?.filter(({ details }) =>
    (showClosed || details.open) && (!severity || details.severity === severity) &&
    [details.jira, details.client, details.next, details.circuit ?? ''].some(value => value.toLocaleLowerCase('pt-BR').includes(term)));
  const visibleClients = new Map<string, Client>(state?.clients.map(client => [client.name, client]));
  for (const entry of [...(items ?? []), ...(handover?.snapshot ?? [])]) {
    if (!visibleClients.has(entry.details.client)) visibleClients.set(entry.details.client, { name: entry.details.client });
  }
  const retryTeams = handover && (['failed', 'pending', 'disabled'].includes(handover.teams_status) ||
    (handover.teams_status === 'sending' && (!handover.teams_attempted_at || now - Date.parse(handover.teams_attempted_at) > 60000)));
  const overdue = handover && state && now >= Date.parse(handover.starts_at) + state.grace * 60000;
  const label = !handover ? '' : handover.accepted_at ? 'Aceita'
    : handover.published_at ? overdue ? 'Aceite em atraso' : 'Aguardando aceite'
      : overdue ? 'Publicação em atraso' : 'Rascunho';

  function select(id: number) {
    setView('Passagem ativa');
    setSearch('');
    setSeverity('');
    setShowClosed(false);
    setSelected(id);
    setForm(undefined);
    setPreview(undefined);
    setJiraIssue(undefined);
    setCaveat('');
    history.replaceState(null, '', id ? `?passagem=${id}` : location.pathname);
  }

  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await work();
      setState(await request<State>('/state'));
      setFeedback(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na operação.');
    } finally {
      setBusy(false);
    }
  }

  function create(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      const timestamp = new Date(startsAt + '-03:00').toISOString();
      const result = await request<{ id: number }>('/handovers', { startsAt: timestamp });
      select(result.id);
      setStartsAt('');
    }, 'Rascunho criado.');
  }

  function copyText(client: Client) {
    if (!handover) return;
    const message = customerMessage(client.name, format(handover.starts_at), handover.snapshot ?? []);
    setPreview(message ? { client, text: message } : undefined);
    if (!message) {
      setFeedback('Este cliente não tem pendências marcadas para compartilhar nesta passagem.');
    }
  }

  async function prepareChatwoot() {
    if (!preview?.client.chatwoot) return;
    setError('');
    setFeedback('');
    try {
      const browser = globalThis as typeof globalThis & {
        chrome?: { runtime?: {
          lastError?: { message: string };
          sendMessage: (id: string, data: object, callback: (reply?: { ok: boolean; error?: string }) => void) => void;
        } };
      };
      const runtime = browser.chrome?.runtime;
      const extension = import.meta.env.VITE_CHATWOOT_EXTENSION_ID;
      if (!runtime?.sendMessage || !extension) throw new Error('Extensão indisponível. Use a cópia ou abra a conversa pelo link.');
      setFeedback('Abrindo a conversa no Chatwoot…');
      await new Promise<void>((resolve, reject) => {
        runtime.sendMessage(extension, { type: 'prepare-handover', url: preview.client.chatwoot, text: preview.text }, reply => {
          if (runtime.lastError || !reply) reject(new Error('A extensão não respondeu. Confira a instalação ou use a cópia.'));
          else if (!reply.ok) reject(new Error(reply.error || 'Não foi possível preencher o Chatwoot.'));
          else resolve();
        });
      });
      setFeedback('Preparado no Chatwoot. Revise o texto e envie na conversa.');
    } catch (e) {
      setFeedback('');
      setError(e instanceof Error ? e.message : 'Falha ao preparar o Chatwoot.');
    }
  }

  function setField<K extends keyof Details>(key: K, value: Details[K]) {
    setForm(current => current && { ...current, details: { ...current.details, [key]: value } });
  }

  return (
    <>
      <header><span className="brand">ShiftPulse NOC</span><nav className="top-nav" aria-label="Navegação principal">
        {views.map(entry => <button key={entry} type="button" aria-current={view === entry ? 'page' : undefined} onClick={() => {
          if (entry === 'Passagem ativa' && view !== entry && !form) select(0);
          setView(entry);
        }}>{entry}</button>)}
      </nav>{state?.analyst ? <span>{state.analyst.name}</span> : <label>Perfil de teste <select value={actor} onChange={e => setActor(e.target.value)}>
        {profiles.map(profile => <option key={profile}>{profile}</option>)}
      </select></label>}</header>
      <main>
        <p className="operation">SNOC / NOC TELCO</p>
        <h1>{view === 'Passagem ativa' ? 'Passagem de turno' : view}</h1>
        {view !== 'Passagem ativa' && error && <p role="alert" className="error">{error}</p>}
        {view === 'Configurações' ? <section className="content settings" aria-label="Configuração operacional">
          {state ? <>
            <h2>Execução</h2>
            <dl>
              <div><dt>Acesso</dt><dd>{state.analyst ? 'Login corporativo via proxy' : 'Piloto local com perfis de teste'}</dd></div>
              <div><dt>Tolerância de aceite</dt><dd>{state.grace} min após o início do turno</dd></div>
              <div><dt>Teams</dt><dd>{state.teamsEnabled ? 'Webhook configurado' : 'Webhook pendente'}</dd></div>
              <div><dt>Jira</dt><dd>{state.jiraEnabled ? 'Consulta em leitura configurada' : 'Referência manual'}</dd></div>
              <div><dt>Extensão Chatwoot</dt><dd>{import.meta.env.VITE_CHATWOOT_EXTENSION_ID ? 'ID configurado no build' : 'Cópia manual disponível'}</dd></div>
            </dl>
            <h2>Destinos por cliente</h2>
            <ul>{state.clients.map(client => <li key={client.name}>{client.name} · {client.chatwoot ? 'Conversa cadastrada' : 'Conversa pendente'}</li>)}</ul>
            {state.canEditSettings && <form key={state.settingsRevision} className="item-form" onSubmit={event => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void act(async () => {
                await request('/settings', {
                  grace: Number(data.get('grace')),
                  revision: state.settingsRevision,
                  destinations: state.clients.map((client, index) => ({ name: client.name, url: data.get(`destination-${index}`) })),
                });
                setPreview(undefined);
              }, 'Configurações salvas.');
            }}>
              <h2>Editar configurações operacionais</h2>
              <label>Tolerância de aceite (minutos)<input name="grace" type="number" min="0" max="1440" required defaultValue={state.grace} /></label>
              {state.clients.map((client, index) => <label key={client.name}>
                Conversa Chatwoot · {client.name}
                <input name={`destination-${index}`} type="url" maxLength={500} defaultValue={client.chatwoot ?? ''} />
              </label>)}
              <button disabled={busy}>Salvar configurações</button>
            </form>}
            {state.canEditSettings && <form className="item-form" onSubmit={event => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void act(async () => {
                await request('/clients', { name: data.get('name'), url: data.get('url') });
                form.reset();
              }, 'Cliente cadastrado.');
            }}>
              <h2>Cadastrar cliente</h2>
              <label>Nome do cliente<input name="name" maxLength={100} required /></label>
              <label>Conversa Chatwoot (opcional)<input name="url" type="url" maxLength={500} /></label>
              <button disabled={busy}>Cadastrar cliente</button>
            </form>}
            <p>A escala e as credenciais das integrações são administradas no servidor.</p>
            {feedback && <p role="status" className="notice">{feedback}</p>}
          </> : <p>Carregando configurações…</p>}
        </section> : view === 'Histórico e turnos' ? <section className="content settings" aria-label="Histórico de turnos">
          {state?.handovers.length ? <ul className="turn-history">{state.handovers.map(entry => <li key={entry.id}>
            <button className="secondary" onClick={() => select(entry.id)}>{format(entry.starts_at)}</button>
            <span>{entry.accepted_at ? `Aceita por ${entry.accepted_by}` : entry.published_at ? 'Aguardando aceite' : 'Rascunho'}</span>
          </li>)}</ul> : <p>{state ? 'Nenhuma passagem registrada.' : 'Carregando turnos…'}</p>}
        </section> : <div className="layout">
          <aside>
            <h2>Turnos</h2>
            <form onSubmit={create}>
              <label htmlFor="starts">Início do turno de entrada (Brasília)</label>
              <input id="starts" type="datetime-local" required value={startsAt} onChange={e => setStartsAt(e.target.value)} />
              <button disabled={busy || !state}>Criar passagem</button>
            </form>
            {state?.handovers.length ? <button className="secondary history-link" onClick={() => setView('Histórico e turnos')}>Ver histórico de turnos</button> : null}
          </aside>
          <section className="content" aria-label="Passagem selecionada">
            {error && <p role="alert" className="error">{error}</p>}
            {feedback && <p role="status" className="notice">{feedback}</p>}
            {!handover && <p>{!state ? 'Carregando…' : selected ? 'Passagem não encontrada.' : 'Crie uma passagem para iniciar o acompanhamento do NOC Telco.'}</p>}
            {handover && <>
              <div className="heading"><div><h2>NOC Telco</h2><p>Turno de entrada · {format(handover.starts_at)}</p></div><span className={overdue && !handover.accepted_at ? 'badge late' : 'badge'}>{label}</span></div>
              {handover.published_at && <p>Publicada por {handover.published_by} em {format(handover.published_at)}.</p>}
              {handover.accepted_at && <p>Aceita por {handover.accepted_by} em {format(handover.accepted_at)}.{handover.caveat && ` Ressalva: ${handover.caveat}`}</p>}
              {handover.published_at && <p className="teams">
                Teams · {({ submitted: 'solicitação recebida', disabled: 'webhook não configurado', failed: 'falha no webhook', sending: 'solicitando envio', pending: 'pendente' } as Record<string, string>)[handover.teams_status]}
                {retryTeams && <button className="secondary" disabled={busy} onClick={() => void act(() => request(`/handovers/${handover.id}/teams`, {}), 'Estado do Teams atualizado.')}>Tentar notificar</button>}
              </p>}
              {latest && !handover.published_at && <div className="actions">
                <button disabled={busy || Boolean(form)} onClick={() => void act(() => request(`/handovers/${handover.id}/publish`, { actor, revision: handover.draft_revision }), 'Passagem publicada.')}>Publicar passagem</button>
                <button className="secondary" disabled={busy || Boolean(form)} onClick={() => void act(async () => {}, 'Passagem atualizada.')}>Atualizar passagem</button>
              </div>}
              {handover.published_at && !handover.accepted_at && canAccept && <form className="accept" onSubmit={e => {
                e.preventDefault();
                void act(() => request(`/handovers/${handover.id}/accept`, { actor, caveat }), 'Aceite registrado.');
              }}>
                <label>Ressalva (opcional)<textarea value={caveat} maxLength={1000} onChange={e => setCaveat(e.target.value)} /></label>
                <button disabled={busy}>Aceitar passagem</button>
              </form>}
              <div className="heading list-title"><h2>Incidentes Telco</h2>{editable && <button className="secondary" onClick={() => {
                setJiraIssue(undefined);
                setForm({ id: null, details: { ...blank, client: state?.clients[0]?.name ?? '' } });
              }}>Adicionar pendência</button>}</div>
              {!!items?.length && <div className="queue-filters">
                <label>Buscar pendências<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Chamado, cliente, circuito ou ação" /></label>
                <label>Prioridade<select value={severity} onChange={e => setSeverity(e.target.value)}>
                  <option value="">Todas</option>{['P0', 'P1', 'P2', 'P3'].map(value => <option key={value}>{value}</option>)}
                </select></label>
                {editable && handover.accepted_at && <label className="check"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> Mostrar concluídas</label>}
              </div>}
              {form && editable && <form className="item-form" onSubmit={event => {
                event.preventDefault();
                void act(async () => {
                  await request(`/handovers/${handover.id}/items`, { ...form, actor });
                  setForm(undefined);
                }, 'Pendência salva.');
              }}>
                <h3>{form.id ? 'Editar pendência' : 'Nova pendência'}</h3>
                <label>Cliente<select value={form.details.client} onChange={e => setField('client', e.target.value)}>{state?.clients.map(client => <option key={client.name}>{client.name}</option>)}</select></label>
                <label>Chamado(s) Jira · chave ou link<input required maxLength={250} value={form.details.jira} onChange={e => {
                  setJiraIssue(undefined);
                  setField('jira', e.target.value);
                }} /></label>
                {state?.jiraEnabled && <div className="actions"><button type="button" className="secondary" disabled={busy || !form.details.jira.trim()} onClick={() => void act(async () => {
                  setJiraIssue(await request('/jira/lookup', { reference: form.details.jira }));
                }, 'Chamado consultado.')}>Consultar Jira</button>
                  {jiraIssue && <a href={jiraIssue.url} target="_blank" rel="noreferrer">{jiraIssue.key} · {jiraIssue.status} · {jiraIssue.summary}</a>}
                </div>}
                <label>Última atualização<textarea required maxLength={1500} value={form.details.update} onChange={e => setField('update', e.target.value)} /></label>
                <label>Próxima ação<textarea required maxLength={600} value={form.details.next} onChange={e => setField('next', e.target.value)} /></label>
                <div className="queue-filters">
                  <label>Circuito<input maxLength={120} value={form.details.circuit ?? ''} onChange={e => setField('circuit', e.target.value)} /></label>
                  <label>Prioridade<select value={form.details.severity ?? ''} onChange={e => setField('severity', (e.target.value || undefined) as Details['severity'])}>
                    <option value="">A definir</option>{['P0', 'P1', 'P2', 'P3'].map(value => <option key={value}>{value}</option>)}
                  </select></label>
                </div>
                <label>Horário de acompanhamento<input maxLength={120} value={form.details.followUp} onChange={e => setField('followUp', e.target.value)} /></label>
                <label className="check"><input type="checkbox" checked={form.details.open} onChange={e => setField('open', e.target.checked)} /> Pendência aberta</label>
                <label className="check"><input type="checkbox" checked={form.details.share} onChange={e => setField('share', e.target.checked)} /> Incluir no recorte para o cliente</label>
                {form.details.share && <label>Atualização e próximo passo para o cliente<textarea required maxLength={1000} value={form.details.external} onChange={e => setField('external', e.target.value)} /></label>}
                <div className="actions"><button disabled={busy}>Salvar</button><button type="button" className="secondary" onClick={() => setForm(undefined)}>Cancelar</button></div>
              </form>}
              {[...visibleClients.values()].map(client => {
                const group = filtered?.filter(item => item.details.client === client.name) ?? [];
                const canCopy = handover.snapshot?.some(item => item.details.client === client.name && item.details.share);
                if (!group.length && (term || severity || !canCopy)) return null;
                return <section key={client.name} className="client"><div className="heading"><h3>{client.name}</h3>{canCopy && <button className="secondary" onClick={() => copyText(client)}>Preparar mensagem</button>}</div>
                  {group.map(item => <article key={item.id} className="incident">
                    <div className="heading"><h4>{item.details.jira}</h4>{editable && <button className="secondary" onClick={() => { setJiraIssue(undefined); setForm(item); }}>Editar</button>}</div>
                    {(item.details.severity || item.details.circuit) && <p>{[item.details.severity, item.details.circuit].filter(Boolean).join(' · ')}</p>}
                    <p>{item.details.update}</p><p><strong>Próxima ação</strong> · {item.details.next}</p>
                    {item.details.followUp && <p>Acompanhar · {item.details.followUp}</p>}
                    {!item.details.open && <p>Concluída</p>}
                    <details><summary>Histórico da pendência</summary>
                      <ul>{state?.history.filter(entry => entry.item_id === item.id).map(entry => <li key={entry.id}>{format(entry.created_at)} · {entry.actor} · {entry.details.update} · {entry.details.next}</li>)}</ul>
                    </details>
                    {handover.snapshot?.some(entry => entry.id === item.id) && <details>
                      <summary>Esclarecimentos</summary>
                      {state?.comments.filter(entry => entry.handover_id === handover.id && entry.item_id === item.id).map(entry => <p key={entry.id}><strong>{entry.actor}</strong> · {entry.body}</p>)}
                      <form onSubmit={event => {
                        event.preventDefault();
                        const target = event.currentTarget;
                        const body = new FormData(target).get('comment');
                        void act(async () => {
                          await request(`/handovers/${handover.id}/comments`, { actor, itemId: item.id, body });
                          target.reset();
                        }, 'Esclarecimento registrado.');
                      }}><label>Pergunta ou resposta<textarea name="comment" required maxLength={1000} /></label><button disabled={busy}>Registrar</button></form>
                    </details>}
                  </article>)}
                </section>;
              })}
              {!items?.length && <p>Sem pendências nesta passagem.</p>}
              {!!items?.length && !filtered?.length && <p>Nenhuma pendência encontrada.</p>}
              {preview && <section className="item-form"><h3>Mensagem para {preview.client.name}</h3><textarea readOnly aria-label="Texto para copiar" value={preview.text} rows={8} />
                <div className="actions"><button onClick={async () => {
                  setError('');
                  try {
                    await navigator.clipboard.writeText(preview.text);
                    setFeedback('Texto copiado. Cole na conversa do cliente no Chatwoot.');
                  } catch {
                    setError('Selecione o texto da prévia e copie manualmente.');
                  }
                }}>Copiar passagem do cliente</button>
                {preview.client.chatwoot && <>
                  <button className="secondary" onClick={() => void prepareChatwoot()}>Abrir e preencher no Chatwoot</button>
                  <a href={preview.client.chatwoot} target="_blank" rel="noreferrer">Abrir conversa</a>
                </>}</div>
              </section>}
            </>}
          </section>
        </div>}
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
