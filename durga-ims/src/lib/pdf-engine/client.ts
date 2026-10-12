import type { TableKind, TableKindProps } from "./kinds";
import type { WorkerRequest, WorkerResponse } from "./pdf.worker";

// Main-thread side of the PDF worker. The worker is created lazily, kept for the page
// lifetime, and (optionally) pre-warmed on idle so the first print has no startup cost.

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    const w = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.bytes);
      else p.reject(new Error(e.data.error));
    };
    w.onerror = () => {
      // Worker died (or failed to load): fail everything in flight and let the next call retry.
      pending.forEach((p) => p.reject(new Error("PDF worker crashed")));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    worker = w;
    return w;
  } catch {
    return null;
  }
}

/** Create the worker ahead of the first print. Safe to call repeatedly. */
export function warmPdfWorker(): void {
  const run = () => void getWorker();
  if (typeof requestIdleCallback === "function") requestIdleCallback(run);
  else setTimeout(run, 500);
}

export async function generateTablePdf<K extends TableKind>(
  kind: K,
  props: TableKindProps[K]
): Promise<Blob> {
  const w = getWorker();
  let bytes: Uint8Array;
  if (w) {
    const id = nextId++;
    bytes = await new Promise<Uint8Array>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, kind, props } satisfies WorkerRequest);
    });
  } else {
    // No Worker support: still correct, just on the main thread.
    const { renderTablePdf } = await import("./kinds");
    bytes = renderTablePdf(kind, props);
  }
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
