// Ethical filter: keeps the app safe BEFORE and AFTER the AI.
//
//   1. assessSafety(text)       reads the message in context and decides:
//        allow     nothing unsafe, the normal pipeline runs
//        support   the person may be in danger (self-harm): the analysis runs, written with care, and
//                  help lines are shown
//        redirect  the person voices an intention to harm, control or deceive someone: the analysis runs
//                  in a guarded mode (it will not help with that aim, it de-escalates) and a notice is shown
//        block     instructions for violence, weapons, self-harm methods, or sexual content about minors:
//                  nothing is analysed, nothing is charged, a safe message is returned
//   2. checkOutputSafety(texts) validates what the AI wrote before the person sees it.
//
// It does NOT delete "dangerous" words. A word on its own means little ("I want to prevent harm" and
// "I want to cause harm" use the same word), so each clause is judged by the word AND its context:
// negation ("I don't want to hurt anyone"), protection ("how do I stop him hurting me"), who is
// the victim ("he hurt me"), exaggeration ("I could kill him", "kill time"), fiction, and whether the
// person states an intention, a target, a plan or asks for instructions.
//
// It is still rules, in English, Hinglish and Hindi, so it can miss unusual phrasing or flag
// something harmless. That is why the AI prompt also carries the safety note, and the AI's own answer
// is checked again below.

import type { Language } from "./analysis-options.js";

export type SafetyAction = "allow" | "support" | "redirect" | "block";
export type SafetyCategory = "none" | "self_harm" | "self_harm_method" | "harm_others" | "weapons" | "minor_sexual" | "manipulation";

export type SafetyDecision = {
  action: SafetyAction;
  category: SafetyCategory;
  /** What the person is shown (support / redirect / block), in their language. */
  message?: string;
  /** Why this decision was taken, for the FILTER card. */
  reasons: string[];
  /** The words that triggered it. */
  matched: string[];
  /** Instruction for the AI prompt (support / redirect). */
  guard?: string;
};

// ---------------------------------------------------------------- text helpers

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lower case, no apostrophes (don't -> dont), punctuation to spaces; keeps Hindi letters and marks. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Whole-word / whole-phrase matcher; a trailing * allows any word ending ("kill*" -> killing). */
function re(terms: string[]): RegExp {
  const body = terms.map((t) => (t.endsWith("*") ? `${esc(t.slice(0, -1))}[\\p{L}\\p{M}]*` : esc(t))).join("|");
  return new RegExp(`(?:^|\\s)(${body})(?=\\s|$)`, "gu");
}

type Hit = { text: string; index: number };
function find(rx: RegExp, s: string): Hit[] {
  rx.lastIndex = 0;
  const out: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(s))) {
    out.push({ text: m[1], index: m.index + (m[0].length - m[1].length) });
    if (m[0].length === 0) rx.lastIndex++;
  }
  return out;
}
const any = (rx: RegExp, s: string) => find(rx, s).length > 0;

const tokensBefore = (s: string, index: number, n: number) => s.slice(0, index).split(" ").filter(Boolean).slice(-n);
const tokensAfter = (s: string, index: number, len: number, n: number) => s.slice(index + len).split(" ").filter(Boolean).slice(0, n);

// ---------------------------------------------------------------- vocabulary

const NEG_BEFORE = new Set(["not", "no", "never", "dont", "doesnt", "didnt", "wont", "wouldnt", "cant", "cannot", "couldnt", "without", "nahi", "nahin", "nhi", "mat", "नहीं", "नही", "मत", "avoid", "avoiding", "prevent", "preventing", "stop", "stopping", "against"]);
const NEG_AFTER = new Set(["nahi", "nahin", "nhi", "mat", "नहीं", "नही", "मत"]);

