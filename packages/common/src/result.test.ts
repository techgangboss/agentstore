import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  tryCatch,
  map,
  mapError,
  flatMap,
  unwrap,
  unwrapOr,
  all,
  type Result,
} from './result.js';

describe('Result type', () => {
  describe('ok', () => {
    it('creates a successful result', () => {
      const result = ok(42);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });
  });

  describe('err', () => {
    it('creates a failed result', () => {
      const result = err(new Error('test error'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('test error');
      }
    });
  });

  describe('tryCatch', () => {
    it('wraps successful promises', async () => {
      const result = await tryCatch(Promise.resolve(42));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });

    it('catches rejected promises', async () => {
      const result = await tryCatch(Promise.reject(new Error('failed')));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('failed');
      }
    });

    it('handles non-Error rejections', async () => {
      const result = await tryCatch(Promise.reject('string error'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('string error');
      }
    });
  });

  describe('map', () => {
    it('transforms successful results', () => {
      const result = map(ok(5), (x) => x * 2);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(10);
      }
    });

    it('passes through errors', () => {
      const result = map(err(new Error('test')), (x: number) => x * 2);
      expect(result.success).toBe(false);
    });
  });

  describe('mapError', () => {
    it('transforms errors', () => {
      const result = mapError(err('original'), (e) => new Error(e));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('original');
      }
    });

    it('passes through success', () => {
      const result = mapError(ok(42), (e) => new Error(String(e)));
      expect(result.success).toBe(true);
    });
  });

  describe('flatMap', () => {
    it('chains successful results', () => {
      const result = flatMap(ok(5), (x) => ok(x * 2));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(10);
      }
    });

    it('short-circuits on error', () => {
      const errorResult = err('error') as Result<number, string>;
      const result = flatMap(errorResult, (x) => ok(x * 2));
      expect(result.success).toBe(false);
    });

    it('propagates inner errors', () => {
      const result = flatMap(ok(5), () => err('inner error'));
      expect(result.success).toBe(false);
    });
  });

  describe('unwrap', () => {
    it('returns data from success', () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it('throws on error', () => {
      expect(() => unwrap(err(new Error('test')))).toThrow('test');
    });
  });

  describe('unwrapOr', () => {
    it('returns data from success', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('returns default on error', () => {
      expect(unwrapOr(err(new Error('test')), 0)).toBe(0);
    });
  });

  describe('all', () => {
    it('combines successful results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = all(results);
      expect(combined.success).toBe(true);
      if (combined.success) {
        expect(combined.data).toEqual([1, 2, 3]);
      }
    });

    it('fails on first error', () => {
      const results = [ok(1), err(new Error('fail')), ok(3)];
      const combined = all(results);
      expect(combined.success).toBe(false);
    });

    it('handles empty array', () => {
      const combined = all([]);
      expect(combined.success).toBe(true);
      if (combined.success) {
        expect(combined.data).toEqual([]);
      }
    });
  });
});
