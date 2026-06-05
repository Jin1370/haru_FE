import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { INTEREST_SECTIONS, MAX_INTERESTS } from '@/constants/interests';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// 관심사 선택을 항목별 아코디언으로 표시한다. 태그가 100개 가까이라 전부 펼쳐
// 두면 부담스러워, 섹션 헤더만 보여주고 탭하면 해당 섹션 태그만 아래로 펼친다.
// 회원가입(step1)과 프로필 수정(edit-profile)이 공유 — 선택 상태/토글 로직은
// 부모가 소유하고(저장 위치가 draft store vs form 으로 다름) 이 컴포넌트는 표시
// + 펼침 상태만 담당한다.
interface InterestSelectorProps {
  // 현재 선택된 관심사 id 집합 (부모가 stored 값 → id 로 정규화해 전달).
  selectedIds: Set<string>;
  // 전체 선택 개수 — MAX_INTERESTS 도달 시 미선택 칩을 비활성화하는 데 쓴다.
  totalSelected: number;
  onToggle: (id: string) => void;
  maxInterests?: number;
}

export function InterestSelector({
  selectedIds,
  totalSelected,
  onToggle,
  maxInterests = MAX_INTERESTS,
}: InterestSelectorProps) {
  const { t } = useTranslation();

  // 최초 마운트 시 이미 선택된 항목이 있는 섹션만 펼쳐 둔다 — 프로필 수정 재진입
  // 시 내가 고른 카테고리는 바로 보이고, 신규 가입은 전부 접힌 상태로 시작해
  // 첫인상 부담을 줄인다. (이후 펼침은 사용자 탭으로만 변경)
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const section of INTEREST_SECTIONS) {
      if (section.items.some((it) => selectedIds.has(it.id))) init.add(section.id);
    }
    return init;
  });

  const toggleSection = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View>
      {INTEREST_SECTIONS.map((section) => {
        const isOpen = expanded.has(section.id);
        return (
          <View key={section.id} style={styles.section}>
            <Pressable
              style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
              onPress={() => toggleSection(section.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={styles.title}>{t(section.titleKey)}</Text>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
            {isOpen && (
              <View style={styles.chipRow}>
                {section.items.map(({ id, labelKey }) => {
                  const selected = selectedIds.has(id);
                  const disabled = !selected && totalSelected >= maxInterests;
                  return (
                    <Pressable
                      key={id}
                      disabled={disabled}
                      style={[
                        styles.chip,
                        selected && styles.chipActive,
                        disabled && styles.chipDisabled,
                      ]}
                      onPress={() => onToggle(id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipActiveText,
                          disabled && styles.chipDisabledText,
                        ]}
                      >
                        {t(labelKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  headerPressed: {
    backgroundColor: colors.cardAlt,
  },
  title: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.semibold,
    letterSpacing: 0.2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.medium },
  chipActiveText: { color: colors.white },
  chipDisabledText: { color: colors.textLight },
});
