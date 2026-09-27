# One Login

[![CI](https://github.com/Aguynamedkent7/SIMPLE/actions/workflows/ci.yml/badge.svg)](https://github.com/Aguynamedkent7/SIMPLE/actions/workflows/ci.yml)

**Live: https://simple-tau-gold.vercel.app**

One login, one screen: this month's money in, money out, and what you kept. Built for Australian
tradies who check their numbers on a phone, outside, between jobs. Finish a job, tap **Job done**,
type who, what and how much, and the profit updates before your thumb leaves the glass.

## How to use it

**Create account** with your business name, email and a password, then tap the link in the
confirmation email. After that it's the same as round 1: log in, see the number, tap **Job done**.

Menu (top right): 2-step login, Log out, Log out everywhere.

## Security

Every business sees only its own numbers, enforced by Postgres row level security rather than by
the app code. Passwords are bcrypt-hashed by Supabase Auth and never touch an app table. There is
no admin key in the app. **[SECURITY.md](SECURITY.md)** covers the threat model, every setting,
and how to try to break it yourself. The attack suite runs in CI on every push.

<p>
  <img src="docs/login-light.png" width="200" alt="Login screen">
  <img src="docs/money-light.png" width="200" alt="Money screen">
  <img src="docs/sheet-light.png" width="200" alt="Job done sheet">
  <img src="docs/money-dark.png" width="200" alt="Money screen, dark mode">
</p>

## Stack

Next.js 16 (App Router, Server Actions) · Supabase (Auth + Postgres RLS) · Tailwind CSS 4 ·
Cloudflare Turnstile · pgTAP · Playwright · GitHub Actions · Vercel

## Local setup

```bash
git clone <repo> && cd one-login
npm install
cp .env.example .env.local   # fill in SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
npx supabase link --project-ref <your-project-ref>
npx supabase db push         # applies supabase/migrations
npm run dev
```

## Tests

```bash
npx supabase start     # local stack; confirmation emails land in Mailpit (localhost:54324)
npm run test:unit      # money parsing and formatting
npm run test:db        # pgTAP: RLS forced everywhere, no anon grants, no update policies
npm run test:attack    # direct REST/RPC attacks by one business on another
npm run test:e2e       # Playwright, phone viewport, against the local stack
```

## Left out, on purpose

- **Team invites and more than one business per account.** Every membership path is attack
  surface. One business per account until someone needs more.
- **Editing entries.** Delete and re-add (with Undo) keeps the policy set small: there are no
  update policies at all.
- **Social login.** Fewer providers, fewer misconfigurations.
- **Demo / anonymous access.** Real accounts only, as asked. "Try it now" is gone.
- **2-step login recovery codes.** A lost phone needs manual help for now (see SECURITY.md).

