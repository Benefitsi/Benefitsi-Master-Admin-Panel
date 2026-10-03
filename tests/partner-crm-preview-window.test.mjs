import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTypescript } from './helpers/load-typescript.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/partner-crm/audience-preview-v1.json', import.meta.url)));
const { parseCrmAudiencePreview } = loadTypescript('lib/partners/crm.ts');
const parse = value => parseCrmAudiencePreview(value, fixture.partner_id, 'comeback', { inactivity_days: 30 });
const fractional = (value, fraction) => value.replace('+00:00', `.${fraction}+00:00`);
for (const boundary of ['from', 'to']) for (const fraction of ['001', '000001']) {
  test(`exact Berlin preview window rejects ${boundary} fraction .${fraction}`, () => {
    const value = structuredClone(fixture);
    value.window[boundary] = fractional(value.window[boundary], fraction);
    assert.throws(() => parse(value), error => error.code === 'invalid');
  });
}
test('exact Berlin preview window accepts zero fractions and keeps as_of microseconds', () => {
  for (const fraction of ['', '0', '000', '000000']) {
    const value = structuredClone(fixture);
    if (fraction) for (const boundary of ['from', 'to']) value.window[boundary] = fractional(value.window[boundary], fraction);
    value.as_of = '2026-10-03T10:00:00.000001+00:00';
    const result = parse(value);
    assert.equal(result.as_of, '2026-10-03T10:00:00.000001+00:00');
    assert.equal(result.window.from, value.window.from);
    assert.equal(result.window.to, value.window.to);
    assert.equal(result.audience.value, 12);
  }
  const berlin = structuredClone(fixture);
  berlin.window.from = '2025-10-03T00:00:00.000000+02:00';
  berlin.window.to = '2026-10-03T00:00:00.000000+02:00';
  assert.equal(parse(berlin).window.to, '2026-10-03T00:00:00.000000+02:00');
  const utc = structuredClone(fixture);
  utc.window.from = '2025-10-02T22:00:00.000000Z';
  utc.window.to = '2026-10-02T22:00:00.000000Z';
  assert.equal(parse(utc).window.from, '2025-10-02T22:00:00.000000Z');
});
