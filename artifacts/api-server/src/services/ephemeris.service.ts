// Shared ephemeris helpers used by astro.service.ts (transits "now") and
// vedic.service.ts (natal charts).
//
// Positions come from the full VSOP87D series and the ELP/Meeus lunar series
// shipped with `astronomia`, as *geocentric* longitudes of the mean equinox of
// date (light-time corrected). Sidereal values are obtained by subtracting the
// Lahiri ayanamsa. Typical accuracy is a few arc-seconds for planets and
// better than ~10 arc-seconds for the Moon, far tighter than needed for
// sign / nakshatra / dasha work.
//
// Note: Julian *ephemeris* day is approximated by Julian (UT) day; the
// ~70 s difference (delta-T) moves the Moon by < 0.001°.

import { Planet } from "astronomia/planetposition";
import { position as moonPosition } from "astronomia/moonposition";
import { lightTime } from "astronomia/base";
import vsop87Dearth from "astronomia/data/vsop87Dearth";
import vsop87Dmercury from "astronomia/data/vsop87Dmercury";
import vsop87Dvenus from "astronomia/data/vsop87Dvenus";
import vsop87Dmars from "astronomia/data/vsop87Dmars";
import vsop87Djupiter from "astronomia/data/vsop87Djupiter";
import vsop87Dsaturn from "astronomia/data/vsop87Dsaturn";

export type BodyName =
  | "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn" | "Rahu" | "Ketu";

export const BODY_NAMES: BodyName[] = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu",
];

const J2000 = 2451545.0;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const earth = new Planet(vsop87Dearth);
const outerAndInner = {
  Mercury: new Planet(vsop87Dmercury),
  Venus: new Planet(vsop87Dvenus),
  Mars: new Planet(vsop87Dmars),
  Jupiter: new Planet(vsop87Djupiter),
  Saturn: new Planet(vsop87Dsaturn),
} as const;

export function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Julian Day (UT) for a JS Date, Gregorian calendar. */
export function julianDayFromDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Lahiri (Chitrapaksha) ayanamsa in degrees.
 * 23.857° at J2000 plus general precession in longitude (~1.3969°/century).
 * (Check: ≈ 24.19° on 2024-01-01, matching published Lahiri tables.)
 */
export function lahiriAyanamsa(jd: number): number {
  const T = (jd - J2000) / 36525;
  return 23.857092 + 1.396971 * T + 0.000308 * T * T;
}

/** Geocentric ecliptic longitude (degrees, mean equinox of date) of a planet. */
function planetGeocentricLongitude(name: keyof typeof outerAndInner, jd: number): number {
  const planet = outerAndInner[name];
  const e = earth.position(jd);

  const rel = (tau: number) => {
    const p = planet.position(jd - tau);
    return [
      p.range * Math.cos(p.lat) * Math.cos(p.lon) - e.range * Math.cos(e.lat) * Math.cos(e.lon),
      p.range * Math.cos(p.lat) * Math.sin(p.lon) - e.range * Math.cos(e.lat) * Math.sin(e.lon),
    ] as const;
  };

  // First pass for distance, second pass with light-time correction.
  const [x0, y0] = rel(0);
  const p0 = planet.position(jd);
  const dz = p0.range * Math.sin(p0.lat) - e.range * Math.sin(e.lat);
  const tau = lightTime(Math.hypot(x0, y0, dz));
  const [x, y] = rel(tau);
  return normalizeDegrees(Math.atan2(y, x) * R2D);
}

function sunLongitude(jd: number): number {
  const e = earth.position(jd);
  return normalizeDegrees(e.lon * R2D + 180);
}

function moonLongitude(jd: number): number {
  return normalizeDegrees(moonPosition(jd).lon * R2D);
}

/** Mean lunar ascending node (Rahu), degrees. */
function rahuLongitude(jd: number): number {
  const T = (jd - J2000) / 36525;
  return normalizeDegrees(125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000);
}

/** Tropical (mean equinox of date) geocentric longitudes of all nine grahas. */
export function tropicalLongitudes(jd: number): Record<BodyName, number> {
  const rahu = rahuLongitude(jd);
  return {
    Sun: sunLongitude(jd),
    Moon: moonLongitude(jd),
    Mercury: planetGeocentricLongitude("Mercury", jd),
    Venus: planetGeocentricLongitude("Venus", jd),
    Mars: planetGeocentricLongitude("Mars", jd),
    Jupiter: planetGeocentricLongitude("Jupiter", jd),
    Saturn: planetGeocentricLongitude("Saturn", jd),
    Rahu: rahu,
    Ketu: normalizeDegrees(rahu + 180),
  };
}

/** Sidereal (Lahiri) longitudes of all nine grahas. */
export function siderealLongitudes(jd: number): Record<BodyName, number> {
  const ayanamsa = lahiriAyanamsa(jd);
  const tropical = tropicalLongitudes(jd);
  const out = {} as Record<BodyName, number>;
  for (const name of BODY_NAMES) out[name] = normalizeDegrees(tropical[name] - ayanamsa);
  return out;
}

