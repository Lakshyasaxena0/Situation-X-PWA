import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeAstro } from "../services/astro.service.js";
import { chanceFromScore } from "../services/outlook.service.js";

test("Chance: 5-95 and rises with the score", () => {
  assert.equal(chanceFromScore(0), 50);
  assert.ok(chanceFromScore(30) > chanceFromScore(10));
  assert.ok(chanceFromScore(-500) >= 5 && chanceFromScore(500) <= 95);
});

test("Outlook: every question gets a chance; a date is given only past the gate", () => {
  let withTiming = 0;
  let gated = 0;
  for (let i = 0; i < 40; i++) {
    const at = new Date(Date.UTC(2026, 0, 1) + i * 9.3 * 86400000);
    const a = analyzeAstro("career", "neutral" as never, { at, text: "when will I get the job?" });
    const o = a.outlook;
    assert.ok(o.chance >= 5 && o.chance <= 95);
    if (o.chance < 35) {
      assert.equal(o.timing, null);
      gated++;
    } else if (o.timing) {
      assert.ok(o.timing.from <= o.timing.to);
      assert.ok(o.timing.dashaCheck);
      withTiming++;
    }
  }
  assert.ok(withTiming > 0 && gated > 0, `timing ${withTiming}, gated ${gated}`);
});

test("Prashna trace: lagna, Moon, concerned house, 6/8/12 lords and the blend are all written as points", () => {
  const a = analyzeAstro("career", "neutral" as never, { at: new Date("2026-10-14T14:00:00Z"), text: "Will I get the job?", latitude: 19.076, longitude: 72.8777 });
  const titles = a.prashna.trace.map((t) => t.title).join(" | ");
  assert.match(titles, /Lagna/);
  assert.match(titles, /Moon/);
  assert.match(titles, /10th house/);
  assert.match(titles, /6th, 8th and 12th/);
  assert.match(titles, /house, sign and planet/);
  for (const t of a.prashna.trace) assert.ok(t.points.length >= 2 && t.points.every((p) => p.length > 5));
  assert.equal(a.prashna.trace.find((t) => /6th, 8th/.test(t.title))!.points.length, 3);
  assert.match(titles, /dasha/);
  assert.match(titles, /Mrityu Bhaga/);
  console.log(a.prashna.trace.map((t) => `## ${t.title}\n- ${t.points.join("\n- ")}`).join("\n"));
});

test("Prashna SOP: Navamsa (D9) is read for every kind of question, other charts only when the question needs them", () => {
  for (const [intent, text] of [["career", "Will I get the job?"], ["relationship", "Will we marry?"], ["health", "Will I recover?"], ["conflict", "Will I win the case?"], ["decision", "Should I move?"], ["unclear", "hello"]] as const) {
    const a = analyzeAstro(intent, "neutral" as never, { at: new Date("2026-10-14T14:00:00Z"), text });
    assert.ok(a.prashna.chartsUsed.some((c) => c.chart === "D9"), `${intent} lacks D9`);
    assert.ok(a.prashna.trace.some((t) => /Navamsa \(D9\)/.test(t.title)), `${intent} trace lacks D9`);
    assert.match(a.prashna.trace[0].title, /^Step 1:/);
    assert.match(a.prashna.trace[a.prashna.trace.length - 1].title, /Verdict/);
  }
  const mother = analyzeAstro("decision", "neutral" as never, { at: new Date("2026-10-14T14:00:00Z"), text: "Will my mother get well?" });
  assert.ok(mother.prashna.chartsUsed.some((c) => c.chart === "D12"));
  const job = analyzeAstro("career", "neutral" as never, { at: new Date("2026-10-14T14:00:00Z"), text: "Will I get the job?" });
  assert.ok(job.prashna.chartsUsed.some((c) => c.chart === "D10"));
});

test("Chart fitness is a warning by default; the chart is read anyway", () => {
  let unfit = 0;
  for (let i = 0; i < 40; i++) {
    const a = analyzeAstro("career", "neutral" as never, { at: new Date(Date.UTC(2026, 0, 1) + i * 5.7 * 86400000), text: "Will I get the job?" });
    assert.equal(typeof a.prashna.fit.ok, "boolean");
    assert.ok(a.prashna.trace.length >= 10 && a.outlook.chance >= 5);
    if (!a.prashna.fit.ok) {
      unfit++;
      assert.ok(a.prashna.fit.problems.length > 0);
      assert.match(a.prashna.trace[0].points.join(" "), /still read in full/);
    }
  }
  assert.ok(unfit > 0);
});

test("Signification blend: themes of the question are read house by house and planet + house + sign are joined", () => {
  const a = analyzeAstro("career", "neutral" as never, { at: new Date("2026-10-14T14:00:00Z"), text: "Will I get a job abroad?" });
  const titles = a.prashna.trace.map((t) => t.title).join(" | ");
  assert.match(titles, /house by house/);
  assert.match(titles, /Planet \+ house \+ sign blended/);
  assert.ok(a.prashna.factors.some((f) => f.label.startsWith("Theme:")));
  const blend = a.prashna.trace.find((t) => /blended/.test(t.title))!;
  assert.ok(blend.points.every((p) => /→ works through the/.test(p)));
  // Without a recognised theme the kind of question stands in as the theme.
  const g = analyzeAstro("decision", "neutral" as never, { at: new Date("2026-10-14T14:00:00Z"), text: "hmm what now" });
  assert.ok(g.prashna.factors.some((f) => f.label.startsWith("Theme:")));
});
