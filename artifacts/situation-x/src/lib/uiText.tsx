import { createContext, useContext } from "react";

/** The language the finished analysis is shown in. Headings and labels follow it; sentences are translated by the server. */
export type UiLang = "en" | "hi" | "hinglish";

const LangContext = createContext<UiLang>("en");
export const UiLangProvider = LangContext.Provider;

/** Fixed labels of the analysis screen. The English text is the key; a missing entry simply stays English. */
const LABELS: Record<string, { hi: string; hinglish: string }> = {
  "YOUR ANSWER": { hi: "आपका उत्तर", hinglish: "AAPKA JAWAB" },
  "What the chart says": { hi: "कुंडली क्या कहती है", hinglish: "Chart kya kehta hai" },
  "Chance it happens": { hi: "होने की संभावना", hinglish: "Hone ki sambhavna" },
  "Expected time": { hi: "अनुमानित समय", hinglish: "Anumanit samay" },
  "Why": { hi: "क्यों", hinglish: "Kyun" },
  "Risks": { hi: "जोखिम", hinglish: "Jokhim" },
  "What could change this": { hi: "क्या इसे बदल सकता है", hinglish: "Kya isse badal sakta hai" },
  "What to do next": { hi: "आगे क्या करें", hinglish: "Aage kya karein" },
  "Modules used (tap to open)": { hi: "उपयोग किए गए मॉड्यूल (खोलने के लिए दबाएँ)", hinglish: "Use hue modules (kholne ke liye dabayein)" },
  "Intent detection": { hi: "आपका इरादा", hinglish: "Aapka irada" },
  "Mood reading": { hi: "मनोदशा", hinglish: "Mood" },
  "Silence reading": { hi: "चुप्पी का अर्थ", hinglish: "Chuppi ka matlab" },
  "Choices compared": { hi: "विकल्पों की तुलना", hinglish: "Vikalpon ki tulna" },
  "Astrology (Prashna chart)": { hi: "ज्योतिष (प्रश्न कुंडली)", hinglish: "Jyotish (Prashna chart)" },
  "Reasoning": { hi: "तर्क", hinglish: "Tark" },
  "Recommendation by SIVI module": { hi: "SIVI मॉड्यूल की सिफ़ारिश", hinglish: "SIVI module ki sifarish" },
  "What the AJIT module found": { hi: "AJIT मॉड्यूल ने क्या पाया", hinglish: "AJIT module ne kya paya" },
  "What the MANU module found": { hi: "MANU मॉड्यूल ने क्या पाया", hinglish: "MANU module ne kya paya" },
  "What the RSMI module found": { hi: "RSMI मॉड्यूल ने क्या पाया", hinglish: "RSMI module ne kya paya" },
  "How the answer was reasoned": { hi: "उत्तर कैसे तय हुआ", hinglish: "Jawab kaise tay hua" },
  "Best choice": { hi: "सबसे अच्छा विकल्प", hinglish: "Sabse accha vikalp" },
  "Other choices": { hi: "अन्य विकल्प", hinglish: "Doosre vikalp" },
  "Why this order": { hi: "यह क्रम क्यों", hinglish: "Yeh kram kyun" },
  "Your situation, as understood": { hi: "आपकी स्थिति, जैसी समझी गई", hinglish: "Aapki sthiti, jaisi samjhi gayi" },
  "Another way round": { hi: "दूसरा रास्ता", hinglish: "Doosra rasta" },
  "STEPS": { hi: "कदम", hinglish: "KADAM" },
  "1. Will it happen?": { hi: "1. क्या यह होगा?", hinglish: "1. Kya yeh hoga?" },
  "2. By when?": { hi: "2. कब तक?", hinglish: "2. Kab tak?" },
  "3. How the chart reads": { hi: "3. कुंडली का विश्लेषण", hinglish: "3. Chart ka vishleshan" },
  "4. Chart used": { hi: "4. उपयोग की गई कुंडली", hinglish: "4. Use kiya gaya chart" },
  "WHAT HELPS": { hi: "क्या मदद करता है", hinglish: "KYA MADAD KARTA HAI" },
  "WHAT HOLDS IT BACK": { hi: "क्या रोकता है", hinglish: "KYA ROKTA HAI" },
  "What it may mean": { hi: "इसका क्या अर्थ हो सकता है", hinglish: "Iska kya matlab ho sakta hai" },
  "How to find out": { hi: "कैसे पता करें", hinglish: "Kaise pata karein" },
  "Not known yet": { hi: "अभी पता नहीं", hinglish: "Abhi pata nahi" },
  "Read this in:": { hi: "इसे पढ़ें:", hinglish: "Isse padhein:" },
  "As written": { hi: "जैसा लिखा है", hinglish: "Jaisa likha hai" },
  "Show dasha details (for timing questions)": { hi: "दशा विवरण दिखाएँ (समय वाले प्रश्नों के लिए)", hinglish: "Dasha details dikhayein (samay wale sawaalon ke liye)" },
  "Hide dasha details": { hi: "दशा विवरण छिपाएँ", hinglish: "Dasha details chhupayein" },
  "Benefits, downsides, unknowns": { hi: "लाभ, हानि, अनिश्चितता", hinglish: "Labh, nuksaan, anishchitata" },
  "Hide details": { hi: "विवरण छिपाएँ", hinglish: "Details chhupayein" },
};

export function useT(): (text: string) => string {
  const lang = useContext(LangContext);
  return (text) => (lang === "en" ? text : LABELS[text]?.[lang] ?? text);
}

export function useUiLang(): UiLang {
  return useContext(LangContext);
}
