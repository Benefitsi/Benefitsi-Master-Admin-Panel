import assert from 'node:assert/strict'
import test from 'node:test'
import { publicationFixture } from './microsite-publication-cache.test.mjs'
import { createDefaultMicrositeConfig } from '../lib/microsites.ts'
import { createPublicMicrositeSnapshot, publicMicrositePublishBlockers, publicMicrositeUrl } from '../lib/public-microsite-contract.ts'
const config = () => createDefaultMicrositeConfig({ name: 'Synthetic BEN61', slug: 'ben61' }, 'restaurant-premium')

test('real Admin publication stores a versioned projection while keeping editable config', async () => {
  const c = config(); c.hero.headline = 'Actual producer BEN61'; c.builder.versionNote = 'private note'
  const f = publicationFixture()
  assert.equal((await f.save('publish', { existing_config: JSON.stringify(c) })).ok, true)
  const written = f.writes.find(w => w.table === 'microsite_versions').payload.config
  assert.equal(written.hero.headline, c.hero.headline)
  assert.equal(written.publicSnapshot.version, 1)
  assert.equal(written.publicSnapshot.hero.headline, c.hero.headline)
  assert.equal(written.builder.versionNote, 'private note')
  assert.ok(!JSON.stringify(written.publicSnapshot).includes('private note'))
})
test('oversized editable config cannot replace a public pointer but remains saveable as draft', async () => {
  for (const note of ['x'.repeat(1048577), 'ä'.repeat(530000)]) {
    const c = config(); c.builder.versionNote = note
    const f = publicationFixture()
    const result = await f.save('publish', { existing_config: JSON.stringify(c) })
    assert.equal(result.ok, false)
    assert.match(result.message, /zu groß|zu umfangreich/i)
    assert.equal(f.writes.length, 0)
    assert.equal(f.invalidations.length, 0)
    assert.equal(f.microsite.published_version_id, 'version-old')
    assert.equal((await f.save('draft', { existing_config: JSON.stringify(c) })).ok, true)
    assert.equal(f.writes.find(w => w.table === 'microsite_versions').payload.config.builder.versionNote, note)
  }
})
test('publication size budget reserves database JSON formatting overhead', async () => {
  const c = config(); c.hero.headline = 'Synthetic restaurant'
  const baseBytes = Buffer.byteLength(JSON.stringify({ ...c, publicSnapshot: createPublicMicrositeSnapshot(c) }), 'utf8')
  c.builder.versionNote = 'x'.repeat(1048576 - baseBytes - 50)
  const f = publicationFixture()
  const result = await f.save('publish', { existing_config: JSON.stringify(c) })
  assert.equal(result.ok, false, 'compact JSON bytes alone must not qualify a near-limit publication')
  assert.equal(f.writes.length, 0)
})
test('unsupported editable template/field blocks publish before writes but allows draft', async () => {
  for (const change of [c => c.template = 'salon-studio', c => c.template = 'future-unknown-template', c => c.elementText['content.appDownloadUrl'] = 'https://example.org/custom-app', c => c.elementStyles['unimplemented.layout'] = { height: 420 }]) {
    const c = config(); change(c)
    const f = publicationFixture()
    const published = await f.save('publish', { existing_config: JSON.stringify(c) })
    assert.equal(published.ok, false)
    assert.match(published.message, /Template|Text-\/Medienfeld|Layoutfeld/)
    assert.equal(f.writes.length, 0)
    assert.equal(f.invalidations.length, 0)
    assert.equal((await f.save('draft', { existing_config: JSON.stringify(c) })).ok, true)
  }
})
test('unused private default metadata never blocks a supported publication', () => {
  const c = config(); c.builder.versionNote = 'private'; c.printables.headline = 'Poster only'
  c.assets.library.push({ id: 'unused', label: 'unused', url: 'https://user:secret@private.example.org', role: 'other', source: 'upload' })
  assert.deepEqual(publicMicrositePublishBlockers(c), [])
  const p = createPublicMicrositeSnapshot(c)
  assert.ok(!Object.hasOwn(p, 'assets') && !Object.hasOwn(p, 'builder') && !Object.hasOwn(p, 'printables'))
})
test('unsafe public media is rejected before publish and stripped from compatibility projection', async () => {
  for (const url of ['javascript:alert(1)', '//user:secret@example.org/a.jpg', 'https://user:secret@example.org/a.jpg', 'https://example.org/a.jpg?token=private', '/media/image.jpg?token=private']) {
    assert.equal(publicMicrositeUrl(url, 'asset'), '')
    const c = config(); c.hero.backgroundImageUrl = url
    const f = publicationFixture()
    assert.equal((await f.save('publish', { existing_config: JSON.stringify(c) })).ok, false)
    assert.equal(f.writes.length, 0)
    assert.equal(createPublicMicrositeSnapshot(c).hero.backgroundImageUrl, '')
  }
})


test('capability gate identifies unsupported visible styling/icons and ignores empty style placeholders', () => {
  const c = config(); c.elementStyles['unimplemented.layout'] = { fontSize: undefined };
  assert.deepEqual(publicMicrositePublishBlockers(c), []);
  c.elementStyles['seo.title'] = { fontSize: 20 };
  c.hero.services[0].icon = 'unsupported-icon';
  const blockers = publicMicrositePublishBlockers(c).join(';');
  assert.match(blockers, /seo.title/); assert.match(blockers, /hero.services.0.icon/);
});

test('enabled populated embedded feed is a concrete publish blocker; unused or disabled feed is not', async () => {
  const c = config(); c.elementText['content.socialFeed.enabled'] = 'true'
  assert.deepEqual(publicMicrositePublishBlockers(c), [])
  c.elementText['content.socialFeed.instagram.0.url'] = 'https://instagram.com/p/ben61'
  const f = publicationFixture()
  const result = await f.save('publish', { existing_config: JSON.stringify(c) })
  assert.equal(result.ok, false); assert.match(result.message, /content.socialFeed.instagram.0.url/)
  assert.equal(f.writes.length, 0)
  c.elementText['content.socialFeed.enabled'] = 'false'
  assert.equal((await f.save('publish', { existing_config: JSON.stringify(c) })).ok, true)
})
