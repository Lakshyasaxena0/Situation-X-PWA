import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

/** True only for the app's own JSON answer: a sleeping host answers with its own HTML "starting" page. */
async function serverIsUp(timeoutMs: number): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/api/healthz`, { cache: "no-store", signal: ctl.signal });
    return r.ok && (r.headers.get("content-type") ?? "").includes("json");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The app screen now opens instantly from the device, but the free host puts the server to sleep when
 * nobody uses it, and waking it takes up to a minute. This tells the person that is what is happening
 * (instead of an empty or broken screen) and refreshes the data once the server answers.
 */
export function ServerWakeUp() {
  const qc = useQueryClient();
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasDown = false;

    const check = async (quick: boolean) => {
      clearTimeout(timer);
      const up = await serverIsUp(quick ? 3000 : 10000);
      if (stopped) return;
      if (up) {
        setWaking(false);
        if (wasDown) {
          wasDown = false;
          void qc.invalidateQueries();
        }
        return;
      }
      wasDown = true;
      setWaking(true);
      timer = setTimeout(() => void check(false), 3000);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    void check(true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [qc]);

  if (!waking) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[100] bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground">
      Server is waking up. It sleeps when unused and can take up to a minute. Your screen will refresh by itself.
    </div>
  );
}
