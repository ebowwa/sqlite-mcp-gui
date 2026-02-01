/**
 * Authentication Configuration
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface AuthConfig {
  enabled: boolean;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  session: {
    secret: string;
    maxAge: number;
    secure: boolean;
    httpOnly: boolean;
    sameSite: boolean | 'lax' | 'strict' | 'none';
  };
  apiKeys: {
    enabled: boolean;
    keys: string[];
    headerName: string;
  };
  basicAuth: {
    enabled: boolean;
  };
  storage: {
    type: 'memory' | 'file';
    filePath?: string;
  };
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  };
}

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

export const authConfig = loadConfig();

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
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
