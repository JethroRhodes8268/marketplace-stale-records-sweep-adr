import { z } from 'zod';

export const sellerAssetSchema = z.object({
  assetId: z.string().min(1),
  sellerId: z.string().min(1),
  storageKey: z.string().min(1),
  archivedAt: z.string().datetime(),
  bytes: z.number().int().nonnegative()
});

export const buyerUpdateSchema = z.object({
  orderId: z.string().min(1),
  buyerId: z.string().min(1),
  status: z.enum(['draft', 'awaiting_delivery', 'delivered', 'cancelled']),
  updatedAt: z.string().datetime()
});

export const orderHandoffSchema = z.object({
  orderId: z.string().min(1),
  sellerId: z.string().min(1),
  buyerId: z.string().min(1),
  handedOffAt: z.string().datetime()
});

export const sweepRequestSchema = z.object({
  now: z.string().datetime(),
  retentionDays: z.number().int().positive(),
  bucket: z.string().min(1),
  queue: z.string().min(1),
  taskUrl: z.string().url(),
  sellerAssets: z.array(sellerAssetSchema),
  buyerUpdates: z.array(buyerUpdateSchema),
  orderHandoffs: z.array(orderHandoffSchema)
});

export type SellerAsset = z.infer<typeof sellerAssetSchema>;
export type BuyerUpdate = z.infer<typeof buyerUpdateSchema>;
export type OrderHandoff = z.infer<typeof orderHandoffSchema>;
export type SweepRequest = z.infer<typeof sweepRequestSchema>;

export type CleanupCandidate = {
  orderId: string;
  sellerId: string;
  buyerId: string;
  storageKey: string;
  reason: 'buyer-delivered-after-handoff';
};

export type SweepDecision = {
  staleOrdersFound: number;
  enqueuedDeletes: number;
  candidates: CleanupCandidate[];
};
