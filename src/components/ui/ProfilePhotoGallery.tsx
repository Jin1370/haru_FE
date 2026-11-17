import { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors } from '@/constants/colors';

interface ProfilePhotoGalleryProps {
  // Full photos array as returned by BE. photos[0] is the main photo.
  photos: string[];
}

// Horizontal-paging photo carousel used in the chat-screen partner modal.
// 사진이 1장이면 paging 비활성 (phantom slide 회피).
export function ProfilePhotoGallery({ photos }: ProfilePhotoGalleryProps) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  if (!photos || photos.length === 0) {
    return null;
  }

  const canSwipe = photos.length > 1;
  const visiblePhotos = canSwipe ? photos : [photos[0]];

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && w !== width) setWidth(w);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  const renderItem = ({ item }: { item: string; index: number }) => (
    <View style={[styles.slide, { width }]}>
      <Image source={{ uri: item }} style={styles.photo} resizeMode="cover" />
    </View>
  );

  return (
    <View onLayout={onLayout} style={styles.container}>
      {width > 0 ? (
        <FlatList
          data={visiblePhotos}
          horizontal
          pagingEnabled
          scrollEnabled={canSwipe}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          renderItem={renderItem}
        />
      ) : null}
      {canSwipe ? (
        <View style={styles.dots} pointerEvents="none">
          {visiblePhotos.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
    backgroundColor: colors.cardAlt,
  },
  slide: {
    height: '100%',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  dots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    width: 16,
    backgroundColor: colors.white,
  },
});
