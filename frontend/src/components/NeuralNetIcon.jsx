/**
 * NeuralNetIcon — the StudyNerve AI logo mark as an inline React SVG.
 *
 * Props:
 *   size      — rendered width/height in px (default 32)
 *   idPrefix  — unique string to namespace the gradient/filter IDs so
 *               multiple instances on the same page don't collide
 *               (default 'nn'; use e.g. 'nav', 'chat-avatar')
 */
export default function NeuralNetIcon({ size = 32, idPrefix = 'nn' }) {
  const gId = `${idPrefix}-ng`
  const fId = `${idPrefix}-glow`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <defs>
        {/* Node fill: violet highlight → indigo */}
        <radialGradient id={gId} cx="38%" cy="35%" r="65%">
          <stop offset="0%"   stopColor="#a78bfa" />
          <stop offset="60%"  stopColor="var(--indigo-400)" />
          <stop offset="100%" stopColor="var(--indigo-500)" />
        </radialGradient>

        {/*
          Glow: blur SourceGraphic, composite sharp original back on top.
          filterUnits="userSpaceOnUse" keeps coords in the 0-32 space
          regardless of the rendered pixel size.
        */}
        <filter id={fId} x="0" y="0" width="32" height="32" filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
          <feComposite    in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Connection lines — asymmetric network */}
      <g stroke="var(--indigo-400)" strokeOpacity="0.55" strokeWidth="0.9"
         strokeLinecap="round" fill="none">
        <line x1="19" y1="5"  x2="25" y2="7"  />  {/* F – B */}
        <line x1="7"  y1="9"  x2="16" y2="16" />  {/* A – C */}
        <line x1="25" y1="7"  x2="16" y2="16" />  {/* B – C */}
        <line x1="16" y1="16" x2="5"  y2="25" />  {/* C – D */}
        <line x1="16" y1="16" x2="26" y2="25" />  {/* C – E */}
        <line x1="7"  y1="9"  x2="5"  y2="25" />  {/* A – D skip */}
        <line x1="25" y1="7"  x2="26" y2="25" />  {/* B – E skip */}
      </g>

      {/* Nodes — centre hub slightly larger */}
      <g fill={`url(#${gId})`} filter={`url(#${fId})`}>
        <circle cx="19" cy="5"  r="2.2" />  {/* F – top accent  */}
        <circle cx="7"  cy="9"  r="2.5" />  {/* A – upper left  */}
        <circle cx="25" cy="7"  r="2.5" />  {/* B – upper right */}
        <circle cx="16" cy="16" r="3.1" />  {/* C – centre hub  */}
        <circle cx="5"  cy="25" r="2.5" />  {/* D – lower left  */}
        <circle cx="26" cy="25" r="2.5" />  {/* E – lower right */}
      </g>
    </svg>
  )
}
