import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaturnXLogo } from "@/components/SaturnXLogo";
import { BrandName } from "@/components/BrandName";

const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type ClerkLikeError = { errors?: { code?: string; longMessage?: string; message?: string }[]; message?: string };

const KNOWN: Record<string, string> = {
  form_identifier_not_found: "No account with this email. Check the spelling or create an account.",
  form_password_incorrect: "The password is not correct. Use \"Forgot password?\" if you do not remember it.",
  form_identifier_exists: "An account with this email already exists. Please log in instead.",
  form_password_pwned: "This password has appeared in a data leak, so it is not accepted. Choose a different one.",
  form_password_not_strong_enough: "This password is too easy to guess. Add more letters, numbers or symbols.",
  form_password_length_too_short: "The password is too short (use at least 8 characters).",
  form_code_incorrect: "That code is not correct. Check it and try again.",
  verification_expired: "That code has expired. Ask for a new one.",
  too_many_requests: "Too many tries. Please wait a minute and try again.",
  session_exists: "You are already logged in. Open the home page.",
};

function messageOf(err: unknown): string {
  const e = err as ClerkLikeError;
  const code = e?.errors?.[0]?.code ?? "";
  if (KNOWN[code]) return KNOWN[code];
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? e?.message ?? "Something went wrong. Please try again.";
}

/** Asks the browser (Chrome, Edge, Android) to offer saving the password it just saw, so it fills in next time. */
async function offerToSavePassword(email: string, password: string, name?: string) {
  try {
    const W = window as unknown as { PasswordCredential?: new (d: { id: string; password: string; name?: string }) => Credential };
    if (W.PasswordCredential && navigator.credentials?.store) await navigator.credentials.store(new W.PasswordCredential({ id: email, password, name }));
  } catch {
    /* the browser may not support it; the normal autofill prompt still works */
  }
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center justify-center gap-2">
          <SaturnXLogo size={32} />
          <BrandName />
        </div>
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, id, ...rest } = props;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-semibold text-foreground">{label}</Label>
      <Input id={id} {...rest} />
    </div>
  );
}

const Error = ({ text }: { text: string }) => (text ? <p role="alert" className="text-sm text-red-700">{text}</p> : null);

function CodeStep({ email, onSubmit, onResend, busy, error }: { email: string; onSubmit: (code: string) => void; onResend: () => void; busy: boolean; error: string }) {
  const [code, setCode] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(code.trim()); }} className="space-y-3">
      <p className="text-sm text-foreground">We sent a code to <strong>{email}</strong>. Type it here.</p>
      <Field id="code" name="code" label="Code from your email" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
      <Error text={error} />
      <Button type="submit" className="w-full" disabled={busy || !code.trim()}>{busy ? "Checking..." : "Continue"}</Button>
      <button type="button" onClick={onResend} className="text-sm underline text-foreground">Send the code again</button>
    </form>
  );
}

