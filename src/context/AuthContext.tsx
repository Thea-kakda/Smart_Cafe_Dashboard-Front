import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User } from '../types';
import {
  ApiError,
  authLogin,
  authLogout,
  authRegister,
  refreshSession,
  setAccessToken,
  setUnauthenticatedHandler,
} from '../lib/api';
import { apiRequest } from '../lib/api';

/** Branch entry exactly as returned by GET /api/v1/users/me/access-context. */
export interface BranchAccess {
  storeId: string;
  storeCode: string;
  storeName: string;
  timezone: string;
  defaultCurrency: string;
  defaultLanguage: string;
  active: boolean;
}

/** Backend AccessContextResponse contract. */
export interface AccessContext {
  userId: string;
  fullName: string;
  email: string;
  preferredLanguage: string;
  status: string;
  roles: string[];
  permissions: string[];
  globalAccess: boolean;
  accessibleBranches: BranchAccess[];
}

export interface RegisterData {
  fullName: string;
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  permissions: string[];
  roles: string[];
  globalAccess: boolean;
  accessibleBranches: BranchAccess[];
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
  refreshAccessContext: () => Promise<void>;
}

const ACCESS_CONTEXT_PATH = '/api/v1/users/me/access-context';

function toUser(ctx: AccessContext): User {
  // All fields come from the backend access-context response; nothing is
  // invented in the browser. storeId is intentionally unset until a real
  // branch selection happens (StoreContext validates against the list below).
  return {
    id: ctx.userId,
    username: ctx.email,
    email: ctx.email,
    fullName: ctx.fullName,
    roles: ctx.roles,
    permissions: ctx.permissions,
  };
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  authError: null,
  permissions: [],
  roles: [],
  globalAccess: false,
  accessibleBranches: [],
  login: async () => ({ success: false, error: 'AuthProvider not mounted' }),
  register: async () => ({ success: false, error: 'AuthProvider not mounted' }),
  logout: async () => {},
  hasPermission: () => false,
  refreshAccessContext: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [context, setContext] = useState<AccessContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadAccessContext = useCallback(async (): Promise<AccessContext | null> => {
    try {
      const ctx = await apiRequest<AccessContext>(ACCESS_CONTEXT_PATH);
      if (!mountedRef.current) return null;
      // The backend serializes roles/permissions as sets; normalize to arrays.
      const normalized: AccessContext = {
        ...ctx,
        roles: Array.from(ctx.roles ?? []),
        permissions: Array.from(ctx.permissions ?? []),
        accessibleBranches: ctx.accessibleBranches ?? [],
      };
      setContext(normalized);
      return normalized;
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) {
        setAccessToken(null);
        if (mountedRef.current) setContext(null);
        return null;
      }
      throw err;
    }
  }, []);

  /** Restore the session from the httpOnly refresh cookie, then hydrate access context. */
  const restoreSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const session = await refreshSession();
      if (session) {
        await loadAccessContext();
      } else if (mountedRef.current) {
        setContext(null);
      }
    } catch {
      if (mountedRef.current) setContext(null);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [loadAccessContext]);

  useEffect(() => {
    mountedRef.current = true;
    // Expired-and-unrefreshable sessions reported by the API layer land here.
    setUnauthenticatedHandler(() => {
      if (mountedRef.current) setContext(null);
    });
    void restoreSession();
    return () => {
      mountedRef.current = false;
      setUnauthenticatedHandler(null);
    };
  }, [restoreSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      setAuthError(null);
      if (!email || !password) {
        const msg = 'Email and password are required.';
        setAuthError(msg);
        return { success: false, error: msg };
      }
      setIsLoading(true);
      try {
        await authLogin({ email, password });
        await loadAccessContext();
        return { success: true };
      } catch (err) {
        const error = err instanceof ApiError ? err.message : 'Login failed. Please try again.';
        setAuthError(error);
        setContext(null);
        return { success: false, error };
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [loadAccessContext],
  );

  const register = useCallback(
    async (data: RegisterData): Promise<{ success: boolean; error?: string }> => {
      setAuthError(null);
      if (!data.fullName || !data.email || !data.password) {
        const msg = 'Please fill in all required registration fields.';
        setAuthError(msg);
        return { success: false, error: msg };
      }
      if (data.password.length < 10) {
        const msg = 'Password must be at least 10 characters (server policy).';
        setAuthError(msg);
        return { success: false, error: msg };
      }
      setIsLoading(true);
      try {
        // Real backend registration. Roles and branch assignments are never
        // chosen here: they are granted server-side and read from the
        // access-context response afterwards.
        await authRegister({
          fullName: data.fullName,
          email: data.email,
          password: data.password,
          preferredLanguage: 'en',
        });
        await loadAccessContext();
        return { success: true };
      } catch (err) {
        const error = err instanceof ApiError ? err.message : 'Registration failed. Please try again.';
        setAuthError(error);
        setContext(null);
        return { success: false, error };
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [loadAccessContext],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authLogout();
    } catch {
      // Cookie/token is already cleared locally; a failed server logout
      // must not trap the user in a signed-in UI state.
      setAccessToken(null);
    }
    // Clean up legacy business persistence from previous mock implementations.
    localStorage.removeItem('erp_auth_user');
    setContext(null);
    setAuthError(null);
  }, []);

  const refreshAccessContext = useCallback(async (): Promise<void> => {
    await loadAccessContext();
  }, [loadAccessContext]);

  const value = useMemo<AuthContextType>(() => {
    const permissions = context?.permissions ?? [];
    return {
      user: context ? toUser(context) : null,
      isAuthenticated: !!context,
      isLoading,
      authError,
      permissions,
      roles: context?.roles ?? [],
      globalAccess: context?.globalAccess ?? false,
      accessibleBranches: context?.accessibleBranches ?? [],
      login,
      register,
      logout,
      // Permissions are resolved by the backend (including global
      // administrator expansion); the browser never infers or elevates them.
      hasPermission: (permissionCode: string) => permissions.includes(permissionCode),
      refreshAccessContext,
    };
  }, [context, isLoading, authError, login, register, logout, refreshAccessContext]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
