import { View, Image, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { usePhotoAccess } from '@/hooks/usePhotoAccess';
import { colors, gradients, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

type Variant = 'avatar' | 'swipe-card' | 'detail';

interface ProfilePhotoProps {
  // Registry key for photo-access lookup. null/undefined → DEFAULT (locked).
  userId?: string | null;
  // photos[0] URL. null/undefined renders the person placeholder.
  uri?: string | null;
  // avatar variant only; ignored otherwise. Default 54 to match MatchItem.
  size?: number;
  variant: Variant;
  // Policy override. Discover always passes forceBlur — photo_access is not the
  // source of truth there. If omitted, `!main_photo_unlocked` is used.
  forceBlur?: boolean;
  // avatar variant only: gradient ring (used for unread-badge style).
  ringed?: boolean;
  style?: ViewStyle;
}

const AVATAR_BLUR_MULTIPLIER = 0.35;
const AVATAR_BLUR_MIN = 8;
const SWIPE_CARD_BLUR = 24;
const DETAIL_BLUR = 40;

export function ProfilePhoto({
  userId,
  uri,
  size = 54,
  variant,
  forceBlur,
  ringed = false,
  style,
}: ProfilePhotoProps) {
  const { t } = useTranslation();
  const access = usePhotoAccess(userId);
  const blurred = forceBlur ?? !access.main_photo_unlocked;

  if (variant === 'avatar') {
    return (
      <AvatarVariant
        uri={uri}
        size={size}
        blurred={blurred}
        ringed={ringed}
        style={style}
        lockedLabel={t('photoAccess.locked.a11y')}
      />
    );
  }

  if (variant === 'swipe-card') {
    return (
      <SwipeCardVariant
        uri={uri}
        blurred={blurred}
        style={style}
        hint={t('photoAccess.locked.hint')}
        lockedLabel={t('photoAccess.locked.a11y')}
      />
    );
  }

  // detail
  return (
    <DetailVariant
      uri={uri}
      blurred={blurred}
      style={style}
      hint={t('photoAccess.locked.hint')}
      lockedLabel={t('photoAccess.locked.a11y')}
    />
  );
}

// ---------- avatar ----------

function AvatarVariant({
  uri,
  size,
  blurred,
  ringed,
  style,
  lockedLabel,
}: {
  uri?: string | null;
  size: number;
  blurred: boolean;
  ringed: boolean;
  style?: ViewStyle;
  lockedLabel: string;
}) {
  const radius = size / 2;
  // Ring footprint is reserved unconditionally so toggling ringed never
  // pushes neighboring layout (e.g. the matches row name/time on the right).
  // When ringed=false the wrapper is a transparent View of the same size;
  // when ringed=true the same wrapper paints the gradient.
  const RING_PAD = 2;
  const outerSize = size + RING_PAD * 2;
  const outerRadius = outerSize / 2;
  const blurRadius = blurred ? Math.max(AVATAR_BLUR_MIN, size * AVATAR_BLUR_MULTIPLIER) : 0;
  const lockIconSize = Math.max(10, Math.round(size * 0.28));

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
      accessibilityLabel={blurred ? lockedLabel : undefined}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          blurRadius={blurRadius}
        />
      ) : (
        <Ionicons name="person" size={size * 0.5} color={colors.white} />
      )}
      {blurred && uri ? (
        <View style={avatarStyles.lockOverlay} pointerEvents="none">
          <Ionicons name="lock-closed" size={lockIconSize} color={colors.white} />
        </View>
      ) : null}
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

  return (
    <View style={[avatarStyles.ring, wrapperLayout, style]}>{inner}</View>
  );
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
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});

// ---------- swipe-card ----------

function SwipeCardVariant({
  uri,
  blurred,
  style,
  hint,
  lockedLabel,
}: {
  uri?: string | null;
  blurred: boolean;
  style?: ViewStyle;
  hint: string;
  lockedLabel: string;
}) {
  return (
    <View
      style={[swipeStyles.container, style]}
      accessibilityLabel={blurred ? lockedLabel : undefined}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={swipeStyles.photo}
          blurRadius={blurred ? SWIPE_CARD_BLUR : 0}
        />
      ) : (
        <View style={[swipeStyles.photo, swipeStyles.placeholder]}>
          <Ionicons name="person" size={80} color={colors.white} />
        </View>
      )}
      {blurred ? (
        <View style={swipeStyles.lockRow} pointerEvents="none">
          <Ionicons name="lock-closed" size={14} color={colors.white} />
          <Text style={swipeStyles.lockText} numberOfLines={1}>
            {hint}
          </Text>
        </View>
      ) : null}
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
  lockRow: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  lockText: {
    fontSize: 12,
    color: colors.white,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
});

// ---------- detail ----------

function DetailVariant({
  uri,
  blurred,
  style,
  hint,
  lockedLabel,
}: {
  uri?: string | null;
  blurred: boolean;
  style?: ViewStyle;
  hint: string;
  lockedLabel: string;
}) {
  return (
    <View
      style={[detailStyles.container, style]}
      accessibilityLabel={blurred ? lockedLabel : undefined}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={detailStyles.photo}
          resizeMode="cover"
          blurRadius={blurred ? DETAIL_BLUR : 0}
        />
      ) : (
        <View style={[detailStyles.photo, detailStyles.placeholder]}>
          <Ionicons name="person" size={72} color={colors.white} />
        </View>
      )}
      {blurred && uri ? (
        <View style={detailStyles.lockRow} pointerEvents="none">
          <Ionicons name="lock-closed" size={14} color={colors.white} />
          <Text style={detailStyles.lockText} numberOfLines={1}>
            {hint}
          </Text>
        </View>
      ) : null}
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
  lockRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  lockText: {
    fontSize: 12,
    color: colors.white,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
});
