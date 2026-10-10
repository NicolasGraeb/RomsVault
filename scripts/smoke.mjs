// End-to-end checks against the complete running Compose stack. Node 22+, no dependencies.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)] }))
const origin = process.env.TEST_ORIGIN || env.APP_ORIGIN || 'http://localhost:8080'
const keep = process.argv.includes('--keep-fixtures')
const password = 'RomVault-QA-only-2026'
const users = []; const owner = new Map(); const visitor = new Map(); const admin = new Map()
let checks = 0
async function request(endpoint, { jar, method = 'GET', json, body, headers = {}, status = 200 } = {}) {
  const response = await fetch(origin + endpoint, { method, headers: { Origin: origin, ...(jar ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: json ? JSON.stringify(json) : body })
  if (jar) for (const cookie of response.headers.getSetCookie()) { const [pair] = cookie.split(';'); const index = pair.indexOf('='); jar.set(pair.slice(0, index), pair.slice(index + 1)) }
  const data = Buffer.from(await response.arrayBuffer())
  assert.equal(response.status, status, `${method} ${endpoint}: ${data.toString().slice(0, 500)}`)
  return { response, data, json: () => JSON.parse(data.toString()) }
}
function pass(name) { checks++; console.log(`PASS ${name}`) }
const sum = b => createHash('sha256').update(b).digest('hex')
function uploadHeaders(b, filename, key = randomUUID()) { return { 'Idempotency-Key': key, 'X-Filename': encodeURIComponent(filename), 'X-Checksum-SHA256': sum(b), 'Content-Type': 'application/octet-stream' } }

try {
  await request('/health'); pass('all dependencies healthy')
  await request('/api/games', { status: 401 }); pass('anonymous access denied')
  for (const [jar, label] of [[owner, 'owner'], [visitor, 'visitor']]) {
    const email = `qa-${label}-${randomUUID().slice(0, 8)}@example.test`
    const result = await request('/api/auth/register', { jar, method: 'POST', json: { email, password, name: 'Kolekcja testowa' } })
    const u = result.json(); users.push(u); assert.equal(u.role, 'user')
    const cookies = result.response.headers.getSetCookie(); assert(cookies.every(c => c.includes('HttpOnly') && c.includes('SameSite=Lax')))
  }
  pass('registration creates unprivileged users and HttpOnly cookies')
  await request('/api/auth/login', { method: 'POST', json: { email: users[0].email, password: 'incorrect' }, status: 401 }); pass('incorrect password rejected')
  await request('/api/admin/extensions', { jar: owner, method: 'PUT', json: { extension: '.qa', platform: 'QA', enabled: true }, status: 403 }); pass('admin role enforced')
  await request('/api/games', { jar: owner, method: 'POST', headers: { Origin: 'https://evil.example' }, status: 403 }); pass('cross-origin mutations blocked')

  const rom = Buffer.from(`RomVault synthetic QA fixture: ${randomUUID()}\n`)
  const headers = uploadHeaders(rom, 'Test Żółw.iso')
  const first = await request('/api/games', { jar: owner, method: 'POST', body: rom, headers, status: 201 }); const game = first.json()
  assert.equal(game.checksum, sum(rom)); assert.equal(game.size, rom.length); pass('SeaweedFS upload with SHA-256')
  const again = await request('/api/games', { jar: owner, method: 'POST', body: rom, headers }); assert.equal(again.json().id, game.id); assert.equal(again.response.headers.get('Idempotency-Replayed'), 'true'); pass('idempotent replay returns original game')
  await request('/api/games', { jar: owner, method: 'POST', body: rom, headers: { ...headers, 'X-Title': 'changed' }, status: 409 }); pass('idempotency key cannot change payload')
  await request('/api/games', { jar: owner, method: 'POST', body: rom, headers: uploadHeaders(rom, 'duplicate.iso'), status: 409 }); pass('duplicate content blocked')
  const corrupt = Buffer.from('deliberately mismatched content')
  await request('/api/games', { jar: owner, method: 'POST', body: corrupt, headers: { ...uploadHeaders(corrupt, 'corrupt.iso'), 'X-Checksum-SHA256': '0'.repeat(64) }, status: 422 }); pass('checksum mismatch rejected')
  await request('/api/games', { jar: owner, method: 'POST', body: rom, headers: uploadHeaders(rom, 'bad.exe'), status: 415 }); pass('unsupported extension rejected')
  await request(`/api/games/${game.id}/download`, { jar: visitor, status: 404 }); await request(`/api/games/${game.id}`, { jar: visitor, method: 'DELETE', status: 404 }); pass('cross-account file isolation')
  const download = await request(`/api/games/${game.id}/download`, { jar: owner }); assert.deepEqual(download.data, rom); assert.equal(download.response.headers.get('x-checksum-sha256'), sum(rom)); assert(download.response.headers.get('repr-digest').includes('sha-256')); pass('download bytes and checksum headers')
  const partial = await request(`/api/games/${game.id}/download`, { jar: owner, headers: { Range: 'bytes=3-11' }, status: 206 }); assert.deepEqual(partial.data, rom.subarray(3, 12)); pass('HTTP Range resume')
  const tail = await request(`/api/games/${game.id}/download`, { jar: owner, headers: { Range: 'bytes=-5' }, status: 206 }); assert.deepEqual(tail.data, rom.subarray(-5)); pass('suffix byte range')
  const manifest = await request(`/api/games/${game.id}/checksum`, { jar: owner }); assert(manifest.data.toString().startsWith(sum(rom))); pass('SHA-256 manifest')
  await request('/api/games', { jar: owner }); await request(`/api/games/${game.id}`, { jar: owner, method: 'PATCH', json: { favorite: true, title: 'Zmieniony tytuł' } }); const list = (await request('/api/games', { jar: owner })).json(); assert.equal(list[0].favorite, true); assert.equal(list[0].title, 'Zmieniony tytuł'); pass('metadata updates invalidate Redis cache')
  const image = readFileSync(path.join(root, 'scripts/fixtures/cover.png'))
  await request(`/api/games/${game.id}/cover`, { jar: owner, method: 'PUT', body: image }); const cover = await request(`/api/games/${game.id}/cover`, { jar: owner }); assert.equal(cover.response.headers.get('content-type'), 'image/jpeg'); pass('cover validation, re-encoding and retrieval')
  await request(`/api/games/${game.id}/cover`, { jar: owner, method: 'PUT', body: Buffer.from('<svg onload="alert(1)"></svg>'), status: 415 }); pass('active-content cover rejected')
  const sh = (await request('/api/shares', { jar: owner, method: 'POST', json: { label: 'QA link', days: 1 }, status: 201 })).json(); const token = sh.url.split('/share/')[1]
  assert.equal((await request(`/api/shared/${token}`)).json().games.length, 1); assert.deepEqual((await request(`/api/shared/${token}/games/${game.id}/download`)).data, rom); pass('anonymous read-only library sharing')
  await request(`/api/shares/${sh.share.id}`, { jar: visitor, method: 'DELETE', status: 404 }); await request(`/api/shares/${sh.share.id}`, { jar: owner, method: 'DELETE', status: 204 }); await request(`/api/shared/${token}`, { status: 404 }); await request(`/api/shared/${token}/games/${game.id}/download`, { status: 404 }); pass('share isolation and immediate revocation')

  const old = new Map(owner); owner.delete('rv_access')
  await request('/api/auth/me', { jar: owner, status: 401 }); await request('/api/auth/refresh', { jar: owner, method: 'POST', status: 204 }); await request('/api/auth/me', { jar: owner }); assert.notEqual(owner.get('rv_refresh'), old.get('rv_refresh')); pass('refresh restores access and rotates refresh token')
  const previous = await request('/api/auth/refresh', { jar: old, method: 'POST', status: 204 }); assert.equal(previous.response.headers.getSetCookie().length, 0); await request('/api/auth/me', { jar: old }); pass('concurrent tab grace keeps current cookies intact')
  const beforeLogout = new Map(owner); await request('/api/auth/logout', { jar: owner, method: 'POST', status: 204 }); await request('/api/auth/me', { jar: beforeLogout, status: 401 }); await request('/api/auth/refresh', { jar: beforeLogout, method: 'POST', status: 401 }); pass('logout invalidates server-side access and refresh')
  await request('/api/auth/login', { jar: owner, method: 'POST', json: { email: users[0].email, password } })
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const me = (await request('/api/auth/login', { jar: admin, method: 'POST', json: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } })).json(); assert.equal(me.role, 'admin')
    const ext = '.qaformat'; await request('/api/admin/extensions', { jar: admin, method: 'PUT', json: { extension: ext, platform: 'QA Platform', enabled: true } })
    const data = Buffer.from('custom-format-' + randomUUID()); const custom = (await request('/api/games', { jar: owner, method: 'POST', body: data, headers: uploadHeaders(data, `custom${ext}`), status: 201 })).json(); assert.equal(custom.platform, 'QA Platform')
    await request('/api/admin/extensions', { jar: admin, method: 'PUT', json: { extension: ext, platform: 'QA Platform', enabled: false } }); await request('/api/games', { jar: owner, method: 'POST', body: data, headers: uploadHeaders(data, `disabled${ext}`), status: 415 }); await request(`/api/games/${custom.id}/download`, { jar: owner }); pass('admin adds and disables formats without breaking downloads')
  }
  const large = Buffer.alloc(17 * 1024 * 1024, 93); large.write(randomUUID()); const multipart = (await request('/api/games', { jar: owner, method: 'POST', body: large, headers: uploadHeaders(large, 'multipart.iso'), status: 201 })).json(); assert.equal(sum((await request(`/api/games/${multipart.id}/download`, { jar: owner })).data), sum(large)); pass('S3 multipart upload above 16 MB with matching download')
  for (const item of (await request('/api/games', { jar: owner })).json()) await request(`/api/games/${item.id}`, { jar: owner, method: 'DELETE', status: 204 })
  assert.equal((await request('/api/games', { jar: owner })).json().length, 0); await request(`/api/games/${game.id}/download`, { jar: owner, status: 404 }); pass('delete removes game and invalidates library cache')
  if (keep) {
    for (const [title, ext] of [['Pixel Journey', '.gba'], ['Orbital Echoes', '.iso'], ['Pocket Adventure', '.gb'], ['Midnight Racer', '.chd'], ['Starlight Valley', '.sfc'], ['Summer Arcade', '.nds']]) {
      const data = Buffer.from(`Synthetic UI QA fixture: ${title} ${randomUUID()}`)
      await request('/api/games', { jar: owner, method: 'POST', body: data, headers: uploadHeaders(data, title + ext), status: 201 })
    }
    console.log(`UI QA account: ${users[0].email} / ${password}`)
  }
  console.log(`${checks} end-to-end checks passed.`)
} finally {
  mkdirSync(path.join(root, 'artifacts'), { recursive: true })
  // Delete only accounts created by this exact test run. Enqueue blobs before cascading metadata.
  const ids = users.map(u => `'${u.id}'`).join(',')
  if (ids) writeFileSync(path.join(root, 'artifacts/smoke-cleanup.sql'), `BEGIN; INSERT INTO storage_garbage(storage_key) SELECT storage_key FROM games WHERE owner_id IN (${ids}) ON CONFLICT DO NOTHING; INSERT INTO storage_garbage(storage_key) SELECT cover_key FROM games WHERE owner_id IN (${ids}) AND cover_key<>'' ON CONFLICT DO NOTHING; DELETE FROM users WHERE id IN (${ids}); DELETE FROM extensions WHERE extension='.qaformat' AND platform='QA Platform'; COMMIT;\n`)
}

