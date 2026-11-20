import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Zap, 
  PlusCircle, 
  Store as StoreIcon, 
  Boxes, 
  ShoppingCart, 
  Flame, 
  Cookie, 
  ChevronRight,
  Sparkles,
  Command
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';

export interface QuickActionItem {
  id: string;
  tab: string;
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
  defaultTitle: string;
  defaultDesc: string;
  shortcut: string;
  badge: string;
  iconColor: string;
  iconBg: string;
}

interface QuickActionsMenuProps {
  onNavigate: (tab: string) => void;
}

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({ onNavigate }) => {
  const { t, locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const actions: QuickActionItem[] = [
    {
      id: 'add-product',
      tab: 'catalog',
      icon: PlusCircle,
      titleKey: 'quickAction.addProduct',
      descKey: 'quickAction.addProductDesc',
      defaultTitle: 'Add New Product',
      defaultDesc: 'Create and configure catalog item',
      shortcut: 'Alt+P',
      badge: 'Catalog',
      iconColor: 'text-[#C48A56]',
      iconBg: 'bg-[#C48A56]/15',
    },
    {
      id: 'create-branch',
      tab: 'stores',
      icon: StoreIcon,
      titleKey: 'quickAction.createBranch',
      descKey: 'quickAction.createBranchDesc',
      defaultTitle: 'Create Branch',
      defaultDesc: 'Register a new branch location',
      shortcut: 'Alt+B',
      badge: 'Stores',
      iconColor: 'text-[#2E7D32]',
      iconBg: 'bg-[#2E7D32]/15',
    },
    {
      id: 'view-inventory',
      tab: 'inventory',
      icon: Boxes,
      titleKey: 'quickAction.viewInventory',
      descKey: 'quickAction.viewInventoryDesc',
      defaultTitle: 'View Inventory',
      defaultDesc: 'Stock levels & ingredient tracking',
      shortcut: 'Alt+I',
      badge: 'Stock',
      iconColor: 'text-[#0284C7]',
      iconBg: 'bg-[#0284C7]/15',
    },
    {
      id: 'new-pos-order',
      tab: 'pos',
      icon: ShoppingCart,
      titleKey: 'quickAction.newOrder',
      descKey: 'quickAction.newOrderDesc',
      defaultTitle: 'New POS Order',
      defaultDesc: 'Point of sale counter terminal',
      shortcut: 'Alt+O',
      badge: 'POS',
      iconColor: 'text-[#7C3AED]',
      iconBg: 'bg-[#7C3AED]/15',
    },
    {
      id: 'kitchen-kds',
      tab: 'production',
      icon: Flame,
      titleKey: 'quickAction.kitchenQueue',
      descKey: 'quickAction.kitchenQueueDesc',
      defaultTitle: 'Kitchen Display (KDS)',
      defaultDesc: 'Cook station & beverage tickets',
      shortcut: 'Alt+K',
      badge: 'KDS',
      iconColor: 'text-[#D97706]',
      iconBg: 'bg-[#D97706]/15',
    },
    {
      id: 'bakery-bds',
      tab: 'bakery',
      icon: Cookie,
      titleKey: 'quickAction.bakeryQueue',
      descKey: 'quickAction.bakeryQueueDesc',
      defaultTitle: 'Bakery Display (BDS)',
      defaultDesc: 'Oven & pastry display system',
      shortcut: 'Alt+D',
      badge: 'BDS',
      iconColor: 'text-[#C48A56]',
      iconBg: 'bg-[#F0EFED] dark:bg-[#2B2522]',
    },
  ];

  const handleSelect = (tab: string) => {
    onNavigate(tab);
    setIsOpen(false);
  };

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global hotkeys (Alt+Q to toggle menu, Alt+P, Alt+B, Alt+I, Alt+O, Alt+K)
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Toggle Quick Actions menu with Alt+Q
      if (event.altKey && (event.key === 'q' || event.key === 'Q')) {
        event.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      if (event.altKey && (event.key === 'p' || event.key === 'P')) {
        event.preventDefault();
        handleSelect('catalog');
      } else if (event.altKey && (event.key === 'b' || event.key === 'B')) {
        event.preventDefault();
        handleSelect('stores');
      } else if (event.altKey && (event.key === 'i' || event.key === 'I')) {
        event.preventDefault();
        handleSelect('inventory');
      } else if (event.altKey && (event.key === 'o' || event.key === 'O')) {
        event.preventDefault();
        handleSelect('pos');
      } else if (event.altKey && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        handleSelect('production');
      } else if (event.altKey && (event.key === 'd' || event.key === 'D')) {
        event.preventDefault();
        handleSelect('bakery');
      }

      // Close on Escape
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    },
    [isOpen, onNavigate]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Quick Actions (Alt+Q)"
        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-2xs ${
          isOpen
            ? 'border-[#C48A56] bg-[#C48A56]/10 text-[#C48A56]'
            : 'border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#1C1A19] dark:text-[#F5F3F0] hover:border-[#C48A56] dark:hover:border-[#D4A87A]'
        }`}
      >
        <Zap className="w-3.5 h-3.5 text-[#C48A56] fill-[#C48A56]/20" />
        <span className="hidden sm:inline font-bold">
          {t('nav.quickActions')}
        </span>
        <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono text-[#8C7C6B] bg-[#E5E3DF]/50 dark:bg-[#2B2522] rounded">
          Alt+Q
        </kbd>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 sm:right-auto sm:left-0 mt-2 w-80 rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="px-3.5 py-2 border-b border-[#E5E3DF] dark:border-[#2B2522] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
                <Zap className="w-3.5 h-3.5 text-[#C48A56]" />
                <span>{t('nav.quickActions')}</span>
              </div>
              <p className="text-[10px] text-[#8C7C6B] dark:text-[#A89D94] mt-0.5">
                {locale === 'km' ? 'ចូលដំណើរការការងារទូទៅដោយចុចតែម្តង' : 'One-click shortcuts to frequent workflows'}
              </p>
            </div>
            <span className="text-[10px] font-mono font-medium text-[#8C7C6B] bg-[#F0EFED] dark:bg-[#2B2522] px-2 py-0.5 rounded-md">
              ESC
            </span>
          </div>

          {/* Action Items List */}
          <div className="p-1.5 space-y-0.5 max-h-[380px] overflow-y-auto">
            {actions.map((act) => {
              const Icon = act.icon;
              const title = t(act.titleKey) !== act.titleKey ? t(act.titleKey) : act.defaultTitle;
              const desc = t(act.descKey) !== act.descKey ? t(act.descKey) : act.defaultDesc;

              return (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => handleSelect(act.tab)}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/60 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${act.iconBg} ${act.iconColor} transition-transform group-hover:scale-105`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0] group-hover:text-[#C48A56] transition-colors">
                          {title}
                        </span>
                        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded-md bg-[#F0EFED] dark:bg-[#2B2522] text-[#8C7C6B] font-semibold">
                          {act.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8C7C6B] dark:text-[#A89D94] truncate">
                        {desc}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <kbd className="hidden sm:inline-block text-[9px] font-mono font-medium text-[#8C7C6B] bg-[#F0EFED] dark:bg-[#2B2522] px-1.5 py-0.5 rounded border border-[#E5E3DF]/60 dark:border-[#2B2522]">
                      {act.shortcut}
                    </kbd>
                    <ChevronRight className="w-3.5 h-3.5 text-[#8C7C6B] group-hover:text-[#C48A56] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="px-3.5 py-1.5 border-t border-[#E5E3DF]/60 dark:border-[#2B2522] bg-[#FBFBF9]/50 dark:bg-[#151310]/50 text-[10px] text-[#8C7C6B] flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Command className="w-3 h-3 text-[#C48A56]" />
              {locale === 'km' ? 'ផ្លូវកាត់ក្តារចុចសកម្ម' : 'Global hotkeys active'}
            </span>
            <span>ERP Enterprise</span>
          </div>
        </div>
      )}
    </div>
  );
};
