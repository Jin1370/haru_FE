import { Platform } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

// 뒤로가기 아이콘. OS 기본 헤더(플레이리스트 카드 화면 등)와 같은 모양으로 맞춘다 — Android ←, iOS ‹.
export function BackIcon({ color }: { color: string }) {
  return Platform.OS === 'ios' ? (
    <Ionicons name="chevron-back" size={28} color={color} />
  ) : (
    <MaterialIcons name="arrow-back" size={24} color={color} />
  );
}
