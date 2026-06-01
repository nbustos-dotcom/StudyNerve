export default function Logo({ size = 24, className = '' }) {
  return (
    <img
      src="/logo.svg"
      alt="StudyNerve"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
    />
  )
}
