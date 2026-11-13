import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { z, ZodError } from 'zod';
import { createServer as createViteServer } from 'vite';
import { config, proxyToken, publicOrigin, shared } from './config.js';
import { proxyIdentity } from './proxyIdentity.js';

const connectionString = process.env.DATABASE_URL?.trim();
const pool = connectionString ? new pg.Pool({ connectionString }) : undefined;
const local = pool ? undefined : new PGlite(process.env.PGLITE_DATA_DIR || './.handover-data');
const grace = z.coerce.number().int().min(0).max(1440).parse(process.env.ACCEPTANCE_GRACE_MINUTES ?? 15);
const port = z.coerce.number().int().min(0).max(65535).parse(process.env.PORT ?? 3000);

async function query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = pool ? await pool.query(sql, values) : await local!.query(sql, values);
  return result.rows as T[];
}

await query(`
  CREATE TABLE IF NOT EXISTS handovers (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    starts_at timestamptz NOT NULL UNIQUE,
    published_at timestamptz,
    published_by text,
    snapshot jsonb,
    accepted_at timestamptz,
    accepted_by text,
    caveat text,
    teams_status text NOT NULL DEFAULT 'pending',
    teams_attempted_at timestamptz
  )
`);
await query('ALTER TABLE handovers ADD COLUMN IF NOT EXISTS teams_attempted_at timestamptz');
await query('ALTER TABLE handovers ADD COLUMN IF NOT EXISTS draft_revision integer NOT NULL DEFAULT 0');
await query(`CREATE TABLE IF NOT EXISTS operational_settings (
  singleton boolean PRIMARY KEY CHECK (singleton),
  grace integer NOT NULL CHECK (grace BETWEEN 0 AND 1440),
  destinations jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0
)`);
await query(`
  CREATE TABLE IF NOT EXISTS items (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    details jsonb NOT NULL
  )
`);
await query(`
  CREATE TABLE IF NOT EXISTS item_history (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id integer NOT NULL REFERENCES items(id),
    handover_id integer NOT NULL REFERENCES handovers(id),
    actor text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    details jsonb NOT NULL
  )
`);
await query(`
  CREATE TABLE IF NOT EXISTS comments (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    handover_id integer NOT NULL REFERENCES handovers(id),
    item_id integer NOT NULL REFERENCES items(id),
    actor text NOT NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`);

const app = express();
const jiraBase = process.env.JIRA_BASE_URL?.replace(/\/+$/, '');
const jiraToken = process.env.JIRA_API_TOKEN;
const jiraEmail = process.env.JIRA_EMAIL;
const jiraProjects = new Set((process.env.JIRA_PROJECTS || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean));
const jiraEnabled = Boolean(jiraBase && jiraToken && jiraProjects.size);
if (jiraBase) z.url({ protocol: /^https$/ }).parse(jiraBase);
app.use((req, res, next) => {
  const hostname = req.hostname;
  if (!shared && hostname !== '127.0.0.1' && hostname !== 'localhost') {
    return res.status(403).json({ error: 'O piloto está disponível somente no computador local.' });
  }
  const origin = req.get('origin');
  const expectedOrigin = publicOrigin ? new URL(publicOrigin).origin : `http://${req.get('host')}`;
  if (req.method === 'POST' && origin && origin !== expectedOrigin) {
    return res.status(403).json({ error: 'Origem diferente da aplicação local.' });
  }
  next();
});
if (shared) app.use(proxyIdentity(proxyToken!, config.analysts));
app.use(express.json({ limit: '32kb' }));
// Perfis de demonstração. Este servidor é restrito a loopback até integrar o SSO.
const actor = z.enum(['Analista de saída', 'Analista de entrada']);
function author(req: express.Request, res: express.Response): string {
  return shared ? res.locals.analyst.name : actor.parse(req.body.actor);
}
const id = z.coerce.number().int().positive();
const item = z.object({
  client: z.string().refine(name => config.clients.some(entry => entry.name === name), 'Selecione um cliente cadastrado.'),
  jira: z.string().trim().min(1).max(250),
  severity: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
  circuit: z.string().trim().max(120).optional(),
  update: z.string().trim().min(1).max(1500),
  next: z.string().trim().min(1).max(600),
  followUp: z.string().trim().max(120),
  external: z.string().trim().max(1000),
  share: z.boolean(),
  open: z.boolean(),
}).refine(value => !value.share || value.external.length > 0, {
  message: 'Preencha a mensagem para o cliente antes de compartilhar.',
});

