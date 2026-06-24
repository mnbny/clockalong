import { type SVGProps, useId } from 'react'

import { cx } from '../utils/cx'

export type ClinearLogoProps = Omit<SVGProps<SVGSVGElement>, 'color'> & {
  backgroundColor?: string
  markColor?: string
  showBackground?: boolean
  title?: string
}

export function ClinearLogo({
  backgroundColor = '#151515',
  className,
  markColor = 'currentColor',
  showBackground = false,
  title,
  width = 32,
  height = 32,
  role,
  ...props
}: ClinearLogoProps) {
  const titleId = useId()
  const ariaHidden = title ? undefined : (props['aria-hidden'] ?? true)

  return (
    <svg
      aria-hidden={ariaHidden}
      aria-labelledby={title ? titleId : undefined}
      focusable="false"
      height={height}
      role={title ? 'img' : role}
      viewBox="0 0 500 500"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      className={cx('text-accent', className)}
      {...props}>
      {title ? <title id={titleId}>{title}</title> : null}
      {showBackground ? <rect width="500" height="500" rx="96" fill={backgroundColor} /> : null}
      <path
        fill={markColor}
        d="M250 42c66.9 0 128.6 31.9 167.5 84.4l-51.4 38.1C337 125.1 294.3 101 250 101c-82.4 0-149 66.6-149 149s66.6 149 149 149c44.2 0 86.8-24 116-63.3l51.3 38.2C378.3 426.1 316.8 458 250 458 135.1 458 42 364.9 42 250S135.1 42 250 42Z"
      />
      <path
        fill={markColor}
        d="M250 162c38.7 0 72.1 25 84.1 60H458v56H334.1c-12 35-45.4 60-84.1 60-49.2 0-89-39.8-89-89s39.8-87 89-87Zm0 56c-18.2 0-33 14.8-33 33s14.8 31 33 31 33-14.8 33-33-14.8-31-33-31Z"
      />
    </svg>
  )
}

export default ClinearLogo
