process.env.TZ = 'Asia/Phnom_Penh';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { datetimeLocalToIso, isoToDatetimeLocal } from '../lib/datetimeLocal';

const VIEW = fileURLToPath(new URL('../components/views/PromotionsAdminView.tsx', import.meta.url));

test('timezone is UTC+7 so a UTC/local mix-up would be visible', () => {
  assert.equal(new Date('2026-11-15T10:00:00Z').getHours(), 17);
});

test('iso -> datetime-local shows wall-clock local time', () => {
  assert.equal(isoToDatetimeLocal('2026-11-15T10:00:00Z'), '2026-11-15T17:00');
  assert.equal(isoToDatetimeLocal('2026-12-31T20:30:00Z'), '2027-01-01T03:30');
});

test('edit round-trip does not shift the campaign period', () => {
  for (const iso of ['2026-11-15T10:00:00.000Z', '2026-02-28T23:45:00.000Z', '2027-06-01T00:00:00.000Z']) {
    assert.equal(datetimeLocalToIso(isoToDatetimeLocal(iso)), iso);
  }
});

test('empty and invalid values are handled', () => {
  assert.equal(isoToDatetimeLocal(null), '');
  assert.equal(isoToDatetimeLocal(undefined), '');
  assert.equal(isoToDatetimeLocal('not-a-date'), '');
  assert.equal(datetimeLocalToIso(''), null);
  assert.equal(datetimeLocalToIso('garbage'), null);
});

test('promotion view uses the local-time helpers and requires an end date', () => {
  const src = readFileSync(VIEW, 'utf8');
  assert.ok(!/toISOString\(\)\.slice\(0,\s*16\)/.test(src), 'UTC slice must not feed datetime-local inputs');
  assert.ok(src.includes('isoToDatetimeLocal(p.startsAt)'));
  assert.ok(src.includes('isoToDatetimeLocal(p.endsAt)'));
  assert.ok(src.includes("{t('promos.fieldEnds')} *"));
  assert.ok(/!form\.startsAt \|\| !form\.endsAt\) \{/.test(src));
});
