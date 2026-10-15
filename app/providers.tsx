'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { useMemo, type ReactNode } from 'react';
import './auth-ui.css';
import {DisplayPreferencesProvider,useDisplayPreferences} from './display-preferences';
import {clerkFontSize} from '../lib/display-preferences';

export const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function Providers({ children }: { children: ReactNode }) {
  if (!clerkConfigured) return <DisplayPreferencesProvider>{children}</DisplayPreferencesProvider>;
  // #346: Clerk sits inside the display preferences so its base font size follows the Text size setting.
  return <DisplayPreferencesProvider><ScaledClerk>{children}</ScaledClerk></DisplayPreferencesProvider>;
}

function ScaledClerk({ children }: { children: ReactNode }) {
  const { preferences } = useDisplayPreferences();
  const fontSize = clerkFontSize(preferences.textScale);
  const appearance = useMemo(() => clerkAppearance(fontSize), [fontSize]);
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      localization={{ userButton: { action__openUserMenu: 'Account menu', action__closeUserMenu: 'Close account menu' } }}
      appearance={appearance}
    >
      {children}
    </ClerkProvider>
  );
}

function clerkAppearance(fontSize: string) {
  return {
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
      fontSize,
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
  };
}