const HARM_OTHERS = re([
  "kill*", "murder*", "shoot*", "stab*", "strangle*", "poison*", "assault*", "rape*", "behead*", "hurt*", "harm*", "attack*", "beat up", "beat him up", "beat her up", "beat them up", "burn him", "burn her", "burn them", "torture", "lynch*", "end him", "end her", "destroy his life", "destroy her life", "ruin his life", "ruin her life", "teach him a lesson", "teach her a lesson", "get rid of him", "get rid of her",
  "maar dunga", "maar dalunga", "maar dalu", "maar dungi", "maarunga", "maar dena", "jaan se maar", "jaan le lunga", "jaan lunga", "khatam kar dunga", "khatam kar dena", "khatam kar du", "khatam kar dalunga", "qatl", "katl", "nuksan pahunch*", "nuksan pahuncha*", "barbaad kar", "sabak sikha*", "sabak sikhana",
  "मार दूंगा", "मार डालूंगा", "जान से मार", "हत्या", "खत्म कर दूंगा", "नुकसान पहुंचा",
]);
const WEAPON_TERMS = re(["bomb*", "explosive*", "grenade*", "ied", "pipe bomb", "molotov*", "silencer*", "ghost gun*", "nerve agent*", "ricin", "anthrax", "sarin", "poison gas", "meth", "methamphetamine", "fentanyl", "napalm", "thermite", "zip gun", "bam", "बम"]);
const MAKE_CUES = re(["make", "making", "build", "building", "assemble", "synthesi*", "cook", "cooking", "manufactur*", "produce", "get hold of", "buy", "purchase", "banana", "banao", "banane", "kaise bana*", "kharid*"]);
const INSTRUCTION = re(["how to", "how do i", "how can i", "how could i", "how would i", "how should i", "best way to", "easiest way to", "quickest way to", "ways to", "way to", "steps to", "step by step", "without getting caught", "undetectable", "untraceable", "without leaving a trace", "kaise", "tarika", "tariqa", "tareeka", "vidhi", "तरीका", "कैसे"]);
const INTENT = re(["i will", "ill", "im going to", "i am going to", "going to", "gonna", "i want to", "i wanna", "i plan to", "planning to", "plan to", "i have decided to", "decided to", "i must", "i am determined to", "im determined to", "i need to", "i shall", "dunga", "dungi", "karunga", "karungi", "chahta hoon", "chahta hu", "chahti hoon", "chahti hu", "chahta", "chahti", "irada", "iraada", "mann hai", "man hai", "ठान", "इरादा", "चाहता हूं", "चाहती हूं"]);
const PLAN = re(["tonight", "tomorrow", "today", "this weekend", "next week", "aaj raat", "kal raat", "aaj hi", "kal", "with a knife", "with a gun", "with acid", "with poison", "knife", "gun", "pistol", "acid", "petrol", "kerosene", "rope", "talwar", "chaku", "tamanch*", "tezaab", "when he is alone", "when she is alone", "when they are asleep", "while he sleeps", "while she sleeps", "at night"]);
const TARGET = re(["him", "her", "them", "someone", "somebody", "anyone", "everyone", "people", "he", "she", "they", "his", "their", "my boss", "my wife", "my husband", "my ex", "my neighbour", "my neighbor", "my brother", "my sister", "my mother in law", "my father in law", "my colleague", "my teacher", "usko", "use", "usse", "unko", "unhe", "kisi ko", "sabko", "sasur", "saas", "padosi", "pati ko", "patni ko", "boss ko", "ex ko", "उसको", "उसे", "उन्हें", "किसी को"]);
const VICTIM = /(?:^|\s)(?:hurt|hit|beat|beats|beating|attack\w*|abus\w*|harass\w*|threat\w*|assault\w*|rap\w*|kill\w*|stab\w*|shoot\w*|poison\w*|hurting|harming)\s+(?:me|us)(?=\s|$)|(?:^|\s)ne\s+(?:mujhe|mujhko|hume|humein)(?=\s|$)|(?:^|\s)i\s+(?:was|am|got|have been|had been)\s+(?:being\s+)?(?:hurt|hit|beaten|attacked|abused|harassed|threatened|assaulted|raped|stabbed|shot|poisoned|blackmailed|stalked)/u;
const PROTECT = re(["prevent*", "protect*", "avoid*", "stop*", "save", "rescue", "afraid", "scared", "fear*", "victim*", "survivor*", "report*", "police", "helpline", "legal action", "complaint", "how to help", "help someone", "bachao", "bachana", "bacha", "rok*", "darr", "dar", "ghabra*", "worried that", "worried about", "in self defence", "self defense", "self defence", "rakhsha", "सुरक्षा", "बचाव", "बचाना"]);
const HYPERBOLE = re(["could", "might", "may", "would love to", "feel like", "feels like", "felt like", "feeling like", "ready to", "so angry", "so mad", "lagta hai", "lagta", "mann karta", "man karta", "man karta hai", "mann karta hai", "ho jata", "ho jaata", "jaisa lag", "joke", "jokes", "joking", "jk", "lol", "lmao", "haha"]);
const IDIOM = /(?:^|\s)(?:kill(?:ing|ed|s)?\s+(?:time|it|the\s+(?:vibe|mood|buzz|lights|engine|session|game)|me\s+(?:with|softly|slowly)?|this\s+(?:project|task|bug))|killing\s+me|murder(?:ed|ing)?\s+(?:the|that|this|my)\s+(?:exam|test|interview|presentation|pitch|performance|round)|dying\s+to|dead\s+tired|hurt\s+(?:feelings|sentiments)|(?:hurts|hurt)\s+(?:a\s+lot|so\s+much|badly)|time\s+pass|attack\s+(?:of|on\s+the\s+problem)|panic\s+attack|heart\s+attack|anxiety\s+attack|asthma\s+attack|harm\s+(?:reduction)|harmless)(?=\s|$)/u;
const FICTION = re(["story", "novel", "movie", "film", "script", "character", "fiction", "game", "show", "series", "book", "screenplay", "anime", "episode", "kahani", "कहानी", "फिल्म"]);

