import { test } from "node:test";
import assert from "node:assert/strict";
import { charaDashaAt, charaSignYears, signAspects, vimshottariAt, DASHA_YEAR_MS } from "../services/dasha.service.js";

const birth = new Date("1990-01-01T00:00:00Z");
const after = (years: number) => new Date(birth.getTime() + years * DASHA_YEAR_MS);
const NAK = 360 / 27;

test("Vimshottari: Moon at 0 Aries starts a full Ketu mahadasha at birth", () => {
  const d = vimshottariAt(0, birth, birth);
  assert.equal(d.mahadasha.planet, "Ketu");
  assert.equal(d.mahadasha.startDate, "1990-01-01");
  assert.equal(d.mahadasha.durationYears, 7);
  assert.equal(d.antardasha.planet, "Ketu");
  assert.equal(d.pratyantardasha.planet, "Ketu");
});

test("Vimshottari: balance of the first dasha is what is left of the nakshatra", () => {
  // Moon half-way through Ashwini: 3.5 of Ketu's 7 years are left
  const d = vimshottariAt(NAK / 2, birth, birth);
  assert.equal(d.mahadasha.planet, "Ketu");
  const end = new Date(d.mahadasha.endDate).getTime();
  const expected = birth.getTime() + 3.5 * DASHA_YEAR_MS;
  assert.ok(Math.abs(end - expected) < 2 * 86400000, "Ketu should end about 3.5 years after birth");
  // Right after that, Venus (20 years) begins
  const next = vimshottariAt(NAK / 2, birth, after(3.6));
  assert.equal(next.mahadasha.planet, "Venus");
  assert.equal(next.antardasha.planet, "Venus");
});

test("Vimshottari: nakshatra lords follow the Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury cycle", () => {
  const lords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
  for (let n = 0; n < 27; n++) {
    assert.equal(vimshottariAt(n * NAK + 0.01, birth, birth).mahadasha.planet, lords[n % 9]);
  }
});

test("Vimshottari: antardasha order and lengths inside Venus (20 years)", () => {
  // Moon at the very start of Bharani: Venus runs for 20 years from birth.
  const m = NAK;
  const first = vimshottariAt(m, birth, after(0.01));
  assert.equal(first.mahadasha.planet, "Venus");
  assert.equal(first.antardasha.planet, "Venus"); // Venus-Venus lasts 20*20/120 = 3.333 y
  const second = vimshottariAt(m, birth, after(3.34));
  assert.equal(second.antardasha.planet, "Sun"); // next in order after Venus
  const third = vimshottariAt(m, birth, after(3.334 + 1.0 + 0.01));
  assert.equal(third.antardasha.planet, "Moon");
  const ven = vimshottariAt(m, birth, after(1));
  assert.ok(Math.abs(ven.antardasha.durationYears - 20 * 20 / 120) < 0.01);
});

test("Vimshottari: sub-periods tile their parent exactly", () => {
  const at = after(37.123);
  const d = vimshottariAt(123.4, birth, at);
  const t = (s: string) => new Date(s).getTime();
  for (const [parent, child] of [[d.mahadasha, d.antardasha], [d.antardasha, d.pratyantardasha], [d.pratyantardasha, d.sookshmadasha]] as const) {
    assert.ok(t(child.startDate) >= t(parent.startDate) - 86400000);
    assert.ok(t(child.endDate) <= t(parent.endDate) + 86400000);
  }
  assert.ok(t(d.mahadasha.startDate) <= at.getTime() && at.getTime() < t(d.mahadasha.endDate) + 86400000);
});

test("Vimshottari: dashas of a chart at a later 'now' differ from the birth ones", () => {
  const nowChart = vimshottariAt(100, birth, birth);
  const later = vimshottariAt(100, birth, after(30));
  assert.notEqual(nowChart.mahadasha.planet, later.mahadasha.planet);
});

const lon = (signs: Record<string, number>) =>
  Object.fromEntries(Object.entries(signs).map(([p, s]) => [p, s * 30 + 10]));

