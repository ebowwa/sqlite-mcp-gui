/**
 * Authentication Configuration
 */

import type {
  AuthConfig,
  PasswordPolicy,
  PasswordValidationResult,
} from './types.js';

/**
 * Load authentication configuration from environment variables
 */
function loadConfig(): AuthConfig {
  const enabled = process.env.AUTH_ENABLED === 'true';
  const jwtSecret = process.env.JWT_SECRET || 'change-this-secret-in-production';
  const sessionSecret = process.env.SESSION_SECRET || 'change-this-session-secret-in-production';
  const defaultApiKeys = process.env.DEFAULT_API_KEYS
    ? process.env.DEFAULT_API_KEYS.split(',').map(k => k.trim())
    : [];
  const storagePath = process.env.USERS_FILE_PATH;

  return {
    enabled,
    jwt: {
      secret: jwtSecret,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    },
    session: {
      secret: sessionSecret,
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10),
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    },
    apiKeys: {
      enabled: process.env.API_KEYS_ENABLED !== 'false',
      keys: defaultApiKeys,
      headerName: process.env.API_KEY_HEADER || 'X-API-Key',
    },
    basicAuth: {
      enabled: process.env.BASIC_AUTH_ENABLED === 'true',
    },
    storage: {
      type: storagePath ? 'file' : 'memory',
      filePath: storagePath,
    },
    passwordPolicy: {
      minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
      requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
      requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
      requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
      requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL === 'true',
    },
  };
}

/**
 * Exported authentication configuration
 */
export const authConfig: AuthConfig = loadConfig();

/**
 * Validate a password against the configured password policy
 *
 * @param password - The password to validate
 * @returns Validation result with validity flag and error messages
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  const policy = authConfig.passwordPolicy;

  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters long`);
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if the current configuration is secure for production use
 *
 * @returns Object indicating if configuration is secure and any warnings
 */
export function checkSecurityConfiguration(): {
  secure: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!authConfig.enabled) {
    warnings.push('Authentication is disabled - all requests will be unauthenticated');
  }

  if (authConfig.jwt.secret.includes('change-this')) {
    warnings.push('JWT secret is set to default value - please change in production');
  }

  if (authConfig.session.secret.includes('change-this')) {
    warnings.push('Session secret is set to default value - please change in production');
  }

  if (authConfig.apiKeys.keys.length === 0 && authConfig.apiKeys.enabled) {
    warnings.push('API keys are enabled but no keys are configured');
  }

  if (!authConfig.session.secure && process.env.NODE_ENV === 'production') {
    warnings.push('Session cookies are not set to secure in production environment');
  }

  if (authConfig.passwordPolicy.minLength < 8) {
    warnings.push('Password minimum length is less than 8 characters');
  }

  return {
    secure: warnings.length === 0,
    warnings,
  };
}
