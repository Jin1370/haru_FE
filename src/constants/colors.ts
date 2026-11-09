import { isNight } from './theme';

// 낮 테마 — 노을. 밤 테마는 아래 nightColors 가 같은 키를 덮어쓴다.
const dayColors = {
  // Brand primary: a dusty rose sunset — warm, romantic, nostalgic.
  primary: '#E27AA0',
  primaryLight: '#FBDCE6',
  primaryDark: '#B85478',
  // 공용 버튼 배경 (옛 gradients.primary 의 중간색보다 살짝 진하게).
  primaryMid: '#E990AF',

  secondary: '#F6B5C8',

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

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(58,35,64,0.45)',

  // 사진 배경이 그려지기 전 비치는 바탕 (사진 상단 톤).
  photoBase: '#F6B5C8',
  // 카드 없이 배경 사진 위에 바로 놓이는 글자.
  onPhotoText: '#3A2340',
  onPhotoTextSecondary: '#7A5F76',
  onPhotoTextShadow: 'rgba(255,244,238,0.9)',
  // 로그인 HARU 제목 글자 그림자.
  titleShadow: 'rgba(226,122,160,0.45)',
  // 그림자 색.
  shadow: '#3A2340',
};

// 밤 테마 — 채도를 낮춘 슬레이트 블루 + 창문 불빛 같은 앰버 포인트.
// 흰 배경 위 대비: primary 6.8:1, primaryMid 위 흰 글자 6.2:1.
const nightColors: typeof dayColors = {
  ...dayColors,
  primary: '#3E5C8A',
  primaryLight: '#E1E6EE',
  primaryDark: '#263B5E',
  primaryMid: '#46628F',

  secondary: '#9AAAC3',

  background: '#F2F4F7',
  surface: '#E6EAF0',
  card: '#FAFBFC',
  cardAlt: '#EEF1F5',

  text: '#1C2433',
  textSecondary: '#5A6577',
  textLight: '#A2AAB8',
  border: '#D9DEE6',
  borderSoft: '#E8EBF0',

  like: '#B8862F',

  overlay: 'rgba(18,24,38,0.5)',

  photoBase: '#1C2380',
  onPhotoText: '#FFFFFF',
  onPhotoTextSecondary: '#E2E7EF',
  onPhotoTextShadow: 'rgba(10,14,30,0.85)',
  titleShadow: 'rgba(10,14,40,0.6)',
  shadow: '#1C2433',
};

export const colors = isNight ? nightColors : dayColors;

export const gradients = isNight
  ? {
      primary: ['#7F93B5', '#3E5C8A'] as const,
      blush: ['#F7F8FA', '#E6EAF0'] as const,
      glow: ['#9DB0CC', '#4A6390'] as const,
    }
  : {
      // Soft pink CTA gradient used on the Button primary + like controls.
      primary: ['#F6B5C8', '#E27AA0'] as const,
      // Blush surface — subtle warmth behind cards/sheets.
      blush: ['#FFF6F1', '#FCE6EE'] as const,
      // Warm glow for bubbles / highlights.
      glow: ['#FFD9A8', '#F59EBF'] as const,
    };

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
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  glow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;

