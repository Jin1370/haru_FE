import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// Custom cross-platform photo editor: 3:4 crop (pan + pinch-zoom over a fixed
// frame) + 90° rotate + horizontal/vertical flip. Replaces expo-image-picker's
// native `allowsEditing` editor, which on iOS forces a square crop and offers
// no rotate/flip (see app.json/CLAUDE notes). Output is a JPEG file URI.
//
// Rotate/flip "re-bake" the working image through expo-image-manipulator and
// reset the transform — keeping the gesture/crop math purely about pan+zoom on
// an axis-aligned image (no rotated-bounds bookkeeping in the worklet layer).

const ASPECT_X = 3;
const ASPECT_Y = 4;
const FRAME_PADDING = 16;
const MAX_SCALE = 5;

const EDITOR_BG = '#1C1320'; // deep plum — on-brand dark surround, photo pops
const TOOL_FG = '#FFFFFF';

type WorkingImage = { uri: string; w: number; h: number };

function clampWorklet(v: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(v, min), max);
}

export function PhotoEditor({
  uri,
  onComplete,
  onCancel,
}: {
  uri: string;
  onComplete: (editedUri: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [working, setWorking] = useState<WorkingImage | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pan/zoom transform state (screen px; translation of the image center
  // relative to the frame center, scale about center).
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const resetTransforms = () => {
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    savedTx.value = 0;
    ty.value = 0;
    savedTy.value = 0;
  };

  // Load the working image whenever the source changes. We normalize EXIF
  // orientation up-front by re-baking the source through expo-image-manipulator
  // (no ops → decode applies orientation, encode strips EXIF). Android gallery/
  // camera photos commonly carry EXIF orientation, and Image.getSize vs the
  // crop buffer disagreed on whether it was applied — so the computed crop
  // origin landed in the wrong corner (the top-left got cut off). After this
  // bake the on-screen <Image>, the reported width/height, and the crop buffer
  // are all in the same upright space, making the crop math exact. (rotate/flip
  // already re-bake the same way.)
  useEffect(() => {
    let active = true;
    setWorking(null);
    setErrorMsg(null);
    (async () => {
      try {
        const ref = await ImageManipulator.manipulate(uri).renderAsync();
        const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
        if (!active) return;
        setWorking({ uri: out.uri, w: out.width, h: out.height });
        resetTransforms();
      } catch {
        if (active) setErrorMsg(t('photoEditor.failed'));
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  // Measure the available central area and fit a 3:4 crop frame inside it.
  const onAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const availW = width - FRAME_PADDING * 2;
    const availH = height - FRAME_PADDING * 2;
    if (availW <= 0 || availH <= 0) return;
    let fw = availW;
    let fh = (fw * ASPECT_Y) / ASPECT_X;
    if (fh > availH) {
      fh = availH;
      fw = (fh * ASPECT_X) / ASPECT_Y;
    }
    setFrame((prev) =>
      prev && Math.abs(prev.w - fw) < 0.5 && Math.abs(prev.h - fh) < 0.5
        ? prev
        : { w: fw, h: fh },
    );
  };

  // Base "cover" geometry: at scale=1 the image exactly covers the frame.
  const geom = useMemo(() => {
    if (!working || !frame) return null;
    const baseScale = Math.max(frame.w / working.w, frame.h / working.h);
    return {
      baseScale,
      dispBaseW: working.w * baseScale,
      dispBaseH: working.h * baseScale,
      frameW: frame.w,
      frameH: frame.h,
    };
  }, [working, frame]);

  const gesture = useMemo(() => {
    if (!geom) return Gesture.Race(); // no-op until measured
    const { dispBaseW, dispBaseH, frameW, frameH } = geom;
    const pan = Gesture.Pan()
      .onUpdate((e) => {
        'worklet';
        const maxTx = Math.max(0, (dispBaseW * scale.value - frameW) / 2);
        const maxTy = Math.max(0, (dispBaseH * scale.value - frameH) / 2);
        tx.value = clampWorklet(savedTx.value + e.translationX, -maxTx, maxTx);
        ty.value = clampWorklet(savedTy.value + e.translationY, -maxTy, maxTy);
      })
      .onEnd(() => {
        'worklet';
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        'worklet';
        scale.value = clampWorklet(savedScale.value * e.scale, 1, MAX_SCALE);
        const maxTx = Math.max(0, (dispBaseW * scale.value - frameW) / 2);
        const maxTy = Math.max(0, (dispBaseH * scale.value - frameH) / 2);
        tx.value = clampWorklet(tx.value, -maxTx, maxTx);
        ty.value = clampWorklet(ty.value, -maxTy, maxTy);
      })
      .onEnd(() => {
        'worklet';
        savedScale.value = scale.value;
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });
    return Gesture.Simultaneous(pan, pinch);
  }, [geom, scale, savedScale, tx, savedTx, ty, savedTy]);

  const imgAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const rebake = async (op: 'rotate' | 'flipH' | 'flipV') => {
    if (!working || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const ctx = ImageManipulator.manipulate(working.uri);
      if (op === 'rotate') ctx.rotate(90);
      else if (op === 'flipH') ctx.flip('horizontal');
      else ctx.flip('vertical');
      const ref = await ctx.renderAsync();
      const out = await ref.saveAsync({ format: SaveFormat.PNG });
      setWorking({ uri: out.uri, w: out.width, h: out.height });
      resetTransforms();
    } catch {
      setErrorMsg(t('photoEditor.failed'));
    } finally {
      setBusy(false);
    }
  };

  const onDone = async () => {
    if (!working || !geom || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const sc = geom.baseScale * scale.value; // original px → screen px
      let cropW = geom.frameW / sc;
      let cropH = geom.frameH / sc;
      let originX = (working.w - cropW) / 2 - tx.value / sc;
      let originY = (working.h - cropH) / 2 - ty.value / sc;
      cropW = Math.round(Math.min(cropW, working.w));
      cropH = Math.round(Math.min(cropH, working.h));
      originX = Math.round(Math.min(Math.max(0, originX), working.w - cropW));
      originY = Math.round(Math.min(Math.max(0, originY), working.h - cropH));
      const ref = await ImageManipulator.manipulate(working.uri)
        .crop({ originX, originY, width: cropW, height: cropH })
        .renderAsync();
      const out = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      onComplete(out.uri);
    } catch {
      setErrorMsg(t('photoEditor.failed'));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onCancel}
          disabled={busy}
          hitSlop={12}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Text style={styles.headerCancel}>{t('common.cancel')}</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('photoEditor.title')}
        </Text>
        <Pressable
          onPress={onDone}
          disabled={busy || !working || !geom}
          hitSlop={12}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
        >
          <Text style={[styles.headerDone, (busy || !working) && styles.disabled]}>
            {t('common.done')}
          </Text>
        </Pressable>
      </View>

      {/* Crop area */}
      <View style={styles.area} onLayout={onAreaLayout}>
        {working && geom ? (
          <View
            style={[
              styles.frame,
              { width: geom.frameW, height: geom.frameH },
            ]}
          >
            <GestureDetector gesture={gesture}>
              <Animated.View style={StyleSheet.absoluteFill}>
                <Animated.Image
                  source={{ uri: working.uri }}
                  style={[
                    {
                      position: 'absolute',
                      width: geom.dispBaseW,
                      height: geom.dispBaseH,
                      left: (geom.frameW - geom.dispBaseW) / 2,
                      top: (geom.frameH - geom.dispBaseH) / 2,
                    },
                    imgAnimStyle,
                  ]}
                />
              </Animated.View>
            </GestureDetector>

            {/* Rule-of-thirds grid (non-interactive) */}
            <View pointerEvents="none" style={styles.grid}>
              <View style={[styles.gridLineV, { left: '33.33%' }]} />
              <View style={[styles.gridLineV, { left: '66.66%' }]} />
              <View style={[styles.gridLineH, { top: '33.33%' }]} />
              <View style={[styles.gridLineH, { top: '66.66%' }]} />
            </View>
          </View>
        ) : (
          <ActivityIndicator color={TOOL_FG} />
        )}

        {busy ? (
          <View style={styles.busyOverlay} pointerEvents="auto">
            <ActivityIndicator color={TOOL_FG} />
            <Text style={styles.busyText}>{t('photoEditor.processing')}</Text>
          </View>
        ) : null}
      </View>

      {errorMsg ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Toolbar */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 16 }]}>
        <ToolButton
          icon="refresh-outline"
          label={t('photoEditor.rotate')}
          onPress={() => rebake('rotate')}
          disabled={busy || !working}
        />
        <ToolButton
          icon="swap-horizontal"
          label={t('photoEditor.flipHorizontal')}
          onPress={() => rebake('flipH')}
          disabled={busy || !working}
        />
        <ToolButton
          icon="swap-vertical"
          label={t('photoEditor.flipVertical')}
          onPress={() => rebake('flipV')}
          disabled={busy || !working}
        />
      </View>
    </View>
  );
}

function ToolButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.tool,
        pressed && !disabled && styles.toolPressed,
        disabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={24} color={TOOL_FG} />
      <Text style={styles.toolLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: EDITOR_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  headerBtn: { minWidth: 56, justifyContent: 'center' },
  headerCancel: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TOOL_FG,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: TOOL_FG,
    flex: 1,
    textAlign: 'center',
  },
  headerDone: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.primary,
    textAlign: 'right',
  },
  disabled: { opacity: 0.4 },
  area: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: FRAME_PADDING,
  },
  frame: {
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.black,
  },
  grid: { ...StyleSheet.absoluteFillObject },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: 10,
  },
  busyText: { color: TOOL_FG, fontSize: 13, fontFamily: fonts.regular },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,107,122,0.18)',
  },
  errorText: {
    color: '#FFD2D7',
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 24,
  },
  tool: { alignItems: 'center', gap: 6, minWidth: 72, paddingVertical: 6 },
  toolPressed: { opacity: 0.6 },
  toolLabel: { color: TOOL_FG, fontSize: 12, fontFamily: fonts.regular },
});
