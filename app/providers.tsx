'use client';

import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import './auth-ui.css';
import {DisplayPreferencesProvider} from './display-preferences';

export const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function Providers({ children }: { children: ReactNode }) {
  if (!clerkConfigured) return <DisplayPreferencesProvider>{children}</DisplayPreferencesProvider>;

  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      localization={{ userButton: { action__openUserMenu: 'Account menu', action__closeUserMenu: 'Close account menu' } }}
      appearance={{
        variables: {
          colorPrimary: '#72c7b9',
          colorBackground: '#0c1a1e',
          colorForeground: '#f3ecd8',
          colorNeutral: '#f3ecd8',
          colorMuted: '#15272b',
          colorMutedForeground: '#b2c3bf',
          colorInput: '#09171b',
          colorInputForeground: '#f3ecd8',
          colorBorder: '#38514f',
          colorRing: '#72c7b9',
          colorModalBackdrop: '#02090d',
          colorDanger: '#ffafa0',
          borderRadius: '6px',
          fontSize: '14px',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        },
        elements: {
          cardBox: 'harimu-auth-card',
          userButtonPopoverCard: 'harimu-auth-popover',
          userButtonTrigger: 'harimu-auth-trigger',
          userButtonPopoverActionButton: 'harimu-auth-menu-action',
          userButtonPopoverActionButtonIcon: 'harimu-auth-menu-icon',
          modalContent: 'harimu-auth-modal',
        },
      }}
    >
      <DisplayPreferencesProvider>{children}</DisplayPreferencesProvider>
    </ClerkProvider>
  );
}
