import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ErrorText } from '@/components/ui/ErrorText';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { BIO_PHRASES, findPresetByText, getBioPhraseText } from '@/constants/bioPhrases';

interface BioPhrasePickerProps {
  value: string;
  // onChange now also reports the catalog id of the picked preset, or `null`
  // when the user is in custom mode (or when `value` resolves to no known
  // preset). Callers forward the id to the BE in `voice_intro_phrase_id` so
  // the backend can short-circuit Gemini translation by looking up the
  // server-side catalog (voice-intro-preset-bypass sprint, Phase 3).
  onChange: (text: string, phraseId: string | null) => void;
  // Profile language used for both displaying the localized preset body and
  // the text written back to `bio`. Keeping these aligned ensures the cloned
  // voice synthesizes the same language it was trained on.
  language: string;
  disabled?: boolean;
  lockedHint?: string;
  onCustomFocus?: () => void;
  // Inline validation error (e.g. forbidden zero-width chars on the custom
  // text). Renders directly under the custom input and tints its border red
  // so the message stays visually attached to the field that caused it.
  error?: string | null;
}

const CUSTOM_MAX = 500;
const CUSTOM_TINT = '#C8ADBA';
// 주제 태그 색상. 키는 BIO_PHRASES 의 `tag` (= i18n 키). 미등록 태그는 CUSTOM_TINT
// 로 폴백하므로 문구를 추가할 때 색을 깜빡해도 렌더는 깨지지 않는다.
const TAG_TINTS: Record<string, string> = {
  daily: '#B8C8DD',
  listen: '#E8A88C',
  greeting: '#F6B5C8',
  talk: '#F4A261',
  friend: '#B8A1C8',
  food: '#E27AA0',
  music: '#78C99A',
};
// 직접 입력 카드와 프리셋 카드가 같은 높이로 시작하도록 공유하는 본문 최소 높이.
// 두 카드 모두 위에 태그 칩 행이 붙으므로 이 값만 맞으면 총 높이가 같다.
const CARD_CONTENT_MIN_HEIGHT = 60;

export function BioPhrasePicker({
  value,
  onChange,
  language,
  disabled,
  lockedHint,
  onCustomFocus,
  error,
}: BioPhrasePickerProps) {
  const { t } = useTranslation();

  // Derive initial selection state from the incoming `value`. Empty value =
  // nothing selected yet. Matching preset = that preset selected. Otherwise =
  // custom mode with the value as the typed text.
  const initialPreset = useMemo(() => findPresetByText(value), [value]);
  const initialIsCustom = value.length > 0 && !initialPreset;

  const [selectedId, setSelectedId] = useState<string | null>(
    initialPreset?.id ?? (initialIsCustom ? 'custom' : null),
  );
  const [customText, setCustomText] = useState(initialIsCustom ? value : '');
  // Ref to the custom TextInput so we can imperatively focus it (second tap on
  // the custom card, once selected) and blur it (when a preset card is picked).
  const customInputRef = useRef<TextInput>(null);

  // Hold the latest onChange in a ref so the resync effect doesn't re-fire on
  // every parent render (callers like setup/profile.tsx pass an inline arrow).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Re-sync when the parent feeds a new value (e.g. profile loaded async) or
  // when the user's language changes. If the stored bio matches a preset in a
  // different language, promote it to the current-language version so the
  // saved bio stays aligned with the voice clone's language.
  //
  // The phraseId arg on onChange must be kept consistent with `value` so the
  // parent's two state slots (text + phraseId) stay aligned through async
  // profile loads. Re-emit is idempotent because the parent's setters short
  // out on identical values.
  useEffect(() => {
    const preset = findPresetByText(value);
    if (preset) {
      setSelectedId(preset.id);
      const localized = getBioPhraseText(preset, language);
      if (localized !== value) onChangeRef.current(localized, preset.id);
      else onChangeRef.current(value, preset.id);
      return;
    }
    if (value.length > 0) {
      setSelectedId('custom');
      setCustomText(value);
      onChangeRef.current(value, null);
    }
  }, [value, language]);

  const handleSelectPreset = (id: string, text: string) => {
    if (disabled) return;
    // Picking a preset releases the custom input's focus and dismisses the
    // keyboard — keyboardShouldPersistTaps="handled" would otherwise keep it up.
    customInputRef.current?.blur();
    setSelectedId(id);
    onChange(text, id);
  };

  // Two-tap to edit (matches the preset cards' "select first" feel): the FIRST
  // tap only selects the custom card (pink border) without raising the keyboard.
  // Once selected the input becomes editable, so a SECOND tap focuses it and the
  // keyboard comes up. On the first tap the input is editable=false, so a tap on
  // it bubbles to this Pressable — card-vs-input taps behave identically.
  const handleSelectCustom = () => {
    if (disabled) return;
    if (selectedId !== 'custom') {
      setSelectedId('custom');
      onChange(customText, null);
      return;
    }
    customInputRef.current?.focus();
  };

  // Single entry point for "switching into custom mode": fires whether the user
  // tapped the input directly (native focus) or tapped the surrounding card
  // (handleSelectCustom -> focus()). Keeps selection state and the keyboard
  // lift (onCustomFocus) in one place.
  const handleCustomFocus = () => {
    if (selectedId !== 'custom') {
      setSelectedId('custom');
      onChange(customText, null);
    }
    onCustomFocus?.();
  };

  const handleCustomTextChange = (text: string) => {
    setCustomText(text);
    if (selectedId === 'custom') onChange(text, null);
  };

  return (
    <View style={styles.container}>
      <Pressable
        disabled={disabled}
        onPress={handleSelectCustom}
        style={[
          styles.card,
          selectedId === 'custom' && styles.cardSelected,
          disabled && styles.cardDisabled,
          // Red border whenever there's an inline validation error — most
          // such errors come from the custom-typed string, so visually
          // attach them to this card.
          error ? styles.cardError : null,
        ]}
      >
        <View style={styles.customHeaderRow}>
          <View style={[styles.tag, { backgroundColor: CUSTOM_TINT }]}>
            <Text style={styles.tagText}>{t('setupProfile.bioPicker.customTag')}</Text>
          </View>
          {/* Counter only shows once the user is actively in custom mode —
              otherwise it's noise. Turns red at the cap so the user
              understands why typing stopped. */}
          {selectedId === 'custom' ? (
            <Text
              style={[
                styles.charCounter,
                customText.length >= CUSTOM_MAX && styles.charCounterMax,
              ]}
              accessibilityLabel={`${customText.length} / ${CUSTOM_MAX}`}
            >
              {customText.length} / {CUSTOM_MAX}
            </Text>
          ) : null}
        </View>
        <CustomInput
          ref={customInputRef}
          value={customText}
          onChangeText={handleCustomTextChange}
          // Only focusable once the card is selected — this is what makes the
          // first tap "select" and the second tap "focus" (see handleSelectCustom).
          editable={!disabled && selectedId === 'custom'}
          placeholder={t('setupProfile.bioPicker.customPlaceholder')}
          onFocus={handleCustomFocus}
        />
        <ErrorText testID="bio-phrase-picker-error">{error ?? null}</ErrorText>
      </Pressable>

      {BIO_PHRASES.map((phrase) => {
        const selected = selectedId === phrase.id;
        const localizedText = getBioPhraseText(phrase, language);
        return (
          <Pressable
            key={phrase.id}
            disabled={disabled}
            onPress={() => handleSelectPreset(phrase.id, localizedText)}
            style={[
              styles.card,
              selected && styles.cardSelected,
              disabled && styles.cardDisabled,
            ]}
          >
            <View
              style={[
                styles.tag,
                { backgroundColor: TAG_TINTS[phrase.tag] ?? CUSTOM_TINT },
              ]}
            >
              <Text style={styles.tagText}>
                {t(`setupProfile.bioPicker.tags.${phrase.tag}`)}
              </Text>
            </View>
            <Text
              style={[styles.phraseText, selected && styles.phraseTextSelected]}
            >
              {localizedText}
            </Text>
          </Pressable>
        );
      })}

      {disabled && lockedHint ? (
        <View style={styles.lockHintBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primaryDark} />
          <Text style={styles.lockHintText}>{lockedHint}</Text>
        </View>
      ) : null}
    </View>
  );
}