test("Chara: years = signs counted to the lord minus one (forward from odd signs, backward from even signs)", () => {
  // Aries 0, Taurus 1, Gemini 2, Cancer 3, Leo 4, Libra 6
  const planets = lon({ Sun: 0, Moon: 6, Mars: 4, Mercury: 2, Jupiter: 0, Venus: 2, Saturn: 0, Rahu: 0, Ketu: 6 });
  assert.equal(charaSignYears(0, planets), 4); // Aries -> Mars in Leo: 5th sign, 4 years
  assert.equal(charaSignYears(1, planets), 1); // Taurus -> Venus in Gemini: 2nd, 1 year
  assert.equal(charaSignYears(2, planets), 12); // Gemini -> Mercury in Gemini: own sign, 12
  assert.equal(charaSignYears(3, planets), 9); // Cancer (backward) -> Moon in Libra: 10th backward, 9 years
});

test("Chara: Scorpio / Aquarius - the lord that sits in the sign is skipped, both in the sign gives 12, neither: the stronger", () => {
  // Mars in Scorpio itself: the other lord (Ketu in Pisces) is used. Scorpio counts forward: 4 signs on = 4 years
  const a = lon({ Sun: 0, Moon: 0, Mars: 7, Mercury: 0, Jupiter: 0, Venus: 0, Saturn: 0, Rahu: 5, Ketu: 11 });
  assert.equal(charaSignYears(7, a), 4);
  // Ketu in Scorpio, Mars in Aries: Mars is used. Scorpio -> Aries forward: 6th sign, 5 years
  const b = lon({ Sun: 3, Moon: 3, Mars: 0, Mercury: 5, Jupiter: 5, Venus: 5, Saturn: 5, Rahu: 1, Ketu: 7 });
  assert.equal(charaSignYears(7, b), 5);
  // Both lords in the sign: 12 years
  const both = lon({ Sun: 3, Moon: 3, Mars: 7, Mercury: 5, Jupiter: 5, Venus: 5, Saturn: 5, Rahu: 1, Ketu: 7 });
  assert.equal(charaSignYears(7, both), 12);
  // Neither in the sign: the one with more company wins (Mars in Leo with Sun and Moon beats Ketu alone in Pisces)
  const c = lon({ Sun: 4, Moon: 4, Mars: 4, Mercury: 5, Jupiter: 5, Venus: 5, Saturn: 5, Rahu: 1, Ketu: 11 });
  assert.equal(charaSignYears(7, c), 9); // Scorpio -> Leo is the 10th sign
  // Aquarius follows the same rule with Saturn and Rahu: Rahu in Aquarius, so Saturn (Libra) is used; backward 5th -> 4 years
  const d = lon({ Sun: 0, Moon: 0, Mars: 0, Mercury: 5, Jupiter: 5, Venus: 5, Saturn: 6, Rahu: 10, Ketu: 4 });
  assert.equal(charaSignYears(10, d), 4);
});

test("Chara: exaltation / debilitation adjustment is off by default and +1 / -1 when switched on", () => {
  // Aries -> Mars in Capricorn (exalted): 10th sign, 9 years; 10 with the adjustment
  const exalted = lon({ Sun: 0, Moon: 0, Mars: 9, Mercury: 0, Jupiter: 0, Venus: 0, Saturn: 0, Rahu: 0, Ketu: 6 });
  assert.equal(charaSignYears(0, exalted), 9);
  assert.equal(charaSignYears(0, exalted, true), 10);
  // Aries -> Mars in Cancer (debilitated): 4th sign, 3 years; 2 with the adjustment
  const debil = lon({ Sun: 0, Moon: 0, Mars: 3, Mercury: 0, Jupiter: 0, Venus: 0, Saturn: 0, Rahu: 0, Ketu: 6 });
  assert.equal(charaSignYears(0, debil), 3);
  assert.equal(charaSignYears(0, debil, true), 2);
});

test("Chara: matches a published worked example (Gemini lagna, Upadesa/K.N. Rao convention)", () => {
  // Mercury Aquarius, Venus/Mars/Sun Pisces, Jupiter Taurus, Saturn Libra, Moon Cancer
  const planets = lon({ Sun: 11, Moon: 3, Mars: 11, Mercury: 10, Jupiter: 1, Venus: 11, Saturn: 6 });
  const d = charaDashaAt({ longitudes: planets, lagnaLongitude: 75 }, birth, after(0.1))!;
  assert.equal(d.direction, "reverse");
  assert.deepEqual(d.sequence.map((p) => p.sign), ["Gemini", "Taurus", "Aries", "Pisces", "Aquarius", "Capricorn", "Sagittarius", "Scorpio", "Libra", "Virgo", "Leo", "Cancer"]);
  assert.deepEqual(d.sequence.map((p) => p.years), [8, 10, 11, 10, 4, 3, 5, 4, 5, 7, 5, 12]);
});

