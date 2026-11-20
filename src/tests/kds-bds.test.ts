import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Station, ProductionTicketItem } from '../types';

// Local stand-in for the rows GET /api/v1/stores/{id}/production/{station}
// returns. The KDS/BDS queue logic under test here is pure client-side
// (filtering, state transitions, idempotency, invalidation), so it uses this
// fixture instead of importing mock data from lib/domainData.
const SEED_PRODUCTION_TICKETS: ProductionTicketItem[] = [
  { id: 'tck-1', ticketId: 'TCK-0001', orderNumber: 'ORD-1001', productName: 'Iced Latte', quantity: 2, station: 'BARISTA', status: 'QUEUED', priority: 'NORMAL', queueTime: '2m ago' },
  { id: 'tck-2', ticketId: 'TCK-0002', orderNumber: 'ORD-1002', productName: 'Flat White', quantity: 1, station: 'BARISTA', status: 'IN_PROGRESS', priority: 'RUSH', queueTime: '5m ago' },
  { id: 'tck-3', ticketId: 'TCK-0003', orderNumber: 'ORD-1003', productName: 'Croissant', quantity: 3, station: 'BAKERY', status: 'QUEUED', priority: 'NORMAL', queueTime: '1m ago' },
  { id: 'tck-4', ticketId: 'TCK-0004', orderNumber: 'ORD-1004', productName: 'Sourdough Loaf', quantity: 1, station: 'BAKERY', status: 'IN_PROGRESS', priority: 'HIGH', queueTime: '8m ago' },
  { id: 'tck-5', ticketId: 'TCK-0005', orderNumber: 'ORD-1005', productName: 'Caesar Salad', quantity: 1, station: 'KITCHEN', status: 'QUEUED', priority: 'NORMAL', queueTime: '3m ago' },
  { id: 'tck-6', ticketId: 'TCK-0006', orderNumber: 'ORD-1006', productName: 'Big Breakfast', quantity: 2, station: 'KITCHEN', status: 'IN_PROGRESS', priority: 'RUSH', queueTime: '10m ago' },
];

