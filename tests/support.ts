// Shared by the API attack tests and Playwright. Everything runs against LOCAL Supabase
// (`npx supabase start`), acting only as ordinary users with the public key. No admin key.
import { createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321'
// The local stack's well-known publishable key (printed by `supabase start`), not a secret.
export const SUPABASE_KEY = process.env.TEST_SUPABASE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const MAILPIT = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:54324'

export const PASSWORD = 'correct horse 42 battery'

export function anon(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

export const uniqueEmail = (who: string) =>
  `${who}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`

/** The token_hash from the newest confirm/reset email Mailpit caught for this address. */
export async function emailToken(email: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const { messages } = await search.json() as { messages: { ID: string }[] }
    if (messages.length) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { HTML: string }
      const token = /token_hash=([\w-]+)/.exec(message.HTML)?.[1]
      if (token) return token
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`No email for ${email}`)
}

/** Sign up through the public API, confirm by the emailed link, return a signed-in client. */
export async function confirmedUser(business: string) {
  const email = uniqueEmail(business.toLowerCase().replace(/\W+/g, ''))
  const client = anon()
  const { error } = await client.auth.signUp({
    email, password: PASSWORD, options: { data: { business_name: business } },
  })
  if (error) throw error
  const { data, error: verifyError } = await client.auth.verifyOtp({ type: 'email', token_hash: await emailToken(email) })
  if (verifyError) throw verifyError
  const { data: membership, error: membershipError } = await client.from('memberships').select('business_id').single()
  if (membershipError) throw membershipError
  return { client, email, userId: data.user!.id, businessId: membership!.business_id as string }
}

/** RFC 6238 TOTP code, so tests can play the authenticator app. */
export function totp(secret: string, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secret.replace(/=+$/, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