const settingsInput = z.object({
  grace: z.number().int().min(0).max(1440),
  revision: z.number().int().nonnegative(),
  destinations: z.array(z.object({
    name: z.string(),
    url: z.string().trim().max(500).refine(value => {
      if (!value) return true;
      const url = URL.parse(value);
      return !!url && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
        /^\/app\/accounts\/\d+\/(?:inbox\/\d+\/)?conversations\/\d+\/?$/.test(url.pathname);
    }, 'Use o endereço HTTPS completo da conversa no Chatwoot.'),
  })).max(config.clients.length),
}).refine(value => new Set(value.destinations.map(entry => entry.name)).size === config.clients.length &&
  value.destinations.every(entry => config.clients.some(client => client.name === entry.name)),
  'A lista de clientes mudou. Atualize a página.');

app.post('/api/settings', async (req, res) => {
  if (shared && !res.locals.analyst.admin) return res.status(403).json({ error: 'Apenas administradores podem editar configurações.' });
  const values = settingsInput.parse(req.body);
  const rows = await query(`
    INSERT INTO operational_settings (singleton, grace, destinations, revision)
    SELECT true, $1, $2::jsonb, 1
    WHERE $3::integer = 0 OR EXISTS (SELECT 1 FROM operational_settings)
    ON CONFLICT (singleton) DO UPDATE SET grace = EXCLUDED.grace,
      destinations = EXCLUDED.destinations, revision = operational_settings.revision + 1
    WHERE operational_settings.revision = $3 RETURNING revision
  `, [values.grace, JSON.stringify(Object.fromEntries(values.destinations.map(entry => [entry.name, entry.url]))), values.revision]);
  if (!rows.length) return res.status(409).json({ error: 'As configurações mudaram. Recarregue a página antes de salvar.' });
  res.json(rows[0]);
});

app.get('/api/state', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const handovers = await query('SELECT * FROM handovers ORDER BY starts_at DESC');
  const items = await query('SELECT id, details FROM items ORDER BY id');
  const history = await query('SELECT * FROM item_history ORDER BY id DESC');
  const comments = await query('SELECT * FROM comments ORDER BY id');
  const analyst = res.locals.analyst;
  const [settings] = await query<{ grace: number; destinations: Record<string, string>; revision: number }>(
    'SELECT grace, destinations, revision FROM operational_settings');
  const clients = config.clients.map(client => ({
    ...client, chatwoot: (settings && Object.hasOwn(settings.destinations, client.name)
      ? settings.destinations[client.name] : client.chatwoot) || undefined,
  }));
  res.json({ handovers, items, history, comments, grace: settings?.grace ?? grace, clients, jiraEnabled,
    settingsRevision: settings?.revision ?? 0, canEditSettings: !shared || Boolean(analyst?.admin),
    teamsEnabled: Boolean(process.env.TEAMS_WEBHOOK_URL?.trim()),
    analyst: analyst ? { name: analyst.name, startsAt: analyst.startsAt } : null });
});