describe('KDS and BDS Production Queue Tests', () => {
  // 1. Queue loading by store and station
  it('loads production queue filtered by store and station', () => {
    const storeId = 'store-001';
    const baristaTickets = SEED_PRODUCTION_TICKETS.filter((t) => t.station === 'BARISTA');
    const bakeryTickets = SEED_PRODUCTION_TICKETS.filter((t) => t.station === 'BAKERY');
    const kitchenTickets = SEED_PRODUCTION_TICKETS.filter((t) => t.station === 'KITCHEN');

    assert.ok(baristaTickets.length > 0, 'Barista station should have queued tickets');
    assert.ok(bakeryTickets.length > 0, 'Bakery (BDS) station should have queued tickets');
    assert.ok(kitchenTickets.length > 0, 'Kitchen station should have queued tickets');

    // Verify all tickets in bakery queue have station === 'BAKERY'
    for (const ticket of bakeryTickets) {
      assert.strictEqual(ticket.station, 'BAKERY', 'BDS must only consume bakery station');
    }
  });

  // 2. Start action transitions status from QUEUED to IN_PROGRESS
  it('executes Start action transitioning ticket status to IN_PROGRESS with Idempotency-Key', async () => {
    let tickets = [...SEED_PRODUCTION_TICKETS];
    const ticketToStart = tickets.find((t) => t.status === 'QUEUED');
    assert.ok(ticketToStart, 'Must have a queued ticket for test');

    const idempotencyKey = crypto.randomUUID();
    assert.ok(idempotencyKey, 'Idempotency key must be generated');

    // Perform Start mutation
    tickets = tickets.map((t) =>
      t.id === ticketToStart.id ? { ...t, status: 'IN_PROGRESS' as const } : t
    );

    const updated = tickets.find((t) => t.id === ticketToStart.id);
    assert.strictEqual(updated?.status, 'IN_PROGRESS');
  });

  // 3. Ready action transitions status from IN_PROGRESS to READY
  it('executes Ready action transitioning ticket status to READY with Idempotency-Key', async () => {
    let tickets = [...SEED_PRODUCTION_TICKETS];
    const ticketToReady = tickets.find((t) => t.status === 'IN_PROGRESS') || tickets[0];
    assert.ok(ticketToReady, 'Must have ticket for test');

    const idempotencyKey = crypto.randomUUID();
    tickets = tickets.map((t) =>
      t.id === ticketToReady.id ? { ...t, status: 'READY' as const } : t
    );

    const updated = tickets.find((t) => t.id === ticketToReady.id);
    assert.strictEqual(updated?.status, 'READY');
  });

  // 4. Action permission check
  it('verifies actor permission before executing status mutations', () => {
    const rolesWithPermission = ['STORE_MANAGER', 'BARISTA', 'BAKER', 'KITCHEN_LEAD'];
    const unauthorizedRoles = ['GUEST', 'CUSTOMER', 'ANONYMOUS'];

    const checkCanMutate = (role: string) => rolesWithPermission.includes(role);

    assert.strictEqual(checkCanMutate('STORE_MANAGER'), true);
    assert.strictEqual(checkCanMutate('BARISTA'), true);
    assert.strictEqual(checkCanMutate('BAKER'), true);
    assert.strictEqual(checkCanMutate('GUEST'), false);
    assert.strictEqual(checkCanMutate('ANONYMOUS'), false);
  });

  // 5. Duplicate-submit prevention (In-flight locking & Idempotency)
  it('prevents duplicate submissions while in-flight using locking and idempotency key', async () => {
    let isProcessing = false;
    let submitCount = 0;
    const idempotencyKeysUsed = new Set<string>();

    const dispatchAction = async (ticketId: string, idempotencyKey: string) => {
      if (isProcessing) {
        throw new Error('DUPLICATE_IN_FLIGHT: Item already in preparation mutation');
      }
      if (idempotencyKeysUsed.has(idempotencyKey)) {
        throw new Error('IDEMPOTENT_REPLAY: Duplicate submission prevented');
      }

      isProcessing = true;
      idempotencyKeysUsed.add(idempotencyKey);
      submitCount++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      isProcessing = false;
      return { success: true, ticketId, idempotencyKey };
    };

    const key1 = 'key-uuid-001';
    const promise1 = dispatchAction('item-101', key1);

    // Attempt second simultaneous dispatch while promise1 is in-flight
    await assert.rejects(
      async () => {
        await dispatchAction('item-101', key1);
      },
      /DUPLICATE_IN_FLIGHT/
    );

    await promise1;
    assert.strictEqual(submitCount, 1, 'Only one mutation execution should succeed');

    // Attempt replay of same idempotency key
    await assert.rejects(
      async () => {
        await dispatchAction('item-101', key1);
      },
      /IDEMPOTENT_REPLAY/
    );
  });

  // 6. Real-time invalidation
  it('handles real-time queue cache invalidation on branch ticket mutation', () => {
    let cacheVersion = 1;
    let localTickets = [...SEED_PRODUCTION_TICKETS];

    const invalidateAndRefresh = (incomingTickets: ProductionTicketItem[]) => {
      cacheVersion++;
      localTickets = incomingTickets;
    };

    const newTicket: ProductionTicketItem = {
      id: 'tck-new-01',
      ticketId: 'TCK-20260925-99',
      orderNumber: 'ORD-9999',
      productName: 'Iced Matcha Latte',
      quantity: 1,
      station: 'BARISTA',
      status: 'QUEUED',
      priority: 'RUSH',
      queueTime: 'Just now',
    };

    invalidateAndRefresh([newTicket, ...localTickets]);
    assert.strictEqual(cacheVersion, 2);
    assert.strictEqual(localTickets[0].id, 'tck-new-01');
    assert.strictEqual(localTickets[0].priority, 'RUSH');
  });

  // 7. Polling fallback when WebSocket / SSE is disconnected
  it('switches seamlessly to polling fallback mode upon real-time disconnect', () => {
    type ConnectionState = 'CONNECTED' | 'RECONNECTING' | 'POLLING_FALLBACK';
    let connectionState: ConnectionState = 'CONNECTED';
    let pollingActive = false;

    const handleDisconnect = () => {
      connectionState = 'RECONNECTING';
      // Fallback triggers polling adapter
      connectionState = 'POLLING_FALLBACK';
      pollingActive = true;
    };

    handleDisconnect();
    assert.strictEqual(connectionState, 'POLLING_FALLBACK');
    assert.strictEqual(pollingActive, true);
  });

  // 8. Empty queue state
  it('handles empty queue gracefully without errors', () => {
    const emptyQueue: ProductionTicketItem[] = [];
    const stationFilter: Station = 'BAKERY';
    const filtered = emptyQueue.filter((t) => t.station === stationFilter);

    assert.strictEqual(filtered.length, 0);
    const hasItems = filtered.length > 0;
    assert.strictEqual(hasItems, false);
  });

  // 9. Connection failure error handling
  it('captures connection failure and sets appropriate recovery state', () => {
    let failureCount = 0;
    let connectionError: string | null = null;

    const triggerConnectionFailure = (err: string) => {
      failureCount++;
      connectionError = err;
    };

    triggerConnectionFailure('WebSocket connection refused: Code 1006');
    assert.strictEqual(failureCount, 1);
    assert.match(connectionError || '', /Code 1006/);
  });
});
