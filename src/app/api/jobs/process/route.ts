import { NextResponse, type NextRequest } from "next/server";
import { runJobProcessingCycle } from "@/lib/job-runner";

/**
 * In production, an external scheduler (Vercel Cron or equivalent) calls
 * this on an interval with the shared CRON_SECRET header — see
 * docs/architecture.md Section 3. For local dev, `npm run jobs:process`
 * calls the same underlying function directly without HTTP.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runJobProcessingCycle();
  return NextResponse.json(result);
}
