// Renders the canonical privacy policy stored as plain markdown so the doc
// itself is the source of truth (legal review can diff a single .md file).
// Vite's built-in `?raw` query inlines the file at build time as a string —
// no new dependency.
import privacyContent from '../content/privacy-policy.md?raw'
import LegalPage from '../components/LegalPage'

export default function Privacy() {
  return (
    <LegalPage
      content={privacyContent}
      otherDocPath="/terms"
      otherDocLabel="Terms of Service"
    />
  )
}
