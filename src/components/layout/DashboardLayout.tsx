import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { OverviewView } from '../views/OverviewView';
import { StoresView } from '../views/StoresView';
import { CatalogView } from '../views/CatalogView';
import { PricingView } from '../views/PricingView';
import { ExchangeRatesView } from '../views/ExchangeRatesView';
import { CurrencyConverterView } from '../views/CurrencyConverterView';
import { InventoryView } from '../views/InventoryView';
import { SuppliersView } from '../views/SuppliersView';
import { PurchaseOrdersView } from '../views/PurchaseOrdersView';
import { StockTransfersView } from '../views/StockTransfersView';
import { IngredientMasterView } from '../views/IngredientMasterView';
import { UomAdminView } from '../views/UomAdminView';
import { BatchExpiryView } from '../views/BatchExpiryView';
import { ProductionView } from '../views/ProductionView';
import { PosView } from '../views/PosView';
import { NotificationsView } from '../views/NotificationsView';
import { AuditLogsView } from '../views/AuditLogsView';
import { CategoriesView, PaymentMethodsView, UnitsOfMeasureView } from '../views/ReferenceViews';
import { ProductAdminView } from '../views/ProductAdminView';
import { CategoryAdminView } from '../views/CategoryAdminView';
import { StaffAdminView } from '../views/StaffAdminView';
import { UsersAdminView } from '../views/UsersAdminView';
import { RolesAdminView } from '../views/RolesAdminView';
import { OrdersAdminView } from '../views/OrdersAdminView';
import { PromotionsAdminView } from '../views/PromotionsAdminView';
import { ReportsView } from '../views/ReportsView';
import { SettingsView } from '../views/SettingsView';
import { AuthModal } from '../auth/AuthModal';
import { useTranslation } from '../../lib/i18n';

export const DashboardLayout: React.FC = () => {
  const { t } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'register'>('signin');

  const openAuthModal = (tab: 'signin' | 'register' = 'signin') => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewView onNavigate={setActiveTab} />;
      case 'stores':
        return <StoresView />;
      case 'catalog':
        return <CatalogView />;
      case 'product-admin':
        return <ProductAdminView onNavigate={setActiveTab} />;
      case 'category-admin':
        return <CategoryAdminView />;
      case 'pricing':
        return <PricingView />;
      case 'exchange-rates':
        return <ExchangeRatesView />;
      case 'currency-converter':
        return <CurrencyConverterView />;
      case 'inventory':
        return <InventoryView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'purchase-orders':
        return <PurchaseOrdersView />;
      case 'stock-transfers':
        return <StockTransfersView />;
      case 'ingredient-admin':
        return <IngredientMasterView />;
      case 'uom-admin':
        return <UomAdminView />;
      case 'batch-expiry':
        return <BatchExpiryView />;
      case 'pos':
        return <PosView />;
      case 'production':
        return <ProductionView mode="KDS" />;
      case 'bakery':
        return <ProductionView mode="BDS" lockedStation="BAKERY" />;
      case 'notifications':
        return <NotificationsView />;
      case 'audit-logs':
        return <AuditLogsView />;
      case 'categories':
        return <CategoriesView />;
      case 'payment-methods':
        return <PaymentMethodsView />;
      case 'units-of-measure':
        return <UnitsOfMeasureView />;
      // Management views (Phase 8): every screen below is backed by a real,
      // permission-guarded endpoint; each view re-checks the exact code the
      // server enforces before rendering data or mutation controls.
      case 'staff':
        return <StaffAdminView />;
      case 'users':
        return <UsersAdminView />;
      case 'roles':
        return <RolesAdminView />;
      case 'orders':
        return <OrdersAdminView />;
      case 'promotions':
        return <PromotionsAdminView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView onNavigate={setActiveTab} />;
      default:
        return <OverviewView onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)]">
      {/* Responsive Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col lg:pl-72 transition-all duration-300">
        <TopNavbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenAuthModal={openAuthModal}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-150">
          {renderActiveView()}
        </main>
      </div>

      {/* Global Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultTab={authModalTab}
      />
    </div>
  );
};