app.post('/api/jira/lookup', async (req, res) => {
  if (!jiraEnabled) return res.status(503).json({ error: 'Consulta Jira não configurada.' });
  const reference = z.string().trim().max(250).parse(req.body.reference);
  const key = /^(?:[A-Z][A-Z0-9_]*-\d+)$/i.test(reference)
    ? reference.toUpperCase()
    : reference.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)(?:[?#].*)?$/i)?.[1].toUpperCase();
  if (!key) return res.status(400).json({ error: 'Informe a chave ou o link de um único chamado.' });
  if (!jiraProjects.has(key.split('-')[0])) return res.status(403).json({ error: 'Projeto Jira fora da lista autorizada.' });
  try {
    const version = jiraEmail ? 3 : 2;
    const authorization = jiraEmail
      ? 'Basic ' + Buffer.from(jiraEmail + ':' + jiraToken).toString('base64')
      : 'Bearer ' + jiraToken;
    const response = await fetch(`${jiraBase}/rest/api/${version}/issue/${key}?fields=summary,status`, {
      headers: { accept: 'application/json', authorization }, redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return res.status(404).json({ error: 'Chamado ausente ou indisponível para a conta Jira.' });
    if (!response.ok) return res.status(502).json({ error: 'O Jira recusou a consulta. Confira as credenciais e o projeto.' });
    const issue = z.object({ fields: z.object({ summary: z.string(), status: z.object({ name: z.string() }) }) }).parse(await response.json());
    res.json({ key, url: `${jiraBase}/browse/${key}`, summary: issue.fields.summary, status: issue.fields.status.name });
  } catch {
    res.status(502).json({ error: 'Não foi possível obter os dados do Jira.' });
  }
});

app.post('/api/handovers', async (req, res) => {
  const startsAt = z.iso.datetime().parse(req.body.startsAt);
  const rows = await query(`
    INSERT INTO handovers (starts_at)
    SELECT $1::timestamptz
    WHERE NOT EXISTS (SELECT 1 FROM handovers WHERE starts_at >= $1::timestamptz)
    ON CONFLICT DO NOTHING RETURNING id
  `, [startsAt]);
  if (!rows.length) return res.status(409).json({ error: 'O início precisa ser posterior ao da última passagem criada.' });
  res.status(201).json(rows[0]);
});

app.post('/api/handovers/:handoverId/items', async (req, res) => {
  const handoverId = id.parse(req.params.handoverId);
  const itemId = id.nullable().parse(req.body.id ?? null);
  const name = author(req, res);
  const details = JSON.stringify(item.parse(req.body.details));
  const rows = await query(`
    WITH target AS (
      UPDATE handovers SET draft_revision = draft_revision + 1 WHERE id = $1
        AND (published_at IS NULL OR accepted_at IS NOT NULL)
        AND starts_at = (SELECT max(starts_at) FROM handovers)
      RETURNING id
    ), inserted AS (
      INSERT INTO items (details)
      SELECT $3::jsonb FROM target WHERE $2::integer IS NULL
      RETURNING id
    ), updated AS (
      UPDATE items SET details = $3::jsonb
      WHERE id = $2 AND EXISTS (SELECT 1 FROM target)
      RETURNING id
    ), saved AS (
      SELECT id FROM inserted UNION ALL SELECT id FROM updated
    )
    INSERT INTO item_history (item_id, handover_id, actor, details)
    SELECT saved.id, target.id, $4, $3::jsonb FROM saved CROSS JOIN target RETURNING item_id
  `, [handoverId, itemId, details, name]);
  if (!rows.length) return res.status(409).json({ error: 'Esta passagem está aguardando aceite ou já existe um turno mais recente.' });
  res.json(rows[0]);
});

async function notifyTeams(handoverId: number) {
  const webhook = process.env.TEAMS_WEBHOOK_URL?.trim();
  const [entry] = await query<{ starts_at: Date; snapshot: unknown[] }>(`
    UPDATE handovers SET teams_status = $2, teams_attempted_at = now()
    WHERE id = $1 AND published_at IS NOT NULL
      AND (teams_status IN ('pending', 'failed', 'disabled') OR (
        teams_status = 'sending' AND coalesce(teams_attempted_at, '-infinity'::timestamptz) < now() - interval '1 minute'
      ))
    RETURNING starts_at, snapshot
  `, [handoverId, webhook ? 'sending' : 'disabled']);
  if (!entry || !webhook) return;
  let status = 'failed';
  try {
    const url = new URL(`/?passagem=${handoverId}`, process.env.PUBLIC_BASE_URL || `http://localhost:${port}`);
    const date = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
    }).format(new Date(entry.starts_at));
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard', version: '1.2',
            body: [
              { type: 'TextBlock', text: 'Passagem de turno · NOC Telco', weight: 'Bolder' },
              { type: 'TextBlock', text: `${date} · ${entry.snapshot.length} pendência(s) aberta(s)`, wrap: true },
            ],
            actions: [{ type: 'Action.OpenUrl', title: 'Revisar e aceitar', url: url.href }],
          },
        }],
      }),
    });
    if (response.ok) status = 'submitted';
  } catch (error) {
    console.error('Falha ao solicitar notificação no Teams:', error instanceof Error ? error.name : 'Erro');
  }
  await query('UPDATE handovers SET teams_status = $2 WHERE id = $1', [handoverId, status]);
}

