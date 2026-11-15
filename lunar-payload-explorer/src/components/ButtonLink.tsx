import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonLinkProps {
  to: string;
  children: ReactNode;
  variant?: Variant;
  size?: 'sm' | 'md';
  block?: boolean;
  iconBefore?: IconName;
  iconAfter?: IconName;
  className?: string;
  ariaLabel?: string;
}

/** Router link styled as a button (the prototype's `.btn` classes). */
export function ButtonLink({
  to,
  children,
  variant = 'secondary',
  size = 'md',
  block = false,
  iconBefore,
  iconAfter,
  className,
  ariaLabel,
}: ButtonLinkProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Link className={classes} to={to} aria-label={ariaLabel}>
      {iconBefore ? <Icon name={iconBefore} size={18} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={18} /> : null}
    </Link>
  );
}