/**
 * Apparent retrograde motion. Sun and Moon never are; the mean nodes always
 * move backwards; the five planets are determined from their longitude change
 * over +/- 12 hours.
 */
export function isRetrograde(name: BodyName, jd: number): boolean {
  if (name === "Rahu" || name === "Ketu") return true;
  if (name === "Sun" || name === "Moon") return false;
  const before = planetGeocentricLongitude(name, jd - 0.5);
  const after = planetGeocentricLongitude(name, jd + 0.5);
  let delta = after - before;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta < 0;
}

/**
 * Tropical ascendant (degrees) for a Julian day UT and geographic position
 * (east longitude positive).
 */
export function tropicalAscendant(jd: number, latitude: number, longitude: number): number {
  const T = (jd - J2000) / 36525;
  const gmst = normalizeDegrees(
    280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - (T * T * T) / 38710000,
  );
  const lst = (gmst + longitude) * D2R; // local sidereal time = RAMC
  const eps = (23.43929111 - 0.0130042 * T) * D2R; // mean obliquity
  const phi = latitude * D2R;
  // Standard formula: ASC = atan2(cos RAMC, -(sin RAMC cos eps + tan phi sin eps))
  const y = Math.cos(lst);
  const x = -(Math.sin(lst) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps));
  return normalizeDegrees(Math.atan2(y, x) * R2D);
}

// ---------------------------------------------------------------------------------------------
// Daily motion, declination, sunrise / sunset (used for strengths and the hora of the question)
// ---------------------------------------------------------------------------------------------

/** Daily motion in degrees per day (negative = retrograde), from the change over +/- 12 hours. */
export function dailyMotion(name: BodyName, jd: number): number {
  if (name === "Rahu" || name === "Ketu") return -0.0530;
  const lon = (t: number): number => {
    if (name === "Sun") return sunLongitude(t);
    if (name === "Moon") return moonLongitude(t);
    return planetGeocentricLongitude(name, t);
  };
  let d = lon(jd + 0.5) - lon(jd - 0.5);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

const OBLIQUITY = 23.4393;

/** Declination (degrees) of a point on the ecliptic from its TROPICAL longitude. */
export function declinationOf(tropicalLongitude: number): number {
  return Math.asin(Math.sin(OBLIQUITY * D2R) * Math.sin(tropicalLongitude * D2R)) * R2D;
}

export type SunTimes = {
  /** Julian day (UT) of the sunrise that begins the Vedic day in force at the question. */
  sunrise: number;
  sunset: number;
  nextSunrise: number;
  /** 0 = Sunday ... 6 = Saturday, for the day that began at that sunrise. */
  weekday: number;
};

/** Sunrise / sunset for the local (mean-time) day that starts at JD `localMidnight` (x.5 in local mean time). */
function sunRiseSet(localMidnight: number, latitude: number, longitude: number): { rise: number; set: number } {
  const tz = longitude / 15;
  const noonUt = localMidnight + 0.5 - tz / 24;
  const T = (noonUt - J2000) / 36525;
  const lam = sunLongitude(noonUt);
  const decl = declinationOf(lam);
  const eps = OBLIQUITY * D2R;
  const ra = normalizeDegrees(Math.atan2(Math.cos(eps) * Math.sin(lam * D2R), Math.cos(lam * D2R)) * R2D);
  const l0 = normalizeDegrees(280.46646 + 36000.76983 * T);
  let eq = l0 - 0.0057183 - ra;
  if (eq > 180) eq -= 360;
  if (eq < -180) eq += 360;
  const eqMinutes = eq * 4;
  const cosH = (Math.sin(-0.833 * D2R) - Math.sin(latitude * D2R) * Math.sin(decl * D2R)) / (Math.cos(latitude * D2R) * Math.cos(decl * D2R));
  // Polar day / night: fall back to 6:00 and 18:00 local solar time.
  const H = cosH >= 1 || cosH <= -1 ? 90 : Math.acos(cosH) * R2D;
  const dayStartUt = Math.floor(noonUt - 0.5) + 0.5;
  return {
    rise: dayStartUt + (720 - 4 * (longitude + H) - eqMinutes) / 1440,
    set: dayStartUt + (720 - 4 * (longitude - H) - eqMinutes) / 1440,
  };
}

/**
 * The Vedic day at the moment `jd`: it runs from one sunrise to the next, so before sunrise the
 * previous day's sunrise is used. Accurate to about a minute, plenty for hora (hour-long) work.
 */
export function sunTimesFor(jd: number, latitude: number, longitude: number): SunTimes {
  const tz = longitude / 15;
  const localMidnight = Math.floor(jd + tz / 24 - 0.5) + 0.5;
  let m = localMidnight;
  let today = sunRiseSet(m, latitude, longitude);
  if (jd < today.rise) {
    m -= 1;
    today = sunRiseSet(m, latitude, longitude);
  }
  const next = sunRiseSet(m + 1, latitude, longitude);
  return { sunrise: today.rise, sunset: today.set, nextSunrise: next.rise, weekday: (Math.floor(m + 0.5) + 1) % 7 };
}
