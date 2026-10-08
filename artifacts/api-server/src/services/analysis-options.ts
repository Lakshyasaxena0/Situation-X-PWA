/** What the user switched on or off in Settings for one analysis. */
export type Language = "auto" | "en" | "hi" | "hinglish";

export type AnalysisOptions = {
  useAi: boolean;
  useAstrology: boolean;
  language: Language;
};

export const DEFAULT_OPTIONS: AnalysisOptions = { useAi: true, useAstrology: true, language: "auto" };

export const LANGUAGE_NAMES: Record<Language, string> = {
  auto: "the same language as the situation (English, Hindi or Hinglish)",
  en: "English",
  hi: "Hindi (Devanagari script)",
  hinglish: "Hinglish (Hindi written in the Latin alphabet)",
};
