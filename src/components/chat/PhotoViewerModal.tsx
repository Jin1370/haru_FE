import { useState } from 'react';
import {
  View,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAlert } from '@/stores/alertStore';
import { colors } from '@/constants/colors';

interface PhotoViewerModalProps {
  visible: boolean;
  /** 표시할 이미지. 로컬 캐시가 있으면 그 경로, 없으면 서명 URL. */
  uri: string | null;
  onClose: () => void;
}

/**
 * 채팅 사진 전체 화면 뷰어.
 *
 * 핀치 줌은 v1 제외 — 제스처 라이브러리를 하나 더 붙여야 하고, 채팅 사진은
 * 한 장을 크게 보는 게 목적이라 확대까지 필요한 경우가 드물다.
 *
 * 스크린샷 차단(`expo-screen-capture`)은 켜지 않는다 (사용자 결정 2026-09-10).
 * iOS 는 OS 차원에서 스크린샷을 못 막아 어차피 반쪽이고, 저장 기능을 여기
 * 두기로 한 이상 차단은 앞뒤가 안 맞는다.
 */
export function PhotoViewerModal({ visible, uri, onClose }: PhotoViewerModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!uri || saving) return;
    setSaving(true);
    try {
      // writeOnly=true — 저장만 하는데 읽기 권한까지 요청하면 Android 13+ 에서
      // "음악과 오디오" 를 포함한 미디어 읽기 권한 전체를 묻는다 (라이브러리
      // 기본값이 READ_MEDIA_IMAGES/VIDEO/AUDIO 를 한꺼번에 요청). iOS 에서는
      // "사진 추가만 허용" 권한(NSPhotoLibraryAddUsageDescription)으로 매핑된다.
      const { granted } = await MediaLibrary.requestPermissionsAsync(true);
      if (!granted) {
        showAlert({
          variant: 'info',
          title: t('chat.photo.saveFailed'),
          message: t('chat.photo.savePermission'),
        });
        return;
      }

      // 출처를 가리지 않고 항상 **확장자 있는 임시 파일**로 만들어 넘긴다.
      //   * 원격(서명 URL) — 갤러리 저장은 로컬 파일만 받는다.
      //   * 로컬 캐시 — photoCache 의 파일명은 messageId 뿐이라 확장자가 없다.
      //     saveToLibraryAsync 는 확장자로 타입을 판별해서 그대로 넘기면 실패한다.
      const tmp = `${FileSystem.cacheDirectory}save_${Date.now()}.jpg`;
      if (uri.startsWith('file://')) {
        await FileSystem.copyAsync({ from: uri, to: tmp });
      } else {
        const res = await FileSystem.downloadAsync(uri, tmp);
        // downloadAsync 는 4xx/5xx 에도 throw 하지 않고 응답 본문을 파일에 쓴다.
        // 그대로 저장하면 "이미지가 아닌 파일" 로 실패한다.
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`photo download failed: ${res.status}`);
        }
      }

      try {
        await MediaLibrary.saveToLibraryAsync(tmp);
      } finally {
        // 중간에 끊겨 부분만 받아진 파일도 남기지 않는다.
        await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
      }
      showAlert({ variant: 'info', title: t('chat.photo.saved') });
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[PhotoViewerModal] save failed:', (e as Error)?.message);
      }
      showAlert({ variant: 'error', title: t('chat.photo.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* 배경 탭으로 닫기 — 전체 화면이라 별도 닫기 동선이 하나 더 있는 게 안전하다. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : null}

        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('chat.photo.save')}
            style={styles.iconButton}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Ionicons name="download-outline" size={24} color={colors.white} />
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
});
