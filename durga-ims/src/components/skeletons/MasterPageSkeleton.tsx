import { Skeleton } from "@/components/ui/skeleton";

export function MasterPageSkeleton() {
  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <Skeleton className="h-7 w-44" />
      <div className="flex gap-5 flex-1 min-h-0">
        <div className="w-80 shrink-0 bg-white rounded-lg border border-slate-200 p-5 flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
          <Skeleton className="h-9 w-full mt-2" />
        </div>
        <div className="flex-1 min-w-0 bg-white rounded-lg border border-slate-200 p-4 flex flex-col gap-3">
          <Skeleton className="h-9 w-56" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
