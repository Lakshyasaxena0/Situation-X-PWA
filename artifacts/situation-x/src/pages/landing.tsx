import { SaturnXLogo, SituationFullLogo } from "@/components/SaturnXLogo";
import { BrandName } from "@/components/BrandName";

const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/** The landing page uses the logo's own paper colour (#f8f9f3) so the logo blends in with no visible box. */
const LANDING_THEME = {
  "--background": "70 33% 96.5%",
  "--foreground": "222 40% 12%",
  "--border": "60 12% 84%",
  "--muted": "60 18% 91%",
  "--muted-foreground": "220 10% 36%",
  "--primary": "38 92% 50%",
  "--primary-foreground": "222 47% 8%",
} as React.CSSProperties;

export default function Landing() {
  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col overflow-hidden" style={LANDING_THEME}>
      {/* Logo watermark */}
      <img
        src={`${base}/logo-mark.png`}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(95vw,820px)] opacity-[0.07]"
      />
      {/* Header */}
      <header className="relative border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SaturnXLogo size={32} />
          <BrandName />
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${base}/sign-in`}
            className="px-5 py-2 rounded text-sm font-medium transition-colors border border-border hover:bg-muted text-foreground"
          >
            Sign In
          </a>
          <a
            href={`${base}/sign-up`}
            className="px-5 py-2 rounded text-sm font-semibold transition-colors bg-primary text-primary-foreground hover:opacity-90"
          >
            Get Started
          </a>
        </div>
      </header>

      {/* Hero */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-8">
          <SituationFullLogo width={420} />
        </div>

        <h1 className="sr-only">
          Situation X
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mb-10 leading-relaxed">
          Combines intent detection, emotion mapping, path simulation, and Vedic astrology into a single structured analysis of any situation you face.
        </p>

        <div className="flex items-center gap-3">
          <a
            href={`${base}/sign-up`}
            className="px-8 py-3 rounded font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Get Started
          </a>
          <a
            href={`${base}/sign-in`}
            className="px-8 py-3 rounded font-semibold border border-border text-foreground hover:bg-muted transition-colors"
          >
            Sign In
          </a>
        </div>
        {/* Android app: built by the "Build Android APK" workflow and published as a GitHub Release. */}
        <a
          href="https://github.com/Lakshyasaxena0/Situation-X-PWA/releases/latest/download/Situation-X.apk"
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Download the Android app (APK)
        </a>
      </main>

      <footer className="relative border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        Situation X — Analytical intelligence for complex decisions.
      </footer>
    </div>
  );
}