test("Chara: antardashas follow the direction of the dasha sign itself", () => {
  const planets = lon({ Sun: 11, Moon: 3, Mars: 11, Mercury: 10, Jupiter: 1, Venus: 11, Saturn: 6 });
  // Gemini lagna: Gemini counts forward -> antardashas start with Cancer; Taurus counts forward too -> Gemini
  const g = charaDashaAt({ longitudes: planets, lagnaLongitude: 75 }, birth, after(0.01))!;
  assert.equal(g.antardasha.sign, "Cancer");
  // Pisces mahadasha (4th, 10 years) counts backward -> its first antardasha is Aquarius
  const p = charaDashaAt({ longitudes: planets, lagnaLongitude: 75 }, birth, after(8 + 10 + 11 + 0.01))!;
  assert.equal(p.mahadasha.sign, "Pisces");
  assert.equal(p.antardasha.sign, "Aquarius");
});

test("Chara: Aries/Leo/Virgo/Libra/Aquarius/Pisces lagnas run direct, the others reverse, periods start at birth and tile", () => {
  const planets = lon({ Sun: 0, Moon: 6, Mars: 4, Mercury: 2, Jupiter: 0, Venus: 2, Saturn: 0, Rahu: 0, Ketu: 6 });
  const direct = charaDashaAt({ longitudes: planets, lagnaLongitude: 5 }, birth, after(0.1))!;
  assert.equal(direct.direction, "direct");
  assert.equal(direct.mahadasha.sign, "Aries");
  assert.equal(direct.sequence[1].sign, "Taurus");
  assert.equal(direct.sequence[0].startDate, "1990-01-01");
  assert.equal(direct.sequence[1].startDate, direct.sequence[0].endDate);

  const reverse = charaDashaAt({ longitudes: planets, lagnaLongitude: 95 }, birth, after(0.1))!;
  assert.equal(reverse.direction, "reverse");
  assert.equal(reverse.mahadasha.sign, "Cancer");
  assert.equal(reverse.sequence[1].sign, "Gemini");
});

test("Chara: antardashas are 1/12 of the mahadasha, start after the dasha sign and end with it", () => {
  const planets = lon({ Sun: 0, Moon: 6, Mars: 4, Mercury: 2, Jupiter: 0, Venus: 2, Saturn: 0, Rahu: 0, Ketu: 6 });
  // Aries mahadasha = 4 years -> each antardasha 4/12 year
  const first = charaDashaAt({ longitudes: planets, lagnaLongitude: 5 }, birth, after(0.05))!;
  assert.equal(first.mahadasha.years, 4);
  assert.equal(first.antardasha.sign, "Taurus");
  assert.ok(Math.abs(first.antardasha.years - 4 / 12) < 0.001);
  const last = charaDashaAt({ longitudes: planets, lagnaLongitude: 5 }, birth, after(3.95))!;
  assert.equal(last.antardasha.sign, "Aries");
});

test("Chara: moves to the next sign when the mahadasha ends, and is null after the first cycle", () => {
  const planets = lon({ Sun: 0, Moon: 6, Mars: 4, Mercury: 2, Jupiter: 0, Venus: 2, Saturn: 0, Rahu: 0, Ketu: 6 });
  const d = charaDashaAt({ longitudes: planets, lagnaLongitude: 5 }, birth, after(4.2))!;
  assert.equal(d.mahadasha.sign, "Taurus");
  assert.equal(charaDashaAt({ longitudes: planets, lagnaLongitude: 5 }, birth, after(500)), null);
});

test("Jaimini sign aspects", () => {
  // Aries (movable) aspects Leo, Scorpio, Aquarius (fixed) but not adjacent Taurus
  for (const s of [4, 7, 10]) assert.ok(signAspects(0, s));
  assert.ok(!signAspects(0, 1));
  // Taurus (fixed) aspects Cancer, Libra, Capricorn but not adjacent Aries
  for (const s of [3, 6, 9]) assert.ok(signAspects(1, s));
  assert.ok(!signAspects(1, 0));
  // Gemini (dual) aspects Virgo, Sagittarius, Pisces
  for (const s of [5, 8, 11]) assert.ok(signAspects(2, s));
  assert.ok(!signAspects(2, 3));
});
