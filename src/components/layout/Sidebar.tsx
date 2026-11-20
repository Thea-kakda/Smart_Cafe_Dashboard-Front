import React from 'react';
import { 
  LayoutDashboard, 
  Store as StoreIcon, 
  ShoppingBag, 
  Tag, 
  Boxes, 
  Flame, 
  Bell, 
  FileText, 
  FolderTree, 
  CreditCard, 
  Scale, 
  Users, 
  ShieldCheck, 
  Receipt, 
  Sparkles, 
  BarChart3, 
  Settings, 
  Coffee, 
  X, 
  ChevronRight,
  AlertTriangle,
  Coins,
  ArrowLeftRight,
  Package,
  FolderCog,
  Truck,
  ClipboardList,
  Leaf,
  Ruler,
  CalendarClock
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

interface NavItem {
  id: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  isGap?: boolean;
  isReadOnly?: boolean;
  badgeCount?: number;
  /** When set, the entry is shown only if the user holds at least one of these codes. */
  anyPermission?: string[];
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
}) => {
  const { t } = useTranslation();
  const { selectedStore } = useStore();
  const { hasPermission } = useAuth();

  const navSections: NavSection[] = [
    {
      titleKey: 'nav.section.core',
      items: [
        {
          id: 'overview',
          labelKey: 'nav.dashboard',
          icon: LayoutDashboard,
          isGap: false,
          isReadOnly: false,
        },
        {
          id: 'stores',
          labelKey: 'nav.stores',
          icon: StoreIcon,
          isGap: false,
          isReadOnly: true,
        },
        {
          id: 'catalog',
          labelKey: 'nav.catalog',
          icon: ShoppingBag,
          isGap: false,
          isReadOnly: true,
        },
        {
          // Master-data catalog editor (write path). Gated by the exact
          // permission the backend command services enforce.
          id: 'product-admin',
          labelKey: 'nav.productAdmin',
          icon: Package,
          isGap: false,
          anyPermission: ['product:manage'],
        },
        {
          id: 'category-admin',
          labelKey: 'nav.categoryAdmin',
          icon: FolderCog,
          isGap: false,
          anyPermission: ['category:manage'],
        },
        {
          id: 'pricing',
          labelKey: 'nav.pricing',
          icon: Tag,
          isGap: false,
          isReadOnly: true,
        },
      ],
    },
    {
      titleKey: 'nav.section.storeOperations',
      items: [
        {
          id: 'pos',
          labelKey: 'nav.pos',
          icon: Receipt,
          isGap: false,
          isReadOnly: false,
        },
        {
          id: 'inventory',
          labelKey: 'nav.inventory',
          icon: Boxes,
          isGap: false,
          isReadOnly: false,
        },
        {
          // Supplier master data (global). Gated by the exact code the
          // backend SupplierCommandService enforces.
          id: 'suppliers',
          labelKey: 'nav.suppliers',
          icon: Truck,
          isGap: false,
          anyPermission: ['supplier:manage'],
        },
        {
          // Store purchase orders + goods receiving. Gated by purchase:manage
          // (the receive action additionally requires inventory:receive).
          id: 'purchase-orders',
          labelKey: 'nav.purchaseOrders',
          icon: ClipboardList,
          isGap: false,
          anyPermission: ['purchase:manage'],
        },
        {
          // Inter-branch stock transfers. Gated by the exact code the backend
          // StockTransferService enforces (both stores must also be in scope).
          id: 'stock-transfers',
          labelKey: 'nav.stockTransfers',
          icon: ArrowLeftRight,
          isGap: false,
          anyPermission: ['inventory:transfer'],
        },
        {
          // Ingredient master data — closes the documented API gap. Reads under
          // inventory:read, writes under ingredient:manage.
          id: 'ingredient-admin',
          labelKey: 'nav.ingredientAdmin',
          icon: Leaf,
          isGap: false,
          anyPermission: ['ingredient:manage', 'inventory:read'],
        },
        {
          // Unit-of-measure master editor (real backend, replaces the old
          // hard-coded reference table). Gated by uom:manage.
          id: 'uom-admin',
          labelKey: 'nav.uomAdmin',
          icon: Ruler,
          isGap: false,
          anyPermission: ['uom:manage'],
        },
        {
          // Batch / lot + expiry console (FEFO). The list needs inventory:read
          // + store scope; the write-off needs inventory:adjust. Both are
          // enforced server-side; the mutation button is gated in the view.
          id: 'batch-expiry',
          labelKey: 'nav.batchExpiry',
          icon: CalendarClock,
          isGap: false,
          anyPermission: ['inventory:read'],
        },
        {
          id: 'production',
          labelKey: 'nav.production',
          icon: Flame,
          isGap: false,
          isReadOnly: false,
          anyPermission: ['production:queue-read'],
        },
        {
          id: 'bakery',
          labelKey: 'nav.bds',
          icon: Coffee,
          isGap: false,
          isReadOnly: false,
          anyPermission: ['production:queue-read'],
        },
        {
          id: 'notifications',
          labelKey: 'nav.notifications',
          icon: Bell,
          // No badge count: there is no unread-count endpoint, and a hard-coded
          // number was a mock-era fabrication. The mechanism stays available for
          // when a real count exists.
          isGap: false,
          isReadOnly: false,
        },
        {
          id: 'audit-logs',
          labelKey: 'nav.auditLogs',
          icon: FileText,
          isGap: false,
          isReadOnly: true,
        },
      ],
    },
    {
      titleKey: 'nav.section.reference',
      items: [
        {
          id: 'categories',
          labelKey: 'nav.categories',
          icon: FolderTree,
          isGap: false,
          isReadOnly: true,
        },
        {
          id: 'payment-methods',
          labelKey: 'nav.paymentMethods',
          icon: CreditCard,
          isGap: false,
          isReadOnly: true,
        },
        {
          id: 'units-of-measure',
          labelKey: 'nav.unitsOfMeasure',
          icon: Scale,
          isGap: false,
          isReadOnly: true,
        },
        {
          id: 'exchange-rates',
          labelKey: 'nav.exchangeRates',
          icon: Coins,
          isGap: false,
          isReadOnly: true,
          anyPermission: ['currency-rate:read', 'currency-rate:manage'],
        },
        {
          id: 'currency-converter',
          labelKey: 'nav.currencyConverter',
          icon: ArrowLeftRight,
          isGap: false,
          isReadOnly: true,
          anyPermission: ['currency-conversion:preview'],
        },
      ],
    },
    {
      titleKey: 'nav.section.admin',
      items: [
        {
          id: 'staff',
          labelKey: 'nav.staff',
          icon: Users,
          isGap: false,
          anyPermission: ['staff:read'],
        },
        {
          // Global account directory (staff + customers), §1.1. Read-only.
          id: 'users',
          labelKey: 'nav.users',
          icon: Users,
          isGap: false,
          isReadOnly: true,
          anyPermission: ['user:admin-read'],
        },
        {
          id: 'roles',
          labelKey: 'nav.roles',
          icon: ShieldCheck,
          isGap: false,
          anyPermission: ['role:read'],
        },
        {
          id: 'orders',
          labelKey: 'nav.orders',
          icon: Receipt,
          isGap: false,
          anyPermission: ['order:admin-read'],
        },
        {
          id: 'promotions',
          labelKey: 'nav.promotions',
          icon: Sparkles,
          isGap: false,
          anyPermission: ['promotion:read'],
        },
        {
          id: 'reports',
          labelKey: 'nav.reports',
          icon: BarChart3,
          isGap: false,
          anyPermission: ['report:sales-read', 'report:inventory-cogs-read'],
        },
        {
          // Org-wide settings remain a genuine BACKEND API GAP (Phase 7 audit);
          // the view shows the real branch settings plus an honest gap panel.
          id: 'settings',
          labelKey: 'nav.settings',
          icon: Settings,
          isGap: true,
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Drawer Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex w-72 flex-col bg-[#2A2421] text-[#F5F3F0] transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
        aria-label="Sidebar Navigation"
      >
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#3E3530] px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#C48A56] to-[#A36C3D] text-white shadow-md">
              <Coffee className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
                {t('app.title')}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-medium text-[#C48A56] uppercase tracking-wider">
                  {t('app.subtitle')}
                </span>
                <span className="rounded bg-[#C48A56]/20 px-1 py-0.2 text-[8px] font-semibold text-[#D4A87A]">
                  MVP
                </span>
              </div>
            </div>
          </div>

          {/* Close button for mobile */}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#A89D94] hover:bg-[#3A322E] hover:text-white lg:hidden transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navSections.map((section, idx) => (
            <div key={idx}>
              <div className="px-3 mb-2 text-[10px] font-semibold tracking-wider text-[#A89D94] uppercase">
                {t(section.titleKey)}
              </div>
              <nav className="space-y-1" aria-label={t(section.titleKey)}>
                {section.items
                  .filter((item) => !item.anyPermission || item.anyPermission.some((p) => hasPermission(p)))
                  .map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        if (window.innerWidth < 1024) {
                          onClose();
                        }
                      }}
                      className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[#C48A56] text-white font-semibold shadow-xs'
                          : 'text-[#E0D8D0] hover:bg-[#3A322E] hover:text-white'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive ? 'text-white' : 'text-[#C48A56] group-hover:text-white'
                          }`}
                        />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.badgeCount && (
                          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#DC2626] px-1 text-[9px] font-bold text-white">
                            {item.badgeCount}
                          </span>
                        )}
                        {item.isReadOnly && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[8px] font-medium transition-colors ${
                              isActive
                                ? 'bg-black/20 text-white'
                                : 'bg-[#3A322E] text-[#C48A56]'
                            }`}
                          >
                            RO
                          </span>
                        )}
                        {item.isGap && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[8px] font-medium flex items-center gap-0.5 ${
                              isActive
                                ? 'bg-black/20 text-[#F5F3F0]'
                                : 'bg-[#3A322E] text-[#D97706]'
                            }`}
                            title="Spring Boot REST API endpoint missing"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            GAP
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Bottom Store Context Card */}
        <div className="shrink-0 border-t border-[#3E3530] p-3.5 bg-[#231E1B]">
          <div className="flex items-center justify-between rounded-lg bg-[#2F2824] p-2.5 border border-[#3E3530]">
            <div className="truncate pr-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    selectedStore?.isActive ? 'bg-[#4ADE80]' : 'bg-[#EF4444]'
                  }`}
                />
                <span className="text-[10px] font-semibold tracking-wider text-[#A89D94] uppercase truncate">
                  {selectedStore?.code || 'NO BRANCH'}
                </span>
              </div>
              <p className="text-xs font-semibold text-white truncate mt-0.5">
                {selectedStore?.name}
              </p>
            </div>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold shrink-0 ${
                selectedStore?.isActive
                  ? 'bg-[#4ADE80]/20 text-[#4ADE80]'
                  : 'bg-[#EF4444]/20 text-[#EF4444]'
              }`}
            >
              {selectedStore?.isActive ? t('badge.active') : t('badge.inactive')}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
