/**
 * Re-export of the shared sourcePreferences implementation.
 * Lives in shared/notify/ so the client and the notification backend
 * compile one implementation instead of two ports that can drift.
 */
export * from '@/shared/notify/sourcePreferences';
