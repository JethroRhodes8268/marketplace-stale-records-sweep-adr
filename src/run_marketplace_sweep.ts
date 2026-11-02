import { infrai } from './infrai.js';
import { ensureCleanupQueue, enqueueCleanupJobs, drainCleanupQueue } from './cleanup_handoff.js';
import { sweepRequestSchema, type SweepRequest } from './marketplace_types.js';
import { decideMarketplaceCleanup } from './sweep_policy.js';

const exampleRequest = {
  now: '2026-01-10T00:00:00.000Z',
  retentionDays: 30,
  bucket: process.env.INFRAI_SWEEP_BUCKET ?? 'creator-marketplace-archive',
  queue: process.env.INFRAI_SWEEP_QUEUE ?? 'creator-marketplace-cleanup',
  taskUrl: process.env.INFRAI_SWEEP_TASK_URL ?? 'https://example.com/tasks/marketplace-cleanup',
  sellerAssets: [
    {
      assetId: 'ord_1001',
      sellerId: 'seller_9',
      storageKey: process.env.INFRAI_SWEEP_STORAGE_KEY ?? 'orders/ord_1001/final-cut.mp4',
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
};

async function main(): Promise<void> {
  const request = sweepRequestSchema.parse(exampleRequest) as SweepRequest;
  const decision = decideMarketplaceCleanup(request);
  const sweepId = `sweep-${request.now}`;

  const cron = await infrai.cron.create({
    cron_expr: '0 */6 * * *',
    task: request.taskUrl
  });

  await ensureCleanupQueue(request.queue);
  const messageIds = await enqueueCleanupJobs(request.queue, decision.candidates, sweepId);
  const cleanup = await drainCleanupQueue(request.queue, request.bucket);

  console.log(JSON.stringify({
    cronJobId: cron.data.job_id,
    sweep: decision,
    publishedMessageIds: messageIds,
    cleanup
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
