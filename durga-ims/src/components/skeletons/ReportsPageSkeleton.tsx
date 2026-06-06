import { Skeleton } from "@/components/ui/skeleton";

export function ReportsPageSkeleton() {
  return (
    <div className="flex h-full gap-0">
      <div className="flex flex-col gap-2 border-r p-4 w-52 shrink-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
      <div className="flex flex-col gap-4 flex-1 p-6">
        <div className="flex gap-3 flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-44" />
          ))}
        </div>
        <Skeleton className="h-9 w-28" />
        <div className="flex flex-col gap-2 mt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
