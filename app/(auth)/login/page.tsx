import Heading from '../Heading'
import { LoginForm } from '../forms'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const expired = (await searchParams).link === 'expired'
  return (
    <>
      <Heading title="Know where your month stands.">
        Money in, money out, and what you kept. One screen.
      </Heading>
      <LoginForm notice={expired ? 'That link has expired or was already used. Log in, or ask for a new reset link.' : undefined} />
    </>
  )
}
