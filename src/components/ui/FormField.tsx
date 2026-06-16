import { useState, forwardRef } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { ErrorText } from './ErrorText';

export interface FormFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  errorTestID?: string;
}

// Reusable text input + inline red error. The input's border turns red while
// `error` is set so the field state and the message stay visually linked.
// `error` is rendered with role="alert" so screen readers announce it on change.
export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  {
    label,
    error,
    containerStyle,
    inputStyle,
    style,
    errorTestID,
    onFocus,
    onBlur,
    placeholder,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  // RN's native placeholder loses fontFamily in several configurations
  // (multiline, certain keyboardTypes, platform quirks), so we render the
  // placeholder as a Text overlay instead. This guarantees the pixel font.
  const hasValue = typeof rest.value === 'string' && rest.value.length > 0;
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputWrap}>
        <TextInput
          ref={ref}
          style={[
            { fontFamily: fonts.pixel },
            styles.input,
            focused && styles.inputFocused,
            error ? styles.inputError : null,
            inputStyle,
            style,
          ]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {!hasValue && placeholder ? (
          <Text
            // Pick up callers' padding/fontSize overrides via inputStyle,
            // then re-apply the placeholder's own color/font/bg so any leak
            // from inputStyle (text color, surface bg) doesn't bleed through.
            style={[
              styles.placeholder,
              inputStyle,
              {
                color: colors.textLight,
                fontFamily: fonts.pixel,
                backgroundColor: 'transparent',
              },
            ]}
            pointerEvents="none"
            numberOfLines={1}
          >
            {placeholder}
          </Text>
        ) : null}
      </View>
      <ErrorText testID={errorTestID}>{error ?? null}</ErrorText>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
    fontFamily: fonts.regular,
    // 높이를 고정하고 세로 패딩을 0 으로 둬 "내용영역 = 박스 전체(52px)" 로 만든다.
    // 픽셀 폰트가 빈칸-신규 / 빈칸-입력후삭제 의 자연 높이를 다르게 측정해 출렁이던
    // 문제를, 높이를 못 박아 제거 (minHeight 는 floor 만 잡아 못 막음). 내용영역이
    // 박스 전체라 16px 글자는 절대 안 잘리고, 세로 위치는 textAlignVertical 로 중앙.
    height: 52,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  inputError: {
    borderColor: colors.error,
  },
  placeholder: {
    // Fill the entire input area. 세로 중앙 정렬은 lineHeight = 박스 높이(52) 로
    // 맞춘다 — 이러면 textAlignVertical:center 로 중앙 정렬된 실제 입력 텍스트와
    // placeholder 위치가 정확히 겹친다(상하 패딩 기반이면 고정 높이에서 어긋남).
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    fontSize: 16,
    lineHeight: 52,
    color: colors.textLight,
    fontFamily: fonts.pixel,
  },
});
