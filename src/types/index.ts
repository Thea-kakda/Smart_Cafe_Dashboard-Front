export type Locale = 'en' | 'km';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  storeId?: string;
  avatarUrl?: string;
}

export interface Store {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  timezone?: string;
  defaultCurrency?: string;
  defaultLanguage?: string;
  isActive: boolean;
  /** Legacy display flag from the mock era; the backend has no open/closed state. */
  isOpen?: boolean;
  openingTime?: string;
  closingTime?: string;
  updatedAt?: string;
  /** Optimistic-lock version from the management API; required for updates. */
  version?: number;
}

export type Station = 'BARISTA' | 'BAKERY' | 'KITCHEN';

export interface Category {
  id: string;
  name: string;
  code: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
}

export type PricingMode = 'Inherited' | 'Branch Override';

export interface ProductSummary {
  id: string;
  name: string;
  code: string;
  categoryName: string;
  categoryId: string;
  basePrice?: number;
  branchPrice?: number;
  pricingMode: PricingMode;
  effectivePrice: number;
  currencyCode: string;
  isAvailable: boolean;
  soldOutUntil?: string;
  station: Station;
  preparationTimeMinutes: number;
  isCustomizable: boolean;
  updatedAt: string;
  imageUrl?: string;
}

export interface InventoryItem {
  id: string;
  ingredientCode: string;
  ingredientName: string;
  baseUnit: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  minimumStock: number;
  isLowStock: boolean;
  unitCost?: number;
  currencyCode?: string;
  version?: number;
}

export interface ProductionTicketItem {
  id: string;
  ticketId: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  station: Station;
  status: 'QUEUED' | 'IN_PROGRESS' | 'READY';
  customizations?: string[];
  notes?: string;
  queueTime: string;
  priority: 'NORMAL' | 'HIGH' | 'RUSH';
  /** Server-only identifiers carried for queue reconciliation (never fabricated). */
  orderId?: string;
  itemStatus?: string;
  version?: number;
}

export interface AuditLog {
  id: string;
  actor: string;
  actorRole?: string;
  action: string;
  aggregate: string;
  description?: string;
  category?: 'AUTH' | 'PRODUCTION' | 'INVENTORY' | 'STORE' | 'CATALOG' | 'SECURITY';
  outcome: 'SUCCESS' | 'FAILURE' | 'WARNING';
  reason?: string;
  requestId: string;
  timestamp: string;
  storeId?: string;
  storeName?: string;
  ipAddress?: string;
}

export interface NotificationItem {
  id: string;
  titleKey: string;
  messageKey: string;
  createdAt: string;
  isRead: boolean;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  category: 'INVENTORY' | 'PRODUCTION' | 'SYSTEM';
  deadline?: string;
  priority?: 'NORMAL' | 'HIGH' | 'CRITICAL';
  actionTarget?: 'inventory' | 'production' | 'stores';
  targetId?: string;
  link?: string;
}
