import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { customerMessage } from '../src/customerMessage.ts';
import { proxyIdentity } from '../proxyIdentity.ts';

const trusted = 'secret-for-local-test-only';
const shift = '2026-11-13T10:00:00Z';
const identify = proxyIdentity(trusted, [{ subject: 'entra:analyst', name: 'Analista NOC', startsAt: [shift] }]);
function identity(headers) {
  const result = { status: 200, locals: {} };
  identify({ get: name => headers[name], body: { actor: 'Admin' } }, {
    locals: result.locals,
    status(code) { result.status = code; return this; },
    json() {},
  }, () => {});
  return result;
}
assert.equal(identity({ 'x-handover-subject': 'entra:analyst' }).status, 403);
assert.equal(identity({ 'x-handover-proxy-token': trusted, 'x-handover-subject': 'unknown' }).status, 403);
assert.deepEqual(identity({ 'x-handover-proxy-token': trusted, 'x-handover-subject': 'entra:analyst' }).locals.analyst,
  { subject: 'entra:analyst', name: 'Analista NOC', startsAt: [shift] });

let base;
const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts', '--built'], {
  env: { ...process.env, PORT: '0', DATABASE_URL: '', TEAMS_WEBHOOK_URL: '', PGLITE_DATA_DIR: 'memory://' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

async function call(path, body, status = 200) {
  const response = await fetch(base + '/api' + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}

try {
  base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Servidor local não iniciou em 45 segundos.')), 45000);
    const lines = createInterface({ input: server.stdout });
    server.once('error', reject);
    server.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Servidor encerrou com código ${code}.`));
    });
    lines.on('line', line => {
      const url = line.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) {
        clearTimeout(timeout);
        resolve(url);
      }
    });
  });
  assert.match(await (await fetch(base)).text(), /Passagem de turno/);
  const original = await call('/state');
  const settings = {
    grace: 0, revision: original.settingsRevision,
    destinations: [{ name: 'Cliente X', url: 'https://app.chatwoot.com/app/accounts/1/conversations/101' }, { name: 'Cliente Y', url: '' }],
  };
  await call('/settings', { ...settings, destinations: [{ name: 'Cliente X', url: 'https://example.com/' }, settings.destinations[1]] }, 400);
  await call('/settings', settings);
  await call('/settings', settings, 409);
  const configured = await call('/state');
  assert.equal(configured.grace, 0);
  assert.equal(configured.clients[0].chatwoot, settings.destinations[0].url);
  const newClient = { name: 'Cliente Z', url: 'https://app.chatwoot.com/app/accounts/1/conversations/103' };
  await call('/clients', newClient, 201);
  await call('/clients', newClient, 409);
  await call('/settings', { ...settings, revision: configured.settingsRevision }, 409);
  assert.equal((await call('/state')).clients.find(client => client.name === newClient.name).chatwoot, newClient.url);
  const outgoing = { actor: 'Analista de saída' };
  const incoming = { actor: 'Analista de entrada', caveat: 'Validar visita' };
  const first = await call('/handovers', { startsAt: '2026-11-13T10:00:00Z' }, 201);
  const route = '/handovers/' + first.id;
  const save = (client, jira) => call(route + '/items', {
    ...outgoing,
    details: { client, jira, update: 'Interno', next: 'Acompanhar', followUp: '', external: client + ' externo', share: true, open: true },
  });
  const item = await save('Cliente X', 'INC-126039');
  await save('Cliente Y', 'INC-135038');
  await save(newClient.name, 'INC-135039');
  await call(route + '/publish', { ...outgoing, revision: 0 }, 409);
  await call(route + '/publish', { ...outgoing, revision: 3 });
  await call(route + '/comments', { ...incoming, itemId: item.item_id, body: 'Qual a data?' });
  const accept = () => fetch(base + '/api' + route + '/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(incoming),
  });
  const results = await Promise.all([accept(), accept()]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  const second = await call('/handovers', { startsAt: '2026-11-13T22:00:00Z' }, 201);
  await call('/handovers/' + second.id + '/publish', { ...outgoing, revision: 0 });
  const state = await call('/state');
  assert.equal(state.handovers[0].snapshot[0].id, item.item_id);
  assert.equal(state.handovers[1].caveat, 'Validar visita');
  assert.equal(state.history.length, 3);
  assert.equal(state.comments.length, 1);
  const message = customerMessage('Cliente X', '13/11/2026 07:00', state.handovers[1].snapshot);
  assert.match(message, /INC-126039\*\nCliente X externo/);
  assert.doesNotMatch(message, /Cliente [YZ]|INC-13503[89]|Interno|Acompanhar/);
  console.log('OK: identidade do proxy, revisão da publicação, esclarecimento, aceite concorrente e continuidade.');
} finally {
  server.kill();
}
