import type {ComponentProps} from 'react';
import type {ClerkProvider} from '@clerk/nextjs';

type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>['appearance']>;
type Localization = NonNullable<ComponentProps<typeof ClerkProvider>['localization']>;

/** Copy on Clerk screens. New users get a welcome line; returning users see the title only. */
export const clerkLocalization: Localization = {
  signUp: {start: {subtitle: 'Welcome to Quiet Table. Create your account below.'}},
};

/** Clerk's sign-in, sign-up and account screens, styled with Astryx tokens so
 * they read as part of the app rather than Clerk's default look. */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: 'var(--color-background-inverted)',
    colorPrimaryForeground: 'var(--color-on-dark)',
    colorForeground: 'var(--color-text-primary)',
    colorMutedForeground: 'var(--color-text-secondary)',
    colorBackground: 'var(--color-background-card)',
    colorInput: 'var(--color-background-surface)',
    colorInputForeground: 'var(--color-text-primary)',
    colorBorder: 'var(--color-border-emphasized)',
    colorDanger: 'var(--color-error)',
    colorSuccess: 'var(--color-success)',
    colorWarning: 'var(--color-warning)',
    fontFamily: 'var(--font-family-body)',
    fontFamilyButtons: 'var(--font-family-body)',
    borderRadius: 'var(--radius-element)',
  },
  options: {
    socialButtonsVariant: 'blockButton',
    // The orange stripe flags Clerk development keys. Hidden for the beta;
    // switch to production keys before a wider launch.
    unsafe_disableDevelopmentModeWarnings: true,
  },
  elements: {
    // Flat card with a hairline border, like Astryx cards: no Clerk shadow.
    cardBox: {
      boxShadow: 'none',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-container)',
    },
    // Tighter bottom so "Already have an account?" sits closer to Continue.
    card: {
      boxShadow: 'none',
      background: 'var(--color-background-card)',
      paddingBottom: 'var(--spacing-4)',
    },
    // Footer sits on the card instead of Clerk's grey band.
    footer: {background: 'var(--color-background-card)'},
    // Clerk draws borders as box shadows at ~10% opacity and its own rules win
    // on specificity, so these overrides need !important to take effect.
    // Solid button, no gradient, shadow or arrow.
    formButtonPrimary: {
      background: 'var(--color-background-inverted)',
      color: 'var(--color-on-dark)',
      boxShadow: 'none !important',
      textTransform: 'none',
      '&::after': {display: 'none'},
      '&:hover, &:focus, &:active': {background: 'var(--color-background-inverted)', opacity: 0.88},
    },
    buttonArrowIcon: {display: 'none'},
    socialButtonsBlockButton: {boxShadow: '0 0 0 1px var(--color-border-emphasized) !important'},
    formFieldInput: {
      boxShadow: '0 0 0 1px var(--color-border-emphasized) !important',
      '&:focus': {boxShadow: '0 0 0 2px var(--color-text-primary) !important'},
    },
    dividerLine: {background: 'var(--color-border-emphasized)'},
    // Line above "Secured by Clerk", same as the card outline.
    footerItem: {borderTopColor: 'var(--color-border) !important'},
    headerTitle: {fontWeight: 600},
    footerActionLink: {color: 'var(--color-text-primary)', fontWeight: 600},
  },
  // Returning users: title only, no "Welcome back! Please sign in…" line.
  signIn: {elements: {headerSubtitle: {display: 'none'}}},
};
