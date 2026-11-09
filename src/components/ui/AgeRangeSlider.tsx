import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  type LayoutChangeEvent,
} from 'react-native';
import { colors } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';

interface AgeRangeSliderProps {
  min: number;
  max: number;
  value: { min: number; max: number };
  onChange: (next: { min: number; max: number }) => void;
  // Whitespace between handles in age units. Prevents the two thumbs from
  // crossing or overlapping into an unreadable lump.
  minGap?: number;
  // Suffix appended to the live label, e.g. "세" / "y/o". Caller-supplied
  // because the parent already has translation context.
  suffix?: string;
}

const HANDLE_SIZE = 24;
const TRACK_HEIGHT = 4;

// Dual-handle range picker. PanResponder + refs avoid the stale-closure
// trap: handlers read latest value/usable from a ref written on every
// render, so a single useRef-built responder keeps working as state moves.
export function AgeRangeSlider({
  min,
  max,
  value,
  onChange,
  minGap = 1,
  suffix = '',
}: AgeRangeSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);

  const range = max - min;
  const usable = Math.max(trackWidth - HANDLE_SIZE, 1);
  const minPos = ((value.min - min) / range) * usable;
  const maxPos = ((value.max - min) / range) * usable;

  const liveRef = useRef({ value, usable, range, min, max, minGap, onChange });
  liveRef.current = { value, usable, range, min, max, minGap, onChange };

  // Snapshot at gesture start so dx applies to the value when drag began —
  // otherwise repeated onPanResponderMove ticks compound the same delta.
  const dragStartRef = useRef<{ min: number; max: number }>({ min: value.min, max: value.max });

  const minResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = { ...liveRef.current.value };
      },
      onPanResponderMove: (_, g) => {
        const live = liveRef.current;
        if (live.usable <= 0) return;
        const deltaAge = (g.dx / live.usable) * live.range;
        const next = Math.round(dragStartRef.current.min + deltaAge);
        const clamped = Math.max(
          live.min,
          Math.min(next, dragStartRef.current.max - live.minGap),
        );
        if (clamped !== live.value.min) {
          live.onChange({ min: clamped, max: live.value.max });
        }
      },
    }),
  ).current;

  const maxResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = { ...liveRef.current.value };
      },
      onPanResponderMove: (_, g) => {
        const live = liveRef.current;
        if (live.usable <= 0) return;
        const deltaAge = (g.dx / live.usable) * live.range;
        const next = Math.round(dragStartRef.current.max + deltaAge);
        const clamped = Math.min(
          live.max,
          Math.max(next, dragStartRef.current.min + live.minGap),
        );
        if (clamped !== live.value.max) {
          live.onChange({ min: live.value.min, max: clamped });
        }
      },
    }),
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.valueLabel}>
        {value.min} ~ {value.max}
        {value.max === max ? '+' : ''}
        {suffix}
      </Text>
      <View style={styles.trackContainer} onLayout={handleLayout}>
        <View style={styles.track} />
        {trackWidth > 0 ? (
          <>
            <View
              style={[
                styles.activeTrack,
                { left: minPos + HANDLE_SIZE / 2, width: Math.max(maxPos - minPos, 0) },
              ]}
            />
            <View
              {...minResponder.panHandlers}
              style={[styles.handle, { left: minPos }]}
              accessibilityRole="adjustable"
              accessibilityLabel={`min age ${value.min}`}
            />
            <View
              {...maxResponder.panHandlers}
              style={[styles.handle, { left: maxPos }]}
              accessibilityRole="adjustable"
              accessibilityLabel={`max age ${value.max}`}
            />
          </>
        ) : null}
      </View>
      <View style={styles.boundsRow}>
        <Text style={styles.boundText}>{min}</Text>
        <Text style={styles.boundText}>{max}+</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  valueLabel: {
    fontSize: fs(14),
    fontFamily: fonts.semibold,
    color: colors.primaryDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  trackContainer: {
    height: HANDLE_SIZE,
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  track: {
    position: 'absolute',
    left: HANDLE_SIZE / 2,
    right: HANDLE_SIZE / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: colors.border,
  },
  activeTrack: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: colors.primary,
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  boundsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  boundText: {
    fontSize: fs(11),
    color: colors.textSecondary,
    fontFamily: fonts.regular,
  },
});
