// Renders the canonical Terms of Service stored as plain markdown so the doc
// itself is the source of truth (legal review can diff a single .md file).
// Vite's built-in `?raw` query inlines the file at build time as a string —
// no new dependency.
import termsContent from '../content/terms-of-service.md?raw'
import LegalPage from '../components/LegalPage'

export default function Terms() {
  return (
    <LegalPage
      content={termsContent}
      otherDocPath="/privacy"
      otherDocLabel="Privacy Policy"
    />
  )
}
