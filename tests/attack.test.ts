// Cross-tenant attack tests: the attacker is a logged-in user (A) holding the public key and their
// own session, calling the Supabase REST and RPC APIs directly. Every probe at business B must fail.
// Run: npx supabase start && npm run test:attack
import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'
import { anon, confirmedUser, PASSWORD, SUPABASE_KEY, SUPABASE_URL, totp } from './support.ts'

type User = Awaited<ReturnType<typeof confirmedUser>>
let a: User
let b: User
let bEntryId: string

before(async () => {
  ;[a, b] = await Promise.all([confirmedUser('Alpha Plumbing'), confirmedUser('Bravo Electrical')])
  const add = (u: User, customer: string, amount_cents: number) => u.client.from('entries')
    .insert({ business_id: u.businessId, type: 'in', customer, description: 'Job', amount_cents })
    .select('id').single()
  await add(a, 'A customer', 10000)
  const { data, error } = await add(b, 'B secret customer', 777700)
  assert.ifError(error)
  bEntryId = data!.id
})

describe('logged in as A, attacking B', () => {
  test('select entries with no filter returns only A’s rows', async () => {
    const { data, error } = await a.client.from('entries').select('business_id, customer')
    assert.ifError(error)
    assert.equal(data.length, 1)
    assert.ok(data.every((e) => e.business_id === a.businessId))
  })

  test('select entries where business_id = B returns nothing', async () => {
    const { data, error } = await a.client.from('entries').select().eq('business_id', b.businessId)
    assert.ifError(error)
    assert.deepEqual(data, [])
  })

  test('select B’s entry by id returns nothing', async () => {
    const { data } = await a.client.from('entries').select().eq('id', bEntryId)
    assert.deepEqual(data, [])
  })

  test('insert into B’s business is refused by RLS', async () => {
    const { error } = await a.client.from('entries')
      .insert({ business_id: b.businessId, type: 'out', description: 'Planted', amount_cents: 1 })
    assert.equal(error?.code, '42501')
  })

  test('insert into A’s business pretending to be B is refused', async () => {
    const { error } = await a.client.from('entries').insert({
      business_id: a.businessId, created_by: b.userId, type: 'out', description: 'Framed', amount_cents: 1,
    })
    assert.equal(error?.code, '42501')
  })

  test('delete B’s entry affects 0 rows and it still exists', async () => {
    const { count, error } = await a.client.from('entries').delete({ count: 'exact' }).eq('id', bEntryId)
    assert.ifError(error)
    assert.equal(count, 0)
    const { data } = await b.client.from('entries').select('id').eq('id', bEntryId)
    assert.equal(data?.length, 1)
  })

  test('update is impossible, even on A’s own rows', async () => {
    const { error } = await a.client.from('entries').update({ amount_cents: 1 }).eq('business_id', a.businessId)
    assert.equal(error?.code, '42501')
    const { error: crossError } = await a.client.from('entries').update({ business_id: a.businessId }).eq('id', bEntryId)
    assert.equal(crossError?.code, '42501')
  })

  test('month_totals for B returns zeros', async () => {
    const { data, error } = await a.client.rpc('month_totals', { bid: b.businessId }).single()
    assert.ifError(error)
    assert.deepEqual(data, { money_in: 0, money_out: 0, profit: 0 })
    const { data: entries } = await a.client.rpc('month_entries', { bid: b.businessId })
    assert.deepEqual(entries, [])
  })

  test('businesses shows only A’s business', async () => {
    const { data } = await a.client.from('businesses').select('id, name')
    assert.deepEqual(data, [{ id: a.businessId, name: 'Alpha Plumbing' }])
  })

  test('memberships shows only A’s membership', async () => {
    const { data } = await a.client.from('memberships').select('business_id, user_id, role')
    assert.deepEqual(data, [{ business_id: a.businessId, user_id: a.userId, role: 'owner' }])
  })

  test('joining B’s business through memberships is refused', async () => {
    const { error } = await a.client.from('memberships')
      .insert({ business_id: b.businessId, user_id: a.userId, role: 'owner' })
    assert.equal(error?.code, '42501')
    const { error: promote } = await a.client.from('memberships').update({ business_id: b.businessId }).eq('user_id', a.userId)
    assert.equal(promote?.code, '42501')
  })

  test('creating or renaming businesses is refused', async () => {
    assert.equal((await a.client.from('businesses').insert({ name: 'Mine now' })).error?.code, '42501')
    assert.equal((await a.client.from('businesses').update({ name: 'Pwned' }).eq('id', b.businessId)).error?.code, '42501')
    assert.equal((await a.client.from('businesses').delete().eq('id', b.businessId)).error?.code, '42501')
  })

  test('audit log is read-only and only shows A’s business', async () => {
    const { data } = await a.client.from('audit_log').select('business_id, action, metadata')
    assert.ok(data!.length >= 2) // business.create + entry.insert
    assert.ok(data!.every((row) => row.business_id === a.businessId))
    assert.ok(data!.every((row) => !JSON.stringify(row.metadata).includes('customer')))
    assert.equal((await a.client.from('audit_log').insert({ business_id: a.businessId, action: 'x' })).error?.code, '42501')
    assert.equal((await a.client.from('audit_log').update({ action: 'x' }).eq('business_id', a.businessId)).error?.code, '42501')
    assert.equal((await a.client.from('audit_log').delete().eq('business_id', a.businessId)).error?.code, '42501')
  })

  test('private helpers are not reachable over the API', async () => {
    const { error } = await a.client.rpc('is_member', { bid: b.businessId })
    assert.equal(error?.code, 'PGRST202') // no such function in the exposed schema
    const { error: schemaError } = await a.client.schema('private').rpc('is_member', { bid: b.businessId })
    assert.equal(schemaError?.code, 'PGRST106') // schema not exposed
  })

  test('GraphQL is gone', async () => {
    const { data: { session } } = await a.client.auth.getSession()
    const res = await fetch(`${SUPABASE_URL}/graphql/v1`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session!.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ entriesCollection { edges { node { customer } } } }' }),
    })
    assert.ok(!(await res.text()).includes('B secret customer'))
  })

  test('a tampered JWT is rejected', async () => {
    const { data: { session } } = await a.client.auth.getSession()
    const [header, payload, signature] = session!.access_token.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    const forged = [header, Buffer.from(JSON.stringify({ ...claims, sub: b.userId })).toString('base64url'), signature].join('.')
    const res = await fetch(`${SUPABASE_URL}/rest/v1/entries?select=customer`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${forged}` },
    })
    assert.equal(res.status, 401)
    const unsigned = [Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url'),
      Buffer.from(JSON.stringify({ ...claims, sub: b.userId })).toString('base64url'), ''].join('.')
    const res2 = await fetch(`${SUPABASE_URL}/rest/v1/entries?select=customer`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${unsigned}` },
    })
    assert.equal(res2.status, 401)
  })
})

