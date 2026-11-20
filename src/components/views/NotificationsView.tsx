import React from 'react';
import { Bell, Check, CheckCheck, AlertTriangle, Info, AlertCircle, Trash2, Boxes, Clock } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useNotifications } from '../../context/NotificationContext';

export const NotificationsView: React.FC = () => {
  const { t } = useTranslation();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismissNotification,
  } = useNotifications();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
              {t('nav.notifications')}
            </h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[#DC2626] px-2 py-0.5 text-[10px] font-bold text-white">
                {unreadCount} New
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">
            System alerts, operational threshold triggers, and station event dispatches.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors"
          >
            <CheckCheck className="w-4 h-4 text-[#C48A56]" />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs divide-y divide-[#E5E3DF] dark:divide-[#2B2522] overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-12 text-center text-[#8C7C6B]">
            <Bell className="w-8 h-8 mx-auto text-[#8C7C6B]/60" />
            <p className="mt-2 text-xs font-medium">No notifications in your inbox.</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                !notif.isRead
                  ? 'bg-[#C48A56]/5 hover:bg-[#C48A56]/10'
                  : 'hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 p-2 rounded-xl shrink-0 ${
                  notif.type === 'ALERT'
                    ? 'bg-[#DC2626]/10 text-[#DC2626]'
                    : notif.type === 'WARNING'
                    ? 'bg-[#D97706]/10 text-[#D97706]'
                    : 'bg-[#C48A56]/10 text-[#C48A56]'
                }`}>
                  {notif.type === 'ALERT' ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : notif.type === 'WARNING' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Info className="w-4 h-4" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
                      {notif.titleKey}
                    </h4>
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#C48A56]" />
                    )}
                  </div>
                  <p className="text-xs text-[#6E5E4F] dark:text-[#A89D94] mt-0.5">
                    {notif.messageKey}
                  </p>
                  <span className="text-[10px] text-[#8C7C6B] mt-1 inline-block">
                    {notif.createdAt}
                  </span>
                </div>
              </div>

              {!notif.isRead && (
                <button
                  type="button"
                  onClick={() => markAsRead(notif.id)}
                  className="px-2.5 py-1 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] text-[11px] font-medium text-[#C48A56] hover:bg-[#C48A56]/10 transition-colors shrink-0"
                >
                  Mark read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
