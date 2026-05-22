/**
 * Design Tokens
 * =============
 * Single source of truth for all visual constants.
 * Every color, spacing value, and style primitive in the app
 * should come from here — never hardcoded inline.
 *
 * Usage:
 *   import { tokens } from '../styles/tokens';
 *   style={{ background: tokens.color.surface.card }}
 */

export const tokens = {
  color: {
    // Base palette
    background: {
      page: '#0f1117',
      card: '#161b27',
      input: '#0f1117',
      hover: '#1e3a5f',
    },
    border: {
      default: '#1e2a3a',
      subtle: '#1a2232',
    },
    text: {
      primary: '#e2e8f0',
      secondary: '#94a3b8',
      muted: '#64748b',
      disabled: '#475569',
    },
    accent: {
      blue: '#3b82f6',
      blueDark: '#1d4ed8',
      green: '#22c55e',
      red: '#ef4444',
      redDark: '#7f1d1d',
      redText: '#fca5a5',
      purple: '#a78bfa',
      teal: '#34d399',
      amber: '#f59e0b',
    },
    status: {
      error: {
        background: '#1c1012',
        border: '#7f1d1d',
        text: '#fca5a5',
      },
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
  },

  radius: {
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
  },

  fontSize: {
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 15,
    xl: 22,
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  transition: {
    default: 'all 0.15s',
  },
} as const;

// Common component style presets — reduces repetition in components
export const presets = {
  card: {
    background: tokens.color.background.card,
    border: `1px solid ${tokens.color.border.default}`,
    borderRadius: tokens.radius.xl,
  },

  input: {
    width: '100%',
    background: tokens.color.background.input,
    border: `1px solid ${tokens.color.border.default}`,
    borderRadius: tokens.radius.md,
    padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
    color: tokens.color.text.primary,
    fontSize: tokens.fontSize.base,
    outline: 'none',
  },

  button: {
    primary: {
      display: 'flex',
      alignItems: 'center',
      gap: tokens.spacing.sm,
      background: tokens.color.accent.blueDark,
      color: tokens.color.text.primary,
      border: 'none',
      borderRadius: tokens.radius.lg,
      padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
      fontSize: tokens.fontSize.base,
      fontWeight: tokens.fontWeight.medium,
      cursor: 'pointer',
    },
    secondary: {
      display: 'flex',
      alignItems: 'center',
      gap: tokens.spacing.sm,
      background: tokens.color.border.default,
      color: tokens.color.text.secondary,
      border: 'none',
      borderRadius: tokens.radius.lg,
      padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
      fontSize: tokens.fontSize.base,
      fontWeight: tokens.fontWeight.normal,
      cursor: 'pointer',
    },
    danger: {
      display: 'flex',
      alignItems: 'center',
      gap: tokens.spacing.sm,
      background: tokens.color.accent.redDark,
      color: tokens.color.accent.redText,
      border: 'none',
      borderRadius: tokens.radius.lg,
      padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
      fontSize: tokens.fontSize.base,
      fontWeight: tokens.fontWeight.medium,
      cursor: 'pointer',
    },
  },
} as const;