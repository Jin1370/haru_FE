import { useState } from 'react';
import { View, Image, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '@/constants/colors';

type Variant = 'avatar' | 'swipe-card' | 'detail';

interface ProfilePhotoProps {
  // photo-watercolor-pipeline sprint 후 변환본 메인은 항상 클리어 노출 —
  // userId / forceBlur prop 은 옛 잠금 정책 시절 인터페이스 호환 위해 보존
  // (호출처는 이미 forceBlur=false 또는 미전달).
  userId?: string | null;
  uri?: string | null;
  size?: number;
  variant: Variant;
  forceBlur?: boolean;
  ringed?: boolean;
  style?: ViewStyle;
}

export function ProfilePhoto({
  uri,
  size = 54,
  variant,
  ringed = false,
  style,
}: ProfilePhotoProps) {
  if (variant === 'avatar') {
    return <AvatarVariant uri={uri} size={size} ringed={ringed} style={style} />;
  }

  if (variant === 'swipe-card') {
    return <SwipeCardVariant uri={uri} style={style} />;
  }

  return <DetailVariant uri={uri} style={style} />;
}

// ---------- avatar ----------

function AvatarVariant({
  uri,
  size,
  ringed,
  style,
}: {
  uri?: string | null;
  size: number;
  ringed: boolean;
  style?: ViewStyle;
}) {
  const radius = size / 2;
  // Ring footprint is reserved unconditionally so toggling ringed never
  // pushes neighboring layout (e.g. the matches row name/time on the right).
  const RING_PAD = 2;
  const outerSize = size + RING_PAD * 2;
  const outerRadius = outerSize / 2;

  const inner = (
    <View
      style={[
        avatarStyles.inner,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: ringed ? 0 : 1,
          borderColor: colors.borderSoft,
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} />
      ) : (
        <Ionicons name="person" size={size * 0.5} color={colors.white} />
      )}
    </View>
  );

  const wrapperLayout = {
    width: outerSize,
    height: outerSize,
    borderRadius: outerRadius,
    padding: RING_PAD,
  };

  if (ringed) {
    return (
      <LinearGradient
        colors={[...gradients.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[avatarStyles.ring, wrapperLayout, style]}
      >
        {inner}
      </LinearGradient>
    );
  }

  return <View style={[avatarStyles.ring, wrapperLayout, style]}>{inner}</View>;
}

const avatarStyles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

// ---------- swipe-card ----------

function SwipeCardVariant({ uri, style }: { uri?: string | null; style?: ViewStyle }) {
  // 사진을 받는 동안 빈 배경색만 보이면 고장 난 카드처럼 보인다 — 다 받을 때까지 로딩 표시.
  // (방금 무료로 열린 받은 인사 카드는 사진 주소가 그 응답에 처음 와서 미리 받아 둘 수 없다.)
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  return (
    <View style={[swipeStyles.container, style]}>
      {uri ? (
        <>
          <Image source={{ uri }} style={swipeStyles.photo} onLoadEnd={() => setLoadedUri(uri)} />
          {loadedUri !== uri ? (
            <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.white} />
          ) : null}
        </>
      ) : (
        <View style={[swipeStyles.photo, swipeStyles.placeholder]}>
          <Ionicons name="person" size={80} color={colors.white} />
        </View>
      )}
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: colors.secondary,
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ---------- detail ----------

function DetailVariant({ uri, style }: { uri?: string | null; style?: ViewStyle }) {
  return (
    <View style={[detailStyles.container, style]}>
      {uri ? (
        <Image source={{ uri }} style={detailStyles.photo} resizeMode="cover" />
      ) : (
        <View style={[detailStyles.photo, detailStyles.placeholder]}>
          <Ionicons name="person" size={72} color={colors.white} />
        </View>
      )}
    </View>
  );
}

const detailStyles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
    backgroundColor: colors.cardAlt,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
