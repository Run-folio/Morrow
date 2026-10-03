"use client";

import { Map as MapIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { EasyTLinkButton } from './easyt-controls';
import { MorroviaSectionStatus } from './morrovia-loading-states';
import styles from './morrovia-map-preview.module.css';

/** Shared preview chrome. Each workspace supplies its existing map projection
 * and context-preserving full-map destination. */
export function MorroviaMapPreview({ title, href, children, size = 'standard', className = '', language = 'en' }: {
  title: string;
  href: string;
  children?: ReactNode;
  size?: 'standard' | 'large';
  className?: string;
  language?: 'en' | 'es';
}) {
  return <section className={`${styles.card} ${size === 'large' ? styles.large : ''} ${className}`} aria-label={title} data-map-preview="">
    <h3>{title}</h3>
    <div className={styles.frame}>
      {children ?? <div className={styles.empty}><MorroviaSectionStatus compact state="success" title={language === 'es' ? 'Aún no hay lugares en el mapa' : 'No mapped places yet'} detail={language === 'es' ? 'Añade un lugar para verlo aquí.' : 'Add a place to see it here.'} /></div>}
    </div>
    <EasyTLinkButton href={href} icon={MapIcon} variant="quiet" size="small" fullWidth>{language === 'es' ? 'Ver mapa' : 'View map'}</EasyTLinkButton>
  </section>;
}
