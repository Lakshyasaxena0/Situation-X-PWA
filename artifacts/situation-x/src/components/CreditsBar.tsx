import { Link } from "wouter";
import { useGetCredits, getGetCreditsQueryKey } from "@workspace/api-client-react";
import { Coins } from "lucide-react";

/** Top of the Analysis page: credits received, used and left. */
export function CreditsBar() {
  const { data } = useGetCredits({ query: { queryKey: getGetCreditsQueryKey(), staleTime: 15_000, refetchOnWindowFocus: true } });
  if (!data) return null;

  const received = data.granted ?? data.balance + (data.used ?? 0);
  const used = data.used ?? 0;
  const left = data.balance;
  const usedShare = received > 0 ? Math.min(100, Math.round((used / received) * 100)) : 0;
  const low = data.billingActive && left < 15;

  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Coins className="w-4 h-4 text-primary" />
          Your credits
        </div>
        <Link href="/pricing" className="text-xs text-primary underline underline-offset-2">
          {data.billingActive ? "Add credits" : "Plans"}
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/60 py-2">
          <div className="text-lg font-bold text-foreground">{received}</div>
          <div className="text-[11px] text-muted-foreground">received</div>
        </div>
        <div className="rounded-md bg-muted/60 py-2">
          <div className="text-lg font-bold text-foreground">{used}</div>
          <div className="text-[11px] text-muted-foreground">used</div>
        </div>
        <div className={`rounded-md py-2 ${low ? "bg-red-500/10" : "bg-primary/15"}`}>
          <div className={`text-lg font-bold ${low ? "text-red-700" : "text-foreground"}`}>{left}</div>
          <div className="text-[11px] text-muted-foreground">left</div>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
        <div className="h-full bg-primary" style={{ width: `${usedShare}%` }} />
      </div>
      {!data.billingActive && <p className="mt-2 text-[11px] text-muted-foreground">Credits are not being charged right now, so nothing is deducted from your balance.</p>}
    </div>
  );
}