const SELF_IDEATION = re([
  "kill myself", "end my life", "end it all", "take my own life", "want to die", "wants to die", "wanted to die", "wanna die", "wants to kill himself", "wants to kill herself", "wants to end his life", "wants to end her life", "wants to end their life", "thinking of killing himself", "thinking of killing herself", "wish i was dead", "wish i were dead", "better off dead", "better off without me", "no reason to live", "no point in living", "dont want to live", "dont want to be alive", "suicid*", "hurt myself", "harm myself", "cut myself", "hang myself", "overdose on purpose",
  "marna chahta", "marna chahti", "mar jaun", "mar jana chahta", "mar jana chahti", "jeena nahi chahta", "jeena nahi chahti", "jine ka mann nahi", "jeene ka mann nahi", "khud ko khatam", "khud ko nuksan", "aatmhatya", "jaan de dun", "jaan dene",
  "आत्महत्या", "मरना चाहता", "मरना चाहती", "जीना नहीं चाहता", "जीना नहीं चाहती", "खुद को खत्म",
]);
const SELF_METHOD = re(["painless way to die", "painless way to kill", "ways to die", "way to die", "best way to die", "easiest way to die", "how many pills", "lethal dose", "fatal dose", "how to commit suicide", "how to kill myself", "how to end my life", "how to hang", "kaise mar", "kaise marun", "marne ka tarika", "marne ke tarike"]);
const SUICIDE_EDU = re(["suicide prevention", "prevent suicide", "suicide rate*", "suicide statistics", "suicide awareness", "suicide hotline", "suicide helpline", "how to help someone", "help a friend", "documentary", "research", "article", "essay"]);
const OTHER_PERSON = new Set(["friend", "brother", "sister", "he", "she", "wife", "husband", "son", "daughter", "colleague", "someone", "mother", "mom", "father", "dad", "dost", "bhai", "behen", "mummy", "papa", "uncle", "aunt", "student", "patient"]);
const FIRST_PERSON = new Set(["i", "im", "ive", "me", "myself", "main", "mai", "mujhe"]);

const MANIPULATION = re([
  "blackmail*", "stalk*", "spy on", "track her", "track him", "track his", "track her phone", "hack her", "hack his", "hack their", "manipulate her", "manipulate him", "manipulate them", "revenge porn", "leak her", "leak his", "defame", "get revenge", "take revenge", "revenge on", "badla lena", "badla lunga", "badla loonga", "badla lungi",
  "vashikaran", "vashikaran", "वशीकरण", "jadu tona", "jaadu tona", "black magic on", "kala jadu", "maran prayog", "maaran", "ucchatan", "uchchatan", "tantra to control", "tantra se control", "control her mind", "control his mind", "control his life", "control her life", "mind control",
]);
const MANIP_VICTIM = re(["being blackmailed", "blackmailed me", "blackmailing me", "stalking me", "stalked me", "being stalked", "manipulating me", "manipulated me", "being manipulated", "spying on me", "hacked my", "leaked my", "defamed me", "defaming me", "mujhe blackmail", "mujhe dara", "blackmail kar raha", "blackmail kar rahi"]);

