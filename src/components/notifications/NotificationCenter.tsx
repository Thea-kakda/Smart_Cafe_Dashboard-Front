import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Boxes,
  Flame,
  Clock,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  X,
  ExternalLink,
  ChevronRight,
  Filter,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useNotifications } from '../../context/NotificationContext';
import { NotificationItem } from '../../types';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const { t, locale } = useTranslation();
  const {
    notifications,
    unreadCount,
    inventoryAlertsCount,
    productionRemindersCount,
    markAsRead,
    markAllAsRead,
    dismissNotification,
  } = useNotifications();

  const [activeFilter, setActiveFilter] = useState<'ALL' | 'INVENTORY' | 'PRODUCTION' | 'UNREAD'>('ALL');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      // Delay slightly to prevent immediate trigger from opening button
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 50);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter items
  const filteredNotifications = notifications.filter((item) => {
    if (activeFilter === 'INVENTORY') return item.category === 'INVENTORY';
    if (activeFilter === 'PRODUCTION') return item.category === 'PRODUCTION';
    if (activeFilter === 'UNREAD') return !item.isRead;
    return true;
  });

  const handleActionClick = (target?: 'inventory' | 'production' | 'stores', id?: string) => {
    onClose();
    if (target === 'inventory') {
      onNavigate('inventory');
    } else if (target === 'production') {
      onNavigate('production');
    } else if (target === 'stores') {
      onNavigate('stores');
    } else {
      onNavigate('notifications');
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 md:w-[420px] rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[85vh]"
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#C48A56]/15 text-[#C48A56]">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#DC2626] text-[9px] font-extrabold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
              {locale === 'km' ? 'មជ្ឈមណ្ឌលជូនដំណឹង (Notification Center)' : 'Notification Center'}
            </h3>
            <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
              {unreadCount > 0
                ? `${unreadCount} unread system operational alerts`
                : 'All operational alerts acknowledged'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="p-1.5 rounded-lg text-[#8C7C6B] hover:text-[#C48A56] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] text-xs font-semibold flex items-center gap-1 transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8C7C6B] hover:text-[#1C1A19] dark:hover:text-white hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 pt-3 pb-2 border-b border-[#E5E3DF] dark:border-[#2B2522] flex gap-1.5 overflow-x-auto text-[11px] font-semibold">
        <button
          type="button"
          onClick={() => setActiveFilter('ALL')}
          className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
            activeFilter === 'ALL'
              ? 'bg-[#C48A56] text-white shadow-xs'
              : 'text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]'
          }`}
        >
          All ({notifications.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('INVENTORY')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
            activeFilter === 'INVENTORY'
              ? 'bg-[#C48A56] text-white shadow-xs'
              : 'text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Inventory Alerts</span>
          {inventoryAlertsCount > 0 && (
            <span className="px-1 py-0.2 rounded-full bg-[#DC2626] text-white text-[9px] font-bold">
              {inventoryAlertsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('PRODUCTION')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
            activeFilter === 'PRODUCTION'
              ? 'bg-[#C48A56] text-white shadow-xs'
              : 'text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Deadlines</span>
          {productionRemindersCount > 0 && (
            <span className="px-1 py-0.2 rounded-full bg-[#D97706] text-white text-[9px] font-bold">
              {productionRemindersCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('UNREAD')}
          className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
            activeFilter === 'UNREAD'
              ? 'bg-[#C48A56] text-white shadow-xs'
              : 'text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E5E3DF] dark:divide-[#2B2522]">
        {filteredNotifications.length === 0 ? (
          <div className="p-10 text-center text-[#8C7C6B]">
            <CheckCircle2 className="w-8 h-8 mx-auto text-[#2E7D32]/60" />
            <p className="mt-2 text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">
              No active alerts in this view
            </p>
            <p className="text-[11px] text-[#8C7C6B] mt-0.5">
              All inventory levels and production SLAs are currently running normally.
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const isInventory = notif.category === 'INVENTORY';
            const isProduction = notif.category === 'PRODUCTION';

            return (
              <div
                key={notif.id}
                className={`p-4 transition-colors ${
                  !notif.isRead
                    ? 'bg-[#C48A56]/5 hover:bg-[#C48A56]/10'
                    : 'hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Category Icon */}
                    <div
                      className={`mt-0.5 p-2 rounded-xl shrink-0 ${
                        isInventory
                          ? 'bg-[#DC2626]/10 text-[#DC2626]'
                          : isProduction
                          ? 'bg-[#D97706]/10 text-[#D97706]'
                          : 'bg-[#C48A56]/10 text-[#C48A56]'
                      }`}
                    >
                      {isInventory ? (
                        <Boxes className="w-4 h-4" />
                      ) : isProduction ? (
                        <Clock className="w-4 h-4" />
                      ) : (
                        <Info className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      {/* Badge & Title */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isInventory && (
                          <span className="rounded bg-[#DC2626]/15 px-1.5 py-0.2 text-[9px] font-bold text-[#DC2626] uppercase">
                            Low Stock
                          </span>
                        )}
                        {isProduction && notif.deadline && (
                          <span className="rounded bg-[#D97706]/15 px-1.5 py-0.2 text-[9px] font-bold text-[#D97706] uppercase flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {notif.deadline}
                          </span>
                        )}
                        <h4 className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
                          {notif.titleKey}
                        </h4>
                      </div>

                      {/* Message Content */}
                      <p className="text-xs text-[#6E5E4F] dark:text-[#A89D94] mt-1 leading-relaxed">
                        {notif.messageKey}
                      </p>

                      {/* Footer Actions & Metadata */}
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-[#8C7C6B] font-mono">
                          {notif.createdAt}
                        </span>

                        <div className="flex items-center gap-2">
                          {notif.actionTarget && (
                            <button
                              type="button"
                              onClick={() => handleActionClick(notif.actionTarget, notif.targetId)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C48A56] hover:text-[#B37947] hover:underline"
                            >
                              <span>
                                {isInventory ? 'Adjust Stock' : isProduction ? 'Go to KDS' : 'View'}
                              </span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}

                          {!notif.isRead && (
                            <button
                              type="button"
                              onClick={() => markAsRead(notif.id)}
                              className="text-[10px] text-[#8C7C6B] hover:text-[#1C1A19] dark:hover:text-[#F5F3F0] font-medium px-1.5 py-0.5 rounded border border-[#E5E3DF] dark:border-[#2B2522]"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => dismissNotification(notif.id)}
                    className="text-[#8C7C6B] hover:text-[#DC2626] p-1 rounded transition-colors shrink-0"
                    title="Dismiss alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer / Full View Link */}
      <div className="p-3 border-t border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            onClose();
            onNavigate('notifications');
          }}
          className="w-full py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] text-xs font-bold text-[#C48A56] hover:bg-[#C48A56]/10 transition-colors flex items-center justify-center gap-1.5"
        >
          <span>View All System Notifications</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