app.post('/api/handovers/:handoverId/publish', async (req, res) => {
  const handoverId = id.parse(req.params.handoverId);
  const name = author(req, res);
  const revision = z.number().int().nonnegative().parse(req.body.revision);
  const rows = await query(`
    UPDATE handovers SET published_at = now(), published_by = $2, snapshot = (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'details', details) ORDER BY id), '[]'::jsonb)
      FROM items WHERE details->>'open' = 'true'
    )
    WHERE id = $1 AND published_at IS NULL AND draft_revision = $3
      AND starts_at = (SELECT max(starts_at) FROM handovers)
    RETURNING id
  `, [handoverId, name, revision]);
  if (!rows.length) return res.status(409).json({ error: 'A passagem mudou desde a última consulta. Atualize e revise antes de publicar.' });
  await notifyTeams(handoverId);
  res.json(rows[0]);
});

app.post('/api/handovers/:handoverId/teams', async (req, res) => {
  await notifyTeams(id.parse(req.params.handoverId));
  res.json({ ok: true });
});

app.post('/api/handovers/:handoverId/accept', async (req, res) => {
  const name = author(req, res);
  if (!shared && name !== 'Analista de entrada') {
    return res.status(403).json({ error: 'Selecione o perfil de entrada para testar o aceite.' });
  }
  const handoverId = id.parse(req.params.handoverId);
  const caveat = z.string().trim().max(1000).parse(req.body.caveat ?? '');
  const rows = await query(`
    UPDATE handovers SET accepted_at = now(), accepted_by = $2, caveat = $3
    WHERE id = $1 AND published_at IS NOT NULL AND accepted_at IS NULL
      AND ($4::timestamptz[] IS NULL OR starts_at = ANY($4::timestamptz[])) RETURNING id
  `, [handoverId, name, caveat, shared ? res.locals.analyst.startsAt : null]);
  if (!rows.length) return res.status(409).json({ error: 'A passagem não está disponível para aceite neste perfil ou turno.' });
  res.json(rows[0]);
});

app.post('/api/handovers/:handoverId/comments', async (req, res) => {
  const name = author(req, res);
  const handoverId = id.parse(req.params.handoverId);
  const itemId = id.parse(req.body.itemId);
  const body = z.string().trim().min(1).max(1000).parse(req.body.body);
  const rows = await query(`
    INSERT INTO comments (handover_id, item_id, actor, body)
    SELECT id, $2, $3, $4 FROM handovers
    WHERE id = $1 AND snapshot @> jsonb_build_array(jsonb_build_object('id', $2::integer))
    RETURNING id
  `, [handoverId, itemId, name, body]);
  if (!rows.length) return res.status(404).json({ error: 'Item ausente da passagem publicada.' });
  res.json(rows[0]);
});

app.use('/api', (_req, res) => { res.status(404).json({ error: 'Rota inexistente.' }); });
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return res.status(400).json({ error: error.issues[0]?.message });
  console.error(error);
  res.status(500).json({ error: 'Ocorreu uma falha ao salvar ou carregar os dados.' });
});

if (process.argv.includes('--built')) {
  app.use(express.static('dist'));
} else {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

const server = app.listen(port, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') console.log(`NOC Telco · http://127.0.0.1:${address.port}`);
});
