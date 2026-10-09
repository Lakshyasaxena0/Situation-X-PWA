// Vocabulary for AJIT (intent). English, Hinglish and Hindi words with a weight each.
//
// weight   how strongly the word says "this is about <intent>":
//          2   an explicit phrase ("should i", "kya karu", "relationship")
//          1   a normal topic word ("job", "partner")
//          0.5 a generic word that fits many topics ("problem", "work", "family")
// negation what happens when the word is negated ("I do NOT have pain", "no problem"):
//          "cancel"  the word is dropped (a symptom or problem the person says they do not have)
//          "soften"  the topic stays, because wanting to avoid something is still about it
//                    ("I don't want to fight" is a conflict question, from the avoiding side)
//
// A term ending in "*" matches any word that starts with it ("decid*" -> decide, deciding).
// Other terms match the word itself and its plain endings (s, es, ed, d, ing).

export type VocabEntry = { term: string; weight: number; negation: "cancel" | "soften" };
export type Vocabulary = Record<string, VocabEntry[]>;

const entries =
  (weight: number, negation: "cancel" | "soften") =>
  (...terms: string[]): VocabEntry[] =>
    terms.map((term) => ({ term, weight, negation }));

const topic = entries(1, "soften");
const strong = entries(2, "soften");
const generic = entries(0.5, "cancel");
const state = entries(1, "cancel");

export const INTENT_VOCABULARY: Vocabulary = {
  decision: [
    ...strong("should i", "should we", "what should", "kya karu", "kya karun", "kya karna chahiye", "kya mujhe", "kare ya na", "ya nahi karu", "mujhe kya karna", "pros and cons", "worth it", "dilemma", "confused between", "kya sahi hoga", "क्या करूं", "क्या मुझे"),
    ...topic("decid*", "choose", "chose", "option", "select*", "konsa", "kaun sa", "which one", "either", "chunna", "chunu", "faisla", "nirnay", "फैसला", "चुनूं", "कौन सा"),
    ...generic("better to", "or not", "ya phir"),
  ],
  relationship: [
    ...strong("relationship", "रिश्ता", "rishta"),
    ...topic("love", "girlfriend", "boyfriend", "partner", "marriage", "marry", "married", "breakup", "break up", "husband", "wife", "spouse", "dating", "crush", "divorce", "fiance", "fiancee", "ex", "in laws", "sasural", "shaadi", "shadi", "vivah", "pyaar", "pyar", "ladki", "ladka", "patni", "pati", "biwi", "mangetar", "प्यार", "शादी", "पति", "पत्नी", "लड़की", "लड़का"),
    ...generic("family", "parents", "mother", "father", "mummy", "papa", "friend", "dost", "दोस्त"),
  ],
  conflict: [
    ...topic("fight", "argument", "argue", "quarrel", "dispute", "clash", "misunderstanding", "ladhai", "jhagda", "jhagra", "enemy", "rival", "harass*", "bully", "bullying", "betray*", "cheated", "complaint", "blame", "insult*", "court", "lawsuit", "vivad", "झगड़ा", "लड़ाई", "विवाद", "दुश्मन"),
    ...generic("problem", "issue", "legal", "police", "case", "gussa", "tension", "samasya", "समस्या"),
  ],
  career: [
    ...topic("job", "career", "salary", "promotion", "college", "study", "studies", "exam", "interview", "resume", "business", "startup", "boss", "office", "company", "resign*", "naukri", "padhai", "degree", "university", "course", "placement", "income", "client", "appraisal", "internship", "नौकरी", "करियर", "पढ़ाई", "परीक्षा", "व्यापार"),
    ...generic("work", "future", "offer", "quit", "project", "profit", "paisa", "kaam", "काम"),
  ],
  health: [
    ...strong("health", "sehat", "सेहत", "स्वास्थ्य"),
    ...state("pain", "disease", "illness", "sick", "fever", "headache", "injury", "injured", "symptom*", "insomnia", "depression", "depressed", "bimar", "bimari", "dard", "बीमारी", "दर्द", "बुखार"),
    ...topic("doctor", "hospital", "surgery", "medicine", "treatment", "diagnos*", "cancer", "diabetes", "blood pressure", "therapy", "dawai", "ilaaj", "इलाज", "दवाई"),
    ...entries(0.75, "cancel")("anxiety"),
    ...entries(0.5, "cancel")("stress*", "sleep", "tired", "thakan"),
  ],
};

// ---- context words -------------------------------------------------------

/** Negators that come BEFORE the word they negate ("I do not want to fight", "no problem"). */
export const NEGATORS_BEFORE = new Set([
  "not", "no", "never", "dont", "doesnt", "didnt", "wont", "wouldnt", "cant", "cannot", "couldnt", "isnt", "arent", "wasnt", "werent", "shouldnt", "without", "neither", "nor", "avoid", "avoiding", "stop", "stopping", "nahi", "nahin", "nhi", "nai", "mat", "bina", "नहीं", "नही", "मत", "बिना",
]);

/** Hindi puts the negator AFTER the word ("ladhai nahi karni", "dard nahi hai"). */
export const NEGATORS_AFTER = new Set(["nahi", "nahin", "nhi", "nai", "mat", "na", "नहीं", "नही", "मत", "ना"]);

/** Words that say the person WANTS or plans something; with a negator they mean "I want to avoid it". */
export const DESIRE_CUES = new Set([
  "want", "wanna", "wish", "like", "need", "plan", "planning", "should", "shouldnt", "avoid", "stop", "chahta", "chahti", "chahiye", "chahte", "karna", "karni", "karne", "karunga", "karungi", "karu", "bachna", "चाहता", "चाहती", "चाहिए", "करना", "करनी",
]);

export const INTENSIFIERS = new Set(["very", "really", "so", "extremely", "totally", "completely", "badly", "bahut", "bohot", "bohat", "kaafi", "behad", "bilkul", "बहुत", "काफी"]);
export const DIMINISHERS = new Set(["slightly", "little", "bit", "somewhat", "thoda", "thodi", "thora", "थोड़ा", "थोड़ी"]);

/** Words that start a new clause: a negator before them does not reach across. */
export const CLAUSE_BREAKS = /(?:[,;:()—]+|\b(?:but|however|although|though|lekin|magar|parantu|kintu|while|whereas)\b|(?:लेकिन|मगर|परंतु|किंतु))/giu;

/** How much a negated "soften" word still counts: the topic is still there. */
export const SOFTEN_FACTOR = 1;
export const INTENSIFIER_FACTOR = 1.3;
export const DIMINISHER_FACTOR = 0.7;
/** Words inside a question sentence matter a little more: that is where the real ask usually is. */
export const QUESTION_FACTOR = 1.25;
