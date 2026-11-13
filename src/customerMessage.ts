type ShareableItem = {
  details: { client: string; share: boolean; jira: string; external: string };
};

export function customerMessage(client: string, shift: string, items: ShareableItem[]) {
  const entries = items
    .filter(({ details }) => details.client === client && details.share)
    .map(({ details }) => `*${details.jira}*\n${details.external}`);
  if (!entries.length) return '';
  return [`📡 *${client} | Pendências Telco*`, `Turno de entrada · ${shift}`, ...entries].join('\n\n');
}
