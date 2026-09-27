import Heading from '../Heading'
import { ResetForm } from '../forms'

export default function ResetPasswordPage() {
  return (
    <>
      <Heading title="Forgot your password?">We’ll email you a link to choose a new one.</Heading>
      <ResetForm siteKey={process.env.TURNSTILE_SITE_KEY} />
    </>
  )
}
