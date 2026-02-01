/**
 * Express Middleware
 *
 * Custom middleware for security, rate limiting, and request handling.
 */

import { Request, Response, NextFunction } from 'express';
import { RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_REQUESTS } from './constants.js';
import { RateLimitError } from './errors.js';
import { logger } from './logger.js';

/**
 * Rate limiting store
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired rate limit entries
 */
function cleanupRateLimitStore(): void {
  const now = Date.now();

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupRateLimitStore, 60000);

/**
 * Rate limiting middleware
 *
 * Limits the number of requests from a single IP address.
 */
export function rateLimitMiddleware(
  options: {
    windowMs?: number;
    maxRequests?: number;
  } = {}
) {
  const windowMs = options.windowMs || RATE_LIMIT_WINDOW;
  const maxRequests = options.maxRequests || RATE_LIMIT_MAX_REQUESTS;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = rateLimitStore.get(ip);

    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(ip, entry);
      next();
      return;
    }

    // Increment counter
    entry.count++;

    if (entry.count > maxRequests) {
      const resetTime = Math.ceil((entry.resetTime - now) / 1000);
      logger.warn(`Rate limit exceeded for IP: ${ip}`);

      res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
        type: 'rate_limit',
        retryAfter: resetTime,
      });
      return;
    }

    next();
  };
}

/**
 * CORS middleware
 *
 * Enables Cross-Origin Resource Sharing with configurable options.
 */
export function corsMiddleware(
  options: {
    origin?: string | string[] | boolean;
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
  } = {}
) {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization'],
    credentials = false,
    maxAge = 86400, // 24 hours
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Set origin
    if (typeof origin === 'boolean') {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    } else if (typeof origin === 'string') {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (Array.isArray(origin)) {
      const requestOrigin = req.headers.origin;
      if (requestOrigin && origin.includes(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      }
    }

    // Set other headers
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));

    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Max-Age', String(maxAge));

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * Request ID middleware
 *
 * Adds a unique request ID to each request for tracking.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  res.setHeader('X-Request-ID', requestId);

  next();
}

/**
 * Security headers middleware
 *
 * Adds security-related HTTP headers to responses.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (basic)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );

  next();
}

/**
 * Request logging middleware
 *
 * Logs incoming requests with timing information.
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { method, path, ip } = req;
    const { statusCode } = res;

    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel](
      `${method} ${path} - ${statusCode} - ${duration}ms - ${ip || 'unknown'}`
    );
  });

  next();
}
