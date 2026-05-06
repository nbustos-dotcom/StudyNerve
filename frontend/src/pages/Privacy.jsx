import { Link } from 'react-router-dom'
import NeuralBackground from '../components/NeuralBackground'

const glassCard = {
  background: 'rgba(15, 15, 35, 0.6)',
  backdropFilter: 'blur(32px)',
  WebkitBackdropFilter: 'blur(32px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 8px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
}

const sections = [
  {
    title: '1. Information We Collect',
    body: `We collect the following information when you use StudyNerve AI: your name and email address (provided at registration), study notes and uploaded documents, quiz questions and results, flashcard sets, chat history with the AI tutor, and vision board content. We do not collect payment information, precise location data, or any data beyond what is necessary to provide the service.`,
  },
  {
    title: '2. How We Use Your Information',
    body: `Your information is used exclusively to provide you with a personalized tutoring experience — generating quizzes, answering your questions, organizing your notes, and tracking your study progress. We do not sell, rent, or share your personal data with third parties for marketing or advertising purposes. Your data is yours.`,
  },
  {
    title: '3. API Keys',
    body: `If you provide third-party API keys (such as Groq, Gemini, OpenAI, or Anthropic), those keys are encrypted in our database using industry-standard encryption. They are never logged in plaintext, never shared with any third party beyond the intended AI provider, and are only used to fulfill requests you initiate. You may remove your stored keys at any time from Settings.`,
  },
  {
    title: '4. Third-Party Services',
    body: `StudyNerve AI supports multiple AI providers: Groq, Gemini, OpenAI, and Anthropic. When you use the AI chat or quiz features, your messages and study content are sent to the provider you have selected. Each provider processes your data according to their own privacy policies. We encourage you to review the privacy policy of your chosen AI provider. StudyNerve AI is not responsible for how third-party providers handle data once it leaves our service.`,
  },
  {
    title: '5. Data Storage',
    body: `All user data — including your account information, notes, quizzes, and chat history — is stored in a Supabase-managed PostgreSQL database. Data is encrypted at rest and in transit. Supabase's infrastructure complies with industry-standard security practices.`,
  },
  {
    title: '6. Data Deletion',
    body: `You have full control over your data. You may delete your account and all associated data at any time from the Settings page. Upon deletion, all your personal information, notes, quizzes, chat history, and stored API keys are permanently removed from our systems. This action is irreversible.`,
  },
  {
    title: '7. Cookies & Local Storage',
    body: `StudyNerve AI uses your browser's localStorage to store your authentication token (JWT) for session management. We do not use cookies for tracking, advertising, or analytics. No third-party tracking scripts are embedded in the platform.`,
  },
  {
    title: '8. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. When we do, we will update the effective date at the top of this page. Continued use of StudyNerve AI after changes are posted constitutes your acceptance of the revised policy. We encourage you to review this page periodically.`,
  },
  {
    title: '9. Contact',
    body: `If you have any questions, concerns, or data requests regarding this Privacy Policy, please contact us at studynerveai@gmail.com.`,
  },
]

export default function Privacy() {
  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-16"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(var(--indigo-500-rgb),0.1) 0%, transparent 70%)' }}
    >
      <NeuralBackground />

      <div className="w-full max-w-2xl relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <h1
            className="text-3xl font-bold tracking-tight bg-clip-text text-transparent mb-2"
            style={{ backgroundImage: 'linear-gradient(115deg, #a5b4fc 0%, #c4b5fd 45%, var(--indigo-400) 100%)' }}
          >
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-500">Effective date: April 14, 2026</p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map(({ title, body }) => (
            <div key={title} className="rounded-2xl p-6" style={glassCard}>
              <h2 className="text-sm font-semibold text-indigo-300 mb-2">{title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Footer nav */}
        <div className="flex justify-center gap-6 mt-10 text-xs text-slate-600">
          <Link to="/terms" className="hover:text-slate-400 transition-colors">Terms of Service</Link>
          <Link to="/login" className="hover:text-slate-400 transition-colors">Back to Login</Link>
        </div>
      </div>
    </div>
  )
}
