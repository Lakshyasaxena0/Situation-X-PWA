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

/** Words that say a feeling is about the past ("I was angry yesterday"). Counted only for emotions. */
export const PAST_MARKERS = new Set(["was", "were", "had", "used", "yesterday", "ago", "earlier", "tha", "thi", "pehle", "kal", "\u092a\u0939\u0932\u0947", "\u0925\u093e", "\u0925\u0940"]);
/** Words that say it is how the person feels now. A clause with one of these is never "past". */
export const PRESENT_MARKERS = new Set(["am", "im", "feel", "feeling", "feels", "hai", "hoon", "hu", "raha", "rahi", "rahe", "now", "today", "abhi", "aaj", "currently", "still", "lag", "\u0939\u0942\u0902", "\u0939\u0942\u0901", "\u0930\u0939\u093e", "\u0930\u0939\u0940", "\u0905\u092d\u0940"]);
export const PAST_FACTOR = 0.7;
/** "!" or CAPITALS in the sentence. */
export const EMPHASIS_FACTOR = 1.2;

// ---- emotions (MANU) ------------------------------------------------------
// Same weights and negation rules as above. For feelings a negation almost always cancels them
// ("I am not worried"), so every entry is "cancel".

const feel = (weight: number, ...terms: string[]) => entries(weight, "cancel")(...terms);

export const EMOTION_VOCABULARY: Vocabulary = {
  stressed: [
    ...feel(2, "pressure mein", "tension mein", "cant handle", "cant cope", "cant take it", "too much to handle", "burnt out", "burn out", "kaam ka load", "dabav mein"),
    ...feel(1.5, "overwhelm*", "burnout", "tension le", "exhausted"),
    ...feel(1, "stress*", "pressure", "burden", "tension", "deadline", "dabav", "load", "\u0924\u0928\u093e\u0935", "\u0926\u092c\u093e\u0935"),
    ...feel(0.5, "too much", "no time", "thak*", "tired", "\u0925\u0915"),
  ],
  anxious: [
    ...feel(2, "chinta ho rahi", "chinta ho raha", "dar lag raha", "dar lag rahi", "cant stop worrying", "cant stop thinking", "cant sleep", "what if", "kya hoga"),
    ...feel(1.5, "overthink*", "ghabra*", "ghabrahat", "panic*", "dread", "bechaini", "\u0918\u092c\u0930\u093e\u0939\u091f"),
    ...feel(1, "anxious", "anxiety", "worried", "worry", "worries", "worrying", "fear", "scared", "afraid", "nervous", "uneasy", "chinta", "dar", "darr", "\u091a\u093f\u0902\u0924\u093e", "\u0921\u0930"),
  ],
  angry: [
    ...feel(2, "gusse mein", "gussa aa raha", "gussa aa rahi", "fed up", "sick of", "sick and tired", "khoon khaul"),
    ...feel(1.5, "furious", "rage", "pissed", "bhadak*", "krodh", "nafrat", "\u0928\u092b\u0930\u0924"),
    ...feel(1, "angry", "anger", "frustrat*", "irritat*", "annoy*", "hate", "hated", "resent*", "mad", "gussa", "chidh*", "\u0917\u0941\u0938\u094d\u0938\u093e", "\u091a\u093f\u0922\u093c"),
  ],
  sad: [
    ...feel(2, "bura lag raha", "bura lag rahi", "dil toot", "dil tut", "feeling low", "feel low", "heartbroken", "heart broken", "hopeless", "worthless"),
    ...feel(1.5, "bura lag", "toot gaya", "ro raha", "ro rahi", "depressed", "depression", "lonely", "grief", "give up", "let down"),
    ...feel(1, "sad", "hurt", "cry", "crying", "tears", "regret*", "disappointed", "empty", "dukh", "udaas", "udas", "rona", "afsos", "pachta*", "\u0909\u0926\u093e\u0938", "\u0926\u0941\u0916"),
    ...feel(0.5, "alone", "miss", "akela", "akeli", "low"),
  ],
  confused: [
    ...feel(2, "samajh nahi aa raha", "samajh nahi aa rahi", "cant decide", "mixed feelings", "dont know what to do", "kya karu samajh nahi", "\u0909\u0932\u091d\u0928"),
    ...feel(1.5, "not sure", "dont know", "pata nahi", "samajh nahi", "uljh*", "ulajh*", "dwidha", "torn between", "\u092a\u0924\u093e \u0928\u0939\u0940\u0902", "\u0938\u092e\u091d \u0928\u0939\u0940\u0902"),
    ...feel(1, "confus*", "uncertain*", "doubt*", "unsure", "no idea", "torn", "dilemma", "confuse"),
    ...feel(0.5, "lost"),
  ],
  calm: [
    ...feel(1, "theek hoon", "theek hu", "sab theek", "all good", "im fine", "i am fine", "im okay", "i am okay", "doing fine", "at peace", "thinking clearly", "clear headed", "shant", "\u0920\u0940\u0915 \u0939\u0942\u0902", "\u0936\u093e\u0902\u0924"),
    ...feel(1, "calm", "peaceful", "relaxed", "composed", "stable", "normal"),
    ...feel(0.5, "fine", "okay", "theek hai", "theek"),
  ],
};

/** Words that make a feeling bigger or an overall state worse. Added to the intensity, not to the emotion. */
export const INTENSITY_CUES: Vocabulary = {
  absolute: [...entries(0.5, "cancel")("always", "never", "everything", "nothing", "no one", "nobody", "everyone", "hamesha", "kabhi nahi", "sab kuch", "kuch nahi", "koi nahi", "\u0939\u092e\u0947\u0936\u093e")],
  limit: [...entries(1, "cancel")("cant take", "cant anymore", "cant do this", "breaking point", "too much", "unbearable", "bardasht", "bas ab", "thak gaya", "thak gayi")],
};

/** Phrases that mean the person may be in danger. MANU only raises a flag so the answer is written with care. */
export const CRISIS_VOCABULARY: Vocabulary = {
  crisis: [...entries(4, "cancel")("kill myself", "end my life", "end it all", "want to die", "wanna die", "suicide", "suicidal", "no reason to live", "better off without me", "marna chahta", "marna chahti", "mar jaun", "jeena nahi chahta", "jeena nahi chahti", "khud ko khatam", "aatmhatya", "\u0906\u0924\u094d\u092e\u0939\u0924\u094d\u092f\u093e")],
};
