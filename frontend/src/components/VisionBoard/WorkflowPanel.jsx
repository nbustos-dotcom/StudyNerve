import { useState, useEffect, useRef } from 'react'
import { wf } from '../../api/workflow.js'

const NODE_TYPES = [
  'claude_text', 'chatgpt_text', 'gemini_text',
  'chatgpt_image', 'gemini_image', 'stability_image',
  'meshy_3d',
  'internal_quiz', 'internal_flashcard', 'internal_summary',
]

const STATUS_COLOR = {
  awaiting_confirmation: '#a5b4fc',
  running:  '#f59e0b',
  done:     '#10b981',
  failed:   '#ef4444',
}

const STATUS_LABEL = {
  awaiting_confirmation: 'planned',
  running:  'running',
  done:     'done',
  failed:   'failed',
}

export default function WorkflowPanel({ boardId, nodes, setNodes }) {
  const [addOpen, setAddOpen]   = useState(false)
  const [form, setForm]         = useState({ node_type: 'claude_text', prompt: '', input_from_node_id: '' })
  const [busy, setBusy]         = useState(false)
  const [planData, setPlanData] = useState(null)   // { run_id, status, plan }
  const [planOpen, setPlanOpen] = useState(false)
  const [runStatus, setRunStatus] = useState(null)
  const [error, setError]       = useState(null)
  const pollRef                 = useRef(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  function startPolling(rid) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const run = await wf.getRun(rid)
        setRunStatus(run.status)
        if (run.nodes?.length) {
          setNodes(prev => prev.map(n => {
            const rn = run.nodes.find(x => x.id === n.id)
            return rn ? { ...n, status: rn.status, output_data: rn.output_data } : n
          }))
        }
        if (run.status === 'done' || run.status === 'failed') {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      } catch {}
    }, 2000)
  }

  async function handleAddNode(e) {
    e.preventDefault()
    if (!form.node_type || busy) return
    setBusy(true)
    setError(null)
    try {
      const node = await wf.createNode({
        vision_board_id: boardId,
        node_order: nodes.length + 1,
        node_type: form.node_type,
        prompt: form.prompt.trim() || null,
        input_from_node_id: form.input_from_node_id ? Number(form.input_from_node_id) : null,
      })
      setNodes(prev => [...prev, node])
      setAddOpen(false)
      setForm({ node_type: 'claude_text', prompt: '', input_from_node_id: '' })
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function handlePlan() {
    if (nodes.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await wf.plan(boardId)
      setPlanData(result)
      setRunStatus(result.status)
      setPlanOpen(true)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function handleExecute() {
    if (!planData?.run_id || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await wf.execute(planData.run_id)
      setRunStatus(result.status)
      setPlanOpen(false)
      startPolling(result.run_id)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current)
    setPlanData(null)
    setRunStatus(null)
    setError(null)
  }

  const isRunning   = runStatus === 'running'
  const canPlan     = nodes.length > 0 && !busy && !isRunning
  const canExecute  = (runStatus === 'awaiting_confirmation' || runStatus === 'failed') && !busy && !isRunning

  return (
    <>
      {/* Floating panel */}
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 60,
          right: 12,
          width: 232,
          zIndex: 200,
          background: 'rgba(7,7,20,.97)',
          border: '1px solid rgba(99,102,241,.26)',
          borderRadius: 12,
          backdropFilter: 'blur(22px)',
          boxShadow: '0 8px 36px rgba(0,0,0,.6)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(165,180,252,.9)' }}>⚡ Workflow</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.22)', flex: 1 }}>
            {nodes.length} node{nodes.length !== 1 ? 's' : ''}
          </span>
          {runStatus && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
              background: `${STATUS_COLOR[runStatus] || '#6b7280'}18`,
              color: STATUS_COLOR[runStatus] || '#6b7280',
              border: `1px solid ${STATUS_COLOR[runStatus] || '#6b7280'}30`,
            }}>
              {STATUS_LABEL[runStatus] || runStatus}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {error && (
            <p style={{ margin: 0, fontSize: 11, color: '#f87171', wordBreak: 'break-word', lineHeight: 1.4 }}>{error}</p>
          )}

          {/* Add Node toggle */}
          <button
            onClick={() => setAddOpen(v => !v)}
            style={btnStyle(addOpen ? 'active' : 'default')}
          >
            {addOpen ? '− Cancel' : '+ Add Node'}
          </button>

          {/* Add Node form */}
          {addOpen && (
            <form onSubmit={handleAddNode} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <select
                value={form.node_type}
                onChange={e => setForm(f => ({ ...f, node_type: e.target.value }))}
                style={selectStyle}
              >
                {NODE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              <textarea
                value={form.prompt}
                onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                placeholder="Prompt (optional)"
                rows={2}
                style={{ ...selectStyle, resize: 'none', fontFamily: 'inherit' }}
              />
              {nodes.length > 0 && (
                <select
                  value={form.input_from_node_id}
                  onChange={e => setForm(f => ({ ...f, input_from_node_id: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="">Chain from: none</option>
                  {nodes.map(n => (
                    <option key={n.id} value={n.id}>
                      #{n.node_order} {n.node_type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: '6px', borderRadius: 7, border: 'none',
                  background: busy ? 'rgba(99,102,241,.3)' : 'rgba(99,102,241,.7)',
                  color: 'white', fontSize: 12, fontWeight: 600,
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                {busy ? '…' : 'Add'}
              </button>
            </form>
          )}

          {/* Plan */}
          <button
            onClick={handlePlan}
            disabled={!canPlan}
            style={btnStyle(canPlan ? 'purple' : 'disabled')}
          >
            {busy && !addOpen ? '…' : '📋 Plan'}
          </button>

          {/* Execute */}
          {canExecute && (
            <button onClick={handleExecute} style={btnStyle('green')}>
              ▶ Execute
            </button>
          )}

          {/* Running indicator */}
          {isRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
              <span style={{
                display: 'inline-block', width: 10, height: 10,
                border: '1.5px solid rgba(255,255,255,.12)', borderTopColor: '#f59e0b',
                borderRadius: '50%', animation: 'vb-spin 0.7s linear infinite',
              }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.38)' }}>Running… (polling)</span>
            </div>
          )}

          {/* View plan / Reset row */}
          {planData && (
            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={() => setPlanOpen(true)} style={{ ...btnStyle('ghost'), flex: 1 }}>
                View plan
              </button>
              {(runStatus === 'done' || runStatus === 'failed') && (
                <button onClick={handleReset} style={{ ...btnStyle('ghost'), flex: 1 }}>
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Plan modal */}
      {planOpen && planData?.plan && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setPlanOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'rgba(7,7,20,.98)', border: '1px solid rgba(99,102,241,.28)',
              borderRadius: 14, padding: 20, maxWidth: 540, width: '100%',
              maxHeight: '80vh', overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,.75)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.88)', flex: 1 }}>
                Execution Plan
              </span>
              <button
                onClick={() => setPlanOpen(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 20, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
              >×</button>
            </div>

            {planData.plan.summary && (
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'rgba(255,255,255,.6)', lineHeight: 1.6 }}>
                {planData.plan.summary}
              </p>
            )}

            {planData.plan.steps?.map((step, i) => (
              <div key={i} style={{
                padding: '10px 12px', marginBottom: 8, borderRadius: 8,
                background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(165,180,252,.7)' }}>
                    Step {step.node_order}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>
                    {step.node_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.65)', lineHeight: 1.5 }}>
                  {step.action}
                </p>
                {step.chaining_note && step.chaining_note !== 'First node — no upstream input' && (
                  <p style={{ margin: '5px 0 0', fontSize: 11, color: 'rgba(165,180,252,.45)', lineHeight: 1.4 }}>
                    ↑ {step.chaining_note}
                  </p>
                )}
              </div>
            ))}

            {planData.plan.warnings?.length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.2)' }}>
                {planData.plan.warnings.map((w, i) => (
                  <p key={i} style={{ margin: i > 0 ? '4px 0 0' : 0, fontSize: 11, color: '#fbbf24' }}>⚠ {w}</p>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPlanOpen(false)}
                style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'none', color: 'rgba(255,255,255,.45)', fontSize: 13, cursor: 'pointer' }}
              >
                Close
              </button>
              {canExecute && (
                <button
                  onClick={handleExecute}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,.65)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  ▶ Execute
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Style helpers ──────────────────────────────────────────────────────────────

const selectStyle = {
  padding: '5px 8px', borderRadius: 6,
  border: '1px solid rgba(255,255,255,.1)',
  background: 'rgba(255,255,255,.05)',
  color: 'rgba(255,255,255,.8)', fontSize: 12,
  width: '100%', boxSizing: 'border-box',
}

function btnStyle(variant) {
  const base = {
    padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', textAlign: 'left', width: '100%', boxSizing: 'border-box',
  }
  if (variant === 'active')    return { ...base, background: 'rgba(99,102,241,.18)',  border: '1px solid rgba(99,102,241,.4)',    color: 'rgba(165,180,252,.9)' }
  if (variant === 'default')   return { ...base, background: 'rgba(99,102,241,.07)',  border: '1px solid rgba(99,102,241,.25)',   color: 'rgba(165,180,252,.75)' }
  if (variant === 'purple')    return { ...base, background: 'rgba(139,92,246,.1)',   border: '1px solid rgba(139,92,246,.3)',    color: 'rgba(196,181,253,.85)', cursor: 'pointer' }
  if (variant === 'green')     return { ...base, background: 'rgba(16,185,129,.1)',   border: '1px solid rgba(16,185,129,.3)',    color: 'rgba(52,211,153,.9)' }
  if (variant === 'ghost')     return { ...base, background: 'none',                  border: '1px solid rgba(255,255,255,.09)', color: 'rgba(255,255,255,.35)', fontSize: 11 }
  if (variant === 'disabled')  return { ...base, background: 'rgba(99,102,241,.04)',  border: '1px solid rgba(99,102,241,.1)',   color: 'rgba(255,255,255,.2)',  cursor: 'default' }
  return base
}
