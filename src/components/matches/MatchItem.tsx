import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ProfilePhoto } from '@/components/ui/ProfilePhoto';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { formatRelativeTime } from '@/utils/age';
import type { MatchListItem } from '@/types';

interface MatchItemProps {
  item: MatchListItem;
  onPress: () => void;
  onLongPress?: () => void;
}

export function MatchItem({ item, onPress, onLongPress }: MatchItemProps) {
  const { t, i18n } = useTranslation();
  const partner = item.partner;
  const hasUnread = item.unread_count > 0;
  // Tombstone states:
  //   * partner.deleted_at  (mig 012) → "탈퇴한 사용자"
  //   * item.unmatched_at   (mig 013) → "매치 종료"
  // Both suppress avatar photo + the unread ring; deletion takes precedence
  // when both apply (the partner is gone regardless of the match status).
  const isDeleted = !!partner?.deleted_at;
  const isUnmatched = !!item.unmatched_at;
  const isTombstone = isDeleted || isUnmatched;
  const displayName = isDeleted
    ? t('common.deletedUser')
    : (partner?.display_name || t('matches.unknown'));

  // read-at-removal-list-mask sprint: 마지막 메시지 미리보기 마스킹 분기.
  // 분기 우선순위 (위에서부터 평가):
  //   1. tombstone (deleted/unmatched) → "매치 종료" 또는 last_message 무시
  //   2. last_message 없음 → startConversation
  //   3. 본인 발신 → 원문 (현행 유지)
  //   4. 상대 발신 + audio_status != 'ready' → startConversation (defense-in-depth;
  //      BE v3 RPC 가 이미 last_message 후보에서 제외)
  //   5. 상대 발신 + 청취 완료 → 원문 (현행 유지)
  //   6. 상대 발신 + 미청취 → "새 메시지" 마스킹 (단, hasUnread 일 경우 아래
  //      카운트 표시 분기가 우선 적용)
  //
  // viewerId 출처: partner.id 비교로 prop drilling 회피 (plan §3.7 옵션 B).
  // partner null 시 isFromMe=false 로 fallback — last_message 가 있다면 상대 발신
  // 으로 간주, 단 partner 가 null 이면 일반적으로 매치 자체가 비정상 상태.
  const lastMessage = item.last_message;
  const isFromMe = lastMessage && partner ? lastMessage.sender_id !== partner.id : false;
  const isReadyAudio = lastMessage?.audio_status === 'ready';
  const isListened = !!lastMessage?.listened_at;

  let lastMessageText: string;
  if (isTombstone) {
    lastMessageText = isUnmatched ? t('matches.tombstone.unmatched') : '';
  } else if (!lastMessage) {
    lastMessageText = t('matches.startConversation');
  } else if (isFromMe) {
    // BE 가 tombstone 매치에 한해 original_text 를 null 로 normalize 한다
    // (safety 권고 #2 의 raw API 누설 차단). tombstone 은 위 분기에서 처리되므로
    // 여기 도달 시 비어있을 일은 없지만 타입 safety 용 fallback.
    lastMessageText = lastMessage.original_text ?? '';
  } else if (!isReadyAudio) {
    // 상대 발신이지만 비정상 status — BE v3 가 last_message 후보에서 제외하므로
    // 실제로 도달하기 어려운 분기. "비어 있는 카드" 회피용 폴백.
    lastMessageText = t('matches.startConversation');
  } else {
    // 상대 발신 + ready. 청취 완료 → 원문, 미청취 → 카운트 표시 분기가 처리.
    lastMessageText = isListened ? (lastMessage.original_text ?? '') : '';
  }

  // hasUnread 면 lastMessage 자리를 "N개의 새 메시지" 텍스트로 덮어쓴다.
  // 숫자만 핑크(`colors.primary`) 강조. 99 초과는 "99+" 로 절단. tombstone 매치는
  // unread 자체를 표시 안 함 (기존 정책).
  const showUnreadCount = hasUnread && !isTombstone;
  const unreadCountDisplay = item.unread_count > 99 ? '99+' : String(item.unread_count);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <ProfilePhoto
        userId={partner?.id}
        uri={isTombstone ? undefined : partner?.photos[0]}
        size={54}
        variant="avatar"
        ringed={hasUnread && !isTombstone}
      />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          {/* mig 022: muted=true 인 매치는 헤더 우측에 음소거 아이콘. 활성 상태는
              관례대로 아이콘 미노출 (텔레그램/카톡 동일 — UI 노이즈 회피).
              tombstone (탈퇴/언매치) 매치는 알림 의미가 없으므로 표시 안 함. */}
          {item.muted && !isTombstone && (
            <Ionicons
              name="notifications-off"
              size={14}
              color={colors.textLight}
              style={styles.mutedIcon}
            />
          )}
        </View>
        <View style={styles.messageRow}>
          {/* lastMessage 자리. unread 가 있으면 "N개의 새 메시지" 형식으로
              덮어쓰며 숫자만 핑크 강조. 그 외엔 일반 미리보기 텍스트. */}
          {showUnreadCount ? (
            <Text
              style={[styles.lastMessage, styles.lastMessageUnread]}
              numberOfLines={1}
            >
              <Text style={styles.unreadCount}>{unreadCountDisplay}</Text>
              {t('matches.preview.newMessagesSuffix')}
            </Text>
          ) : (
            <Text
              style={[
                styles.lastMessage,
                isTombstone && styles.lastMessageTombstone,
              ]}
              numberOfLines={1}
            >
              {lastMessageText}
            </Text>
          )}
          {item.last_message && (
            <Text style={styles.time}>
              {formatRelativeTime(item.last_message.created_at, t, i18n.language)}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.soft,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text,
    flex: 1,
    letterSpacing: 0.2,
  },
  mutedIcon: {
    marginLeft: 8,
  },
  time: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 8,
    fontFamily: fonts.regular,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    // Lock the row height so unread (with the badge child, h:22) and read
    // (text-only, intrinsic line height) rows stay identical regardless of
    // which fontFamily wins. Without this, switching from regular→medium
    // and the absence of the badge each shave a few px off the card.
    minHeight: 22,
  },
  lastMessage: {
    fontSize: 12,
    // Pin the rendered line height — `regular` and `medium` ship slightly
    // different intrinsic line metrics, so an explicit value keeps the row
    // height consistent across read/unread states.
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    flex: 1,
  },
  lastMessageUnread: {
    color: colors.text,
    fontFamily: fonts.medium,
  },
  lastMessageTombstone: {
    // Galmuri11(픽셀 폰트)에는 italic 변형이 없어 fontStyle: 'italic' 을
    // 주면 RN 이 시스템 폰트로 폴백되어 픽셀 톤이 깨진다. 색만 약하게
    // 두어 구분.
    color: colors.textLight,
  },
  // unread 카운트 숫자만 핑크 강조. 부모 Text 의 fontSize/lineHeight 를 상속해
  // baseline 이 어긋나지 않는다. semibold 로 살짝 굵게 — 가독성 보강.
  unreadCount: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
});
