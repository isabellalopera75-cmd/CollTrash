const { arrayToString, isoDayNumber } = require('../src/utils/dateHelper');

describe('dateHelper utilities', () => {
  describe('arrayToString', () => {
    it('should convert an array of numbers to a comma-separated string', () => {
      expect(arrayToString([1, 2, 3])).toBe('1,2,3');
    });

    it('should convert an array of strings to a comma-separated string', () => {
      expect(arrayToString(['1', ' 2', '3 '])).toBe('1,2,3');
    });

    it('should return empty string if input is not an array', () => {
      expect(arrayToString(null)).toBe('');
      expect(arrayToString(undefined)).toBe('');
      expect(arrayToString('1,2,3')).toBe('');
    });

    it('should filter out falsy values', () => {
      expect(arrayToString([1, null, undefined, 2, ''])).toBe('1,2');
    });
  });

  describe('isoDayNumber', () => {
    it('should return 1 for Monday', () => {
      // 2026-05-25 is a Monday
      const date = new Date('2026-05-25T12:00:00Z');
      expect(isoDayNumber(date)).toBe(1);
    });

    it('should return 7 for Sunday', () => {
      // 2026-05-24 is a Sunday
      const date = new Date('2026-05-24T12:00:00Z');
      expect(isoDayNumber(date)).toBe(7);
    });

    it('should return 3 for Wednesday', () => {
      // 2026-05-27 is a Wednesday
      const date = new Date('2026-05-27T12:00:00Z');
      expect(isoDayNumber(date)).toBe(3);
    });
  });
});
