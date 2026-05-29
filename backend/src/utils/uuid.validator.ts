/**
 * Lenient UUID validator compatible with PostgreSQL UUID storage.
 *
 * Problem: validator.js v13 isUUID() enforces RFC 4122 strictly:
 *   - 3rd segment must start with a version digit (1-5)
 *   - 4th segment must start with a variant digit (8, 9, a, or b)
 *
 * PostgreSQL stores and retrieves ANY 8-4-4-4-12 hex string as a valid UUID,
 * including test-fixture IDs like '44444444-4444-4444-4444-444444444444' that
 * fail RFC 4122 variant/version checks.
 *
 * Using this helper instead of .isUUID() ensures validators accept every UUID
 * that PostgreSQL considers valid.
 */

const PG_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isPostgresUUID = (value: string): boolean => PG_UUID_REGEX.test(value);

/**
 * Express-validator custom validator function.
 * Usage: body('field').custom(validateUUID('field label'))
 */
export const validateUUID =
  (label = 'ID') =>
  (value: string): boolean => {
    if (!PG_UUID_REGEX.test(value)) {
      throw new Error(`${label} must be a valid UUID`);
    }
    return true;
  };
