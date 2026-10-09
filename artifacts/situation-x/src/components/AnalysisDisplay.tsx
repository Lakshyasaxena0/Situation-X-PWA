import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useTranslateAnalysis, type AnalysisResult, type CostLine, type ModuleReport, type TimingResult } from "@workspace/api-client-react";
import { InviteCta } from "@/components/InviteCta";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, CheckCircle2, MinusCircle, Loader2 } from "lucide-react";
import { applyTexts, type Texts } from "@/lib/translation";
import { useSettings } from "@/lib/settings";

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

function EngineCard({ code, title, children, right }: { code: string; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
        <span className="text-xs font-mono font-bold text-primary-foreground bg-primary px-2 py-0.5 rounded">{code}</span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </motion.div>
  );
}

/** Which modules took part and what each one concluded about this question. */
function ModuleReports({ reports }: { reports: ModuleReport[] }) {
  if (reports.length === 0) return null;
  return (
    <div className="mt-4 space-y-2.5 border-t border-border pt-3">
      <div className="text-[11px] font-mono text-muted-foreground tracking-wide">MODULES THAT RAN FOR THIS QUESTION</div>
      {reports.map((m) => (
        <div key={m.key} className="rounded-md bg-muted/50 p-3">
          <div className="flex items-start gap-2">
            {m.active ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-700" /> : <MinusCircle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {m.name} <span className={`ml-1 text-[10px] font-mono uppercase ${m.active ? "text-green-700" : "text-muted-foreground"}`}>{m.active ? "active" : "not triggered"}</span>
              </div>
              {m.role && <p className="text-xs text-muted-foreground italic mb-1">{m.role}</p>}
              <p className="text-sm text-foreground">{m.verdict}</p>
              {m.evidence.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
                  {m.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ))}
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

/** The astrology card: a short summary that expands (down arrow) into the charts and dashas. */
function AstroCard({ result, reports }: { result: AnalysisResult; reports: ModuleReport[] }) {
  const [settings] = useSettings();
  const [open, setOpen] = useState(settings.expandAstrology);
  const astroOn = result.options?.useAstrology !== false;
  const astro = result.astro;

  if (!astroOn) {
    return (
      <EngineCard code="ASTRO" title="Astrological Context">
        <p className="text-sm text-muted-foreground">Astrology was switched off for this analysis (Settings).</p>
      </EngineCard>
    );
  }

  return (
    <EngineCard code="ASTRO" title="Astrological Context">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-3 flex-wrap">
          <span className="text-lg font-bold text-foreground">{astro.influence.dominantPlanet}</span>
          <span className={`text-sm font-semibold ${signalColor(astro.influence.signal as Signal)}`}>{astro.influence.signal}</span>
          <Badge label={`risk: ${astro.influence.risk}`} className={riskColor(astro.influence.risk as RiskLevel)} />
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          {open ? "Hide details" : "Show details"}
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      <ModuleReports reports={reports} />

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">{astro.interpretation}</p>
          {astro.timing ? <TimingSection timing={astro.timing} /> : <p className="text-xs text-muted-foreground border-t border-border pt-3">Dashas (Vimshottari and Chara) are used only when a question asks about timing, such as &ldquo;when&rdquo; or &ldquo;how long&rdquo;.</p>}

          {astro.vedicD1 && (
            <div className="space-y-4">
              <div className="text-xs font-mono text-muted-foreground border-t border-border pt-3">
                PRASHNA CHARTS &middot; cast for the moment you asked
                {astro.prashna && ` · ${astro.prashna.topic}`}
                {astro.location && ` · lat ${astro.location.latitude.toFixed(2)}, lon ${astro.location.longitude.toFixed(2)}`}
              </div>
              {astro.prashna && (
                <ul className="text-xs text-muted-foreground space-y-1">
                  {astro.prashna.chartsUsed.map((u) => (
                    <li key={u.chart}>
                      <span className="font-mono font-bold text-primary">{u.chart}</span> <span className="text-foreground">{u.purpose}</span> &mdash; {u.note}
                    </li>
                  ))}
                </ul>
              )}
              {[astro.vedicD1, astro.vedicD3, astro.vedicD9, astro.vedicD10].map((chart) => {
                if (!chart) return null;
                const used = astro.prashna?.chartsUsed.some((u) => u.chart === chart.chartType);
                return (
                  <div key={chart.chartType} className={`rounded p-3 ${used ? "bg-muted/60 border border-primary/40" : "bg-muted/30 opacity-80"}`}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-primary">{chart.chartType}</span>
                      <span className="text-xs text-muted-foreground">
                        Lagna: <strong className="text-foreground">{chart.ascendant}</strong> {chart.ascendantDegree.toFixed(1)}&deg;
                      </span>
                      {used && <span className="text-[10px] uppercase tracking-wide text-primary">used for this question</span>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
                      {chart.planets.slice(0, 9).map((p) => (
                        <div key={p.name} className="flex items-center gap-1">
                          <span className="text-muted-foreground w-14 truncate">{p.name}</span>
                          <span className="text-foreground">{p.sign}</span>
                          {p.house !== undefined && <span className="text-muted-foreground">H{p.house}</span>}
                          {p.isRetrograde && <span className="text-amber-700">R</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
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

function AnalysisBody({ result, header }: { result: AnalysisResult; header: React.ReactNode }) {
  const syn = result.synthesis;
  const astroOn = result.options?.useAstrology !== false;
  const aiReport = (result.modules ?? []).find((m) => m.key === "AI");
  return (
    <div className="space-y-4 mt-6">
      {header}
      <EngineCard code="AJIT" title="Intent Analysis">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg font-bold text-foreground capitalize">{result.intent.intent}</span>
          <Badge label={result.intent.confidence} className={intensityColor(result.intent.confidence)} />
          <span className="text-xs text-muted-foreground">score: {result.intent.score}</span>
        </div>
        <ModuleReports reports={reportsFor(result, "intent")} />
      </EngineCard>

      <EngineCard code="MANU" title="Emotion Mapping">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg font-bold text-foreground capitalize">{result.emotion.emotion}</span>
          <Badge label={result.emotion.intensity} className={intensityColor(result.emotion.intensity)} />
          <span className="text-xs text-muted-foreground">score: {result.emotion.score}</span>
        </div>
        <ModuleReports reports={reportsFor(result, "emotion")} />
      </EngineCard>

      <EngineCard code="SIVI" title="Alternative Path Simulation">
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1 font-mono">RECOMMENDED PATH</div>
            <div className="bg-muted/60 rounded p-3">
              <p className="text-sm text-foreground font-medium mb-2">{result.simulation.bestPath.action}</p>
              <div className="flex gap-2 flex-wrap">
                <Badge label={`risk: ${result.simulation.bestPath.risk}`} className={riskColor(result.simulation.bestPath.risk as RiskLevel)} />
                <Badge label={`stability: ${result.simulation.bestPath.stability}`} className="text-secondary bg-secondary/10 border-secondary/30" />
                <Badge label={result.simulation.bestPath.outcome} className={`border ${outcomeColor(result.simulation.bestPath.outcome as Outcome)} bg-transparent border-current/30`} />
              </div>
            </div>
          </div>
          {result.simulation.alternatives.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1 font-mono">ALTERNATIVES</div>
              <div className="space-y-2">
                {result.simulation.alternatives.map((alt, i) => (
                  <div key={i} className="bg-muted/40 rounded p-3">
                    <p className="text-sm text-muted-foreground mb-1">{alt.action}</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge label={`risk: ${alt.risk}`} className={riskColor(alt.risk as RiskLevel)} />
                      <Badge label={alt.outcome} className="text-muted-foreground bg-muted border-border" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <ModuleReports reports={reportsFor(result, "paths")} />
      </EngineCard>

      <AstroCard result={result} reports={reportsFor(result, "astrology")} />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`border rounded-lg p-5 ${
          result.finalVerdict.riskLevel === "low" ? "border-green-600/40 bg-green-500/5" : result.finalVerdict.riskLevel === "high" ? "border-red-600/40 bg-red-500/5" : "border-amber-600/40 bg-amber-500/5"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono font-bold text-foreground">VERDICT</span>
          <Badge label={`${result.finalVerdict.riskLevel} risk`} className={riskColor(result.finalVerdict.riskLevel as RiskLevel)} />
          <span className="text-xs text-muted-foreground">score: {result.overallScore}</span>
        </div>
        <p className="text-base font-semibold text-foreground mb-2">{result.finalVerdict.recommendedAction}</p>
        <p className="text-sm text-muted-foreground mb-3">{result.finalVerdict.reasoning}</p>
        <p className="text-sm text-foreground border-t border-border/50 pt-3">{result.summary}</p>
        {syn && (
          <div className="mt-3 space-y-3 text-sm">
            {syn.logicScore !== undefined && syn.weights && (
              <div className="rounded border border-border/60 bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span>
                    <span className="font-mono font-bold text-foreground">AI JUDGMENT</span> {syn.logicScore} <span className="text-muted-foreground">({Math.round(syn.weights.logic * 100)}%)</span>
                  </span>
                  {syn.astroScore !== undefined && (
                    <span>
                      <span className="font-mono font-bold text-foreground">ASTROLOGY</span> {syn.astroScore} <span className="text-muted-foreground">({Math.round(syn.weights.astro * 100)}%)</span>
                    </span>
                  )}
                  <span>
                    <span className="font-mono font-bold text-foreground">FINAL</span> {syn.score} &middot; {syn.verdict}
                  </span>
                  {syn.astroAlignment && (
                    <span className={syn.astroAlignment === "supports" ? "text-green-700" : syn.astroAlignment === "contradicts" ? "text-red-700" : "text-amber-700"}>
                      astrology {syn.astroAlignment === "supports" ? "agrees with the AI" : syn.astroAlignment === "contradicts" ? "disagrees with the AI" : "partly agrees with the AI"}
                    </span>
                  )}
                </div>
              </div>
            )}
            {syn.reasoning && (
              <p className="text-muted-foreground">
                <span className="font-mono text-xs font-bold text-foreground">REASONING </span>
                {syn.reasoning}
              </p>
            )}
            {astroOn && (
              <p className="text-muted-foreground">
                <span className="font-mono text-xs font-bold text-foreground">ASTRO </span>
                {syn.astroInsight}
              </p>
            )}
            {syn.risks && syn.risks.length > 0 && (
              <div className="text-muted-foreground">
                <span className="font-mono text-xs font-bold text-foreground">RISKS</span>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {syn.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {syn.keyUnknowns && syn.keyUnknowns.length > 0 && (
              <div className="text-muted-foreground">
                <span className="font-mono text-xs font-bold text-foreground">WHAT WOULD CHANGE THIS</span>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {syn.keyUnknowns.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-foreground">
              <span className="font-mono text-xs font-bold">NEXT STEP </span>
              {syn.advice}
            </p>
            {syn.nextSteps && syn.nextSteps.length > 0 && (
              <ol className="list-decimal pl-5 space-y-0.5 text-muted-foreground">
                {syn.nextSteps.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            )}
            <p className="text-xs text-muted-foreground">
              Final answer: {syn.verdict} &middot; confidence {syn.confidence}
              {syn.source === "ai+astro" ? " · AI + astrology" : syn.source === "ai" ? " · AI only" : syn.usedAi === false && result.options?.useAi === false ? " · modules + astrology (AI off)" : " · engine only (AI unavailable)"}
              {syn.calibration?.applied && ` · past accuracy ${Math.round(syn.calibration.hitRate * 100)}% (${syn.calibration.samples} follow-ups)`}. We&rsquo;ll ask how it turned out in about {syn.timeframeDays} days.
            </p>
          </div>
        )}
        {aiReport && <ModuleReports reports={[aiReport]} />}
      </motion.div>
      <CreditsUsedCard result={result} />
    </div>
  );
}