const CustomInput = forwardRef<
  TextInput,
  Pick<TextInputProps, 'value' | 'onChangeText' | 'editable' | 'placeholder' | 'onFocus'>
>(function CustomInput({ value, onChangeText, editable, placeholder, onFocus }, ref) {
  // RN's native placeholder loses fontFamily on `multiline` + `editable={false}`
  // TextInputs (the state this field starts in until the user taps the card),
  // so render a Text overlay instead of relying on the `placeholder` prop.
  return (
    <View style={styles.customInputWrap}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline
        maxLength={500}
        style={[{ fontFamily: fonts.pixel }, styles.customInput]}
        onFocus={onFocus}
      />
      {(value?.length ?? 0) === 0 && placeholder ? (
        <Text style={styles.customPlaceholder} pointerEvents="none">
          {placeholder}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardError: {
    borderColor: colors.error,
  },
  customHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: CUSTOM_TINT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  tagText: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.white,
    letterSpacing: 0.4,
  },
  charCounter: {
    fontSize: 11,
    color: colors.textLight,
    fontFamily: fonts.regular,
    letterSpacing: 0.2,
  },
  charCounterMax: {
    color: colors.error,
    fontFamily: fonts.medium,
  },
  phraseText: {
    // 직접 입력 카드와 같은 높이로 시작한다 (CARD_CONTENT_MIN_HEIGHT 공유).
    // 문구가 길면 그만큼 자연스럽게 늘어난다.
    minHeight: CARD_CONTENT_MIN_HEIGHT,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  phraseTextSelected: {
    color: colors.primaryDark,
  },
  customInputWrap: {
    position: 'relative',
  },
  customInput: {
    // 고정 높이 — 길게 써도 카드가 세로로 자라지 않고 입력창 안에서 스크롤된다
    // (multiline TextInput 은 내용이 높이를 넘으면 iOS/Android 모두 내부 스크롤로
    // 전환되고 캐럿을 따라 자동 스크롤한다). 프리셋 카드와 높이를 맞추는 값이라
    // 바꾸려면 CARD_CONTENT_MIN_HEIGHT 를 조정한다.
    height: CARD_CONTENT_MIN_HEIGHT,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
    fontFamily: fonts.regular,
    textAlignVertical: 'top',
    padding: 0,
  },
  customPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textLight,
    fontFamily: fonts.pixel,
  },
  lockHintBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  lockHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.primaryDark,
    fontFamily: fonts.medium,
  },
});
