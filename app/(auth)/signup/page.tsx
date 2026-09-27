import Heading from '../Heading'
import { SignupForm } from '../forms'

export default function SignupPage() {
  return (
    <>
      <Heading title="Create your account.">Your numbers stay yours. Nobody else can see them.</Heading>
      <SignupForm siteKey={process.env.TURNSTILE_SITE_KEY} />
    </>
  )
}
