import { useState } from "react";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ClerkLikeError = { errors?: { longMessage?: string; message?: string }[]; message?: string };

function messageOf(err: unknown): string {
  const e = err as ClerkLikeError;
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? e?.message ?? "Could not change the password. Please try again.";
}

/**
 * Changes the password of the signed-in account (handled by the sign-in provider, never by this app's server).
 * An account that signs in only with Google or another provider has no password yet; it can set one here.
 */
export function ChangePassword() {
  const { isLoaded, user } = useUser();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (!isLoaded || !user) return null;
  const hasPassword = user.passwordEnabled;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setNote(null);
    if (next.length < 8) return setNote({ kind: "error", text: "The new password must be at least 8 characters." });
    if (next !== again) return setNote({ kind: "error", text: "The two new passwords do not match." });
    if (hasPassword && next === current) return setNote({ kind: "error", text: "The new password must be different from the current one." });
    setBusy(true);
    try {
      await user.updatePassword({
        newPassword: next,
        ...(hasPassword ? { currentPassword: current } : {}),
        signOutOfOtherSessions: signOutOthers,
      });
      setCurrent("");
      setNext("");
      setAgain("");
      setNote({ kind: "ok", text: hasPassword ? "Password changed." : "Password set. You can now sign in with it." });
    } catch (err) {
      setNote({ kind: "error", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" autoComplete="off">
      {hasPassword && (
        <div>
          <Label htmlFor="pw-current" className="text-xs text-muted-foreground">Current password</Label>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={busy} />
        </div>
      )}
      <div>
        <Label htmlFor="pw-new" className="text-xs text-muted-foreground">New password</Label>
        <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={busy} />
      </div>
      <div>
        <Label htmlFor="pw-again" className="text-xs text-muted-foreground">New password again</Label>
        <Input id="pw-again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} disabled={busy} />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} disabled={busy} />
        Sign out of my other devices
      </label>
      <Button type="submit" size="sm" disabled={busy || next.length === 0 || (hasPassword && current.length === 0)}>
        {busy ? "Saving..." : hasPassword ? "Change password" : "Set password"}
      </Button>
      {note && (
        <p className={`text-xs ${note.kind === "ok" ? "text-green-700" : "text-destructive"}`} role={note.kind === "error" ? "alert" : "status"}>
          {note.text}
        </p>
      )}
    </form>
  );
}
