import { clsx } from 'clsx'

const variants = {
  primary: 'button--primary',
  secondary: 'button--secondary',
  ghost: 'button--ghost',
  danger: 'button--danger',
}

export default function Button({
  children,
  className,
  icon: Icon,
  variant = 'primary',
  type = 'button',
  ...props
}) {
  return (
    <button
      className={clsx('button', variants[variant], className)}
      type={type}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2.2} /> : null}
      <span>{children}</span>
    </button>
  )
}
