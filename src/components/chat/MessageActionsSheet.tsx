import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MESSAGE_REACTIONS } from '@/constants/messageReactions';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import type { Message, MessageReaction } from '@/types';

interface MessageActionsSheetProps {
  visible: boolean;
  /** 롱프레스 대상 메시지. 부모가 닫으면서 null 로 비워도 내부 스냅샷으로 버틴다. */
  message: Message | null;
  onClose: () => void;
  /** 같은 리액션을 다시 고르면 해제 — 호출처에 null 이 전달된다. */
  onReact: (messageId: string, reaction: MessageReaction | null) => void;
  /** 리액션은 상대 메시지에만 남길 수 있다 (본인 메시지면 행 자체를 숨긴다). */
  canReact: boolean;
  onReply: (message: Message) => void;
}

/**
 * 말풍선 롱프레스로 열리는 액션 시트.
 *
 * 화면당 하나만 두고 대상 메시지를 prop 으로 갈아끼운다 — 말풍선마다 Modal 을
 * 달면 대화가 길어질수록 그 수만큼 모달이 마운트된다.
 *
 * 미청취 메시지에는 애초에 열리지 않는다 (ChatBubble 이 롱프레스를 차단).
 * 안 듣고 리액션만 남기는 동선을 막아야 "들어야 안다" 정책이 유지된다.
 */
export function MessageActionsSheet({
  visible,
  message,
  onClose,
  onReact,
  canReact,
  onReply,
}: MessageActionsSheetProps) {
  const { t } = useTranslation();
  // 부모가 닫힘과 동시에 대상 state 를 비우는 게 자연스러운데, 그러면 페이드
  // 아웃 도중 내용이 사라져 시트가 한 프레임 빈 카드로 깜빡인다.
  const [snapshot, setSnapshot] = useState<Message | null>(null);
  useEffect(() => {
    if (message) setSnapshot(message);
  }, [message]);

  const current = snapshot?.reaction ?? null;

  const handlePick = (value: MessageReaction) => {
    if (!snapshot) return;
    // 같은 걸 다시 누르면 해제. 감정 칩 토글과 같은 규칙이라 학습 비용이 없다.
    onReact(snapshot.id, current === value ? null : value);
    onClose();
  };

  const handleReply = () => {
    if (!snapshot) return;
    onReply(snapshot);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          {/* 리액션은 5개가 한 묶음이라 한 행을 통째로 쓴다. 본인 메시지면
              행 자체가 빠지고 아래 액션들만 남는다. */}
          {canReact && (
            <>
              <View style={styles.reactionRow}>
                {MESSAGE_REACTIONS.map((meta) => {
                  const selected = current === meta.value;
                  return (
                    <Pressable
                      key={meta.value}
                      onPress={() => handlePick(meta.value)}
                      accessibilityRole="button"
                      accessibilityLabel={t(meta.labelKey)}
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        styles.reactionButton,
                        selected && styles.reactionButtonSelected,
                        pressed && { transform: [{ scale: 0.92 }] },
                      ]}
                    >
                      <Text style={styles.reactionEmoji}>{meta.emoji}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.divider} />
            </>
          )}

          <Pressable
            onPress={handleReply}
            accessibilityRole="button"
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          >
            <Ionicons name="arrow-undo-outline" size={19} color={colors.text} />
            <Text style={styles.itemText}>{t('chat.reply.action')}</Text>
          </Pressable>
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
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  reactionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 선택 표시는 중립 회색 — 팔레트가 전부 분홍 계열이라 분홍을 쓰면 배경과 안 갈린다.
  reactionButtonSelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  reactionEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  itemPressed: {
    backgroundColor: colors.surface,
  },
  itemText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text,
    letterSpacing: 0.2,
  },
});
