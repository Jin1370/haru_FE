# CLAUDE.md — haru_FE

FE 작업에 적용하는 UI 규칙. 프로젝트 전체 규칙은 루트 `CLAUDE.md`, 웹은 `web/CLAUDE.md`, 어드민은 `admin/CLAUDE.md` 를 따른다.

## 문구

- 문장 끝에는 문장부호를 붙인다. ko `.`, ja `。`, en `.`
- 제목, 입력칸 안내(placeholder), 버튼, 라벨에는 붙이지 않는다. 모달 타이틀로 쓰이는 문구도 제목이다.
- 문구를 바꾸면 ko, ja, en 을 함께 바꾼다.

## 모달

- 닫기는 우측 상단 X 가 아니라 취소 버튼으로 한다.
- 공용 모달의 취소 버튼은 `cancelText`, 확인 버튼은 `confirmText` 로 지정한다.
- 별사탕을 쓰는 모달은 차감 개수를 보여준다. 공용 모달은 `starCost` 를 쓴다.

## 아이콘과 숫자

- 아이콘 옆 숫자는 세로 중앙에 맞춘다.
- Galmuri11 은 숫자가 줄 상자 아래쪽에 놓여 가운데 정렬만으로는 낮아 보인다. 위치가 어긋나면 `translateY` 로 보정한다 (`StarChip` 참고).
- 나란히 놓는 아이콘은 코드상 크기가 아니라 실제 도형 높이를 맞춘다 (`StarChip` 의 `CHIP_ICON_SIZES` 참고).
- haru 전용 아이콘은 `src/components/ui/HaruIcon.tsx` 에 모은다. 색과 크기는 코드에서 지정한다.
