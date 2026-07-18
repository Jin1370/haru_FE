import { ApiRequestError } from '@/services/api';
import { describeError } from './errors';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('describeError', () => {
  it('prefers ApiRequestError.errorMessage', () => {
    const e = new ApiRequestError(400, 'Email already in use');
    expect(describeError(e)).toBe('Email already in use');
  });

  it('falls back to fallback when ApiRequestError has no message', () => {
    const e = new ApiRequestError(500, '');
    expect(describeError(e, 'fallback')).toBe('fallback');
  });

  it('reads Error.message for generic runtime errors', () => {
    expect(describeError(new Error('oops'))).toBe('oops');
  });

  it('returns a raw thrown string directly', () => {
    expect(describeError('plain string')).toBe('plain string');
  });

  it('uses the fallback for unknown shapes (undefined, number, object)', () => {
    expect(describeError(undefined, 'F1')).toBe('F1');
    expect(describeError(42, 'F2')).toBe('F2');
    expect(describeError({ any: 'shape' }, 'F3')).toBe('F3');
  });
});
