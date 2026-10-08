import { useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PlacePicker } from "@/components/PlacePicker";
import { clearAnalysisSession } from "@/lib/analysisSession";
import { DEFAULT_PLACE } from "@/lib/places";
import { DEFAULT_SETTINGS, settingsStore, useSettings, type Depth, type Language } from "@/lib/settings";

const LANGUAGES: { value: Language; label: string; hint: string }[] = [
  { value: "auto", label: "Same as my question", hint: "Answer in the language you wrote in" },
  { value: "en", label: "English", hint: "" },
  { value: "hi", label: "हिन्दी", hint: "Hindi" },
  { value: "hinglish", label: "Hinglish", hint: "Hindi in English letters" },
];

const DEPTHS: { value: Depth; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Chosen from how complex the question is" },
  { value: "standard", label: "Standard", hint: "4 credits" },
  { value: "deep", label: "Deep", hint: "8 credits" },
  { value: "expert", label: "Expert", hint: "14 credits" },
];

const UTC_OFFSETS = [-480, -420, -360, -300, -240, 0, 60, 120, 180, 240, 270, 330, 345, 360, 480, 540, 600].map((m) => {
  const sign = m < 0 ? "-" : "+";
  const abs = Math.abs(m);
  return { value: m, label: `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}${m === 330 ? " (India)" : ""}` };
});

function deviceOffsetMinutes(): number {
  const m = -new Date().getTimezoneOffset();
  return UTC_OFFSETS.some((o) => o.value === m) ? m : 330;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-card-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function Chips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded border text-xs transition-colors ${value === o.value ? "border-primary bg-primary/20 text-foreground font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const [s, update] = useSettings();
  const [saved, setSaved] = useState("");
  const [birthError, setBirthError] = useState("");

  const birth = s.birth;
  const [birthDate, setBirthDate] = useState(birth?.date ?? "");
  const [birthTime, setBirthTime] = useState(birth?.time ?? "");
  const [offset, setOffset] = useState(birth?.utcOffsetMinutes ?? deviceOffsetMinutes());

  function saveBirth(place = s.birth?.place) {
    if (!birthDate || !birthTime) {
      setBirthError("Enter the birth date and time, then choose the birth place.");
      return;
    }
    if (new Date(`${birthDate}T${birthTime}:00`).getTime() > Date.now()) {
      setBirthError("Birth date cannot be in the future.");
      return;
    }
    if (!place) {
      setBirthError("Choose the birth place.");
      return;
    }
    setBirthError("");
    update({ birth: { date: birthDate, time: birthTime, utcOffsetMinutes: offset, place } });
    setSaved("Birth details saved on this device.");
  }

  return (
    <Shell>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">These choices apply to every analysis. They are saved on this device.</p>
        </div>

        <Section title="Answer language">
          <Chips label="Answer language" options={LANGUAGES} value={s.language} onChange={(language) => update({ language })} />
        </Section>

        <Section title="AI and astrology" hint="Switch either lens off if you only want the other. Credits are only charged for what you use.">
          <ToggleRow label="Use AI" hint="The AI thinks through your situation. Off: you get the module and astrology answer only." checked={s.useAi} onChange={(useAi) => update({ useAi })} />
          {s.useAi && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Default AI reasoning level</div>
              <Chips label="Default AI reasoning level" options={DEPTHS} value={s.depth} onChange={(depth) => update({ depth })} />
            </div>
          )}
          <ToggleRow label="Use astrology" hint="Prashna chart and dashas as a second opinion on timing. Off: the astrology is left out completely." checked={s.useAstrology} onChange={(useAstrology) => update({ useAstrology })} />
          {s.useAstrology && (
            <ToggleRow label="Show astrology details open" hint="Otherwise the charts and dashas stay folded until you tap the arrow." checked={s.expandAstrology} onChange={(expandAstrology) => update({ expandAstrology })} />
          )}
        </Section>

        {s.useAstrology && (
          <>
            <Section title="Your location" hint="The place where you ask. The sky is the same everywhere, but the rising sign (ascendant) and houses depend on the place, so this makes the chart correct for you.">
              <PlacePicker idPrefix="loc" value={s.location} onChange={(location) => update({ location })} />
              {!s.location && <p className="text-xs text-muted-foreground">Not set: {DEFAULT_PLACE.name} is used.</p>}
              {s.location && (
                <Button type="button" variant="ghost" size="sm" onClick={() => update({ location: null })}>
                  Reset to {DEFAULT_PLACE.name}
                </Button>
              )}
            </Section>

            <Section title="Birth details (optional)" hint="Vimshottari and Chara dasha need a birth chart to be about you. Without birth details they are computed for the moment you ask, which is only indicative. Add them for better answers to &quot;when&quot; questions.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-xs text-muted-foreground space-y-1">
                  Birth date
                  <Input type="date" max={new Date().toISOString().slice(0, 10)} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="h-9 bg-card" />
                </label>
                <label className="text-xs text-muted-foreground space-y-1">
                  Birth time
                  <Input type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} className="h-9 bg-card" />
                </label>
                <label className="text-xs text-muted-foreground space-y-1">
                  Time zone at birth place
                  <select className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground" value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
                    {UTC_OFFSETS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Birth place</div>
                <PlacePicker idPrefix="birth" value={s.birth?.place ?? null} onChange={(place) => saveBirth(place)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => saveBirth()}>
                  Save birth details
                </Button>
                {s.birth && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      update({ birth: null });
                      setBirthDate("");
                      setBirthTime("");
                      setSaved("Birth details removed.");
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
              {birthError && <p className="text-xs text-red-700">{birthError}</p>}
              {s.birth && <p className="text-xs text-muted-foreground">Using your birth chart ({s.birth.date} {s.birth.time}, {s.birth.place.name}) for dashas. Birth details stay on this device and are sent only with your analysis request.</p>}
            </Section>
          </>
        )}

        <Section title="This device">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                clearAnalysisSession();
                setSaved("Current question and analysis cleared.");
              }}
            >
              Clear current analysis
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                settingsStore.set(DEFAULT_SETTINGS);
                setBirthDate("");
                setBirthTime("");
                setSaved("Settings reset to the defaults.");
              }}
            >
              Reset all settings
            </Button>
          </div>
        </Section>

        {saved && <p className="text-xs text-muted-foreground" aria-live="polite">{saved}</p>}
      </div>
    </Shell>
  );
}