describe('no session (anon key only)', () => {
  const client = anon()
  for (const table of ['businesses', 'memberships', 'entries', 'audit_log']) {
    test(`select ${table} is refused`, async () => {
      const { data, error } = await client.from(table).select()
      assert.ok(error?.code === '42501' || data?.length === 0, JSON.stringify({ data, error }))
      assert.ok(!data?.length)
    })
  }
  test('RPCs are refused', async () => {
    assert.equal((await client.rpc('month_totals', { bid: b.businessId })).error?.code, '42501')
    assert.equal((await client.rpc('month_entries', { bid: b.businessId })).error?.code, '42501')
  })
  test('insert is refused', async () => {
    const { error } = await client.from('entries')
      .insert({ business_id: b.businessId, type: 'out', description: 'x', amount_cents: 1 })
    assert.equal(error?.code, '42501')
  })
  test('anonymous sign-in is off', async () => {
    const { error } = await client.auth.signInAnonymously()
    assert.equal(error?.code, 'anonymous_provider_disabled')
  })
})

describe('sessions', () => {
  test('Log out everywhere cuts off a still-valid access token at once', async () => {
    const victim = await confirmedUser('Charlie Carpentry')
    const { data: { session } } = await victim.client.auth.getSession()
    const stolen = session!.access_token
    const read = () => fetch(`${SUPABASE_URL}/rest/v1/businesses?select=name`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${stolen}` },
    }).then((r) => r.json())
    assert.deepEqual(await read(), [{ name: 'Charlie Carpentry' }])

    const laptop = anon()
    await laptop.auth.signInWithPassword({ email: victim.email, password: PASSWORD })
    await laptop.auth.signOut({ scope: 'global' })
    assert.deepEqual(await read(), []) // the JWT hasn't expired, but its session is gone
  })

  test('with 2-step login on, a password-only session sees nothing', async () => {
    const user = await confirmedUser('Delta Roofing')
    await user.client.from('entries')
      .insert({ business_id: user.businessId, type: 'in', customer: 'X', description: 'Roof', amount_cents: 500 })
    const { data: factor, error } = await user.client.auth.mfa.enroll({ factorType: 'totp' })
    assert.ifError(error)
    assert.ifError((await user.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) })).error)

    const phone = anon()
    await phone.auth.signInWithPassword({ email: user.email, password: PASSWORD })
    assert.deepEqual((await phone.from('entries').select()).data, [])
    assert.deepEqual((await phone.from('businesses').select()).data, [])
    assert.equal((await phone.from('entries').insert({ business_id: user.businessId, type: 'out', description: 'x', amount_cents: 1 })).error?.code, '42501')

    const { error: stepUp } = await phone.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) })
    assert.ifError(stepUp)
    assert.equal((await phone.from('entries').select()).data?.length, 1)
  })

  test('passwords shorter than 12 or without digits are refused by Auth itself', async () => {
    for (const password of ['short1', 'longbutnodigits']) {
      const { error } = await anon().auth.signUp({ email: `weak.${Date.now()}@example.com`, password })
      assert.equal(error?.code, 'weak_password', password)
    }
  })
})

describe('input rules hold in the database, not just the form', () => {
  let c: User
  before(async () => { c = await confirmedUser('Evil\n\tCorp\u0085 <b>') })
  const add = (row: Record<string, unknown>) =>
    c.client.from('entries').insert({ business_id: c.businessId, type: 'out', description: 'Dated', amount_cents: 1, ...row })

  test('occurred_at in the future or before 2026 is refused; an earlier time (Undo) is kept', async () => {
    const day = 86_400_000
    assert.equal((await add({ occurred_at: new Date(Date.now() + 5 * 365 * day).toISOString() })).error?.code, '23514')
    assert.equal((await add({ occurred_at: '1999-01-01T00:00:00Z' })).error?.code, '23514')
    assert.ifError((await add({ occurred_at: new Date(Date.now() - 40 * day).toISOString() })).error)
  })

  test('control characters are refused in customer and description', async () => {
    for (const bad of ['two\nlines', 'tab\there', 'nel\u0085']) {
      assert.equal((await add({ description: bad })).error?.code, '23514', JSON.stringify(bad))
      assert.equal((await add({ type: 'in', customer: bad })).error?.code, '23514', JSON.stringify(bad))
    }
  })

  test('a signup business name with control characters is cleaned, not stored', async () => {
    const { data } = await c.client.from('businesses').select('name').single()
    assert.equal(data!.name, 'Evil Corp <b>')
  })

  test('created_at can’t be forged', async () => {
    assert.equal((await add({ created_at: '2026-01-02T00:00:00Z' })).error?.code, '42501')
  })

  test('month_totals takes no timezone, so a bad one is never echoed back', async () => {
    const { error } = await c.client.rpc('month_totals', { bid: c.businessId, tz: 'Evil/Zone' })
    assert.equal(error?.code, 'PGRST202')
    assert.ok(!JSON.stringify(error).includes('Evil/Zone'))
    assert.ifError((await c.client.rpc('month_totals', { bid: c.businessId }).single()).error)
  })
})
