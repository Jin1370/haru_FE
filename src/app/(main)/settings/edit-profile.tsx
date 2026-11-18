import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { StarChip } from '@/components/stars/StarChip';
import { RequiredLabel } from '@/components/ui/RequiredLabel';
import { useProfile } from '@/hooks/useProfile';
import { ApiRequestError } from '@/services/api';
import { DISPLAY_NAME_TAKEN_CODE } from '@/services/profile';
import { showAlert } from '@/stores/alertStore';
import { useAuthStore } from '@/stores/authStore';
import { colors, photoCard, radii } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';
import { languageForNationality } from '@/constants/nationalities';
import { MAX_INTERESTS } from '@/constants/interests';
import { InterestSelector } from '@/components/profile/InterestSelector';
import { useInterestResolver } from '@/hooks/useInterestLabel';
import { validateDisplayName, DISPLAY_NAME_MAX } from '@/utils/validators';
import { userFacingError } from '@/utils/errors';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import { NicknameChangeModal } from '@/components/profile/NicknameChangeModal';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile, upsertProfile, loadProfile } = useProfile();
  // 저장 버튼 상태는 이 버튼의 저장에만 묶는다. useProfile 의 loading 은 닉네임 변경 창의
  // 요청에도 켜져서, 그걸 쓰면 '사용하기' 를 눌렀을 때 저장 버튼이 같이 잠긴다.
  const [saving, setSaving] = useState(false);
  const { monetizationEnabled } = useDiscoverQuota();
  const [renameOpen, setRenameOpen] = useState(false);
  // Lift the absolute footer above the keyboard and extend ScrollView
  // paddingBottom by kbHeight (root KeyboardProvider feeds a unified value
  // for both platforms — keeps the layout math identical everywhere).
  const kbHeight = useKeyboardState((s) => s.height);

  // 생년월일·성별·국적은 가입 후 수정하지 않는다 — 저장 시 기존 값을 그대로 보낸다.
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [nameError, setNameError] = useState<string | undefined>();
  // 오류가 나면 닉네임 필드를 화면 위로 올린다 (setup/profile.tsx 와 같은 방식).
  const scrollRef = useRef<ScrollView>(null);
  const nameY = useRef(0);
  const scrollToName = () =>
    scrollRef.current?.scrollTo({ y: Math.max(0, nameY.current - 12), animated: true });

  // 관심사는 처음 받은 값으로 한 번만 채운다 — 닉네임 변경으로 프로필이 갱신될 때
  // 아직 저장 안 한 관심사 선택이 덮어써지지 않게.
  const interestsLoaded = useRef(false);
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      if (!interestsLoaded.current) {
        interestsLoaded.current = true;
        setInterests(profile.interests);
      }
    }
  }, [profile]);

  // Storage moved from "current-locale label" to canonical id (see
  // useInterestResolver doc) so the displayed label always reflects the
  // current app language. Legacy stored labels still resolve to ids.
  const { resolveId } = useInterestResolver();

  const selectedInterestIds = useMemo(() => {
    const ids = new Set<string>();
    for (const stored of interests) {
      const id = resolveId(stored);
      if (id) ids.add(id);
    }
    return ids;
  }, [interests, resolveId]);

  const toggleInterest = (id: string) => {
    Keyboard.dismiss();
    if (selectedInterestIds.has(id)) {
      setInterests((prev) =>
        prev.filter((v) => v !== id && resolveId(v) !== id),
      );
      return;
    }
    if (interests.length >= MAX_INTERESTS) return;
    setInterests((prev) => [...prev, id]);
  };

  // The Save button is always enabled so a tap always produces feedback (App
  // Review flagged the disabled-button pattern under Guideline 2.1(a)).
  const handleSave = async () => {
    Keyboard.dismiss();
    if (!profile) return;
    const nameErr = validateDisplayName(displayName.trim());
    setNameError(nameErr ? t(nameErr.key, nameErr.vars) : undefined);
    if (nameErr) {
      scrollToName();
      return;
    }

    setSaving(true);
    try {
      await upsertProfile({
        // 유료화 ON: 닉네임은 별사탕 변경 창에서만 바꾸므로 저장 버튼은 관심사만 (저장된 닉네임 그대로).
        display_name: monetizationEnabled ? profile.display_name : displayName.trim(),
        birth_date: profile.birth_date,
        gender: profile.gender,
        nationality: profile.nationality,
        // Language is derived from nationality — no user-facing picker.
        language: languageForNationality(profile.nationality),
        voice_intro: profile.voice_intro ?? null,
        interests,
      });
      router.back();
    } catch (e: any) {
      // mig 053: 닉네임 중복은 해당 필드 인라인 에러로 (일반 알림은 어느 값이
      // 문제인지 안 알려준다).
      if (e instanceof ApiRequestError && e.code === DISPLAY_NAME_TAKEN_CODE) {
        setNameError(t('validation.displayNameTaken'));
        scrollToName();
        return;
      }
      showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
    } finally {
      setSaving(false);
    }
  };

  // 유료화 ON 닉네임 변경 — 서버가 별사탕 3개를 차감한다. 닉네임만 바꾸고 관심사는
  // 저장된 값 그대로 보낸다 (화면에서 고르던 관심사는 저장 버튼으로만 저장).
  const rename = async (name: string) => {
    if (!profile) return;
    try {
      await upsertProfile({
        display_name: name,
        birth_date: profile.birth_date,
        gender: profile.gender,
        nationality: profile.nationality,
        language: languageForNationality(profile.nationality),
        voice_intro: profile.voice_intro ?? null,
        interests: profile.interests,
      });
    } catch (e) {
      // 응답이 끊겼거나(네트워크) 서버 오류(5xx)면 서버에선 이미 바뀌고 별사탕도 빠졌을 수 있다
      // (차감+변경은 한 트랜잭션이라 둘 중 하나만 반영되진 않음). 프로필을 다시 받아 바뀌었으면 성공으로 본다.
      // 이유가 명확한 4xx(이미 쓰는 이름·별사탕 부족 등)는 확실한 실패라 그대로 던진다.
      if (e instanceof ApiRequestError && e.status < 500) throw e;
      await loadProfile();
      if (useAuthStore.getState().profile?.display_name === name) return;
      throw e;
    }
  };

  return (
    <View style={styles.container}>
      <WizardHeader
        compact
        title={t('profile.editProfile')}
        right={<StarChip />}
        onBack={() => router.back()}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom + 88 + kbHeight },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View onLayout={(e) => { nameY.current = e.nativeEvent.layout.y; }}>
          <RequiredLabel text={t('setupProfile.displayName')} />
          {monetizationEnabled ? (
            // 유료화 ON: 칸 전체가 버튼 — 누르면 키보드 대신 별사탕 변경 창이 뜬다. 연필은 그 표시.
            // 누르는 동안은 테두리만 분홍으로 (입력 칸 포커스와 같은 표시). 투명도로 흐리게 하면
            // Android 에서 칸 그림자(elevation)가 회색 사각형으로 드러난다.
            <Pressable
              onPress={() => setRenameOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('stars.nicknameChangeTitle')}
            >
              {({ pressed }) => (
                // 안의 입력칸이 터치를 가져가지 않게 막는다.
                <View pointerEvents="none">
                  <FormField
                    value={displayName}
                    editable={false}
                    inputStyle={[
                      styles.inputCompact,
                      styles.inputLocked,
                      pressed && { borderColor: colors.primary },
                    ]}
                  />
                  <View style={styles.changeButton}>
                    <Ionicons name="pencil" size={16} color={photoCard.icon} />
                  </View>
                </View>
              )}
            </Pressable>
          ) : (
            <FormField
              value={displayName}
              onChangeText={(v) => {
                setDisplayName(v);
                setNameError(undefined);
              }}
              placeholder={t('setupProfile.displayNamePlaceholder')}
              maxLength={DISPLAY_NAME_MAX}
              inputStyle={styles.inputCompact}
              error={nameError}
            />
          )}
        </View>

        <View style={styles.divider} />

        <Text style={[styles.label, styles.sectionGap]}>
          {t('setupProfile.interests', { count: interests.length })}
        </Text>
        <Text style={styles.hintBlock}>{t('setupProfile.interestsHint')}</Text>
        <InterestSelector
          selectedIds={selectedInterestIds}
          totalSelected={interests.length}
          onToggle={toggleInterest}
        />
      </ScrollView>

      {/* Footer is intentionally pinned at bottom: 0 (no kbHeight lift) so the
          Save button stays put when the keyboard opens — the user only needs
          the focused FormField visible above the keyboard, not the Save CTA.
          ScrollView paddingBottom still adds kbHeight so the input can be
          scrolled above the keyboard line. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={t('common.save')} onPress={handleSave} loading={saving} disabled={saving} />
      </View>

      <NicknameChangeModal
        visible={renameOpen}
        currentName={profile?.display_name ?? ''}
        onClose={() => setRenameOpen(false)}
        onSubmit={rename}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: fs(14), fontFamily: fonts.medium, color: colors.text, marginBottom: 8 },
  sectionGap: { marginTop: 16 },
  // 닉네임과 관심사 사이 구분선 (관심사 카테고리 박스 테두리와 같은 색).
  divider: { height: 1, backgroundColor: colors.border, marginTop: 16 },
  inputCompact: { fontSize: fs(14) },
  // 잠긴 닉네임 칸 — 연필 표시 자리만큼 비운다.
  inputLocked: { paddingRight: 52 },
  // 연필 표시 (배경 없음, 누르는 곳은 칸 전체). 입력 칸(높이 52) 안 오른쪽 세로 가운데.
  changeButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBlock: {
    fontSize: fs(12),
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: fs(18),
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
