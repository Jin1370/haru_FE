import { dotWindow } from './dotWindow';

const sizes = (n: number, live: number) => dotWindow(n, live).map((d) => d.size);
const idx = (n: number, live: number) => dotWindow(n, live).map((d) => d.i);

test('10장까지는 전부 같은 크기', () => {
  expect(sizes(10, 9)).toEqual(Array(10).fill(8));
  expect(sizes(3, 0)).toEqual([8, 8, 8]);
});

test('넘으면 10개만, 가려진 쪽 끝이 작다', () => {
  expect(idx(30, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(sizes(30, 0)).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 6, 4]);
  expect(idx(30, 15)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  expect(sizes(30, 15)).toEqual([4, 6, 8, 8, 8, 8, 8, 8, 6, 4]);
  expect(idx(30, 29)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  expect(sizes(30, 29)).toEqual([4, 6, 8, 8, 8, 8, 8, 8, 8, 8]);
});

test('보는 카드는 항상 창 안', () => {
  for (let live = 0; live < 57; live++) expect(idx(57, live)).toContain(live);
});
