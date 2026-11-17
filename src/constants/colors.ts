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
  // 되돌리기 어려운 행동의 버튼 (삭제·로그아웃·탈퇴·매칭 해제·신고 제출). 밤 테마는 남색.
  danger: '#FF6B7A',
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
// 흰 배경 위 대비: primary 7.0:1, primaryMid 위 흰 글자 6.4:1.
const nightColors: typeof dayColors = {
  ...dayColors,
  primary: '#325996',
  primaryLight: '#E1E6EE',
  primaryDark: '#263B5E',
  primaryMid: '#395F9C',

  secondary: '#9AAAC3',

  background: '#F0F4F9',
  surface: '#E6EAF0',
  card: '#FAFBFC',
  cardAlt: '#EEF1F5',

  text: '#1C2433',
  textSecondary: '#5A6577',
  textLight: '#A2AAB8',
  border: '#D9DEE6',
  borderSoft: '#E8EBF0',

  like: '#325996',
  danger: '#325996',

  overlay: 'rgba(18,24,38,0.5)',

  photoBase: '#1C2380',
  onPhotoText: '#FFFFFF',
  onPhotoTextSecondary: '#E2E7EF',
  onPhotoTextShadow: 'rgba(10,14,30,0.85)',
  titleShadow: 'rgba(10,14,40,0.6)',
  shadow: '#1C2433',
};

export const colors = isNight ? nightColors : dayColors;

// 배경 사진 위에 뜨는 반투명 카드 (채팅 목록·내 프로필 카드) 와 그 안의 글자·칩.
// 밤은 탐색 카드(SwipeCard)와 같은 어두운 반투명, 낮은 노을에 맞춘 흰 반투명.
// dialog*: 프로필 상태 메시지 칸 (탐색 탭 대화창 모양).
export const photoCard = isNight
  ? {
      card: 'rgba(8,12,30,0.62)',
      text: '#FFFFFF',
      muted: '#8D97B0',
      faint: '#6B7896',
      icon: '#A9BEE3',
      active: '#DCE6F5',
      chip: '#365795',
      field: '#1A2240',
      badge: '#4D74B4',
      dialog: 'rgba(0,0,0,0.35)',
      dialogBorder: '#FFFFFF',
    }
  : {
      card: 'rgba(255,250,250,0.86)',
      text: '#3A2340',
      muted: '#7A5F76',
      faint: '#C8ADBA',
      icon: '#E27AA0',
      active: '#B85478',
      chip: '#FBDCE6',
      field: '#FFF0F3',
      badge: '#E27AA0',
      dialog: '#FFF0F3',
      dialogBorder: '#F6B5C8',
    };

// 밤 테마의 탭 헤더·탭바·채팅 헤더 — 사진 위아래를 밝은 띠 대신 남색 검정으로 감싼다.
// 낮은 null (각 화면의 기존 색 그대로).
export const nightBar = isNight
  ? {
      bg: '#0A0F24',
      text: '#FFFFFF',
      active: '#DCE6F5',
      inactive: '#6B7896',
      border: 'rgba(255,255,255,0.08)',
      // 채팅 입력창 — 입력칸·버튼 바탕, 테두리, 흐린 글자(안내 문구), 아이콘.
      field: '#1A2240',
      fieldBorder: 'rgba(255,255,255,0.12)',
      muted: '#8D97B0',
      icon: '#A9BEE3',
      chipSelected: '#4D74B4',
      // 어두운 바탕 위 칩·버튼 (별사탕 칩, 프로필 카드 편집 버튼, 보이스 탭 등).
      chip: '#365795',
      // 반투명 남색 검정 카드 (탐색·채팅 목록·프로필 카드).
      card: 'rgba(8,12,30,0.62)',
    }
  : null;

export const gradients = isNight
  ? {
      primary: ['#7390C1', '#325996'] as const,
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

