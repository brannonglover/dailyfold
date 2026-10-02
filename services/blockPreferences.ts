/**
 * Re-export of the shared blockPreferences implementation.
 *
 * The shared helpers are generic over the block-related preference fields, so the
 * client keeps its UserPreferences-typed results while the notification backend
 * keeps its PushPreferences-typed ones — one implementation, both types preserved.
 */
export * from '@/shared/notify/blockPreferences';
