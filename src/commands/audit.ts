import { Command } from 'commander';
import chalk from 'chalk';
import { listAudit, type AuditRow } from '../lib/api.js';
import { fail } from '../lib/output.js';

/** Render audit rows as a fixed-width table. Pure — the testable seam. */
export function formatAuditTable(rows: AuditRow[]): string {
  if (rows.length === 0) return 'No audit entries.';
  const header = ['WHEN', 'ACTOR', 'ACTION'];
  const lines = rows.map((r) => [
    r.createdAt ?? '',
    `${r.actorType ?? '?'}:${r.actorId ?? '?'}`,
    r.action ?? '',
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...lines.map((l) => (l[i] ?? '').length)),
  );
  const pad = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  return [pad(header), ...lines.map(pad)].join('\n');
}

export const audit = new Command('audit')
  .description('Show recent audit-log entries')
  .option('--limit <n>', 'max rows to fetch', (v) => parseInt(v, 10))
  .action(async (opts: { limit?: number }) => {
    try {
      const rows = await listAudit(opts.limit);
      console.log(formatAuditTable(rows));
    } catch (e) {
      fail(e);
    }
  });