const MINOR = /(?:^|\s)(?:child|children|kid|kids|minor|minors|underage|under age|schoolgirl|school girl|schoolboy|school boy|toddler|teenage girl|teenage boy|nabalig|bachcha|bachchi|bacchi|bachche|बच्चा|बच्ची|बच्चे|नाबालिग)(?=\s|$)|(?:^|\s)(?:[0-9]|1[0-7])\s*(?:year|yr|saal|sal|years|yrs)\s*(?:old)?(?=\s|$)/u;
const SEXUAL = re(["sex", "sexual", "sexually", "nude", "nudes", "naked", "porn*", "intimate", "erotic", "sexy", "molest*", "grope*", "seduce", "undress", "touch her body", "touch his body", "यौन"]);
const MINOR_PROTECT = re(["protect*", "stop", "report*", "complaint", "safe", "safety", "abuse", "abused", "victim", "survivor", "pocso", "police", "counsel*", "parent*", "teach*", "educat*", "awareness", "bachao", "bachana", "worried", "scared"]);

// ---------------------------------------------------------------- messages

const HELP_EN = "In India you can call Tele-MANAS (14416, free, 24x7) or KIRAN (1800-599-0019); in an emergency call 112. Elsewhere, findahelpline.com lists local lines, or call your local emergency number.";
const HELP_HI = "Bharat mein aap Tele-MANAS (14416, free, 24x7) ya KIRAN (1800-599-0019) par baat kar sakte hain; emergency mein 112 dial karein. Doosre desh mein findahelpline.com par local helpline milegi.";
const HELP_DEV = "भारत में आप Tele-MANAS (14416, मुफ़्त, 24x7) या KIRAN (1800-599-0019) पर बात कर सकते हैं; आपातकाल में 112 डायल करें। दूसरे देशों में findahelpline.com पर स्थानीय हेल्पलाइन मिलेगी।";

