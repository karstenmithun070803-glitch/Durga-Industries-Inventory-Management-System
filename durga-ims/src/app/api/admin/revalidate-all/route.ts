import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";

export async function POST() {
  Object.values(CACHE_TAGS).forEach(revalidateTag);
  return Response.json({ ok: true });
}
