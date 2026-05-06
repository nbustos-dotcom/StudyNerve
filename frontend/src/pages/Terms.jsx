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
    title: '1. Acceptance of Terms',
    body: `By accessing or using StudyNerve AI, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform. Continued use of StudyNerve AI after any changes to these terms constitutes your acceptance of the revised terms.`,
  },
  {
    title: '2. Description of Service',
    body: `StudyNerve AI is a free, AI-powered study tool designed to help students learn more effectively through personalized tutoring, quizzes, flashcards, notes, and interactive chat. The service is provided at no cost to users and is intended for personal, educational use only.`,
  },
  {
    title: '3. User Accounts',
    body: `You are responsible for maintaining the confidentiality of your account credentials, including your email and password. You are solely responsible for all activity that occurs under your account. You agree to notify us immediately of any unauthorized use of your account. StudyNerve AI is not liable for any loss or damage arising from your failure to protect your credentials.`,
  },
  {
    title: '4. API Keys',
    body: `StudyNerve AI allows you to provide your own third-party API keys (such as Groq, Gemini, OpenAI, and Anthropic) to power AI features. You provide these keys voluntarily and at your own risk. StudyNerve AI encrypts all stored API keys and does not share them with any party other than the intended AI provider for service operation. You are solely responsible for complying with the terms of service of the third-party provider whose API key you use.`,
  },
  {
    title: '5. User Content',
    body: `Your notes, quizzes, flashcard sets, chat history, and all other data you create on StudyNerve AI belong to you. You retain full ownership of your content. By using the platform, you grant StudyNerve AI a limited, non-exclusive license to store and process your content solely for the purpose of providing the service to you. We do not sell, share, or use your content for any other purpose.`,
  },
  {
    title: '6. Intellectual Property',
    body: `StudyNerve AI — including its source code, design, branding, interface, and all original content — is the exclusive intellectual property of Nate Bustos. All rights are reserved. You may not copy, reproduce, reverse engineer, decompile, disassemble, modify, distribute, or create derivative works from any part of this platform without express written permission from the owner.`,
  },
  {
    title: '7. No Warranty',
    body: `StudyNerve AI is provided "as-is" and "as available" without warranties of any kind, either express or implied. We do not guarantee the accuracy, completeness, or reliability of any AI-generated content, study materials, quiz questions, or tutoring responses. AI systems can make mistakes — always verify important information with authoritative sources.`,
  },
  {
    title: '8. Limitation of Liability',
    body: `To the fullest extent permitted by law, Nate Bustos and StudyNerve AI shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the service. This includes, without limitation, any loss of data, academic outcomes, or reliance on AI-generated content.`,
  },
  {
    title: '9. Changes to Terms',
    body: `We reserve the right to modify these Terms of Service at any time. Updated terms will be posted on this page with the effective date. Your continued use of StudyNerve AI after changes are posted constitutes your acceptance of the new terms. We encourage you to review this page periodically.`,
  },
  {
    title: '10. Contact',
    body: `If you have any questions or concerns about these Terms of Service, please contact us at studynerveai@gmail.com.`,
  },
]

export default function Terms() {
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
            Terms of Service
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
          <Link to="/privacy" className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
          <Link to="/login" className="hover:text-slate-400 transition-colors">Back to Login</Link>
        </div>
      </div>
    </div>
  )
}
