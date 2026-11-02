import test from 'node:test';
import assert from 'node:assert/strict';
import { decideMarketplaceCleanup } from '../src/sweep_policy.js';

test('sweep selects only delivered orders past retention and ready for handoff cleanup', () => {
  const result = decideMarketplaceCleanup({
    now: '2026-01-10T00:00:00.000Z',
    retentionDays: 30,
    sellerAssets: [
      {
        assetId: 'ord_1001',
        sellerId: 'seller_9',
        storageKey: 'orders/ord_1001/final-cut.mp4',
        archivedAt: '2025-12-01T00:00:00.000Z',
        bytes: 441000
      },
      {
        assetId: 'ord_1002',
        sellerId: 'seller_7',
        storageKey: 'orders/ord_1002/interview.wav',
        archivedAt: '2025-12-20T00:00:00.000Z',
        bytes: 98000
      }
    ],
    buyerUpdates: [
      {
        orderId: 'ord_1001',
        buyerId: 'buyer_3',
        status: 'delivered',
        updatedAt: '2025-12-15T10:00:00.000Z'
      },
      {
        orderId: 'ord_1002',
        buyerId: 'buyer_8',
        status: 'awaiting_delivery',
        updatedAt: '2025-12-25T10:00:00.000Z'
      }
    ],
    orderHandoffs: [
      {
        orderId: 'ord_1001',
        sellerId: 'seller_9',
        buyerId: 'buyer_3',
        handedOffAt: '2025-12-10T09:00:00.000Z'
      },
      {
        orderId: 'ord_1002',
        sellerId: 'seller_7',
        buyerId: 'buyer_8',
        handedOffAt: '2025-12-21T09:00:00.000Z'
      }
    ]
  });

  assert.deepEqual(result, {
    staleOrdersFound: 1,
    enqueuedDeletes: 1,
    candidates: [
      {
        orderId: 'ord_1001',
        sellerId: 'seller_9',
        buyerId: 'buyer_3',
        storageKey: 'orders/ord_1001/final-cut.mp4',
        reason: 'buyer-delivered-after-handoff'
      }
    ]
  });
});