export function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"password" | "second" | "forgot" | "reset" | "newpass">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish(res: { status: string | null; createdSessionId: string | null }, secret?: string) {
    if (res.status === "complete" && res.createdSessionId) {
      if (secret) await offerToSavePassword(email, secret);
      await setActive!({ session: res.createdSessionId });
      navigate("/oracle");
      return true;
    }
    return false;
  }

  const signInWithPassword = () =>
    run(async () => {
      const res = await signIn!.create({ identifier: email.trim(), password });
      if (await finish(res, password)) return;
      // Only if the account's settings still ask for an emailed code on a new device.
      if (res.status === "needs_second_factor" || (res.status as string) === "needs_client_trust") {
        await signIn!.prepareSecondFactor({ strategy: "email_code" });
        setMode("second");
        return;
      }
      setError("This account needs another sign-in step. Use \"Other ways to log in\" below.");
    });

  const sendResetCode = () =>
    run(async () => {
      await signIn!.create({ strategy: "reset_password_email_code", identifier: email.trim() });
      setMode("reset");
      setInfo("");
    });

  if (!isLoaded) return <Frame title="Log in"><p className="text-sm text-muted-foreground">Loading...</p></Frame>;

  if (mode === "second") {
    return (
      <Frame title="Check your email">
        <CodeStep
          email={email}
          busy={busy}
          error={error}
          onResend={() => void run(async () => { await signIn!.prepareSecondFactor({ strategy: "email_code" }); setInfo("A new code was sent."); })}
          onSubmit={(code) => void run(async () => { const res = await signIn!.attemptSecondFactor({ strategy: "email_code", code }); await finish(res, password); })}
        />
        {info && <p className="text-sm text-foreground">{info}</p>}
      </Frame>
    );
  }

  if (mode === "forgot") {
    return (
      <Frame title="Forgot password">
        <form onSubmit={(e) => { e.preventDefault(); void sendResetCode(); }} className="space-y-3">
          <p className="text-sm text-foreground">Type your email. We will send a code so you can choose a new password. This is the only time a code is needed.</p>
          <Field id="email" name="email" type="email" label="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Error text={error} />
          <Button type="submit" className="w-full" disabled={busy || !email.trim()}>{busy ? "Sending..." : "Send me a code"}</Button>
          <button type="button" onClick={() => { setMode("password"); setError(""); }} className="text-sm underline text-foreground">Back to log in</button>
        </form>
      </Frame>
    );
  }

  if (mode === "reset") {
    return (
      <Frame title="Check your email">
        <CodeStep
          email={email}
          busy={busy}
          error={error}
          onResend={() => void sendResetCode()}
          onSubmit={(code) =>
            void run(async () => {
              const res = await signIn!.attemptFirstFactor({ strategy: "reset_password_email_code", code });
              if (res.status === "needs_new_password") setMode("newpass");
              else await finish(res);
            })
          }
        />
      </Frame>
    );
  }

  if (mode === "newpass") {
    return (
      <Frame title="Choose a new password">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const res = await signIn!.resetPassword({ password });
              await finish(res, password);
            });
          }}
          className="space-y-3"
        >
          <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
          <Field id="new-password" name="password" type="password" label="New password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Error text={error} />
          <Button type="submit" className="w-full" disabled={busy || password.length < 8}>{busy ? "Saving..." : "Save password and log in"}</Button>
        </form>
      </Frame>
    );
  }

  return (
    <Frame title="Log in">
      <form onSubmit={(e) => { e.preventDefault(); void signInWithPassword(); }} className="space-y-3" method="post">
        <Field id="email" name="email" type="email" label="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field id="password" name="password" type="password" label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Error text={error} />
        <Button type="submit" className="w-full" disabled={busy || !email.trim() || !password}>{busy ? "Logging in..." : "Log in"}</Button>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" onClick={() => { setMode("forgot"); setError(""); }} className="underline text-foreground">Forgot password?</button>
        <Link href="/sign-up" className="underline text-foreground">Create an account</Link>
      </div>
      <a href={`${base}/sign-in?classic=1`} className="block text-xs text-muted-foreground underline">Other ways to log in (for example Google)</a>
    </Frame>
  );
}

export function SignUpForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"form" | "code">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish(res: { status: string | null; createdSessionId: string | null }) {
    if (res.status === "complete" && res.createdSessionId) {
      await offerToSavePassword(email.trim(), password, name.trim());
      await setActive!({ session: res.createdSessionId });
      navigate("/oracle");
      return true;
    }
    return false;
  }

  if (!isLoaded) return <Frame title="Create your account"><p className="text-sm text-muted-foreground">Loading...</p></Frame>;

  if (step === "code") {
    return (
      <Frame title="Check your email">
        <CodeStep
          email={email}
          busy={busy}
          error={error}
          onResend={() => void run(async () => { await signUp!.prepareEmailAddressVerification({ strategy: "email_code" }); })}
          onSubmit={(code) => void run(async () => { const res = await signUp!.attemptEmailAddressVerification({ code }); if (!(await finish(res))) setError("Something is still missing on this account. Please try again."); })}
        />
      </Frame>
    );
  }

  return (
    <Frame title="Create your account">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const res = await signUp!.create({ firstName: name.trim(), emailAddress: email.trim(), password });
            if (await finish(res)) return;
            // Only if the account settings still require the email to be confirmed.
            if (res.unverifiedFields?.includes("email_address")) {
              await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
              setStep("code");
              return;
            }
            setError("This account needs another step. Use \"Other ways to sign up\" below.");
          });
        }}
        className="space-y-3"
        method="post"
      >
        <Field id="name" name="name" label="Your name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Field id="email" name="email" type="email" label="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field id="password" name="password" type="password" label="Password (at least 8 characters)" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Error text={error} />
        <Button type="submit" className="w-full" disabled={busy || !name.trim() || !email.trim() || password.length < 8}>{busy ? "Creating..." : "Create account"}</Button>
      </form>
      <Link href="/sign-in" className="block text-sm underline text-foreground">I already have an account</Link>
      <a href={`${base}/sign-up?classic=1`} className="block text-xs text-muted-foreground underline">Other ways to sign up (for example Google)</a>
    </Frame>
  );
}
