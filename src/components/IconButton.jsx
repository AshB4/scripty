import { clsx } from 'clsx'

export default function IconButton({
  label,
  icon: Icon,
  className,
  type = 'button',
  ...props
}) {
  return (
    <button
      aria-label={label}
      className={clsx('icon-button', className)}
      title={label}
      type={type}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={19} strokeWidth={2.2} /> : null}
    </button>
  )
}
