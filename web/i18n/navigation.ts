import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware navigation APIs. Unlike plain `next/navigation`, switching locale
// through these sets the NEXT_LOCALE cookie, so the middleware's localeDetection
// respects the user's choice instead of bouncing '/' back to the Accept-Language
// locale (which is why switching *to* Korean — the prefixless default — failed).
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
