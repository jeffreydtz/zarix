import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import AccountCards from '@/components/dashboard/AccountCards';
import RecentTransactions from '@/components/dashboard/RecentTransactions';

// Real frozen components, React, Framer Motion, hooks and Next Link. No mocks,
// network, Auth, DB, fixture recreation or assertion about browser visibility.
const here = path.dirname(fileURLToPath(import.meta.url));
const copy = '/tmp/zarix-app-empty-account-20261015';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const reportBytes = fs.readFileSync(path.join(here, '../attempt-2/verification.json'));
const actual = JSON.parse(reportBytes.toString());
const manifest = JSON.parse(fs.readFileSync(path.join(here, '../attempt-2/manifest.json'), 'utf8'));
const build = JSON.parse(fs.readFileSync('/tmp/zarix-runtime-20261015/empty-proof-build-proof.json', 'utf8'));
const componentSources = ['components/dashboard/AccountCards.tsx', 'components/dashboard/RecentTransactions.tsx', 'app/(authenticated)/dashboard/page.tsx'];

describe('CP3-07 composed actual empty dashboard observations plus real frozen empty-component SSR', () => {
  it('preserves the actual empty request, all15 observed assertions and exact frozen component wiring', () => {
    expect(hash(reportBytes)).toBe(manifest.reportSha256);
    const phase = actual.cases.find((row: { case_id: string }) => row.case_id === 'CP3-07');
    expect(phase.status).toBe('FAIL'); // Preserve the dynamic Flight parser failure.
    expect(phase.failure.location).toBe('ssr-contracts.mjs:46:10');
    expect(phase.assertions).toHaveLength(15);
    expect(phase.assertions.every((row: { status: string }) => row.status === 'PASS')).toBe(true);
    expect(phase.assertions.find((row: { name: string }) => row.name === 'CP3-07 literal absence includes archived accounts and all own history/positions')?.actual).toEqual({ accounts: 0, transactions: 0, investments: 0 });
    expect(phase.assertions.find((row: { name: string }) => row.name === 'CP3-07 actual server returned no invented historic points')?.actual).toEqual([]);
    expect(actual.sourceStable).toBe(true);
    expect(actual.acceptanceGuardsSatisfied).toBe(true);
    expect(actual.binding.revision).toBe('84df929ab2f169251a49f3e95d0e0c148dfcb87c');
    expect(build.revision).toBe(actual.binding.revision);
    expect(build.buildId).toBe(actual.binding.buildId);
    for (const source of componentSources) expect(hash(fs.readFileSync(path.join(copy, source)))).toBe(build.sources.find((row: { path: string }) => row.path === source)?.sha256);
    const page = fs.readFileSync(path.join(copy, componentSources[2]), 'utf8');
    expect(page).toContain("dynamic(() => import('@/components/dashboard/AccountCards')");
    expect(page).toContain("dynamic(() => import('@/components/dashboard/RecentTransactions')");
    expect(page).toContain('<AccountCards accounts={accounts} />');
    expect(page).toContain('<RecentTransactions transactions={recentTransactions} />');
  });
  it('renders the real empty accounts explanation and CU002 create-account help', () => {
    const html = renderToStaticMarkup(createElement(AccountCards, { accounts: [] }));
    expect(text(html)).toContain('No tenés cuentas todavía');
    expect(html).toMatch(/<a\b[^>]*href="\/accounts"[^>]*>\s*Crear cuenta\s*<\/a>/);
    expect(html).not.toMatch(/href="\/accounts\/[a-f0-9-]+"/);
    fs.writeFileSync(path.join(here, 'account-cards-empty.html'), html + '\n');
  });
  it('renders the real empty movements explanation and CU001 expense-registration help', () => {
    const html = renderToStaticMarkup(createElement(RecentTransactions, { transactions: [] }));
    expect(text(html)).toContain('No tenés movimientos todavía');
    expect(text(html)).toContain('Usá el bot de Telegram para registrar gastos');
    expect(html).not.toContain('/expenses/');
    fs.writeFileSync(path.join(here, 'recent-transactions-empty.html'), html + '\n');
  });
});
