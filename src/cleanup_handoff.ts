import { infrai } from './infrai.js';
import type { CleanupCandidate } from './marketplace_types.js';

export async function ensureCleanupQueue(queue: string): Promise<void> {
  await infrai.queue.create({ name: queue });
}

export async function enqueueCleanupJobs(queue: string, candidates: CleanupCandidate[], sweepId: string): Promise<string[]> {
  const published: string[] = [];
  for (const candidate of candidates) {
    const result = await infrai.queue.publish({
      queue,
      payload: {
        sweepId,
        orderId: candidate.orderId,
        sellerId: candidate.sellerId,
        buyerId: candidate.buyerId,
        storageKey: candidate.storageKey,
        reason: candidate.reason
      }
    });
    if (result.data.message_id) {
      published.push(result.data.message_id);
    }
  }
  return published;
}

export async function drainCleanupQueue(queue: string, bucket: string): Promise<{ deletedKeys: string[]; ackedMessages: string[] }> {
  const consumed = await infrai.queue.consume({
    queue,
    max_messages: 10,
    visibility_timeout: 30
  });

  const items = consumed.data.items ?? [];
  const keys = items
    .map((item) => item.payload)
    .filter((payload): payload is { storageKey: string } => typeof payload === 'object' && payload !== null && 'storageKey' in payload && typeof (payload as { storageKey: unknown }).storageKey === 'string')
    .map((payload) => payload.storageKey);

  const deletedKeys = keys.length > 0
    ? (await infrai.storage.object.delete_batch(bucket, { keys })).data.deleted ?? []
    : [];
  const deleted = new Set(deletedKeys);

  const ackedMessages: string[] = [];
  for (const item of items) {
    const payload = item.payload;
    if (typeof payload !== 'object' || payload === null || !('storageKey' in payload)
      || typeof payload.storageKey !== 'string' || !deleted.has(payload.storageKey)) {
      continue;
    }
    await infrai.queue.ack({ queue, message_id: item.message_id });
    ackedMessages.push(item.message_id);
  }

  return { deletedKeys, ackedMessages };
}