type Msg = { en: string; hinglish: string; hi: string };
const MESSAGES: Record<Exclude<SafetyCategory, "none">, Msg> = {
  self_harm: {
    en: `I'm really sorry you are going through this, and I'm glad you said it. Your safety matters more than any analysis. Please reach out to someone you trust right now, a family member or friend, and stay with them. ${HELP_EN} You deserve support, and this feeling can change. The reading below is written gently; please do not decide anything big while you are in this much pain.`,
    hinglish: `Mujhe afsos hai ki aap itne mushkil waqt se guzar rahe hain, aur aapne bataya, yeh acha kiya. Aapki safety kisi bhi analysis se zyada zaroori hai. Abhi kisi apne par bharosa karke baat kijiye, parivaar ya dost, aur unke saath rahiye. ${HELP_HI} Aap support ke haqdaar hain, aur yeh feeling badal sakti hai. Neeche ka reading narmi se likha gaya hai; itne dard mein koi bada faisla mat lijiye.`,
    hi: `मुझे अफ़सोस है कि आप इतने मुश्किल समय से गुज़र रहे हैं, और आपने बताया, यह अच्छा किया। आपकी सुरक्षा किसी भी विश्लेषण से ज़्यादा ज़रूरी है। अभी किसी अपने से बात कीजिए, परिवार या दोस्त, और उनके साथ रहिए। ${HELP_DEV} आप सहारे के हक़दार हैं, और यह एहसास बदल सकता है। नीचे का आकलन नरमी से लिखा गया है; इतने दर्द में कोई बड़ा फ़ैसला मत लीजिए।`,
  },
  self_harm_method: {
    en: `I can't help with ways to hurt yourself, but I do care about what you are feeling. You are not alone in this. Please contact someone you trust right now and stay with them. ${HELP_EN} If you want, tell me what is weighing on you and we can look at it together, step by step.`,
    hinglish: `Main khud ko nuksan pahunchane ke tarikon mein madad nahi kar sakta, lekin aap jo mehsoos kar rahe hain uski mujhe parvah hai. Aap akele nahi hain. Abhi kisi apne se baat kijiye aur unke saath rahiye. ${HELP_HI} Chahein to bataiye ki aapko kya pareshan kar raha hai, hum milkar ek ek step dekhenge.`,
    hi: `मैं खुद को नुकसान पहुंचाने के तरीकों में मदद नहीं कर सकता, लेकिन आप जो महसूस कर रहे हैं उसकी मुझे परवाह है। आप अकेले नहीं हैं। अभी किसी अपने से बात कीजिए और उनके साथ रहिए। ${HELP_DEV} चाहें तो बताइए कि आपको क्या परेशान कर रहा है, हम मिलकर एक-एक कदम देखेंगे।`,
  },
  harm_others: {
    en: "I can't help with hurting someone or planning it. If you are angry or in danger, I can help you cool down, set a boundary, or look at safe, legal options such as talking, mediation, or complaining to the right authority. If someone is in immediate danger, call 112 (India) or your local emergency number.",
    hinglish: "Main kisi ko nuksan pahunchane ya uski planning mein madad nahi kar sakta. Agar aap gusse mein hain ya khatre mein, to main aapko shaant hone, boundary set karne, ya safe aur kanooni raaste dekhne mein madad kar sakta hoon, jaise baat karna, mediation, ya sahi authority ko complaint. Agar kisi ki jaan khatre mein hai to 112 (India) dial kijiye.",
    hi: "मैं किसी को नुकसान पहुंचाने या उसकी योजना बनाने में मदद नहीं कर सकता। अगर आप गुस्से में हैं या ख़तरे में, तो मैं शांत होने, सीमा तय करने, या सुरक्षित और कानूनी रास्ते देखने में मदद कर सकता हूं, जैसे बात करना, मध्यस्थता, या सही अधिकारी से शिकायत। अगर किसी की जान ख़तरे में है तो 112 (भारत) डायल कीजिए।",
  },
  weapons: {
    en: "I can't help with making weapons, explosives or dangerous substances. If you are worried about safety, a threat, or something you found, please contact the police (112 in India). I'm glad to help with a different question.",
    hinglish: "Main hathiyaar, vishfot ya khatarnak cheezein banane mein madad nahi kar sakta. Agar aapko safety, kisi dhamki ya kuch mile hue saaman ki chinta hai to police (India mein 112) ko batayiye. Koi aur sawaal ho to zaroor poochiye.",
    hi: "मैं हथियार, विस्फोटक या ख़तरनाक पदार्थ बनाने में मदद नहीं कर सकता। अगर आपको सुरक्षा, किसी धमकी या मिली हुई किसी चीज़ की चिंता है तो पुलिस (भारत में 112) को बताइए। कोई और सवाल हो तो ज़रूर पूछिए।",
  },
  minor_sexual: {
    en: "I can't help with anything sexual involving children or minors. If a child is at risk, please contact the police (112) or Childline India (1098).",
    hinglish: "Main bachchon ya nabalig se jude kisi bhi sexual vishay mein madad nahi kar sakta. Agar koi bachcha khatre mein hai to police (112) ya Childline India (1098) ko turant batayiye.",
    hi: "मैं बच्चों या नाबालिगों से जुड़े किसी भी यौन विषय में मदद नहीं कर सकता। अगर कोई बच्चा ख़तरे में है तो पुलिस (112) या चाइल्डलाइन इंडिया (1098) को तुरंत बताइए।",
  },
  manipulation: {
    en: "I won't help to control, deceive, stalk or take revenge on someone, including through vashikaran or black magic; that harms them and usually backfires on you. What I can do is read your situation honestly: what you want, what is in your control, and respectful ways forward.",
    hinglish: "Main kisi ko control karne, dhokha dene, stalk karne ya badla lene mein madad nahi karunga, vashikaran ya kala jadu se bhi nahi; isse samne wale ko nuksan hota hai aur aksar aap par hi ulta padta hai. Main aapki situation ko imaandari se padh sakta hoon: aap kya chahte hain, kya aapke control mein hai, aur izzat ke saath aage ke raaste.",
    hi: "मैं किसी को नियंत्रित करने, धोखा देने, पीछा करने या बदला लेने में मदद नहीं करूंगा, वशीकरण या काले जादू से भी नहीं; इससे दूसरे को नुकसान होता है और अक्सर आप पर ही उलटा पड़ता है। मैं आपकी स्थिति को ईमानदारी से पढ़ सकता हूं: आप क्या चाहते हैं, क्या आपके नियंत्रण में है, और सम्मान के साथ आगे के रास्ते।",
  },
};

const GUARDS: Record<"support" | "redirect", string> = {
  support:
    "SAFETY: the text may point to a person who is in distress or danger. Put care first: say kindly that you are concerned, encourage reaching a trusted person or a local helpline now, and keep the advice gentle and practical. Never describe or hint at methods of self-harm, and do not push the person toward any big irreversible decision.",
  redirect:
    "SAFETY: the text voices an intention to harm, control, deceive or take revenge on someone. Do NOT help with that aim and do NOT offer any path that does it (no revenge, blackmail, stalking, manipulation, vashikaran or black magic). Acknowledge the feeling, de-escalate, and focus on lawful, respectful options: talking, setting boundaries, mediation, legal or professional help.",
};

