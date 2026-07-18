import { ApiRequestError } from '@/services/api';

/**
 * Extract a display-safe error message from any thrown value.
 *
 * Order of preference (from most specific to least):
 *   1. `ApiRequestError.errorMessage` — already vetted by the API layer
 *   2. `Error.message` — catches framework / library errors
 *   3. string thrown directly (legacy code paths)
 *   4. `fallback` literal provided by the caller
 *
 * The caller passes a `fallback` that is usually an i18n key resolved
 * via `t('common.error')`, so the function never returns an empty
 * string even for unknown throwable shapes.
 */
export function describeError(e: unknown, fallback = 'Unexpected error'): string {
  if (e instanceof ApiRequestError) return e.errorMessage || fallback;
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === 'string' && e.length > 0) return e;
  return fallback;
}

/**
 * Localized, display-safe error message for user-facing alerts/modals.
 *
 * Unlike `describeError` (which returns the RAW message — for logs/inline
 * dev surfaces), this NEVER surfaces an un-localized string. It buckets the
 * error into a localized category:
 *   - network / timeout (ApiRequestError status=0 with code) → connection copy
 *   - server 5xx → generic server copy
 *   - everything else (4xx, 'Session expired', unknown throwable) → `fallback`
 *
 * `fallback` lets a caller supply a more specific localized message for the
 * "expected" failure of that screen (e.g. t('signupWizard.registerFailed'));
 * when omitted it defaults to the generic t('common.tryAgainLater'). Network/
 * timeout/server always win over the fallback so connectivity issues read
 * correctly regardless of which screen raised them.
 */
export function userFacingError(
  e: unknown,
  t: (key: string) => string,
  fallback?: string,
): string {
  if (e instanceof ApiRequestError) {
    if (e.code === 'network_timeout') return t('common.networkTimeout');
    if (e.code === 'network_error' || e.status === 0) return t('common.networkError');
    if (e.status >= 500) return t('common.serverError');
  }
  return fallback ?? t('common.tryAgainLater');
}
