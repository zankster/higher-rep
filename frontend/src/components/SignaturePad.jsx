// trainer-fork: a finger signature (Phase 2e). Drawn on a canvas with pointer events, handed on as
// a JPEG on white (data URL) after each stroke, which is what the record and its PDF keep.
import { useEffect, useRef, useState } from 'react'
import { ct } from '../lib/coaching.js'

const HEIGHT = 140

/** A white-backed JPEG of what is drawn, or null when nothing is. */
export function signatureImage(canvas) {
  const out = document.createElement('canvas')
  out.width = canvas.width; out.height = canvas.height
  const g = out.getContext('2d')
  if (!g) return null
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, out.width, out.height)
  g.drawImage(canvas, 0, 0)
  return out.toDataURL('image/jpeg', 0.85)
}

export default function SignaturePad({ onChange, label }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2)
    c.width = Math.round(c.clientWidth * ratio) || 600
    c.height = Math.round(HEIGHT * ratio)
    const g = c.getContext('2d')
    if (!g) return
    g.scale(ratio, ratio)
    g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111111'
  }, [])

  const at = e => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const down = e => {
    e.preventDefault()
    ref.current.setPointerCapture?.(e.pointerId)
    drawing.current = true
    last.current = at(e)
    const g = ref.current.getContext('2d')
    if (g) { g.beginPath(); g.arc(last.current[0], last.current[1], 1.2, 0, Math.PI * 2); g.fillStyle = '#111111'; g.fill() }
  }
  const move = e => {
    if (!drawing.current) return
    e.preventDefault()
    const g = ref.current.getContext('2d'), p = at(e)
    if (g) { g.beginPath(); g.moveTo(...last.current); g.lineTo(...p); g.stroke() }
    last.current = p
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    setEmpty(false)
    onChange?.(signatureImage(ref.current))
  }
  const clear = () => {
    const c = ref.current, g = c.getContext('2d')
    if (g) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.restore() }
    setEmpty(true)
    onChange?.(null)
  }

  // White on purpose, in dark mode too: it is a piece of paper, and the ink must show on the PDF.
  return <div style={{ position: 'relative', borderRadius: 12, border: '0.5px solid var(--sep)', background: '#ffffff', overflow: 'hidden' }}>
    <canvas ref={ref} role="img" aria-label={label || ct('Signature')} data-signature
      style={{ display: 'block', width: '100%', height: HEIGHT, touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
    {empty && <span className="small" style={{ position: 'absolute', left: 12, bottom: 8, color: '#8e8e93', pointerEvents: 'none' }}>{ct('Sign with your finger')}</span>}
    {!empty && <button className="small" onClick={clear} style={{ position: 'absolute', right: 10, bottom: 6, color: '#2457E6', background: 'none', border: 0, padding: 4 }}>{ct('Clear')}</button>}
  </div>
}
