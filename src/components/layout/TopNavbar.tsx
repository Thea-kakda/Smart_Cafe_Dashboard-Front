import React, { useState, useRef, useEffect } from 'react';
import { 
  Menu, 
  Store as StoreIcon, 
  Bell, 
  Globe, 
  ChevronDown, 
  LogOut, 
  Sun, 
  Moon, 
  ShieldCheck, 
  Check, 
  Coffee,
  Sparkles,
  CircleDot,
  UserPlus,
  LogIn
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { useNotifications } from '../../context/NotificationContext';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { QuickActionsMenu } from './QuickActionsMenu';

interface TopNavbarProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenAuthModal: (tab?: 'signin' | 'register') => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ 
  onToggleSidebar, 
  isSidebarOpen,
  setActiveTab,
  onOpenAuthModal
}) => {
  const { t, locale, setLocale } = useTranslation();
  const { user, logout } = useAuth();
  const { stores, selectedStore, setSelectedStoreId } = useStore();
  const { unreadCount } = useNotifications();

  const [isStoreMenuOpen, setIsStoreMenuOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark') || 
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const storeMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (storeMenuRef.current && !storeMenuRef.current.contains(target)) {
        setIsStoreMenuOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(target)) {
        setIsLangMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Theme toggle
  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] px-4 md:px-6 transition-colors shadow-xs">
      {/* Left: Mobile Toggle & Brand Indicator */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex items-center justify-center p-2 rounded-lg text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] focus:outline-none focus:ring-2 focus:ring-[#C48A56] transition-colors"
          aria-label={t('common.menu')}
          aria-expanded={isSidebarOpen}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Quick Branch Display Pill */}
        <div className="relative" ref={storeMenuRef}>
          <button
            type="button"
            onClick={() => setIsStoreMenuOpen(!isStoreMenuOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] hover:border-[#C48A56] dark:hover:border-[#D4A87A] transition-all text-left"
            aria-haspopup="true"
            aria-expanded={isStoreMenuOpen}
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56]">
              <StoreIcon className="w-4 h-4" />
            </div>
            <div className="hidden sm:block">
              <div className="text-[11px] font-medium text-[#8C7C6B] dark:text-[#7E746C] leading-none uppercase tracking-wider">
                {t('store.current')}
              </div>
              <div className="text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] truncate max-w-[150px] md:max-w-[200px]">
                {selectedStore?.name || t('store.select')}
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                selectedStore?.isActive ? 'bg-[#2E7D32]' : 'bg-[#DC2626]'
              }`}
              title={selectedStore?.isActive ? t('badge.active') : t('badge.inactive')}
            />
            <ChevronDown className="w-3.5 h-3.5 text-[#8C7C6B] dark:text-[#7E746C] shrink-0" />
          </button>

          {/* Store Switcher Dropdown */}
          {isStoreMenuOpen && (
            <div className="absolute left-0 mt-2 w-72 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-lg py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 border-b border-[#E5E3DF] dark:border-[#2B2522]">
                <p className="text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">
                  {t('store.select')}
                </p>
                <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94] mt-0.5">
                  {t('store.changePrompt')}
                </p>
              </div>

              <div className="max-h-60 overflow-y-auto py-1">
                {stores.map((store) => {
                  const isSelected = store.id === selectedStore?.id;
                  return (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => {
                        setSelectedStoreId(store.id);
                        setIsStoreMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors ${
                        isSelected 
                          ? 'bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56] font-semibold' 
                          : 'text-[#1C1A19] dark:text-[#F5F3F0] hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            store.isActive ? 'bg-[#2E7D32]' : 'bg-[#DC2626]'
                          }`}
                        />
                        <div className="truncate">
                          <p className="truncate font-medium">{store.name}</p>
                          <p className="text-[10px] text-[#8C7C6B] dark:text-[#7E746C]">
                            {store.code} • {store.isActive ? t('badge.active') : t('badge.inactive')}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-[#C48A56] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions Dropdown Menu */}
        <QuickActionsMenu onNavigate={setActiveTab} />
      </div>

      {/* Right Controls: Notifications, Theme, Language, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notification Center Popover Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsNotificationCenterOpen(!isNotificationCenterOpen)}
            className={`relative inline-flex items-center justify-center p-2 rounded-lg transition-colors ${
              isNotificationCenterOpen
                ? 'bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56]'
                : 'text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] hover:text-[#1C1A19] dark:hover:text-[#F5F3F0]'
            }`}
            aria-label={t('nav.notifications')}
            aria-expanded={isNotificationCenterOpen}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#DC2626] text-[9px] font-bold text-white shadow-xs">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification Center Dropdown */}
          <NotificationCenter
            isOpen={isNotificationCenterOpen}
            onClose={() => setIsNotificationCenterOpen(false)}
            onNavigate={setActiveTab}
          />
        </div>

        {/* Theme Mode Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center justify-center p-2 rounded-lg text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] hover:text-[#1C1A19] dark:hover:text-[#F5F3F0] transition-colors"
          aria-label={isDarkMode ? t('common.themeLight') : t('common.themeDark')}
          title={isDarkMode ? t('common.themeLight') : t('common.themeDark')}
        >
          {isDarkMode ? <Sun className="w-5 h-5 text-[#D4A87A]" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Language Switcher Dropdown */}
        <div className="relative" ref={langMenuRef}>
          <button
            type="button"
            onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-medium text-[#1C1A19] dark:text-[#F5F3F0] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors"
            aria-label="Change Language"
            aria-haspopup="true"
            aria-expanded={isLangMenuOpen}
          >
            <Globe className="w-4 h-4 text-[#C48A56]" />
            <span className="font-semibold uppercase">{locale}</span>
            <ChevronDown className="w-3 h-3 text-[#8C7C6B]" />
          </button>

          {isLangMenuOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-lg py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={() => {
                  setLocale('en');
                  setIsLangMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                  locale === 'en'
                    ? 'bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56] font-semibold'
                    : 'text-[#1C1A19] dark:text-[#F5F3F0] hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🇺🇸</span>
                  <span>English (EN)</span>
                </div>
                {locale === 'en' && <Check className="w-4 h-4 text-[#C48A56]" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocale('km');
                  setIsLangMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                  locale === 'km'
                    ? 'bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56] font-semibold'
                    : 'text-[#1C1A19] dark:text-[#F5F3F0] hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🇰🇭</span>
                  <span>ភាសាខ្មែរ (KM)</span>
                </div>
                {locale === 'km' && <Check className="w-4 h-4 text-[#C48A56]" />}
              </button>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-[#E5E3DF] dark:bg-[#2B2522] mx-0.5" />

        {/* User Profile Menu or Sign In Button */}
        {!user ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenAuthModal('signin')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] transition-colors shadow-xs"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{locale === 'km' ? 'ចូល' : 'Sign In'}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenAuthModal('register')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#C48A56] text-[#C48A56] hover:bg-[#C48A56]/10 text-xs font-bold transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{locale === 'km' ? 'ចុះឈ្មោះ' : 'Register'}</span>
            </button>
          </div>
        ) : (
          <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 p-1 pl-1.5 rounded-lg hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors focus:outline-none focus:ring-2 focus:ring-[#C48A56]"
            aria-haspopup="true"
            aria-expanded={isUserMenuOpen}
          >
            <div className="relative">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  className="w-8 h-8 rounded-full object-cover border border-[#C48A56]/30 shadow-2xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#C48A56] text-white flex items-center justify-center font-bold text-xs">
                  {user?.fullName?.charAt(0) || 'U'}
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#2E7D32] ring-2 ring-white dark:ring-[#201D19]" />
            </div>

            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] leading-none">
                {user?.fullName}
              </span>
              <span className="text-[10px] text-[#8C7C6B] dark:text-[#7E746C] mt-0.5">
                {user?.roles?.[0] || 'Admin'}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#8C7C6B] dark:text-[#7E746C] hidden md:block" />
          </button>

          {/* User Profile Dropdown */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              {/* Profile Card Header */}
              <div className="px-4 py-3 border-b border-[#E5E3DF] dark:border-[#2B2522]">
                <div className="flex items-center gap-3">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.fullName}
                      className="w-10 h-10 rounded-full object-cover border border-[#C48A56]"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#C48A56] text-white flex items-center justify-center font-bold text-sm">
                      {user?.fullName?.charAt(0) || 'U'}
                    </div>
                  )}
                  <div className="truncate">
                    <p className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0] truncate">
                      {user?.fullName}
                    </p>
                    <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94] truncate">
                      {user?.email}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#C48A56]/15 text-[#C48A56]">
                        <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                        {user?.roles?.[0]}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#2E7D32]/15 text-[#2E7D32]">
                        <CircleDot className="w-2 h-2 mr-0.5 animate-pulse" />
                        ERP Online
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Roles & Permissions Summary */}
              <div className="px-4 py-2 text-[11px] text-[#6E5E4F] dark:text-[#A89D94] border-b border-[#E5E3DF] dark:border-[#2B2522]">
                <div className="flex justify-between py-1">
                  <span>{t('user.role')}:</span>
                  <span className="font-medium text-[#1C1A19] dark:text-[#F5F3F0]">{user?.roles?.join(', ')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>{t('store.current')}:</span>
                  <span className="font-medium text-[#1C1A19] dark:text-[#F5F3F0]">{selectedStore?.code}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="py-1 border-b border-[#E5E3DF] dark:border-[#2B2522]">
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenAuthModal('signin');
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#1C1A19] dark:text-[#F5F3F0] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors"
                >
                  <LogIn className="w-4 h-4 text-[#C48A56]" />
                  <span>{locale === 'km' ? 'ប្តូរគណនី / ចូលប្រព័ន្ធ' : 'Switch User / Sign In'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenAuthModal('register');
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#1C1A19] dark:text-[#F5F3F0] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors"
                >
                  <UserPlus className="w-4 h-4 text-[#2E7D32]" />
                  <span>{locale === 'km' ? 'ចុះឈ្មោះបុគ្គលិកថ្មី' : 'Register New Staff'}</span>
                </button>
              </div>

              {/* Sign Out Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#DC2626]/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('user.logout')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </header>
  );
};
