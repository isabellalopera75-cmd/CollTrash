// Helper utilities for date / array conversions used across the backend

/**
 * Convert an array of day numbers (1-7) to a comma-separated string.
 * The frontend expects the field name `dias_semana` to contain a string.
 *
 * @param {number[]|string[]} arr
 * @returns {string} comma-separated list, e.g. "1, 2, 3"
 */
function arrayToString(arr) {
  if (!Array.isArray(arr)) return '';
  return arr
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(v => String(v).trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Helper to get ISO-8601 day number (Monday = 1 ... Sunday = 7)
 * 
 * @param {Date} date 
 * @returns {number}
 */
function isoDayNumber(date) {
  return ((date.getDay() + 6) % 7) + 1;
}

module.exports = {
  arrayToString,
  isoDayNumber
};
