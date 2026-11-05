import { cardResetCost } from './discoverDaily';

describe('cardResetCost', () => {
  it('10장에 4개 비율로 올림한다', () => {
    const costs = Array.from({ length: 10 }, (_, i) => cardResetCost(i + 1));
    expect(costs).toEqual([1, 1, 2, 2, 2, 3, 3, 4, 4, 4]);
  });
});
