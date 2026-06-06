import { Component } from 'react'

// Class boundary because React only catches render-time errors in classes.
// Wrap the whole <Routes> tree once at the top level, and wrap individual
// high-risk routes so one crashing route shows this fallback in place
// instead of white-screening the entire app.
//
// Props:
//   children — the subtree to protect
//   label    — short noun shown in the message ("The quiz", "AI Brain", etc.)
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught render error:', error)
    if (info?.componentStack) {
      console.error('[ErrorBoundary] Component stack:', info.componentStack)
    }
  }

  handleRefresh = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { label } = this.props
    const detail = label
      ? `${label} hit an unexpected error.`
      : 'An unexpected error stopped this page from rendering.'

    return (
      <div className="px-4 sm:px-8 py-16 max-w-md mx-auto fade-in-up">
        <div
          className="card p-8 flex flex-col items-center text-center gap-4"
          role="alert"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: 'rgba(239, 68, 68, 0.10)',
              border: '1px solid rgba(239, 68, 68, 0.22)',
            }}
          >
            <svg
              className="w-6 h-6 text-red-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-ink-primary mb-1.5">
              Something went wrong
            </p>
            <p className="text-sm text-ink-muted leading-relaxed">
              {detail} Refreshing usually fixes it.
            </p>
          </div>
          <button onClick={this.handleRefresh} className="btn-primary mt-1">
            Refresh page
          </button>
        </div>
      </div>
    )
  }
}
