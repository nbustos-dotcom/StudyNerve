import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { setApiToastHandler } from '../api/client'

const ToastCtx = createContext(null)

export function useToast() {
  return useContext(ToastCtx)
}

let _nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++_nextId
    setToasts((prev) => [...prev.slice(-4), { id, message, type }])
    timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  // Register with the API client so 429/503 responses can surface a toast.
  // The client module is plain JS and can't read React context directly.
  useEffect(() => {
    setApiToastHandler(showToast)
    return () => setApiToastHandler(null)
  }, [showToast])

  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 72,
          right: 16,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function ToastItem({ toast, onDismiss }) {
  const colors = {
    success: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)', text: '#6ee7b7', icon: '✓' },
    error:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.35)',  text: '#fca5a5', icon: '✕' },
    info:    { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.35)', text: '#a5b4fc', icon: 'ℹ' },
    fire:    { bg: 'rgba(251,146,60,0.15)', border: 'rgba(251,146,60,0.35)', text: '#fdba74', icon: '🔥' },
  }
  const c = colors[toast.type] || colors.info

  return (
    <div
      onClick={() => onDismiss(toast.id)}
      style={{
        pointerEvents: 'all',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 10,
        background: c.bg,
        border: `1px solid ${c.border}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        maxWidth: 320,
        animation: 'toast-slide-in 0.2s ease',
      }}
    >
      <span style={{ fontSize: 14, color: c.text, flexShrink: 0 }}>{c.icon}</span>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{toast.message}</span>
    </div>
  )
}
