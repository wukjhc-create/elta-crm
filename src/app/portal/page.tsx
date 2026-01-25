import { redirect } from 'next/navigation'

export default function PortalPage() {
  // Redirect to home - portal requires a token
  redirect('/')
}
