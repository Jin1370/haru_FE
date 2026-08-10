// 성별 → i18n 키. 표기는 setupProfile.gender* 한 벌(남성/여성/기타)로 통일한다.
export const genderLabelKey = (g?: string | null) =>
  g === 'male'
    ? 'setupProfile.genderMale'
    : g === 'female'
      ? 'setupProfile.genderFemale'
      : 'setupProfile.genderOther';

// 카드/프로필 시트 표기용 FontAwesome 이름. Ionicons male/female 은 원이 크고 화살표·
// 십자가 짧아 13px 에서 판독이 안 돼 고전 기호 비율의 mars/venus 로 교체했다.
// 라벨(genderLabelKey)은 accessibilityLabel 로 유지한다.
// '기타'는 venus-mars(⚥ = 인터섹스) 도 물음표(= 미상)도 오표기라 중립 인물 아이콘.
export const genderIconName = (g?: string | null) =>
  g === 'male' ? 'mars' : g === 'female' ? 'venus' : 'user';
