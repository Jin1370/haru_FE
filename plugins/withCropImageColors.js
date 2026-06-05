// expo-image-picker 의 네이티브 크롭 화면(회전/반전/자르기) 버튼이 일부 기기에서
// 안 보이는 문제 수정.
//
// 원인: 크롭 액티비티(ExpoCropImageActivity)의 테마는 항상 어두운
// `Base.Theme.AppCompat` 라 툴바/윈도우가 어둡다. 그런데 툴바 아이콘·글씨의 color
// 리소스는 *기기* 야간모드 설정에 따라 values/(주간=검정 글씨) 와 values-night/
// (야간=흰 글씨) 로 갈린다 (expo-image-picker/.../res/values*/colors.xml).
//   - 다크모드 기기: 흰 글씨 + 어두운 툴바 → 잘 보임
//   - 라이트모드 기기: 검은 글씨 + 어두운 툴바 → 안 보임  ← 버그
// 즉 툴바 배경(항상 어두움)과 글씨색(기기 따라 흑/백)이 어긋나 라이트모드 기기에서
// 대비가 깨진다. 앱 테마가 userInterfaceStyle:"light" 로 고정돼 있어도 크롭의
// color 폴더 선택은 *기기* 설정을 따르므로 영향을 받지 않는다.
//
// 해결: expo-image-picker 가 앱의 동일 이름 color 리소스로 오버라이드할 수 있도록
// 훅을 열어놨다 (ExpoCropImageUtils.applyPaletteToOptions 가 R.color.expoCrop* 를
// 먼저 조회). 주간(values/) color 를 "어두운 툴바 + 흰 글씨" 로 고정해 라이트모드
// 기기에서도 다크모드 기기와 동일하게 보이게 통일한다. 야간(values-night/) 은
// 라이브러리 기본값이 이미 흰 글씨라 그대로 두면 동일한 결과가 된다.
//
// 앱 리소스가 라이브러리 리소스를 같은 이름으로 덮어쓰며, withAndroidColors 는
// 기존 colors.xml(스플래시 등 다른 색 포함)에 머지하므로 안전하다.
const { AndroidConfig, withAndroidColors } = require('expo/config-plugins');

// 어두운 툴바 + 흰 글씨/아이콘 + 검은 크롭 배경. 기기 야간모드와 무관하게 통일.
const CROP_COLORS = {
  expoCropToolbarColor: '#1A1A1A', // 툴바 배경
  expoCropToolbarIconColor: '#FFFFFF', // 회전/반전 등 메뉴 아이콘
  expoCropToolbarActionTextColor: '#FFFFFF', // "완료" 액션 텍스트
  expoCropBackButtonIconColor: '#FFFFFF', // 뒤로가기 아이콘
  expoCropBackgroundColor: '#000000', // 크롭 영역 배경 (사진 대비용)
};

module.exports = function withCropImageColors(config) {
  return withAndroidColors(config, (cfg) => {
    for (const [name, value] of Object.entries(CROP_COLORS)) {
      cfg.modResults = AndroidConfig.Colors.setColorItem(
        { $: { name }, _: value },
        cfg.modResults,
      );
    }
    return cfg;
  });
};
