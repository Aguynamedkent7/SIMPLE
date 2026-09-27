import Heading from '../Heading'
import { MfaForm } from '../forms'

export default function MfaPage() {
  return (
    <>
      <Heading title="Enter your code.">Open your authenticator app and type the 6-digit code for One Login.</Heading>
      <MfaForm />
    </>
  )
}
