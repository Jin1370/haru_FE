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
import {
  BIO_PHRASES,
  findPresetByText,
  getBioPhraseText,
  type BioPhraseCategory,
} from '@/constants/bioPhrases';

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

const CATEGORY_TINTS: Record<BioPhraseCategory, string> = {
  taste: '#F6B5C8',
  simple: '#B8C8DD',
  sincere: '#E8A88C',
  flutter: '#E27AA0',
  confidence: '#F4A261',
  aegyo: '#D8A8E0',
};

const CUSTOM_TINT = '#C8ADBA';
const CUSTOM_MAX = 500;

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
  // Ref to the custom TextInput so we can programmatically focus it the moment
  // the user taps the custom card. Without this the user must tap twice — once
  // to flip selectedId='custom' (the wrapping Pressable wins because the input
  // is editable=false initially), then again to focus the now-editable input.
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
    setSelectedId(id);
    onChange(text, id);
  };

  const handleSelectCustom = () => {
    if (disabled) return;
    setSelectedId('custom');
    onChange(customText, null);
    // Focus on the next tick so the input has flipped to editable=true.
    // Triggers the onFocus handler so KeyboardAwareScrollView (or any focus
    // listener wired by the caller) lifts the input above the keyboard.
    setTimeout(() => customInputRef.current?.focus(), 0);
  };

  const handleCustomTextChange = (text: string) => {
    setCustomText(text);
    if (selectedId === 'custom') onChange(text, null);
  };

  return (
    <View style={styles.container}>
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
                { backgroundColor: CATEGORY_TINTS[phrase.category] },
              ]}
            >
              <Text style={styles.tagText}>
                {t(`setupProfile.bioPicker.category.${phrase.category}`)}
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
            <Text style={styles.tagText}>
              {t('setupProfile.bioPicker.category.custom')}
            </Text>
          </View>
          {/* Counter only shows once the user is actively in custom mode —
              otherwise it's noise across the preset cards. Turns red at the
              cap so the user understands why typing stopped. */}
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
          editable={!disabled && selectedId === 'custom'}
          placeholder={t('setupProfile.bioPicker.customPlaceholder')}
          onFocus={onCustomFocus}
        />
        <ErrorText testID="bio-phrase-picker-error">{error ?? null}</ErrorText>
      </Pressable>

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
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  customHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
  tagText: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.white,
    letterSpacing: 0.4,
  },
  phraseText: {
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
    minHeight: 60,
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