function languageOf(text: string, language: Language): keyof Msg {
  if (language === "en") return "en";
  if (language === "hi") return "hi";
  if (language === "hinglish") return "hinglish";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  const hinglish = /(?:^|\s)(?:hai|hoon|hu|mujhe|mera|meri|kya|nahi|karu|kaise|kab|aur|lekin|bahut|chahta|chahti|ho|raha|rahi|se|ko|ka|ki|ke)(?=\s|$)/;
  return hinglish.test(norm(text)) ? "hinglish" : "en";
}

// ---------------------------------------------------------------- the assessment

const SEVERITY: Record<SafetyAction, number> = { allow: 0, redirect: 1, support: 2, block: 3 };

type Finding = { action: SafetyAction; category: SafetyCategory; reason: string; matched: string[] };

/** Splits into clauses: sentences, and the parts either side of "but / lekin". */
function clausesOf(text: string): string[] {
  return text
    .split(/[.!?।\n;]+/u)
    .flatMap((s) => s.split(/\b(?:but|however|although|though|lekin|magar|parantu)\b|लेकिन|मगर/iu))
    .map(norm)
    .filter(Boolean);
}

/** True when a negator stands right before the hit or right after it ("nahi karna"). */
function negatedAt(c: string, hit: Hit): boolean {
  const before = tokensBefore(c, hit.index, 4);
  if (before.some((t) => NEG_BEFORE.has(t))) return true;
  return tokensAfter(c, hit.index, hit.text.length, 3).some((t) => NEG_AFTER.has(t));
}

function assessClause(c: string): Finding[] {
  const out: Finding[] = [];
  const idiom = IDIOM.test(c);
  const fiction = any(FICTION, c);
  const instruction = any(INSTRUCTION, c);

  // Weapons and dangerous substances: asking how to make or get them.
  const weapon = find(WEAPON_TERMS, c);
  if (weapon.length && (any(MAKE_CUES, c) || instruction) && !any(PROTECT, c)) {
    out.push({ action: "block", category: "weapons", reason: "Asks how to make or get a weapon or dangerous substance", matched: weapon.map((h) => h.text) });
  }

  // Sexual content involving minors (unless the person is trying to protect a child).
  if (MINOR.test(c) && any(SEXUAL, c) && !any(MINOR_PROTECT, c)) {
    out.push({ action: "block", category: "minor_sexual", reason: "Sexual content involving a minor", matched: find(SEXUAL, c).map((h) => h.text) });
  }

  // Self-harm.
  if (!any(SUICIDE_EDU, c)) {
    const ideation = find(SELF_IDEATION, c).filter((h) => !negatedAt(c, h));
    const method = find(SELF_METHOD, c);
    const before = ideation.length ? tokensBefore(c, ideation[0].index, 5) : [];
    const other = before.some((t) => OTHER_PERSON.has(t)) && !before.some((t) => FIRST_PERSON.has(t));
    if (method.length || (ideation.length && !other && instruction && !any(PROTECT, c))) {
      out.push({ action: "block", category: "self_harm_method", reason: "Asks for a way to end or harm one's own life", matched: [...method, ...ideation].map((h) => h.text) });
    } else if (ideation.length) {
      out.push({
        action: "support",
        category: "self_harm",
        reason: other ? "Mentions someone else who may be thinking of self-harm" : "Words that may point to thoughts of self-harm",
        matched: ideation.map((h) => h.text),
      });
    }
  }

  // Harm to other people.
  const harms = find(HARM_OTHERS, c).filter((h) => !negatedAt(c, h));
  if (harms.length && !idiom && !VICTIM.test(c)) {
    const protect = any(PROTECT, c);
    const hyperbole = any(HYPERBOLE, c) && !instruction;
    const target = any(TARGET, c);
    const intent = any(INTENT, c);
    const plan = any(PLAN, c);
    const matched = harms.map((h) => h.text);
    if (protect || hyperbole || (fiction && !instruction)) {
      // Prevention, exaggeration ("I could kill him") and fiction are allowed; MANU will read the anger.
    } else if (instruction && target) {
      out.push({ action: "block", category: "harm_others", reason: "Asks how to harm a person", matched });
    } else if (intent && target && plan) {
      out.push({ action: "block", category: "harm_others", reason: "States an intention to harm a person together with a plan", matched });
    } else if (intent && target) {
      out.push({ action: "redirect", category: "harm_others", reason: "States an intention to harm a person", matched });
    }
  }

  // Control, deception, stalking, revenge (including vashikaran / black magic used on a person).
  const manip = find(MANIPULATION, c).filter((h) => !negatedAt(c, h));
  if (manip.length && !any(MANIP_VICTIM, c) && !VICTIM.test(c) && !any(PROTECT, c) && !(fiction && !instruction)) {
    out.push({ action: "redirect", category: "manipulation", reason: "Asks to control, deceive, stalk or take revenge on someone", matched: manip.map((h) => h.text) });
  }
  return out;
}

