import { useState, useCallback } from 'react'
import { toRichText } from '@tldraw/tlschema'
import { api } from '../api/client'

const ACTION_LABELS = {
  ask:     '💬 Asking a question',
  cluster: '🗂 Clustering ideas',
  expand:  '🔭 Expanding further',
}

function GhostSticky({ text }) {
  return (
    <div style={{
      flexShrink: 0,
      width: 180,
      minHeight: 64,
      padding: '10px 12px',
      background: 'rgba(15, 58, 74, 0.7)',
      border: '1.5px dashed var(--bs-accent)',
      borderRadius: 6,
      boxShadow: '0 0 10px rgba(86, 207, 225, 0.18)',
      fontFamily: "'Caveat', cursive",
      fontSize: '1rem',
      color: '#E8F8FB',
      lineHeight: 1.4,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {text}
    </div>
  )
}

export default function MakeSenseButton({ editor, boardId }) {
  const [phase, setPhase] = useState('idle')   // idle | loading | result | error
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleClick = useCallback(async () => {
    if (!editor || phase === 'loading') return
    setPhase('loading')
    try {
      const snapshot = editor.getSnapshot()
      const data = await api.visionMakeSense(boardId, JSON.stringify(snapshot))
      setResult(data)
      setPhase('result')
    } catch {
      setErrorMsg("Couldn't read canvas, try again.")
      setPhase('error')
      setTimeout(() => setPhase('idle'), 3000)
    }
  }, [editor, boardId, phase])

  const handleAccept = useCallback(() => {
    if (!result?.items?.length || !editor) return
    const shapes = result.items
      .filter(item => item.type === 'sticky')
      .map(item => ({
        type: 'note',
        x: item.x,
        y: item.y,
        props: {
          color: 'black',
          font: 'draw',
          richText: toRichText(item.text || ''),
        },
      }))
    if (shapes.length) {
      editor.createShapes(shapes)
    }
    setPhase('idle')
    setResult(null)
  }, [result, editor])

  const handleDismiss = useCallback(() => {
    setPhase('idle')
    setResult(null)
  }, [])

  return (
    <>
      {/* ── Result overlay ──────────────────────────────────────────────── */}
      {phase === 'result' && result && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 400,
          padding: '0 16px 16px',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(8, 24, 36, 0.95)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid #1F4A5C',
            borderRadius: 14,
            boxShadow: '0 0 0 1px rgba(86,207,225,0.08), 0 -4px 32px rgba(0,0,0,0.5)',
            padding: '14px 16px',
            pointerEvents: 'all',
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--bs-accent)',
                background: 'rgba(86,207,225,0.1)',
                border: '1px solid rgba(86,207,225,0.25)',
                borderRadius: 4,
                padding: '2px 8px',
              }}>
                {ACTION_LABELS[result.action] ?? `✨ ${result.action}`}
              </span>
              <span style={{
                fontSize: '0.82rem',
                color: 'rgba(232,248,251,0.65)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {result.explanation}
              </span>
            </div>

            {/* Ghost stickies */}
            <div style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 6,
              marginBottom: 12,
              scrollbarWidth: 'thin',
            }}>
              {result.items.map((item, i) => (
                <GhostSticky key={i} text={item.text} />
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={handleDismiss}
                style={{
                  padding: '6px 16px',
                  background: 'transparent',
                  border: '1px solid #1F4A5C',
                  borderRadius: 8,
                  color: 'rgba(232,248,251,0.5)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <button
                onClick={handleAccept}
                style={{
                  padding: '6px 20px',
                  background: 'rgba(86,207,225,0.12)',
                  border: '1px solid var(--bs-accent)',
                  borderRadius: 8,
                  color: 'var(--bs-accent)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 0 12px rgba(86,207,225,0.2)',
                }}
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating trigger button ──────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        right: 16,
        zIndex: 400,
      }}>
        {phase === 'error' ? (
          <div style={{
            padding: '8px 14px',
            background: 'rgba(255,80,80,0.12)',
            border: '1px solid rgba(255,80,80,0.4)',
            borderRadius: 10,
            color: '#ff8080',
            fontSize: '0.82rem',
            maxWidth: 220,
          }}>
            {errorMsg}
          </div>
        ) : (
          <button
            onClick={handleClick}
            disabled={phase === 'loading' || phase === 'result'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 18px',
              background: phase === 'result'
                ? 'rgba(86,207,225,0.08)'
                : 'rgba(10, 31, 46, 0.92)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid #1F4A5C',
              borderRadius: 24,
              color: phase === 'loading' ? 'rgba(86,207,225,0.5)' : 'var(--bs-accent)',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: phase === 'loading' ? 'default' : 'pointer',
              boxShadow: phase === 'loading'
                ? 'none'
                : '0 0 16px rgba(86,207,225,0.2), 0 4px 12px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {phase === 'loading' ? (
              <>
                <span style={{ animation: 'bs-spin 1.2s linear infinite', display: 'inline-block' }}>✦</span>
                Reading your canvas…
              </>
            ) : (
              <>✨ Make Sense</>
            )}
          </button>
        )}
      </div>

      <style>{`
        @keyframes bs-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}
