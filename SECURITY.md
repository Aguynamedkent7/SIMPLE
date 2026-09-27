# Security

One Login keeps each business's money numbers private to that business. This page explains how,
and how to check it yourself.

## 1. Threat model

The attacker has a real account. They have read the public JavaScript bundle, know the Supabase
project URL and publishable (anon) key, hold their own valid session, and call the Supabase REST
API, RPC endpoints and our Next.js server actions directly with crafted payloads.

Their goals: read, change or delete another business's entries; join another business; learn
whether an email address has an account; keep access after being logged out.

Beyond the app itself, the platform accounts are the next target. Every Supabase, Vercel,
GitHub, Cloudflare and Resend account behind this app must have 2-step login on, `main` only changes
through a pull request with passing CI, and no admin key exists outside the Supabase dashboard.
Denial of service is absorbed by Vercel's and Cloudflare's edge, with Supabase Auth rate limits
and Turnstile in front of every login, signup and reset.

## 2. Passwords

- Supabase Auth hashes passwords with bcrypt. The app passes the password to Supabase Auth once,
  inside the login or signup request, and never stores or logs it. No app table has a password
  column.
- Rules: at least 12 characters, with letters and digits, at most 72 (bcrypt's limit). Enforced by
  Supabase Auth itself (tested by calling the Auth API directly) and checked first in the app for
  a clear message.
- Leaked password protection (HaveIBeenPwned) rejects known-breached passwords where the plan
  allows it (see section 4).
- Email must be confirmed before first login.
- Error messages never reveal whether an email has an account: login says "Email or password is
  wrong.", reset says "If that email has an account, we've sent a reset link.", and signup always
  says "Check your email", because Supabase Auth returns the same response for existing emails.

## 3. Tenant isolation

**The database is the security boundary.** A bug in the Next.js code can't leak another
business's numbers, because Postgres refuses first.

- Every business-owned row carries `business_id`. Accounts belong to businesses through
  `memberships`. The signup trigger creates the business and owner membership in one
  transaction, and a user can never choose which business they join.
- Row level security is enabled **and forced** on every table in `public`. Policies check
  membership through `private.is_member()`, a `security definer` helper in a schema the API
  doesn't expose.
- A restrictive policy on every table also requires (a) that the JWT's session still exists, so
  **Log out everywhere takes effect immediately** instead of when the JWT expires, and (b) `aal2`
  once the user has turned on 2-step login.
- Deny by default: `anon` and `PUBLIC` have no privileges on any table or function. `authenticated`
  gets `select` on businesses, memberships and audit_log, and `select, insert, delete` on entries.
  **No `update` privilege exists anywhere.** Businesses and memberships can't be written from the
  client at all.
- `month_totals` / `month_entries` are `security invoker`, so RLS applies: pass another business's
  id and you get zeros.
- The server never trusts a client-supplied `business_id`. `getCurrentBusiness()` (`lib/business.ts`)
  derives it from the user's own membership, using the user's own session. Server action inputs use
  strict zod schemas, so an extra `business_id` key rejects the whole payload.
- **No service role or secret key exists anywhere in the app**, including Vercel env vars. The app
  only ever acts as the signed-in user. `next.config.ts` fails the build if any variable named like
  `SERVICE_ROLE` or `SUPABASE_SECRET` is present.
- The browser never talks to Supabase directly. Session cookies are `httpOnly`, `secure` and
  `SameSite=Lax`, so script injection can't read them. Server code authorises with `getClaims()`
  (verified JWT), never `getSession()`.
- `pg_graphql` is dropped and only the `public` schema is exposed, so there is a single API surface.

## 4. Supabase settings

`supabase/config.toml` holds the local values. Set the same values in the production dashboard.

| Setting | Value |
|---|---|
| Auth → Email → Confirm email | **On** |
| Auth → Email → Secure email change | On |
| Auth → Email → Secure password change | On |
| Auth → Email templates (Confirm signup, Reset password) | Link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (`type=recovery` for reset), matching `supabase/templates/`. The default templates also work (PKCE `code` links), but only in the browser that asked. |
| Auth → Passwords → Minimum length | 12 |
| Auth → Passwords → Requirements | Letters and digits |
| Auth → Passwords → Leaked password protection | Pro plan feature. Next step 1 in section 8. |
| Auth → Anonymous sign-ins | **Off** |
| Auth → Attack protection → CAPTCHA | Cloudflare Turnstile, secret key from Cloudflare. Covers signup, sign-in and password reset. |
| Auth → Rate limits | Defaults (sign-in/sign-up 30 per 5 min per IP; email sends limited) |
| Auth → Sessions | Refresh token rotation on, reuse interval 10 s; JWT expiry 3600 s |
| Auth → URL configuration | Site URL = production domain; redirect allowlist = production domain + `http://localhost:3000/**` |
| Auth → MFA | TOTP enrolment and verification on |
| API → Exposed schemas | `public` only |
| Database → Extensions | `pg_graphql` removed (by migration) |
| Security Advisor / Performance Advisor | Run after migrating. `supabase db lint` is clean locally. |
| Backups | Daily backups (all plans). Point-in-Time Recovery is a Pro add-on: next step 1 in section 8. |

Vercel only needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `TURNSTILE_SITE_KEY`, all server-side
(no `NEXT_PUBLIC_` variables: nothing from the environment is baked into the JS bundle).
The Turnstile widget stays hidden unless Cloudflare needs a tap, and renders nothing when no site
key is set.

## 5. Headers and CSP

Set on every page (`proxy.ts` for the CSP, `next.config.ts` for the rest):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<per request>' 'strict-dynamic'
  https://challenges.cloudflare.com; style-src 'self' 'nonce-<per request>'; img-src 'self' data:;
  font-src 'self'; connect-src 'self'; frame-src https://challenges.cloudflare.com;
  object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
```

There is no `unsafe-inline` and no `unsafe-eval` in production. `connect-src 'self'` works because
every Supabase call goes through our server. Every page renders per request, so each one gets a
fresh nonce. `tests/security.spec.ts` checks the headers, checks the nonce changes per request,
and checks the app runs with no CSP violations.

## 6. How to verify

### Run the attack suite

```bash
npm ci
npx supabase start          # local Postgres, Auth and Mailpit, with all migrations applied
npm run test:db             # pgTAP: RLS on and forced everywhere, no anon grants, no update policies…
npm run test:attack         # 26 direct API attacks as a logged-in user against another business
npm run test:e2e            # Playwright: signup, isolation in two browsers, MFA, CSP, tampered actions
```

`tests/attack.test.ts` is the one to read. Logged in as business A with the public key, it tries:
selecting B's rows (filtered and unfiltered), inserting into B, inserting as B, deleting B's row,
updating anything, `month_totals` for B, reading or joining B's business and memberships, writing
the audit log, calling the private helpers, GraphQL, forged and `alg: none` JWTs, every table
with no session, anonymous sign-in, a stolen JWT after Log out everywhere, and a password-only
session once 2-step login is on. CI runs all of this on every push.

### Try to break it yourself

1. Sign up two accounts, A and B, in two browsers. Add a job in B.
2. Get B's business id: as B, open the Supabase Table view or run
   `curl "$URL/rest/v1/memberships?select=business_id" -H "apikey: $KEY" -H "Authorization: Bearer $B_TOKEN"`.
3. Get A's access token. The session cookie is `httpOnly`, so page JavaScript can't read it (that's
   deliberate). Either copy the `sb-…-auth-token` cookie value from DevTools → Application →
   Cookies (it's base64 JSON: `access_token` is inside), or sign in directly:
   ```bash
   URL=https://<project>.supabase.co; KEY=<publishable key>
   A_TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" \
     -H 'Content-Type: application/json' -d '{"email":"a@…","password":"…"}' | jq -r .access_token)
   ```
4. Attack:
   ```bash
   curl "$URL/rest/v1/entries?business_id=eq.<B id>" -H "apikey: $KEY" -H "Authorization: Bearer $A_TOKEN"
   # → []
   curl -X POST "$URL/rest/v1/entries" -H "apikey: $KEY" -H "Authorization: Bearer $A_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"business_id":"<B id>","type":"out","description":"x","amount_cents":1}'
   # → 403, new row violates row-level security policy
   curl -X PATCH "$URL/rest/v1/entries?business_id=eq.<A id>" -H "apikey: $KEY" \
     -H "Authorization: Bearer $A_TOKEN" -H 'Content-Type: application/json' -d '{"amount_cents":1}'
   # → 403, permission denied for table entries
   curl -X POST "$URL/rest/v1/rpc/month_totals" -H "apikey: $KEY" -H "Authorization: Bearer $A_TOKEN" \
     -H 'Content-Type: application/json' -d '{"bid":"<B id>"}'
   # → [{"money_in":0,"money_out":0,"profit":0}]
   ```
5. In the app, tap Menu → Log out everywhere, then repeat step 4's first call with the old token.
   It returns `[]`, even though the JWT hasn't expired.

## 7. Audit log

`audit_log` is append-only and written only by triggers (`security definer`): `business.create` at
signup, `entry.insert` and `entry.delete` with the actor, entity id, type and amount. It holds no
customer names or free text. Owners can read their own business's log. Nobody can insert, update
or delete it through the API.

## 8. Before real customers' money goes in

Done now: custom SMTP on a verified domain (SPF, DKIM, DMARC), Turnstile, 2-step login,
Dependabot, secret scanning with push protection, CodeQL, branch protection.

Next, in this order:
1. Supabase Pro: leaked password protection (HaveIBeenPwned) and Point-in-Time Recovery.
2. Make 2-step login mandatory, with recovery codes so a lost phone isn't a lockout.
3. Database network restrictions and SSL enforcement for direct Postgres connections.
4. An independent penetration test, and fixing everything it finds before launch.
5. Incident response runbook, quarterly access reviews and vendor assessments (Supabase and
   Vercel both hold SOC 2 Type II), leading to SOC 2 / ISO 27001.
6. The domain on the HSTS preload list.

## 9. Reporting a vulnerability

Please use GitHub's private vulnerability reporting (Security → Report a vulnerability on this
repo). Don't open a public issue. You'll get a reply
within 3 working days. Only test against accounts you created.
