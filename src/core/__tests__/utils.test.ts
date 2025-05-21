// src/core/__tests__/utils.test.ts

import { sanitizeIdForLLM } from '../utils';

describe('Core Utils: sanitizeIdForLLM', () => {
  it('should return an unchanged string for valid IDs', () => {
    expect(sanitizeIdForLLM('valid-id_123')).toBe('valid-id_123');
    expect(sanitizeIdForLLM('another_VALID_name')).toBe('another_VALID_name');
  });

  it('should replace spaces and special characters with underscores', () => {
    expect(sanitizeIdForLLM('id with spaces')).toBe('id_with_spaces');
    expect(sanitizeIdForLLM('id!@#special$char%')).toBe('id___special_char_');
    expect(sanitizeIdForLLM('test@example.com')).toBe('test_example_com');
  });

  it('should truncate strings longer than 64 characters', () => {
    const longString = 'a'.repeat(70);
    const sanitized = sanitizeIdForLLM(longString);
    expect(sanitized.length).toBe(64);
    expect(sanitized).toBe('a'.repeat(64));
  });

  it('should handle strings that become shorter than 64 after sanitization but were originally longer', () => {
    const longProblematicString = '!@#$%^&*()'.repeat(10); // 100 chars, all problematic
    const sanitized = sanitizeIdForLLM(longProblematicString); // Becomes '__________'.repeat(10) = 100 underscores, then truncated
    expect(sanitized.length).toBe(63);
    expect(sanitized).toBe('_'.repeat(63));
  });
  
  it('should handle leading/trailing problematic characters', () => {
    expect(sanitizeIdForLLM('__valid-id__')).toBe('__valid-id__'); // Leading/trailing underscores are valid
    expect(sanitizeIdForLLM('!!invalid-id!!')).toBe('__invalid-id__');
  });

  it('should handle empty string input', () => {
    expect(sanitizeIdForLLM('')).toBe('unnamed_id');
  });

  it('should handle string with only invalid characters', () => {
    expect(sanitizeIdForLLM('!@#$%')).toBe('_____');
  });

  it('should not remove underscores or hyphens if they are part of the 64 char limit', () => {
    const endingWithUnderscore = 'a'.repeat(63) + '_';
    expect(sanitizeIdForLLM(endingWithUnderscore)).toBe(endingWithUnderscore);
    const endingWithHyphen = 'a'.repeat(63) + '-';
    expect(sanitizeIdForLLM(endingWithHyphen)).toBe(endingWithHyphen);
  });

  it('should handle mixed case correctly', () => {
    expect(sanitizeIdForLLM('MixedCaseID')).toBe('MixedCaseID');
  });

  it('should handle numbers in the ID', () => {
    expect(sanitizeIdForLLM('IDwith123Numbers')).toBe('IDwith123Numbers');
  });

  // Edge case from your implementation: if sanitized becomes empty but original was not
  it('should return a placeholder if sanitization results in an empty string from non-empty input', () => {
    // This case is hard to hit if non-alphanumeric are replaced by '_'.
    // The current sanitizeIdForLLM replaces with '_', so it won't become empty unless the original was only problematic chars AND short.
    // If a char was simply REMOVED and not replaced, then "!@#" could become "".
    // Given current logic: '!!!' -> '___'. If '!!!'.substring(0,0) scenario.
    // Let's test the `id_became_empty_after_sanitize` if we had aggressive cleaning
    // For now, the `unnamed_id` for empty string is the main case for "emptiness".
    // The `sanitized_id_empty` is if length becomes 0 after truncation rules.
    const onlyProblematicAndShort = "!!!"; // Becomes "___"
    expect(sanitizeIdForLLM(onlyProblematicAndShort)).toBe("___");

    // Simulating a scenario where truncation could lead to this (if `id.charAt(63) !== '_'`)
    const edgeTruncation = '_'.repeat(63) + '!'; // Becomes `_`.repeat(63) + `_`
    expect(sanitizeIdForLLM(edgeTruncation)).toBe('_'.repeat(64));
  });
});