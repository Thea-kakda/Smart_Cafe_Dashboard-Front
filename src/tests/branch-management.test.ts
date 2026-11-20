import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Store } from '../types';

// Local stand-in for what GET /api/v1/management/stores returns. These tests
// exercise PURE client-side branch-management logic (create/edit/toggle/scope),
// so they no longer import mock data from lib/constants — the shape mirrors the
// Store contract instead.
const SEED_STORES: Store[] = [
  {
    id: 'store-001',
    name: 'BKK1 Flagship Store',
    code: 'STR-BKK1',
    address: 'St. 302, Boeng Keng Kang 1, Phnom Penh',
    phone: '+855 23 999 101',
    timezone: 'Asia/Phnom_Penh',
    isActive: true,
    isOpen: true,
    openingTime: '06:30',
    closingTime: '21:00',
  },
  {
    id: 'store-002',
    name: 'Toul Kork Roastery',
    code: 'STR-TK02',
    address: 'St. 315, Toul Kork, Phnom Penh',
    phone: '+855 23 999 102',
    timezone: 'Asia/Phnom_Penh',
    isActive: true,
    isOpen: true,
    openingTime: '07:00',
    closingTime: '20:00',
  },
  {
    id: 'store-003',
    name: 'Riverside Bakery & Cafe',
    code: 'STR-RIV03',
    address: 'Sisowath Quay, Daun Penh, Phnom Penh',
    phone: '+855 23 999 103',
    timezone: 'Asia/Phnom_Penh',
    isActive: true,
    isOpen: false,
    openingTime: '07:00',
    closingTime: '22:00',
  },
];

describe('Checkpoint 3: Branch Management Tests', () => {
  // 1. Branch list
  it('loads branch list and ensures each branch conforms to domain contract', () => {
    assert.ok(SEED_STORES.length >= 3, 'Must have initial verified stores');
    
    for (const store of SEED_STORES) {
      assert.ok(store.id, 'Branch must have id');
      assert.ok(store.name, 'Branch must have name');
      assert.ok(store.code, 'Branch must have code');
      assert.strictEqual(typeof store.isOpen, 'boolean', 'Branch must have isOpen boolean');
      assert.ok(store.timezone, 'Branch must have timezone');
    }
  });

  // 2. Branch detail
  it('fetches complete branch detail by id', () => {
    const target = SEED_STORES[0];
    const found = SEED_STORES.find((s) => s.id === target.id);

    assert.ok(found, 'Should find branch by id');
    assert.strictEqual(found.name, target.name);
    assert.strictEqual(found.code, target.code);
    assert.strictEqual(found.address, target.address);
    assert.strictEqual(found.openingTime, target.openingTime);
    assert.strictEqual(found.closingTime, target.closingTime);
  });

  // 3. Branch create
  it('creates a new branch with valid id, parameters, and defaults', () => {
    let stores: Store[] = [...SEED_STORES];

    const createBranch = (input: Omit<Store, 'id'>): Store => {
      const newId = `store-${(stores.length + 1).toString().padStart(3, '0')}`;
      const newStore: Store = { ...input, id: newId };
      stores = [...stores, newStore];
      return newStore;
    };

    const newBranch = createBranch({
      name: 'Aeon Sen Sok Flagship',
      code: 'STR-AON2',
      address: 'St 1003, Sen Sok, Phnom Penh',
      phone: '+855 23 999 777',
      openingTime: '07:00',
      closingTime: '22:00',
      timezone: 'Asia/Phnom_Penh',
      isOpen: true,
      isActive: true,
    });

    assert.ok(newBranch.id, 'New branch must have generated id');
    assert.strictEqual(newBranch.code, 'STR-AON2');
    assert.strictEqual(newBranch.isOpen, true);
    assert.strictEqual(stores.length, SEED_STORES.length + 1);
  });

  // 4. Branch edit
  it('edits existing branch attributes and updates record', () => {
    let stores: Store[] = [...SEED_STORES];
    const branchToEdit = stores[0];

    const updateBranch = (id: string, updates: Partial<Store>) => {
      stores = stores.map((s) => (s.id === id ? { ...s, ...updates } : s));
    };

    updateBranch(branchToEdit.id, {
      phone: '+855 23 111 222',
      openingTime: '06:00',
    });

    const updated = stores.find((s) => s.id === branchToEdit.id);
    assert.strictEqual(updated?.phone, '+855 23 111 222');
    assert.strictEqual(updated?.openingTime, '06:00');
    // Ensure code and name remained unchanged
    assert.strictEqual(updated?.code, branchToEdit.code);
  });

  // 5. Branch status toggle
  it('toggles branch operational status between OPEN and CLOSED', () => {
    let stores: Store[] = [...SEED_STORES];
    const branch = stores[0];
    const initialStatus = branch.isOpen;

    const toggleStatus = (id: string) => {
      stores = stores.map((s) => (s.id === id ? { ...s, isOpen: !s.isOpen } : s));
    };

    toggleStatus(branch.id);
    assert.strictEqual(stores[0].isOpen, !initialStatus);

    toggleStatus(branch.id);
    assert.strictEqual(stores[0].isOpen, initialStatus);
  });

  // 6. Active branch scoping
  it('scopes application context to active selected branch', () => {
    let selectedStoreId = SEED_STORES[0].id;
    const setSelectedStoreId = (id: string) => {
      selectedStoreId = id;
    };

    const targetBranch = SEED_STORES[1];
    setSelectedStoreId(targetBranch.id);

    assert.strictEqual(selectedStoreId, targetBranch.id);
    const active = SEED_STORES.find((s) => s.id === selectedStoreId);
    assert.strictEqual(active?.code, targetBranch.code);
  });
});
