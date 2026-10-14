import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAnalyzeSituation, useEstimateAnalysisCost, getGetCreditsQueryKey, useTranslateAnalysis, type AnalysisResult, type CostLine, type ModuleReport, type TimingResult } from "@workspace/api-client-react";
import { InviteCta } from "@/components/InviteCta";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, CheckCircle2, MinusCircle, Loader2 } from "lucide-react";
import { applyTexts, type Texts } from "@/lib/translation";
import { requestOptions, useSettings } from "@/lib/settings";
import { analysisSession } from "@/lib/analysisSession";

type RiskLevel = "low" | "medium" | "high";
type Signal = "favorable" | "challenging" | "neutral";
type Outcome = "positive" | "negative" | "mixed";

function riskColor(level?: RiskLevel) {
  if (level === "low") return "text-green-700 bg-green-500/10 border-green-600/30";
  if (level === "high") return "text-red-700 bg-red-500/10 border-red-600/30";
  return "text-amber-700 bg-amber-500/10 border-amber-600/30";
}

function signalColor(s?: Signal) {
  if (s === "favorable") return "text-green-700";
  if (s === "challenging") return "text-red-700";
  return "text-secondary";
}

function outcomeColor(o?: Outcome) {
  if (o === "positive") return "text-green-700";
  if (o === "negative") return "text-red-700";
  return "text-amber-700";
}

function intensityColor(i?: string) {
  if (i === "high") return "text-red-700 bg-red-500/10";
  if (i === "medium") return "text-amber-700 bg-amber-500/10";
  return "text-secondary bg-secondary/10";
}

