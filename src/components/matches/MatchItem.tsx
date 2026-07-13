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
    // 상대 발신 + ready. 청취 완료 → 원문, 미청취 → "새 메시지" 마스크.
    // 본문은 청취 전까지 노출하지 않는다 ("음성을 들어야 안다" funnel). 미청취
    // 개수는 우측 배지가 별도로 표시하므로 여기선 중립 마스크만 채운다.
    lastMessageText = isListened
      ? (lastMessage.original_text ?? '')
      : t('matches.preview.newMessage');
  }

  // 미청취 상대 메시지 개수는 미리보기 텍스트와 분리해 우측 핑크 배지로 표시한다
  // (카톡/라인 관례 — 미리보기 = 마지막 대화, 배지 = 안 읽음 개수). 99 초과는
  // "99+" 로 절단. tombstone 매치는 unread 자체를 표시 안 함 (기존 정책).
  const showUnreadBadge = hasUnread && !isTombstone;
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
          {/* 시간은 이름 행 우측에 둔다 (카톡/라인 관례). 미리보기 행 우측은
              안 읽음 배지 자리로 비워둔다. */}
          {item.last_message && (
            <Text style={styles.time}>
              {formatRelativeTime(item.last_message.created_at, t, i18n.language)}
            </Text>
          )}
        </View>
        <View style={styles.messageRow}>
          {/* 미리보기 텍스트 = 마지막 메시지 (본인 발신 → 원문, 상대 미청취 →
              "새 메시지" 마스크, 상대 청취 → 원문). unread 가 있으면 톤을 강조. */}
          <Text
            style={[
              styles.lastMessage,
              showUnreadBadge && styles.lastMessageUnread,
              isTombstone && styles.lastMessageTombstone,
            ]}
            numberOfLines={1}
          >
            {lastMessageText}
          </Text>
          {/* 안 읽음(미청취) 개수 배지 — 미리보기 텍스트와 분리된 우측 신호. */}
          {showUnreadBadge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCountDisplay}</Text>
            </View>
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
  // 안 읽음 개수 배지 — 미리보기 행 우측 끝의 핑크 원형 pill. minWidth 로 한
  // 자리 숫자는 원형, 두 자리 이상은 좌우 패딩으로 자연 확장. 높이 20 은 행
  // minHeight 22 안에 들어와 read/unread 행 높이가 흔들리지 않는다.
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    lineHeight: 14,
    // 앱 전역은 Galmuri11(픽셀 폰트)이지만, 그 숫자 글리프는 advance 셀 안에서
    // 좌측에 그려져 원 안에서 왼쪽으로 치우친다 (textAlign 으로도 폰트 내부
    // side-bearing 은 못 고침). 배지 숫자에만 예외로 Pretendard(비픽셀,
    // _layout 에서 loadAsync 됨)를 써서 원 정중앙에 오게 한다. 작은 숫자라
    // 픽셀 톤 이질감은 거의 없고 11px 가독성은 오히려 낫다.
    fontFamily: 'Pretendard-SemiBold',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});
