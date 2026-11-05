export const colors = {
  // Brand primary: a dusty rose sunset — warm, romantic, nostalgic.
  primary: '#E27AA0',
  primaryLight: '#FBDCE6',
  primaryDark: '#B85478',
  // 공용 버튼 배경 (옛 gradients.primary 의 중간색보다 살짝 진하게).
  primaryMid: '#E990AF',

  // Accent pairs — peach/gold + soft lavender to echo twilight light.
  secondary: '#F6B5C8',
  accent: '#FFCBA4',
  lavender: '#B8A1C8',

  // Surfaces: warm blush cream so soft-white cards glow.
  background: '#FFF4EE',
  surface: '#FDE7EE',
  card: '#FFFAFA',
  cardAlt: '#FFF0F3',

  text: '#3A2340',
  textSecondary: '#7A5F76',
  textLight: '#C8ADBA',
  border: '#F4DCE3',
  borderSoft: '#FBE8EF',

  error: '#FF6B7A',
  success: '#78C99A',
  warning: '#F7C787',

  like: '#FF5D87',
  pass: '#D8C4CE',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(58,35,64,0.45)',
} as const;

// Gradient presets — used for signature surfaces (auth, hero headers, CTAs).
// Stops are tuned to the lo-fi sunset palette: warm peach → rose → plum.
export const gradients = {
  // Signature daylight sunset (headers, onboarding hero).
  sunset: ['#FFE8CC', '#FFC1A6', '#E27AA0', '#8A5A8C', '#3D2347'] as const,
  // Deeper twilight for auth / dark surfaces.
  dusk: ['#2D1B3D', '#5F3E73', '#A86696', '#F2A8BE'] as const,
  // Older name kept for compatibility — routes through dusk.
  night: ['#2D1B3D', '#5F3E73', '#A86696', '#F2A8BE'] as const,
  // Gentle daybreak wash — great for empty states & light backgrounds.
  dawn: ['#FFF4EE', '#FDE1E8', '#F3E0F0'] as const,
  // Soft pink CTA gradient used on the Button primary + like controls.
  primary: ['#F6B5C8', '#E27AA0'] as const,
  // Blush surface — subtle warmth behind cards/sheets.
  blush: ['#FFF6F1', '#FCE6EE'] as const,
  // Warm glow for bubbles / highlights.
  glow: ['#FFD9A8', '#F59EBF'] as const,
} as const;

// Layout tokens kept alongside colors so screens can share a rhythm.
export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const shadows = {
  soft: {
    shadowColor: '#3A2340',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  card: {
    shadowColor: '#3A2340',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  glow: {
    shadowColor: '#E27AA0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;
