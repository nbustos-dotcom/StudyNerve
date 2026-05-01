import { useState } from 'react'

const WF_NODE_W = 224

const STATUS_COLOR = {
  pending: '#6b7280',
  running: '#f59e0b',
  done:    '#10b981',
  failed:  '#ef4444',
}

export default function WorkflowNode({ node, index, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const output  = node.output_data
  const color   = STATUS_COLOR[node.status] || '#6b7280'
  const x = 2700
  const y = 80 + index * 270

  return (
    <div
      data-node="true"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: WF_NODE_W,
        zIndex: 5,
        userSelect: 'none',
      }}
    >
      <div style={{
        background: 'rgba(8,8,20,.96)',
        border: `1px solid ${color}44`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 12,
        padding: '10px 12px',
        backdropFilter: 'blur(18px)',
        boxShadow: '0 4px 22px rgba(0,0,0,.55)',
        boxSizing: 'border-box',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'rgba(165,180,252,.75)',
            textTransform: 'uppercase', letterSpacing: '.05em',
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            #{node.node_order} {node.node_type.replace(/_/g, ' ')}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 4, flexShrink: 0,
            background: `${color}18`,
            color: color,
            border: `1px solid ${color}30`,
          }}>
            {node.status}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(node.id) }}
            onMouseDown={e => e.stopPropagation()}
            style={{
              width: 16, height: 16, borderRadius: 3, border: 'none', cursor: 'pointer',
              background: 'rgba(239,68,68,.1)', color: '#f87171', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, lineHeight: 1, padding: 0,
            }}
          >×</button>
        </div>

        {/* Prompt preview */}
        {node.prompt && (
          <p style={{
            margin: '0 0 6px', fontSize: 11, color: 'rgba(255,255,255,.42)',
            lineHeight: 1.4, wordBreak: 'break-word',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {node.prompt}
          </p>
        )}

        {/* Running spinner */}
        {node.status === 'running' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10,
              border: '1.5px solid rgba(255,255,255,.12)', borderTopColor: '#f59e0b',
              borderRadius: '50%', animation: 'vb-spin 0.7s linear infinite',
            }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>Processing…</span>
          </div>
        )}

        {/* Output */}
        {output && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,.06)' }}>
            {output.type === 'text' && (
              <>
                <p style={{
                  margin: 0, fontSize: 11, color: 'rgba(255,255,255,.72)',
                  lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {expanded ? output.content : (output.content || '').slice(0, 300)}
                  {!expanded && (output.content || '').length > 300 && '…'}
                </p>
                {(output.content || '').length > 300 && (
                  <button
                    onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'rgba(165,180,252,.65)', fontSize: 11,
                      padding: '4px 0 0', display: 'block',
                    }}
                  >
                    {expanded ? 'Show less ↑' : 'Show more ↓'}
                  </button>
                )}
              </>
            )}
            {output.type === 'image' && output.content && (
              <img
                src={output.content}
                alt="AI output"
                style={{ width: '100%', borderRadius: 6, display: 'block', maxHeight: 160, objectFit: 'cover' }}
              />
            )}
            {output.type === '3d' && output.content && (
              <a
                href={output.content}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ color: 'rgba(165,180,252,.8)', fontSize: 11, textDecoration: 'underline' }}
              >
                ↓ Download 3D model (.glb)
              </a>
            )}
            {output.type === 'error' && (
              <p style={{ margin: 0, fontSize: 11, color: '#f87171', wordBreak: 'break-word' }}>
                {output.content}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
