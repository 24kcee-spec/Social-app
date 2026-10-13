export const tokens = {
  colors: {
    background: {
      pure: '#FFFFFF',
      surface: '#FFFFFF',
      canvas: '#F8FAFC',
      subtle: '#F1F5F9',
      card: '#FFFFFF',
      border: '#E2E8F0',
      borderLight: '#F1F5F9',
      scrim: 'rgba(15, 23, 42, 0.65)',
    },
    accent: {
      cobalt: '#2563EB',
      cobaltDark: '#1D4ED8',
      cobaltLight: '#EFF6FF',
      teal: '#0D9488',
      tealLight: '#CCFBF1',
      amber: '#F59E0B',
      amberLight: '#FEF3C7',
      indigo: '#4F46E5',
      indigoLight: '#EEF2FF',
      emerald: '#10B981',
      roseAlert: '#F43F5E',
    },
    text: {
      primary: '#0F172A',
      secondary: '#334155',
      muted: '#64748B',
      subtle: '#94A3B8',
      inverted: '#FFFFFF',
    },
    status: {
      studentVerified: '#10B981',
      urgent: '#F43F5E',
      active: '#2563EB',
    },
  },
  typography: {
    fontFamilies: { display: 'System', body: 'System', mono: 'Courier' },
    fontSizes: { micro: 10, caption: 11, sub: 13, body: 15, lead: 17, heading: 20, xl: 24, hero: 30 },
  },
  radii: { xs: 6, sm: 8, md: 12, lg: 16, xl: 20, full: 9999 },
  hitboxes: { minTouchTarget: 44, ctaTouchTarget: 48 },
} as const;

export type DesignTokens = typeof tokens;
