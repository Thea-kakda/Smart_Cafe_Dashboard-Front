import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NotificationItem } from '../types';
import { ApiError } from '../lib/api';
import { notificationsApi, toNotificationItem } from '../lib/notificationsAdmin';
import { useAuth } from './AuthContext';

const POLL_INTERVAL_MS = 30_000;

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  inventoryAlertsCount: number;
  productionRemindersCount: number;
  isLoading: boolean;
  error: ApiError | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  /** Session-local hide: the notification API exposes no archive verb, so this
   * never claims a server mutation — it only removes the row from view. */
  dismissNotification: (id: string) => void;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  inventoryAlertsCount: 0,
  productionRemindersCount: 0,
  isLoading: false,
  error: null,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  dismissNotification: () => {},
  refresh: async () => {},
});

/** Format a real ISO instant into a short local timestamp (derived, not invented). */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString();
}

/**
 * Notification inbox backed by the recipient-scoped REST API. Only the signed-in
 * user's own rows are returned; marking read calls the real PATCH endpoints.
 * The badge count uses the dedicated /unread-count endpoint. There is no create
 * endpoint (notifications are system-generated), so the mock-era addNotification
 * has been removed rather than faked.
 */
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [serverUnread, setServerUnread] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setServerUnread(null);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const [page, count] = await Promise.all([
        notificationsApi.list(0, 30, controller.signal),
        notificationsApi.unreadCount(controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setNotifications(
        page.items.map((row) => ({ ...toNotificationItem(row), createdAt: formatWhen(row.createdAt) })),
      );
      setServerUnread(count.unreadCount);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Notifications could not be loaded.'));
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isAuthenticated, load]);

  const markAsRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setServerUnread((c) => (c === null ? c : Math.max(0, c - 1)));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setServerUnread(0);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const unreadCount = serverUnread ?? notifications.filter((n) => !n.isRead).length;
  const inventoryAlertsCount = notifications.filter((n) => n.category === 'INVENTORY' && !n.isRead).length;
  const productionRemindersCount = notifications.filter((n) => n.category === 'PRODUCTION' && !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        inventoryAlertsCount,
        productionRemindersCount,
        isLoading,
        error,
        markAsRead,
        markAllAsRead,
        dismissNotification,
        refresh: load,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
