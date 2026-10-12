/// <reference lib="webworker" />
import { renderTablePdf, type TableKind, type TableKindProps } from "./kinds";

export interface WorkerRequest {
  id: number;
  kind: TableKind;
  props: TableKindProps[TableKind];
}
export type WorkerResponse =
  | { id: number; ok: true; bytes: Uint8Array }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, kind, props } = e.data;
  try {
    const bytes = renderTablePdf(kind, props as never);
    ctx.postMessage({ id, ok: true, bytes } satisfies WorkerResponse, [bytes.buffer]);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};