function Badge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold border ${className}`}>
      {label.toUpperCase()}
    </span>
  );
}

type SimulationView = AnalysisResult["simulation"];

function BulletList({ title, items, tone }: { title: string; items?: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={`text-[11px] font-mono mb-0.5 ${tone}`}>{title}</div>
      <ul className="list-disc pl-4 space-y-0.5 text-xs text-foreground">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Looking at a path is free. Running it as a question of its own is a new analysis, charged at half
 * price: the price is shown first and nothing happens until the person confirms.
 */
function PathAnalyse({ analysisId, pathIndex }: { analysisId: number; pathIndex: number }) {
  const [settings] = useSettings();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const estimate = useEstimateAnalysisCost();
  const analyze = useAnalyzeSituation();
  const body = { situation: "Analyse this path from my earlier analysis", depth: settings.depth, fromPath: { analysisId, pathIndex }, ...requestOptions(settings) };

  function ask() {
    setAsking(true);
    estimate.mutate({ data: body });
  }
  function confirm() {
    analyze.mutate(
      { data: body },
      {
        onSuccess: (data) => {
          analysisSession.set({ situation: data.situation ?? "", result: data });
          void queryClient.invalidateQueries({ queryKey: getGetCreditsQueryKey() });
          navigate("/oracle");
          window.scrollTo({ top: 0 });
        },
        onError: () => void queryClient.invalidateQueries({ queryKey: getGetCreditsQueryKey() }),
      },
    );
  }

  const quote = estimate.data;
  const status = (analyze.error as { status?: number } | null)?.status;
  if (!asking) {
    return (
      <button type="button" onClick={ask} className="mt-2 text-xs rounded border border-primary px-2.5 py-1 text-foreground hover:bg-primary/15">
        Analyse this path as a new question
      </button>
    );
  }
  return (
    <div className="mt-2 rounded border border-border bg-card p-3 text-xs space-y-2">
      {estimate.isPending && <p className="text-muted-foreground">Checking the price...</p>}
      {estimate.isError && <p className="text-red-700">Could not check the price. Try again.</p>}
      {quote && (
        <>
          <p className="text-foreground">
            This runs as a new analysis of this path.{" "}
            {quote.billingActive ? (
              <>
                It uses <strong>{quote.total} credits</strong> (half price, because it continues this analysis). You have {quote.balance}.
              </>
            ) : (
              "No credits are charged right now."
            )}
          </p>
          {quote.billingActive && <CostLines lines={quote.lines} />}
          {quote.billingActive && !quote.enough && (
            <p className="text-red-700">
              You need {quote.total - quote.balance} more credits.{" "}
              <Link href="/pricing" className="underline underline-offset-2">Get credits</Link>
            </p>
          )}
        </>
      )}
      {analyze.isError && <p className="text-red-700">{status === 402 ? "Not enough credits." : "Analysis failed. Please try again."}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={!quote || analyze.isPending || (quote.billingActive && !quote.enough)}
          className="rounded bg-primary px-3 py-1 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {analyze.isPending ? "Running..." : "Run it"}
        </button>
        <button type="button" onClick={() => setAsking(false)} disabled={analyze.isPending} className="rounded border border-border px-3 py-1 text-muted-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** One path: its levels always visible, benefits / downsides / uncertainties one tap away. */
function PathView({ path, best = false, analysisId, pathIndex }: { path: SimulationView["bestPath"]; best?: boolean; analysisId?: number; pathIndex: number }) {
  const [open, setOpen] = useState(best);
  const hasDetail = (path.benefits?.length ?? 0) + (path.downsides?.length ?? 0) + (path.uncertainties?.length ?? 0) > 0;
  return (
    <div className={`${best ? "bg-muted/60" : "bg-muted/40"} rounded p-3`}>
      <p className={`text-sm mb-2 ${best ? "text-foreground font-medium" : "text-foreground"}`}>{path.action}</p>
      <div className="flex gap-2 flex-wrap">
        <Badge label={`risk: ${path.risk}`} className={riskColor(path.risk as RiskLevel)} />
        <Badge label={`stability: ${path.stability}`} className="text-secondary bg-secondary/10 border-secondary/30" />
        <Badge label={path.outcome} className={`border ${outcomeColor(path.outcome as Outcome)} bg-transparent border-current/30`} />
        {path.reversible !== undefined && (
          <Badge label={path.reversible ? "can be undone" : "hard to undo"} className="text-muted-foreground bg-muted border-border" />
        )}
      </div>
      {hasDetail && (
        <>
          <button type="button" onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2" aria-expanded={open}>
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {open ? "Hide details" : "Benefits, downsides, unknowns"}
          </button>
          {open && (
            <div className="mt-2 space-y-2">
              <BulletList title="BENEFITS" items={path.benefits} tone="text-green-700" />
              <BulletList title="DOWNSIDES" items={path.downsides} tone="text-red-700" />
              <BulletList title="UNCERTAIN" items={path.uncertainties} tone="text-muted-foreground" />
            </div>
          )}
        </>
      )}
      {analysisId !== undefined && <PathAnalyse analysisId={analysisId} pathIndex={pathIndex} />}
    </div>
  );
}

function SituationContextView({ ctx }: { ctx: NonNullable<SimulationView["context"]> }) {
  if (!ctx.desiredOutcome && ctx.knownFacts.length === 0 && ctx.constraints.length === 0) return null;
  return (
    <div className="rounded border border-border bg-card px-3 py-2 space-y-2">
      <div className="text-xs font-semibold text-foreground">Your situation, as understood</div>
      {ctx.desiredOutcome && (
        <p className="text-sm text-foreground">
          <span className="font-semibold">You want: </span>
          {ctx.desiredOutcome}
          {ctx.inferred && <span className="text-xs text-muted-foreground"> (not stated, guessed from the question)</span>}
        </p>
      )}
      <BulletList title="FACTS YOU GAVE" items={ctx.knownFacts} tone="text-muted-foreground" />
      <BulletList title="LIMITS" items={ctx.constraints} tone="text-muted-foreground" />
    </div>
  );
}

/** Splits a text into short points: lines first, then sentences. Leading bullets are removed. */
export function toPoints(text?: string | null): string[] {
  if (!text) return [];
  const lines = text.split(/\n+/).map((l) => l.replace(/^\s*(?:[•\-*]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  const one = lines[0] ?? "";
  const sentences = one.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [one];
  return sentences.length > 1 ? sentences : [one];
}

function Points({ items, className = "" }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={`list-disc pl-5 space-y-1 text-sm ${className}`}>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/** A module card that stays closed until tapped; the closed card shows a one-line result. */
function EngineCard({ code, title, summary, children, defaultOpen = false }: { code: string; title: string; summary?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-card-border rounded-lg shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full text-left p-4 sm:p-5">
        <span className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-primary-foreground bg-primary px-2 py-0.5 rounded">{code}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="ml-auto shrink-0 text-muted-foreground">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
        </span>
        {!open && summary && <span className="mt-2 block text-sm text-foreground">{summary}</span>}
      </button>
      {open && <div className="border-t border-border px-4 pb-4 pt-4 sm:px-5 sm:pb-5">{children}</div>}
    </motion.div>
  );
}

/** Which modules took part and what each one concluded about this question. */
function ModuleReports({ reports, heading }: { reports: ModuleReport[]; heading: string }) {
  if (reports.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {reports.some((m) => m.active) && <div className="text-xs font-semibold text-foreground">{heading}</div>}
      {reports.map((m) =>
        m.active ? (
          <div key={m.key} className="rounded-md bg-muted/50 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-700" />
              <div className="min-w-0">
                {m.role && <p className="text-xs text-muted-foreground italic mb-1">{m.role}</p>}
                <p className="text-sm font-medium text-foreground">{m.verdict}</p>
                {m.evidence.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground space-y-1">
                    {m.evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div key={m.key} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <MinusCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{m.name}</span>
            <span className="ml-auto text-[10px] font-mono uppercase">not activated</span>
          </div>
        ),
      )}
    </div>
  );
}

export function CostLines({ lines }: { lines: CostLine[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {lines.map((l) => (
        <li key={l.key} className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span>
            <span className="text-foreground">{l.label}</span> - {l.note}
          </span>
          <span className="shrink-0 text-foreground">{l.credits}</span>
        </li>
      ))}
    </ul>
  );
}

function CreditsUsedCard({ result }: { result: AnalysisResult }) {
  const c = result.credits;
  if (!c?.billingActive) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Credits used: {c.charged}</h3>
        {c.balance !== null && c.balance !== undefined && (
          <span className="text-xs text-muted-foreground">
            {c.balance} left ·{" "}
            <Link href="/pricing" className="text-primary underline underline-offset-2">
              add credits
            </Link>
          </span>
        )}
      </div>
      <CostLines lines={c.lines} />
      <InviteCta className="mt-4" />
    </div>
  );
}

const dateRange = (a: string, b: string) => `${a} to ${b}`;

function TimingSection({ timing }: { timing: TimingResult }) {
  const v = timing.vimshottari;
  const [showCycle, setShowCycle] = useState(false);
  return (
    <div className="space-y-3">
      <div className="text-xs font-mono text-muted-foreground border-t border-border pt-3">
        DASHA TIMING &middot; Prashna chart of this moment
        <span className="ml-2 text-primary-foreground bg-primary px-1.5 py-0.5 rounded">time-based question</span>
      </div>
      <p className="text-sm text-muted-foreground">{timing.summary}</p>

      <div className="rounded-md bg-muted/50 p-3">
        <div className="text-xs font-mono font-bold text-foreground mb-2">VIMSHOTTARI</div>
        <div className="space-y-1 text-xs">
          {[
            { label: "Maha", level: v.mahadasha },
            { label: "Antar", level: v.antardasha },
            { label: "Pratyantar", level: v.pratyantardasha },
            { label: "Sookshma", level: v.sookshmadasha },
          ].map((d, i) => (
            <div key={d.label} className="flex flex-wrap items-center gap-x-2" style={{ paddingLeft: `${i * 10}px` }}>
              <span className="text-muted-foreground w-20 shrink-0">{d.label}</span>
              <span className="text-foreground font-semibold">{d.level.planet}</span>
              <span className="text-muted-foreground">{dateRange(d.level.startDate, d.level.endDate)}</span>
            </div>
          ))}
        </div>
      </div>

      {timing.chara && (
        <div className="rounded-md bg-muted/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-mono font-bold text-foreground">CHARA DASHA (Jaimini) &middot; {timing.chara.direction}</div>
            <button type="button" onClick={() => setShowCycle((x) => !x)} className="text-xs text-primary underline underline-offset-2">
              {showCycle ? "hide cycle" : "show full cycle"}
            </button>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground w-20 shrink-0">Maha</span>
              <span className="text-foreground font-semibold">{timing.chara.mahadasha.sign}</span>
              <span className="text-muted-foreground">{dateRange(timing.chara.mahadasha.startDate, timing.chara.mahadasha.endDate)} ({timing.chara.mahadasha.years} y)</span>
            </div>
            <div className="flex flex-wrap gap-x-2" style={{ paddingLeft: 10 }}>
              <span className="text-muted-foreground w-20 shrink-0">Antar</span>
              <span className="text-foreground font-semibold">{timing.chara.antardasha.sign}</span>
              <span className="text-muted-foreground">{dateRange(timing.chara.antardasha.startDate, timing.chara.antardasha.endDate)}</span>
            </div>
          </div>
          {showCycle && (
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {timing.chara.sequence.map((p) => (
                <li key={p.sign + p.startDate} className={p.sign === timing.chara!.mahadasha.sign ? "text-foreground font-semibold" : ""}>
                  {p.sign}: {p.startDate.slice(0, 4)}-{p.endDate.slice(0, 4)} ({p.years} y)
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">{timing.chara.notes[0]}</p>
        </div>
      )}

      {timing.activations.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <div className="font-mono font-bold text-foreground mb-1">PERIODS THAT TOUCH THIS QUESTION (house {timing.house}, {timing.houseSign})</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {timing.activations.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const DEFAULT_PLACE = { latitude: 28.6139, longitude: 77.209 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-foreground">{title}</div>
      {children}
    </div>
  );
}

/** ASTRO: will it happen (chance in %), and by when. The chart facts it used are listed in short points. */
function AstroCard({ result }: { result: AnalysisResult }) {
  const [settings] = useSettings();
  const [showDasha, setShowDasha] = useState(false);
  const astroOn = result.options?.useAstrology !== false;
  const astro = result.astro;
  const o = astro.outlook;
  // Older saved analyses stored the whole chart; only its rising sign is shown, never the chart itself.
  const legacy = astro as unknown as { vedicD1?: { ascendant: string; ascendantDegree: number } };
  const asc = astro.ascendant ?? (legacy.vedicD1 ? { sign: legacy.vedicD1.ascendant, degree: legacy.vedicD1.ascendantDegree, lord: "" } : null);

  if (!astroOn) {
    const why = astro.skippedReason ? `Skipped, as you chose in Settings. ${astro.skippedReason}` : "Not activated (switched off in Settings).";
    return (
      <EngineCard code="ASTRO" title="Astrology (Prashna chart)" summary={<span className="text-muted-foreground">{why}</span>}>
        <p className="text-sm text-muted-foreground">{why}</p>
      </EngineCard>
    );
  }

  const loc = astro.location;
  const isDefault = !loc || (Math.abs(loc.latitude - DEFAULT_PLACE.latitude) < 0.001 && Math.abs(loc.longitude - DEFAULT_PLACE.longitude) < 0.001);
  const placeName = isDefault ? "New Delhi (default)" : settings.location && Math.abs(settings.location.latitude - loc.latitude) < 0.01 ? settings.location.name : "the place you set";
  const chanceColor = !o ? "" : o.level === "high" ? "bg-green-600" : o.level === "fair" ? "bg-amber-500" : "bg-red-600";
  const summary = o ? (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-semibold">{o.chance}% chance</span>
      <span className="text-muted-foreground">{o.timing ? `Expected: ${o.timing.text}` : "No clear date from the chart"}</span>
    </span>
  ) : (
    <span className={signalColor(astro.influence.signal as Signal)}>{astro.influence.signal}</span>
  );

  return (
    <EngineCard code="ASTRO" title="Astrology (Prashna chart)" summary={summary} defaultOpen={settings.expandAstrology}>
      <div className="space-y-4">
        {o ? (
          <>
            <Section title="1. Will it happen?">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-foreground">{o.chance}%</span>
                <div className="flex-1">
                  <div className="h-2 rounded bg-muted overflow-hidden" role="img" aria-label={`${o.chance} percent chance`}>
                    <div className={`h-full ${chanceColor}`} style={{ width: `${o.chance}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{o.headline}</p>
                </div>
              </div>
              {o.favours.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono text-green-700 mb-0.5">WHAT HELPS</div>
                  <Points items={o.favours} className="text-foreground" />
                </div>
              )}
              {o.against.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono text-red-700 mb-0.5">WHAT HOLDS IT BACK</div>
                  <Points items={o.against} className="text-foreground" />
                </div>
              )}
            </Section>

            <Section title="2. By when?">
              {o.timing ? (
                <Points
                  className="text-foreground"
                  items={[
                    `Expected time: ${o.timing.text}, between ${o.timing.from} and ${o.timing.to}.`,
                    `How sure: ${o.timing.confidence}. It is a guide, not a promise.`,
                    o.timing.basis,
                    ...(o.timing.dashaCheck ? [o.timing.dashaCheck] : []),
                  ]}
                />
              ) : (
                <Points className="text-foreground" items={[o.timingNote ?? "The chart gives no clear date."]} />
              )}
            </Section>
          </>
        ) : (
          <Points className="text-foreground" items={toPoints(astro.interpretation)} />
        )}

        {(astro.prashna?.trace?.length ?? 0) > 0 && (
          <Section title="3. How the chart reads">
            <div className="space-y-2">
              {astro.prashna?.trace?.map((t, i) => (
                <details key={i} className="rounded-md bg-muted/40 px-3 py-2" open={i === 0}>
                  <summary className="cursor-pointer text-sm font-medium text-foreground">{t.title}</summary>
                  <Points items={t.points} className="mt-2 text-foreground" />
                </details>
              ))}
            </div>
          </Section>
        )}

        <Section title={o ? "4. Chart used" : "Chart used"}>
          <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
            {asc && (
              <li>
                Rising sign (Lagna): <strong>{asc.sign}</strong> {asc.degree.toFixed(2)}&deg;{asc.lord ? `, ruled by ${asc.lord}` : ""}
              </li>
            )}
            {astro.prashna && (
              <li>
                Moon in {astro.prashna.moonSign} ({astro.prashna.moonNakshatra}, {astro.prashna.moonWaxing ? "growing" : "shrinking"})
              </li>
            )}
            {astro.prashna && <li>Topic read: {astro.prashna.topic}</li>}
            {loc && (
              <li>
                Place used: <strong>{placeName}</strong> (lat {loc.latitude.toFixed(2)}, lon {loc.longitude.toFixed(2)})
                {isDefault && (
                  <>
                    {" "}
                    &middot; <Link href="/settings" className="text-primary underline underline-offset-2">set your place</Link> for a more exact chart
                  </>
                )}
              </li>
            )}
            <li>Chart is cast for the moment you asked.</li>
          </ul>
        </Section>

        {astro.timing && (
          <div>
            <button type="button" onClick={() => setShowDasha((x) => !x)} aria-expanded={showDasha} className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">
              {showDasha ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showDasha ? "Hide dasha details" : "Show dasha details (for timing questions)"}
            </button>
            {showDasha && <div className="mt-3"><TimingSection timing={astro.timing} /></div>}
          </div>
        )}
      </div>
    </EngineCard>
  );
}

