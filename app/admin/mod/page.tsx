import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { modConsoleEnabled } from '@/lib/mod-console';
import { ModConsole } from './mod-console';

export const metadata: Metadata = { title: 'Mod console', robots: { index: false, follow: false } };

/** #880: staff mod console (read-only first slice). Flag off = 404, like the admin routes it reads. */
export default function ModConsolePage() {
  if (!modConsoleEnabled()) notFound();
  return <ModConsole />;
}
