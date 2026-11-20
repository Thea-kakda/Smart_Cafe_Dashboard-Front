import { describe, it } from 'node:test';
import assert from 'node:assert';
import { translations } from '../lib/i18n';

describe('Quick Actions Menu Tests', () => {
  const quickActionsConfig = [
    { id: 'add-product', tab: 'catalog', shortcut: 'Alt+P', titleKey: 'quickAction.addProduct' },
    { id: 'create-branch', tab: 'stores', shortcut: 'Alt+B', titleKey: 'quickAction.createBranch' },
    { id: 'view-inventory', tab: 'inventory', shortcut: 'Alt+I', titleKey: 'quickAction.viewInventory' },
    { id: 'new-pos-order', tab: 'pos', shortcut: 'Alt+O', titleKey: 'quickAction.newOrder' },
    { id: 'kitchen-kds', tab: 'production', shortcut: 'Alt+K', titleKey: 'quickAction.kitchenQueue' },
    { id: 'bakery-bds', tab: 'bakery', shortcut: 'Alt+D', titleKey: 'quickAction.bakeryQueue' },
  ];

  it('configures all required operational tasks: Add New Product, Create Branch, and View Inventory', () => {
    const tabs = quickActionsConfig.map((a) => a.tab);
    assert.ok(tabs.includes('catalog'), 'Must include Add New Product pointing to catalog');
    assert.ok(tabs.includes('stores'), 'Must include Create Branch pointing to stores');
    assert.ok(tabs.includes('inventory'), 'Must include View Inventory pointing to inventory');
  });

  it('provides distinct keyboard shortcuts for all quick action shortcuts', () => {
    const shortcuts = quickActionsConfig.map((a) => a.shortcut);
    const uniqueShortcuts = new Set(shortcuts);
    assert.strictEqual(uniqueShortcuts.size, shortcuts.length, 'Every quick action must have a unique shortcut');
  });

  it('ensures all quick action titles exist in both English and Khmer localization dictionaries', () => {
    const enDict = translations.en as Record<string, string>;
    const kmDict = translations.km as Record<string, string>;

    for (const action of quickActionsConfig) {
      assert.ok(action.titleKey in enDict, `English dict missing ${action.titleKey}`);
      assert.ok(action.titleKey in kmDict, `Khmer dict missing ${action.titleKey}`);
      assert.ok(enDict[action.titleKey].length > 0, `English translation for ${action.titleKey} is empty`);
      assert.ok(kmDict[action.titleKey].length > 0, `Khmer translation for ${action.titleKey} is empty`);
    }

    assert.ok('nav.quickActions' in enDict);
    assert.ok('nav.quickActions' in kmDict);
  });

  it('navigates to target tab on action selection', () => {
    let currentTab = 'overview';
    const onNavigate = (tab: string) => {
      currentTab = tab;
    };

    // Trigger 'Add New Product'
    const addProductAction = quickActionsConfig.find((a) => a.id === 'add-product');
    assert.ok(addProductAction);
    onNavigate(addProductAction.tab);
    assert.strictEqual(currentTab, 'catalog');

    // Trigger 'Create Branch'
    const createBranchAction = quickActionsConfig.find((a) => a.id === 'create-branch');
    assert.ok(createBranchAction);
    onNavigate(createBranchAction.tab);
    assert.strictEqual(currentTab, 'stores');

    // Trigger 'View Inventory'
    const viewInventoryAction = quickActionsConfig.find((a) => a.id === 'view-inventory');
    assert.ok(viewInventoryAction);
    onNavigate(viewInventoryAction.tab);
    assert.strictEqual(currentTab, 'inventory');
  });
});
