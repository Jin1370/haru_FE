import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Modal,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';
import { CHAT_PROMPT_STEPS } from '@/constants/chatPrompts';

interface ChatPromptsModalProps {
  visible: boolean;
  onClose: () => void;
}

// Centered, brand-tinted modal that mirrors the inline carousel's 5-slide
// funnel with a softer reading experience: a primaryLight bulb badge,
// larger centered type, and a generous outer card. Dots indicator at the
// bottom is preserved with a brand-pink active state.
export function ChatPromptsModal({ visible, onClose }: ChatPromptsModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Measured slide width (the modal card's content area). Paging snaps on
  // this same width so each swipe rests cleanly on a single step.
  const [slideWidth, setSlideWidth] = useState(0);

  // Always re-enter the funnel from step 1 — opening the modal mid-funnel
  // would lose the carry-through narrative of the 5 prompts.
  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      // Reset the scroll position too — the user might have swiped during
      // a prior open and we want the first slide visible again.
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    }
  }, [visible]);

  const handleMomentumScrollEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (slideWidth === 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    setCurrentIndex(
      Math.max(0, Math.min(CHAT_PROMPT_STEPS.length - 1, idx)),
    );
  };

  const handleListLayout = (e: LayoutChangeEvent) => {
    setSlideWidth(e.nativeEvent.layout.width);
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { paddingTop: 24 + insets.top }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
          <FlatList
            ref={flatListRef}
            data={CHAT_PROMPT_STEPS}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onLayout={handleListLayout}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            renderItem={({ item, index }) => (
              <View style={[styles.slide, { width: slideWidth }]}>
                <View
                  accessibilityRole="text"
                  accessibilityLabel={t('chat.prompts.pageA11y', {
                    current: index + 1,
                    total: CHAT_PROMPT_STEPS.length,
                  })}
                  style={styles.slideInner}
                >
                  <Text style={styles.title}>{t(item.titleKey)}</Text>
                  <Text style={styles.body}>{t(item.bodyKey)}</Text>
                </View>
              </View>
            )}
          />
          <View style={styles.footer}>
            {CHAT_PROMPT_STEPS.map((step, i) => (
              <View
                key={step.id}
                style={[
                  styles.dot,
                  i === currentIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  // Soft rounded card with the brand glow shadow. paddingTop reserves room
  // for the absolute-positioned close button without it overlapping copy.
  // maxWidth bumped to 360 so the longest single-line copy (English title
  // ~315px at 14sp) clears the slide content area without wrapping. On
  // 360-wide devices the card hugs the backdrop padding edge (16+16).
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: 22,
    paddingTop: 22,
    paddingBottom: 18,
    ...shadows.glow,
  },
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slide: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  slideInner: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: fs(14),
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.2,
    lineHeight: fs(20),
    textAlign: 'center',
  },
  body: {
    fontSize: fs(12),
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    lineHeight: fs(18),
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  footer: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  // Same 5 same-sized dots as the inline carousel. Inactive uses borderSoft
  // (visible over the card surface, unlike pure white) so the indicator
  // reads as a row of 5 placeholders at a glance.
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderSoft,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
});