export function assessSafety(text: string, language: Language = "auto"): SafetyDecision {
  const findings = clausesOf(text).flatMap(assessClause);
  if (findings.length === 0) return { action: "allow", category: "none", reasons: ["Read in context: nothing unsafe found."], matched: [] };

  const top = findings.reduce((a, b) => (SEVERITY[b.action] > SEVERITY[a.action] ? b : a));
  const lang = languageOf(text, language);
  const category = top.category as Exclude<SafetyCategory, "none">;
  return {
    action: top.action,
    category,
    message: MESSAGES[category][lang],
    reasons: [...new Set(findings.filter((f) => f.category === top.category).map((f) => f.reason))],
    matched: [...new Set(findings.filter((f) => f.category === top.category).flatMap((f) => f.matched))],
    guard: top.action === "support" || top.action === "redirect" ? GUARDS[top.action] : undefined,
  };
}

// ---------------------------------------------------------------- the AI's answer

const UNSAFE_MEDICAL = /(?:^|\s)(?:stop|quit|skip|discontinue|reduce)\s+(?:taking\s+)?(?:your\s+|the\s+)?(?:medication|medicine|medicines|pills|treatment|insulin|antidepressants?)(?=\s|$)|(?:^|\s)(?:no need|dont need|do not need)\s+(?:to\s+|for\s+)?(?:a\s+|the\s+)?(?:see\s+a\s+)?(?:doctor|treatment|therapy|therapist)(?=\s|$)|(?:^|\s)(?:dont|do not|never)\s+(?:see|visit|consult)\s+(?:a\s+|the\s+)?(?:doctor|therapist|professional)(?=\s|$)/u;
const SELF_ENCOURAGE = re(["you should die", "you should kill yourself", "end your life", "kill yourself", "take your own life", "hurt yourself", "better off dead", "you deserve to die"]);
const RECOMMEND = re(["you should", "you must", "you can", "try to", "consider", "go ahead and", "the best way is to", "i suggest", "i recommend", "make sure to", "just"]);

/**
 * Checks what the AI wrote before the person sees it. Stricter than the input check: nothing here
 * may recommend or describe harming someone, self-harm, blackmail/stalking/black magic on a person,
 * or stopping medical treatment. Returns the reasons when something must be withheld.
 */
export function checkOutputSafety(texts: string[]): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const raw of texts) {
    for (const c of clausesOf(raw)) {
      if (any(SELF_ENCOURAGE, c)) reasons.push("encourages self-harm");
      if (UNSAFE_MEDICAL.test(c) && !/(?:^|\s)(?:without|unless|before|only if|consult|ask)\s/.test(c)) reasons.push("tells the person to stop medical care");
      const manip = find(MANIPULATION, c).filter((h) => !negatedAt(c, h));
      if (manip.length && any(RECOMMEND, c) && !any(PROTECT, c)) reasons.push("suggests controlling, deceiving or taking revenge on someone");
      const harms = find(HARM_OTHERS, c).filter((h) => !negatedAt(c, h));
      if (harms.length && !IDIOM.test(c) && !VICTIM.test(c) && !any(PROTECT, c) && any(TARGET, c) && any(RECOMMEND, c)) {
        reasons.push("suggests harming a person");
      }
      if (find(WEAPON_TERMS, c).length && (any(MAKE_CUES, c) || any(INSTRUCTION, c)) && !any(PROTECT, c)) reasons.push("describes making a weapon or dangerous substance");
    }
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}
