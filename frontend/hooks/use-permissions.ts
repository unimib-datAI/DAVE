import { useQuery } from '@/utils/trpc';
import { useSession } from 'next-auth/react';
import { isAuthEnabled, getUserRolesFromToken } from '@/utils/auth';
import type { DAVEPermissions } from '@/server/routers/permission';

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Fetches the global DAVE permissions document and keeps it fresh.
 * Data is re-fetched every 5 minutes and on window focus.
 */
export function usePermissions() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken as string | undefined;
  const authEnabled = isAuthEnabled();

  const query = useQuery(['permission.getCurrent', { token }], {
    enabled: authEnabled ? Boolean(token) : true,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
    refetchOnWindowFocus: true,
    retry: false,
  });

  return {
    permissions: query.data as DAVEPermissions | null | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export default usePermissions;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper – shared by all permission-check hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a `check(section, action)` convenience function that evaluates
 * whether the currently signed-in user holds a role that satisfies the
 * requested permission entry, plus an `isLoading` flag.
 *
 * All React hooks are called unconditionally so this helper is safe to
 * compose into any other hook without violating the Rules of Hooks.
 *
 * Behaviour summary:
 *  - Auth disabled          → check() always returns true
 *  - Session/perms loading  → check() returns true  (optimistic, avoids flash)
 *  - No token after load    → check() returns false (unauthenticated)
 *  - Permissions missing    → check() returns true  (optimistic)
 *  - admin role             → check() always returns true
 *  - Otherwise              → checks user roles against permissions document
 */
function usePermissionState(): {
  check: (section: string, action: string) => boolean;
  isLoading: boolean;
} {
  const { permissions, isLoading: isLoadingPermissions } = usePermissions();
  const { data: session, status: sessionStatus } = useSession();
  const authEnabled = isAuthEnabled();

  const loading = sessionStatus === 'loading' || isLoadingPermissions;

  // All hooks have been called – safe to branch now.

  if (!authEnabled) {
    return { check: () => true, isLoading: false };
  }

  if (loading) {
    // Optimistically allow while still loading to prevent accidental flashes.
    return { check: () => true, isLoading: true };
  }

  const token = (session as any)?.accessToken as string | undefined;

  if (!token) {
    // No valid session after loading → deny everything.
    return { check: () => false, isLoading: false };
  }

  if (!permissions) {
    // Permissions document not yet available → optimistic allow.
    return { check: () => true, isLoading: false };
  }

  const userRoles = getUserRolesFromToken(token);
  const isAdmin = userRoles.includes('admin');

  const check = (section: string, action: string): boolean => {
    if (isAdmin) return true;
    const allowedRoles: string[] =
      (permissions as any)[section]?.[action] ?? [];
    return userRoles.some((r) => allowedRoles.includes(r));
  };

  return { check, isLoading: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public permission-check hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns whether the current user is allowed to use the chat feature,
 * based on the `chat.canUse` field of the global DAVE permissions document
 * and the roles extracted from the user's JWT access token.
 *
 * - When auth is disabled the function always returns `true`.
 * - While the session or permissions are still loading it returns `true`
 *   to avoid flashing a "not allowed" state that may resolve immediately.
 * - The `admin` role always bypasses the check.
 */
export function useCanUseChat(): boolean {
  const { check } = usePermissionState();
  return check('chat', 'canUse');
}

/**
 * Returns the CRUD permission flags for collections.
 *
 * ```ts
 * const { canCreate, canUpdate, canDelete } = useCollectionPermissions();
 * ```
 *
 * All three flags default to `true` while loading or when auth is disabled,
 * so buttons remain enabled during the brief initial fetch and only become
 * disabled once the server confirms the user lacks a given permission.
 */
export function useCollectionPermissions(): {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  isLoading: boolean;
} {
  const { check, isLoading } = usePermissionState();
  return {
    canCreate: check('collections', 'create'),
    canUpdate: check('collections', 'update'),
    canDelete: check('collections', 'delete'),
    isLoading,
  };
}

/**
 * Returns true when the current user has the 'admin' role.
 *
 * When USE_AUTH is disabled (USE_AUTH=false) this always returns true so
 * that admin-only UI surfaces are accessible in development / demo mode.
 * While the session is still loading it returns false to avoid briefly
 * rendering admin UI before the check resolves.
 */
export function useIsAdmin(): boolean {
  const { data: session, status } = useSession();
  const authEnabled = isAuthEnabled();

  // Auth disabled → treat everyone as admin
  if (!authEnabled) return true;

  // Still resolving the session → not confirmed admin yet
  if (status === 'loading') return false;

  const token = (session as any)?.accessToken as string | undefined;
  if (!token) return false;

  return getUserRolesFromToken(token).includes('admin');
}

/**
 * Returns whether the current user is allowed to use the chat developer mode,
 * based on the `chat.canDevMode` field of the global DAVE permissions document.
 *
 * Follows the same optimistic-allow semantics as useCanUseChat:
 * - Auth disabled  → true
 * - Still loading  → true  (avoids flash)
 * - No token       → false
 * - admin role     → true
 */
export function useCanDevModeChat(): boolean {
  const { check } = usePermissionState();
  return check('chat', 'canDevMode');
}

/**
 * Returns the permission flags for document editing.
 *
 * ```ts
 * const { canUpdate } = useDocumentPermissions();
 * ```
 *
 * `canUpdate` defaults to `true` while loading or when auth is disabled,
 * so controls remain enabled during the brief initial fetch and only become
 * disabled once the server confirms the user lacks the permission.
 */
export function useDocumentPermissions(): {
  canUpdate: boolean;
  isLoading: boolean;
} {
  const { check, isLoading } = usePermissionState();
  return {
    canUpdate: check('document', 'update'),
    isLoading,
  };
}

/**
 * Returns whether the current user is allowed to toggle global anonymization.
 *
 * Usage:
 * const { canToggle, isLoading } = useAnonymizationPermissions();
 *
 * Behaviour follows the same optimistic semantics as other permission hooks:
 * - Auth disabled  -> true
 * - Still loading  -> true (avoid flash)
 * - No token       -> false
 * - admin role     -> true
 */
export function useAnonymizationPermissions(): {
  canToggle: boolean;
  isLoading: boolean;
} {
  const { check, isLoading } = usePermissionState();
  return {
    canToggle: check('settings', 'anonymization'),
    isLoading,
  };
}

/**
 * Returns whether the current user is allowed to configure the annotation pipeline.
 *
 * Usage:
 * const { canEdit, isLoading } = usePipelinePermissions();
 *
 * Behaviour follows the same optimistic semantics as other permission hooks:
 * - Auth disabled  -> true
 * - Still loading  -> true (avoid flash)
 * - No token       -> false
 * - admin role     -> true
 */
export function usePipelinePermissions(): {
  canEdit: boolean;
  isLoading: boolean;
} {
  const { check, isLoading } = usePermissionState();
  return {
    canEdit: check("settings", "pipeline"),
    isLoading,
  };
}

/**
 * Returns whether the current user is allowed to configure LLM settings.
 *
 * Usage:
 * const { canEdit, isLoading } = useLLMPermissions();
 *
 * Behaviour follows the same optimistic semantics as other permission hooks:
 * - Auth disabled  -> true
 * - Still loading  -> true (avoid flash)
 * - No token       -> false
 * - admin role     -> true
 */
export function useLLMPermissions(): {
  canEdit: boolean;
  isLoading: boolean;
} {
  const { check, isLoading } = usePermissionState();
  return {
    canEdit: check("settings", "llm"),
    isLoading,
  };
}
