# One Login

**Live: https://simple-tau-gold.vercel.app**

One login, one screen: this month's money in, money out, and what you kept. Built for Australian
tradies who check their numbers on a phone, outside, between jobs. Finish a job, tap **Job done**,
type who, what and how much, and the profit updates before your thumb leaves the glass.

## How to use it

Tap **Try it now**, then **Job done**.

<p>
  <img src="docs/login-light.png" width="200" alt="Login screen">
  <img src="docs/money-light.png" width="200" alt="Money screen">
  <img src="docs/sheet-light.png" width="200" alt="Job done sheet">
  <img src="docs/money-dark.png" width="200" alt="Money screen, dark mode">
</p>

## Stack

Next.js 16 (App Router, Server Actions) · Supabase (Auth + Postgres) · Tailwind CSS 4 ·
Playwright · Vercel

## Local setup

```bash
git clone <repo> && cd one-login
npm install
cp .env.example .env.local   # fill in SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
npx supabase link --project-ref <your-project-ref>
npx supabase db push         # applies supabase/migrations
npm run dev
```

