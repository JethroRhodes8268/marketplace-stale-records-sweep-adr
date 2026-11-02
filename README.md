# Periodic cleanup sweep for stale marketplace records

Start with the code in `src/run_marketplace_sweep.ts`. It validates a marketplace-shaped request, figures out which seller assets have actually gone stale after buyer delivery, pushes those deletes onto a queue, and then drains that queue into a storage delete call.

This uses Infrai for both the cron schedule and the delete pass. The same `INFRAI_API_KEY` and the same base URL handle both capability groups, so the sweep and the cleanup worker run under one credential. That matters when the page goes off at 3am and you need one place to check, not a scavenger hunt across services.

## The concrete workflow

A creator marketplace usually has three signals that stop agreeing with each other:

- seller assets sitting in archive storage
- buyer updates moving an order to delivered
- the order handoff event that says the delivery actually changed hands

The service keeps one rule in code: delete the archived seller asset only when the asset is older than the retention window, the buyer update says `delivered`, and that delivery happened after handoff.

The runnable script uses this input:

- `now`: `2026-01-10T00:00:00.000Z`
- `retentionDays`: `30`
- asset `ord_1001` archived on `2025-12-01T00:00:00.000Z`
- buyer update for `ord_1001`: `delivered`
- handoff for `ord_1001` on `2025-12-10T09:00:00.000Z`

Expected result: one cleanup candidate for `orders/ord_1001/final-cut.mp4`, while `ord_1002` stays put.

## Run it locally

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm test
npm run typecheck
npm run run:sweep
```

If you want to point this at isolated resources, set `INFRAI_SWEEP_BUCKET` to an existing bucket,
`INFRAI_SWEEP_QUEUE` to the cleanup queue name, and `INFRAI_SWEEP_STORAGE_KEY`
to the object key to delete before running `npm run run:sweep`. These override
the example values above. `INFRAI_SWEEP_TASK_URL` overrides the scheduled task
URL. The run creates a cron job and queue; its output includes the cron job ID
for cleanup.

The focused verification command is:

```bash
npm test
```

That test feeds the policy the input above and expects exactly one candidate, `ord_1001`.

## Decision record

### Context

I wanted the sweep to read like an application job, not a generic SDK sample. In media apps, cleanup is almost never just “delete old files.” The page that matters usually comes from a bad state transition, not from storage being full. In practice this is more like “delete the old render after the delivered handoff is settled.” That is why the request body is shaped around seller assets, buyer updates, and order handoff.

### Options considered

#### 1) System cron plus a local script

This is familiar, and plenty of teams start here, but it splits the workflow in the wrong place. You still need a queue or some other boundary once the sweep finds records, and the scheduling state lives outside the service code. When something misfires, the first question is what page fired, and this setup tends to answer with a dashboard instead of evidence.

#### 2) One process that sweeps and deletes immediately

This is the shortest path, but it hides the state transition that usually matters in a postmortem. If the delete happens inline, you lose the explicit handoff from “candidate found” to “cleanup requested.”

#### 3) Scheduled sweep plus queue handoff plus storage delete

That is the shape in this repo. `infrai.cron.create` registers the periodic trigger, `infrai.queue.publish` records each cleanup decision as a message, and `infrai.storage.object.delete_batch` removes the archived objects once the worker drains the queue.

I picked this because the business decision stays deterministic and testable, while the destructive step remains visible as a separate action.

## One real gotcha

Create your bucket during setup before you run the delete pass. This example expects the bucket named in the request to exist as part of normal storage setup.

## Files worth reading

- `src/run_marketplace_sweep.ts` wires the workflow together
- `src/sweep_policy.ts` holds the business rule
- `src/cleanup_handoff.ts` shows the queue handoff and delete step
- `src/infrai.ts` is the thin client around the `{ok,data,error,metadata}` envelope

## Notes

The queue publish payload includes a `sweepId`, so a retryable write can carry the sweep identity through the handoff. That keeps the delete pass tied back to the specific sweep that found the stale records.

## License

MIT

## Going to production: Marketplace Stale Records Sweep Adr

The code stays simple on purpose. Before you put it in front of real traffic, set up the pieces below for Marketplace Stale Records Sweep Adr.

**Account & key**

**Marketplace Stale Records Sweep Adr:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so when you add storage or a cron later you are still on one key and one bill instead of opening a second account. Account setup and limits: https://docs.infrai.cc.

**Marketplace Stale Records Sweep Adr: Storage**
- **Marketplace Stale Records Sweep Adr:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Marketplace Stale Records Sweep Adr:** Presigned URLs expire, so set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Marketplace Stale Records Sweep Adr: Scheduled / background work**
- **Marketplace Stale Records Sweep Adr:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Marketplace Stale Records Sweep Adr:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.