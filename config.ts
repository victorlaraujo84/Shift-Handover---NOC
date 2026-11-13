import { readFileSync } from 'node:fs';
import { z } from 'zod';

const client = z.object({
  name: z.string().trim().min(1).max(100),
  chatwoot: z.url({ protocol: /^https$/ }).optional(),
});
const configSchema = z.object({
  clients: z.array(client).min(1),
  analysts: z.array(z.object({
    subject: z.string().min(1),
    name: z.string().min(1),
    startsAt: z.array(z.iso.datetime({ offset: true })),
  })).default([]),
}).refine(config => new Set(config.clients.map(entry => entry.name)).size === config.clients.length &&
  new Set(config.analysts.map(entry => entry.subject)).size === config.analysts.length);

const authMode = z.enum(['local', 'proxy']).parse(process.env.HANDOVER_AUTH_MODE || 'local');
export const shared = authMode === 'proxy';
const file = process.env.HANDOVER_CONFIG_FILE;
if (shared && (!file || !process.env.DATABASE_URL?.trim() || !process.env.PUBLIC_BASE_URL)) {
  throw new Error('O modo proxy exige HANDOVER_CONFIG_FILE, DATABASE_URL e PUBLIC_BASE_URL.');
}
export const config = configSchema.parse(file ? JSON.parse(readFileSync(file, 'utf8')) : {
  clients: [{ name: 'Cliente X' }, { name: 'Cliente Y' }],
});
export const publicOrigin = shared ? z.url({ protocol: /^https$/ }).parse(process.env.PUBLIC_BASE_URL) : undefined;
if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin.replace(/\/$/, '')) {
  throw new Error('PUBLIC_BASE_URL deve ser a origem HTTPS do aplicativo.');
}
export const proxyToken = process.env.HANDOVER_PROXY_TOKEN;
if (shared && (!proxyToken || proxyToken.length < 32 || !config.analysts.length)) {
  throw new Error('Configure HANDOVER_PROXY_TOKEN e os analistas autorizados.');
}
