import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface PageHeadProps {
  eyebrow?: string;
  title: string;
  lead?: string;
  iconName?: string;
  aside?: ReactNode;
}

export function PageHead({ eyebrow, title, lead, iconName, aside }: PageHeadProps) {
  return (
    <header className="page-head">
      {iconName ? (
        <div className="page-head__icon">
          <Icon name={iconName} size={34} />
        </div>
      ) : null}
      <div className="page-head__text">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 tabIndex={-1}>{title}</h1>
        {lead ? <p className="page-head__lead">{lead}</p> : null}
      </div>
      {aside ? <div className="page-head__aside">{aside}</div> : null}
    </header>
  );
}
