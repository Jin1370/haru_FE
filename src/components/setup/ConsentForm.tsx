import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LEGAL_URLS } from '@/constants/legal';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// LAUNCH_CHECKLIST #5 — 약관동의 공용 화면.
//
// 회원가입 첫 단계 페이지(setup/consent.tsx)와 기존 회원 재동의 전체화면
// (ReconsentGate)에서 동일하게 재사용한다. 음성(생체정보) 동의를 일반 동의와
// 분리된 독립 항목으로 두어 PIPA §23 / GDPR Art.9 를 충족한다.
//
// 헤더(가운데 "약관동의" + 선택적 back) + 약관 전체동의 + 필수 항목 체크리스트 +
// 하단 "동의하고 계속하기" 버튼으로 구성. 모든 필수 항목 체크 시에만 버튼 활성.

type ConsentKey = 'terms' | 'privacy' | 'voice';

const ITEMS: { key: ConsentKey; labelKey: string; url: string }[] = [
  { key: 'terms', labelKey: 'consent.terms', url: LEGAL_URLS.terms },
  { key: 'privacy', labelKey: 'consent.privacy', url: LEGAL_URLS.privacy },
  // 음성 생체정보 처리 세부는 처리방침 음성 데이터 조항에서 다룬다.
  { key: 'voice', labelKey: 'consent.voiceBiometric', url: LEGAL_URLS.privacy },
];

export function ConsentForm({
  onSubmit,
  submitting = false,
  onBack,
}: {
  onSubmit: () => void;
  submitting?: boolean;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState<Record<ConsentKey, boolean>>({
    terms: false,
    privacy: false,
    voice: false,
  });

  const allChecked = checked.terms && checked.privacy && checked.voice;

  const toggle = (key: ConsentKey) =>
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleAll = () => {
    const next = !allChecked;
    setChecked({ terms: next, privacy: next, voice: next });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={styles.headerTitle}>{t('consent.modalTitle')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.agreeAllRow} onPress={toggleAll}>
          <Ionicons
            name={allChecked ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={26}
            color={allChecked ? colors.primary : colors.textLight}
          />
          <Text style={styles.agreeAllText}>{t('consent.agreeAll')}</Text>
        </Pressable>

        <View style={styles.divider} />

        {ITEMS.map((item) => (
          <View key={item.key} style={styles.itemRow}>
            <Pressable style={styles.itemLeft} onPress={() => toggle(item.key)}>
              <Ionicons
                name={checked[item.key] ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={22}
                color={checked[item.key] ? colors.primary : colors.textLight}
              />
              <Text style={styles.itemLabel}>{t(item.labelKey)}</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(item.url)}
              hitSlop={8}
              accessibilityLabel={t('consent.view')}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          title={t('consent.startButton')}
          onPress={onSubmit}
          disabled={!allChecked}
          loading={submitting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: { width: 32, alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  agreeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  agreeAllText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  itemLabel: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text,
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
});
