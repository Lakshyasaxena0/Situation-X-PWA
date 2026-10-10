import { useState } from "react";
import { useReverification, useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ClerkLikeError = { errors?: { code?: string; longMessage?: string; message?: string; meta?: { paramName?: string } }[]; message?: string };

/** Clerk wants the old password (some sign-in set-ups do): then the field is shown and the person can type it. */
function needsCurrentPassword(err: unknown): boolean {
  const e = (err as ClerkLikeError)?.errors?.[0];
  return e?.meta?.paramName === "current_password" || /current[_ ]password/i.test(`${e?.code ?? ""} ${e?.longMessage ?? ""} ${e?.message ?? ""}`);
}

function messageOf(err: unknown): string {
  const e = err as ClerkLikeError & { errors?: { code?: string }[] };
  const code = e?.errors?.[0]?.code ?? "";
  if (/reverification_cancelled/i.test(code)) return "The confirmation was cancelled, so the password was not changed.";
  if (/reverification/i.test(code)) {
    return "For safety the sign-in provider needs a recent sign-in first. Log out, sign in again, then set the new password.";
  }
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? e?.message ?? "Could not change the password. Please try again.";
}

/**
 * Changes the password of the signed-in account without asking for the old one (you are already signed in) (handled by the sign-in provider, never by this app's server).
 * An account that signs in only with Google or another provider has no password yet; it can set one here.
 */
export function ChangePassword() {
  const { isLoaded, user } = useUser();
  // Clerk may ask the person to confirm it is really them (a small pop-up) before a password change; this
  // hook shows that pop-up and then repeats the call, so the old password does not have to be typed.
  const updatePassword = useReverification((params: { newPassword: string; currentPassword?: string; signOutOfOtherSessions?: boolean }) => user!.updatePassword(params));
  const [askCurrent, setAskCurrent] = useState(false);
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
    setBusy(true);
    try {
      await updatePassword({
        newPassword: next,
        ...(askCurrent && current ? { currentPassword: current } : {}),
        signOutOfOtherSessions: signOutOthers,
      });
      setNext("");
      setAgain("");
      setCurrent("");
      setAskCurrent(false);
      setNote({ kind: "ok", text: hasPassword ? "Password changed." : "Password set. You can now sign in with it." });
    } catch (err) {
      if (!askCurrent && hasPassword && needsCurrentPassword(err)) {
        setAskCurrent(true);
        setNote({ kind: "error", text: "This time the sign-in provider needs your current password too. Type it below and press the button again." });
      } else {
        setNote({ kind: "error", text: messageOf(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" autoComplete="off">
      {askCurrent && (
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
      <Button type="submit" size="sm" disabled={busy || next.length === 0 || (askCurrent && current.length === 0)}>
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
