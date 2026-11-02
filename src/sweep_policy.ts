import type { BuyerUpdate, CleanupCandidate, OrderHandoff, SellerAsset, SweepDecision, SweepRequest } from './marketplace_types.js';

function daysBetween(earlierIso: string, laterIso: string): number {
  const earlier = new Date(earlierIso).getTime();
  const later = new Date(laterIso).getTime();
  return (later - earlier) / (1000 * 60 * 60 * 24);
}

export function decideMarketplaceCleanup(
  input: Pick<SweepRequest, 'now' | 'retentionDays' | 'sellerAssets' | 'buyerUpdates' | 'orderHandoffs'>
): SweepDecision {
  const updatesByOrder = new Map<string, BuyerUpdate>();
  for (const update of input.buyerUpdates) {
    updatesByOrder.set(update.orderId, update);
  }

  const handoffsByOrder = new Map<string, OrderHandoff>();
  for (const handoff of input.orderHandoffs) {
    handoffsByOrder.set(handoff.orderId, handoff);
  }

  const candidates: CleanupCandidate[] = [];
  for (const asset of input.sellerAssets) {
    const handoff = handoffsByOrder.get(asset.assetId);
    const buyerUpdate = updatesByOrder.get(asset.assetId);
    if (!handoff || !buyerUpdate) {
      continue;
    }
    if (buyerUpdate.status !== 'delivered') {
      continue;
    }
    if (daysBetween(asset.archivedAt, input.now) < input.retentionDays) {
      continue;
    }
    if (new Date(buyerUpdate.updatedAt).getTime() < new Date(handoff.handedOffAt).getTime()) {
      continue;
    }

    candidates.push({
      orderId: asset.assetId,
      sellerId: asset.sellerId,
      buyerId: buyerUpdate.buyerId,
      storageKey: asset.storageKey,
      reason: 'buyer-delivered-after-handoff'
    });
  }

  return {
    staleOrdersFound: candidates.length,
    enqueuedDeletes: candidates.length,
    candidates
  };
}