const LIKELIHOOD_STYLE: Record<string, string> = {
  "more likely": "bg-primary/20 text-foreground border-primary/40",
  possible: "bg-muted text-foreground border-border",
  "less likely": "bg-transparent text-muted-foreground border-border",
};

/** AJIT: a clever but ethical way round a direct route that looks closed. Shown only when the question says so, below the intent. */
function IndirectRouteView({ route }: { route: AnalysisResult["indirectRoute"] }) {
  if (!route) return null;
  return (
    <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-foreground">Another way round</p>
      <p className="text-xs text-muted-foreground">What is in the way: {route.blocker}</p>
      <p className="text-sm text-foreground">{route.idea}</p>
      <div>
        <div className="text-[11px] font-mono text-muted-foreground mb-0.5">STEPS</div>
        <ol className="text-sm text-foreground space-y-1 list-decimal pl-5">
          {route.steps.map((st, i) => <li key={i}>{st}</li>)}
        </ol>
      </div>
      <p className="text-xs text-muted-foreground">Why it is fair: {route.fairness}</p>
    </div>
  );
}

/** RSMI: the meanings a described silence can have. Only shown when the question mentioned a silence. */
function SilenceCard({ result }: { result: AnalysisResult }) {
  const s = result.silence;
  if (!s) return null;
  const who = s.subject === "self" ? "Your silence" : s.who ? `${s.who[0].toUpperCase()}${s.who.slice(1)}'s silence` : "The silence";
  const where = { in_person: "in conversation", message: "in messages", call: "on calls", organisation: "from an organisation" }[s.channel];
  const top = s.meanings[0];
  return (
    <EngineCard code="RSMI" title="Silence reading" summary={top ? <>Most likely: {top.meaning}</> : undefined}>
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          {who} {where}, after {s.trigger}
          {s.duration.text ? ` (${s.duration.text})` : ""}.
        </p>
        <div>
          <div className="text-xs font-semibold text-foreground mb-1">What it may mean</div>
          <ul className="space-y-2.5">
            {s.meanings.map((m, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 mt-0.5 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${LIKELIHOOD_STYLE[m.likelihood] ?? ""}`}>{m.likelihood}</span>
                  <span className="text-foreground font-medium">{m.meaning}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{m.why}</p>
              </li>
            ))}
          </ul>
        </div>
        {s.checks.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-foreground mb-1">How to find out</div>
            <Points items={s.checks} className="text-foreground" />
          </div>
        )}
        {s.unknowns.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-foreground mb-1">Not known yet</div>
            <Points items={s.unknowns} className="text-foreground" />
          </div>
        )}
        <p className="text-xs text-muted-foreground">{s.caution}</p>
        {result.clarifications && result.clarifications.length > 0 && (
          <p className="text-xs text-muted-foreground">Used your answers: {result.clarifications.map((c) => c.answer).join("; ")}.</p>
        )}
        <ModuleReports reports={reportsFor(result, "silence")} heading="What the RSMI module found" />
      </div>
    </EngineCard>
  );
}

function reportsFor(result: AnalysisResult, area: ModuleReport["area"]): ModuleReport[] {
  return (result.modules ?? []).filter((m) => m.area === area);
}

type LangChoice = "original" | "en" | "hi" | "hinglish";
const LANG_CHOICES: { value: LangChoice; label: string }[] = [
  { value: "original", label: "As written" },
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "hinglish", label: "Hinglish" },
];

/** Lets the person read the finished analysis in another language (the sentences are translated; numbers stay). */
function LanguageSwitch({ result, lang, setLang, busy, error }: { result: AnalysisResult; lang: LangChoice; setLang: (l: LangChoice) => void; busy: boolean; error: string }) {
  if (!result.id) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
      <span className="text-xs text-muted-foreground">Read this in:</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Language of this analysis">
        {LANG_CHOICES.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={lang === o.value}
            disabled={busy}
            onClick={() => setLang(o.value)}
            className={`px-2.5 py-1 rounded border text-xs transition-colors ${lang === o.value ? "border-primary bg-primary/20 text-foreground font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}

export function AnalysisDisplay({ result: original }: { result: AnalysisResult }) {
  const [settings] = useSettings();
  const translate = useTranslateAnalysis();
  const [lang, setLang] = useState<LangChoice>("original");
  const [cache, setCache] = useState<Record<string, Texts>>({});
  const [error, setError] = useState("");

  // A different analysis starts again from its own text.
  useEffect(() => {
    setLang("original");
    setCache({});
    setError("");
  }, [original.id]);

  // Changing the language in Settings while an analysis is on screen switches this analysis too.
  const firstSettingsRun = useRef(true);
  useEffect(() => {
    if (firstSettingsRun.current) {
      firstSettingsRun.current = false;
      return;
    }
    choose(settings.language === "auto" ? "original" : settings.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.language]);

  function choose(next: LangChoice) {
    setError("");
    setLang(next);
    if (next === "original" || cache[next] || !original.id) return;
    translate.mutate(
      { id: original.id, data: { language: next } },
      {
        onSuccess: (data) => setCache((c) => ({ ...c, [next]: data.texts as Texts })),
        onError: () => {
          setError("Could not translate right now. Showing the original.");
          setLang("original");
        },
      },
    );
  }

  const result = lang === "original" ? original : applyTexts(original, cache[lang]);
  return <AnalysisBody result={result} header={<LanguageSwitch result={original} lang={lang} setLang={choose} busy={translate.isPending} error={error} />} />;
}

function sourceLabel(syn: NonNullable<AnalysisResult["synthesis"]>, aiOff: boolean): string {
  if (syn.source === "ai+astro") return "Online AI + astrology";
  if (syn.source === "ai") return "Online AI";
  if (aiOff) return syn.usedAstrology ? "Modules + astrology (AI is off in Settings)" : "Modules only";
  return syn.usedAstrology ? "Built-in reasoning + astrology" : "Built-in reasoning";
}

function summaryLine(result: AnalysisResult, area: ModuleReport["area"]): React.ReactNode {
  const m = reportsFor(result, area)[0];
  if (!m) return undefined;
  return m.active ? m.verdict : <span className="text-muted-foreground">Not activated for this question.</span>;
}

function AnalysisBody({ result, header }: { result: AnalysisResult; header: React.ReactNode }) {
  const syn = result.synthesis;
  const aiReport = (result.modules ?? []).find((m) => m.key === "AI");
  const aiOff = result.options?.useAi === false;
  const outlook = result.astro?.outlook;
  const reasoningPoints = toPoints(syn?.reasoning);
  const summaryPoints = toPoints(result.summary);
  return (
    <div className="space-y-3 mt-6">
      {header}
      {result.safety && (result.safety.action === "support" || result.safety.action === "redirect") && result.safety.message && (
        <div role="note" className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm leading-relaxed text-foreground">
          {result.safety.message}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`border rounded-lg p-4 sm:p-5 ${
          result.finalVerdict.riskLevel === "low" ? "border-green-600/40 bg-green-500/5" : result.finalVerdict.riskLevel === "high" ? "border-red-600/40 bg-red-500/5" : "border-amber-600/40 bg-amber-500/5"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-mono font-bold text-foreground">YOUR ANSWER</span>
          <Badge label={`${result.finalVerdict.riskLevel} risk`} className={riskColor(result.finalVerdict.riskLevel as RiskLevel)} />
          {syn && <Badge label={syn.verdict} className="text-foreground bg-muted border-border" />}
        </div>
        <p className="text-base font-semibold text-foreground mb-3">{result.finalVerdict.recommendedAction}</p>
        <Points items={summaryPoints} className="text-foreground" />

        {syn && (
          <div className="mt-4 space-y-4 text-sm">
            {outlook && result.options?.useAstrology !== false && (
              <div className="rounded border border-border/60 bg-muted/30 p-3">
                <div className="text-xs font-semibold text-foreground mb-1">What the chart says</div>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  <li>
                    Chance it happens: <strong>{outlook.chance}%</strong> ({outlook.level})
                  </li>
                  <li>{outlook.timing ? <>Expected time: <strong>{outlook.timing.text}</strong> ({outlook.timing.from} to {outlook.timing.to})</> : "No clear date from the chart."}</li>
                  {syn.astroAlignment && (
                    <li className={syn.astroAlignment === "supports" ? "text-green-700" : syn.astroAlignment === "contradicts" ? "text-red-700" : "text-amber-700"}>
                      {syn.astroAlignment === "supports" ? "The chart agrees with the reasoning." : syn.astroAlignment === "contradicts" ? "The chart disagrees with the reasoning, so go carefully." : "The chart partly agrees with the reasoning."}
                    </li>
                  )}
                </ul>
              </div>
            )}
            {reasoningPoints.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-foreground mb-1">Why</div>
                <Points items={reasoningPoints} className="text-foreground" />
              </div>
            )}
            {syn.risks && syn.risks.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-foreground mb-1">Risks</div>
                <Points items={syn.risks} className="text-foreground" />
              </div>
            )}
            {syn.keyUnknowns && syn.keyUnknowns.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-foreground mb-1">What could change this</div>
                <Points items={syn.keyUnknowns} className="text-foreground" />
              </div>
            )}
            <div>
              <div className="text-xs font-semibold text-foreground mb-1">What to do next</div>
              {syn.nextSteps && syn.nextSteps.length > 0 ? (
                <ol className="list-decimal pl-5 space-y-1 text-foreground">
                  {syn.nextSteps.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
              ) : (
                <Points items={toPoints(syn.advice)} className="text-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Score {result.overallScore}/100 &middot; confidence {syn.confidence} &middot; {sourceLabel(syn, aiOff)}
              {syn.logicScore !== undefined && syn.weights ? ` · reasoning ${syn.logicScore}${syn.astroScore !== undefined ? `, astrology ${syn.astroScore}` : ""}` : ""}
              {syn.calibration?.applied && ` · past accuracy ${Math.round(syn.calibration.hitRate * 100)}% (${syn.calibration.samples} follow-ups)`}. We&rsquo;ll ask how it turned out in about {syn.timeframeDays} days.
            </p>
          </div>
        )}
      </motion.div>

      <p className="pt-2 text-xs font-semibold text-muted-foreground">Modules used (tap to open)</p>

      <EngineCard code="AJIT" title="Intent detection" summary={summaryLine(result, "intent")}>
        <div className="space-y-3">
          {result.intent.intent !== "unclear" && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-lg font-bold text-foreground capitalize">{result.intent.intent}</span>
              <Badge label={result.intent.confidence} className={intensityColor(result.intent.confidence)} />
            </div>
          )}
          <ModuleReports reports={reportsFor(result, "intent")} heading="What the AJIT module found" />
          <IndirectRouteView route={result.indirectRoute} />
        </div>
      </EngineCard>

      <EngineCard code="MANU" title="Mood reading" summary={summaryLine(result, "emotion")}>
        <div className="space-y-3">
          {result.emotion.score > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-lg font-bold text-foreground capitalize">{result.emotion.emotion}</span>
              <Badge label={result.emotion.intensity} className={intensityColor(result.emotion.intensity)} />
            </div>
          )}
          <ModuleReports reports={reportsFor(result, "emotion")} heading="What the MANU module found" />
        </div>
      </EngineCard>

      <SilenceCard result={result} />

      <EngineCard code="SIVI" title="Choices compared" summary={summaryLine(result, "paths")}>
        <div className="space-y-4">
          <ModuleReports reports={reportsFor(result, "paths")} heading="Recommendation by SIVI module" />
          {result.simulation.context && <SituationContextView ctx={result.simulation.context} />}
          <div>
            <div className="text-xs font-semibold text-foreground mb-1">Best choice</div>
            <PathView path={result.simulation.bestPath} best analysisId={result.id} pathIndex={0} />
          </div>
          {result.simulation.alternatives.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-foreground mb-1">Other choices</div>
              <div className="space-y-2">
                {result.simulation.alternatives.map((alt, i) => (
                  <PathView key={i} path={alt} analysisId={result.id} pathIndex={i + 1} />
                ))}
              </div>
            </div>
          )}
          {result.simulation.comparison && (
            <div className="rounded border border-border bg-card px-3 py-2">
              <div className="text-xs font-semibold text-foreground mb-1">Why this order</div>
              <Points items={toPoints(result.simulation.comparison)} className="text-foreground" />
            </div>
          )}
          {result.simulation.source && (
            <p className="text-xs text-muted-foreground">
              {result.simulation.source === "ai"
                ? "Choices were built by the AI from your whole situation. They compare options; they do not predict the future."
                : "Choices are general ones based on the topic and mood of your question. They compare options; they do not predict the future."}
            </p>
          )}
        </div>
      </EngineCard>

      <AstroCard result={result} />

      {aiReport && (
        <EngineCard code="AI" title="Reasoning" summary={aiReport.active ? undefined : <span className="text-muted-foreground">{aiReport.verdict}</span>}>
          <ModuleReports reports={[aiReport]} heading="How the answer was reasoned" />
        </EngineCard>
      )}
      <CreditsUsedCard result={result} />
    </div>
  );
}
