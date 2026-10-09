// RSMI - Reasonable Silence Module.
//
// When a question mentions a silence ("I told her this and she went quiet", "he has not replied for
// two days", "HR has been silent since the interview"), RSMI lists the reasonable meanings that silence
// can have, ranks them from the facts given, and says what to check before believing any of them.
//
// It does NOT read minds. A silence has no single meaning; RSMI gives a ranked set of possibilities and
// the facts that would settle the question. Everything is worked out from the person's own words
// (English, Hinglish and Hindi): who was silent, in what channel, after what, for how long, and any
// signs of how it felt. The AI re-reads the whole text and may refine the list (see synthesis.service.ts).

export type SilenceChannel = "in_person" | "message" | "call" | "organisation";
export type SilenceSubject = "other" | "self";
export type Likelihood = "more likely" | "possible" | "less likely";
export type DurationBucket = "moments" | "minutes" | "hours" | "days" | "weeks" | "unknown";

export type SilenceMeaning = { meaning: string; likelihood: Likelihood; why: string };

export type SilenceReading = {
  /** Whose silence it is: the other person's, or the user's own. */
  subject: SilenceSubject;
  channel: SilenceChannel;
  /** Who was silent (partner, friend, parent, boss, HR...), or null when not clear. */
  who: string | null;
  /** What came before the silence (a confession, criticism, request...). */
  trigger: string;
  duration: { bucket: DurationBucket; text: string | null };
  /** Ranked from the most to the least likely given what was written. */
  meanings: SilenceMeaning[];
  /** Facts that were not given and would change the reading. */
  unknowns: string[];
  /** Practical ways to find out what the silence means, instead of guessing. */
  checks: string[];
  caution: string;
  source: "rules" | "ai";
};

const CAUTION = "A silence has no single meaning. These are possibilities ranked from what you wrote, not a reading of their mind; only they can say what it meant.";

// ---------------------------------------------------------------- reading the text

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");

/** "chup nahi hua" / "was not silent": the opposite of a silence. */
const NOT_SILENT = /(chup|chup[- ]?chaap|khamosh|khaamosh|चुप|खामोश|silent|quiet)\s+(nahi|nhi|na|नहीं)\b|\b(not|never|wasn't|weren't|isn't|aren't)\s+(silent|quiet)\b|\bnot\s+(say|saying)\s+nothing\b/g;

const IN_PERSON_SILENCE = [
  /\bchup(?:\s?chaap|pi)?\b/, /\bkhamosh\b|\bkhaamosh\b/, /चुप|खामोश/, /\bruk\s+(?:gaya|gayi|gaye)\b/,
  /\bkuch\s+(?:bhi\s+)?nahi\s+(?:bola|boli|kaha|kahi|bole)\b/, /\bkuch\s+(?:bhi\s+)?nhi\s+(?:bola|boli|kaha)\b/, /कुछ\s+नहीं\s+(?:बोला|बोली|कहा)/,
  /\bbolna\s+band\b/, /\bbol(?:ta|ti)\s+band\b/, /\bstayed\s+(?:silent|quiet)\b/, /\bwent\s+(?:silent|quiet)\b/, /\bwas\s+(?:silent|quiet)\b/,
  /\bgot\s+(?:silent|quiet)\b/, /\bsilen(?:ce|t)\b/, /\bsaid\s+nothing\b/, /\bdidn'?t\s+say\s+(?:anything|a\s+word|much)\b/, /\bnot\s+say\s+anything\b/,
  /\bawkward\s+(?:pause|silence)\b/, /\blong\s+pause\b/, /\bpaused\b/, /\bno\s+words\b/, /\bspeechless\b/, /\bstared\b/, /\bno\s+reaction\b/,
  /\breaction\s+nahi\b/, /\bkoi\s+reaction\b.*\bnahi\b/, /\bmuh\s+band\b|\bmunh\s+band\b/,
];
const MESSAGE_SILENCE = [
  /\breply\s+(?:nahi|nhi)\b/, /\brply\s+(?:nahi|nhi)\b/, /\bjawab\s+(?:nahi|nhi)\b/, /\bresponse\s+(?:nahi|nhi)\b/, /रिप्लाई\s+नहीं|जवाब\s+नहीं/,
  /\bseen\s+(?:kar|ker|but|bt)\b/, /\bseen\s+kiya\b/, /\bon\s+read\b/, /\bghost(?:ed|ing|s)?\b/, /\bignor(?:e|ed|es|ing)\b/, /\bignore\s+kar/,
  /\bno\s+repl(?:y|ies)\b/, /\b(?:not|hasn'?t|haven'?t|didn'?t|doesn'?t|isn't)\s+(?:been\s+)?(?:replying|replied|reply|responding|responded|text(?:ed)?\s+back|answer(?:ed|ing)?)\b/,
  /\bleft\s+me\s+(?:on\s+)?(?:read|seen)\b/, /\bmessage\s+ka\s+(?:reply|jawab)\b/, /\bbaat\s+(?:karna\s+band|nahi\s+kar|nhi\s+kar)\b/,
  /\bstopped\s+(?:talking|texting|replying|responding)\b/, /\bno\s+(?:text|message|msg|dm)\b/, /\bnot\s+(?:talking|texting)\b/,
];
const CALL_SILENCE = [/\bcall\s+(?:nahi|nhi)\s+(?:uthaya|uthayi|utha|uthata|uthati|kiya|kar)/, /\bphone\s+(?:nahi|nhi)\s+(?:uthaya|uthayi|utha)/, /\bdidn'?t\s+(?:pick\s+up|answer\s+(?:my\s+)?(?:call|phone))/, /\bnot\s+(?:picking|answering)\b/, /\bcalls?\s+(?:ignored|declined|cut)\b/, /\bcall\s+cut\s+kar/];
const ORG_CUES = /\b(hr|recruiter|interviewer|interview|company|client|office|application|offer\s+letter|offer|visa|college|university|bank|landlord|vendor|customer|investor|committee)\b/;
const MESSAGE_CUES = /\b(message|msg|text|texted|whatsapp|dm|insta|email|mail|chat|seen|reply|rply|read|online)\b|रिप्लाई/;

const SELF_SILENCE = /\b(?:main|mai|maine|mene|mein|i|me)\b[^.!?\n]{0,25}\b(?:chup|khamosh|kuch\s+(?:bhi\s+)?nahi\s+(?:bola|boli|kaha)|silent|quiet|said\s+nothing|didn'?t\s+(?:say|reply|respond|answer))\b/;

const WHO: [string, RegExp][] = [
  ["partner", /\b(girlfriend|boyfriend|gf|bf|wife|husband|biwi|bivi|pati|patni|fianc[eé]e?|partner|spouse|ex|crush|lover|saathi|shaadi|rishta)\b/],
  ["parent", /\b(mummy|mommy|mom|mother|maa|mata|papa|dad|father|pita|parents?|mummy-papa|ghar\s+wale)\b/],
  ["sibling", /\b(bhai|bhaiya|didi|behen|bahan|brother|sister|sibling)\b/],
  ["boss", /\b(boss|manager|supervisor|sir|madam|ma'am|senior|team\s+lead|head)\b/],
  ["recruiter / company", /\b(hr|recruiter|interviewer|company|client|investor|committee|bank|landlord)\b/],
  ["colleague", /\b(colleague|coworker|co-worker|teammate|office\s+wala|office\s+wali)\b/],
  ["teacher", /\b(teacher|professor|prof|guide|mentor|sir\s+ji)\b/],
  ["friend", /\b(friend|dost|yaar|buddy|bestie|saheli|sakhi)\b/],
  ["relative", /\b(uncle|aunty|aunt|chacha|chachi|mama|mami|nana|nani|dada|dadi|bua|fufa|relative|in-laws?|sasural|saas|sasur|family)\b/],
];

const TRIGGERS: [string, RegExp][] = [
  ["a confession of feelings", /\b(i\s+love\s+you|love\s+you|propose[d]?|confess(?:ed)?|feelings?|pyaar|pyar|dil\s+ki\s+baat|like\s+you|pasand|izhaar|ishq|mohabbat)\b|प्यार|इज़हार/],
  ["an apology", /\b(sorry|apolog(?:y|ized|ised)|maafi|maaf|mafi|kshama)\b|माफ़ी|माफी/],
  ["criticism or an accusation", /\b(blame[d]?|accus(?:e|ed|ation)|criticis(?:e|ed|m)|criticiz(?:e|ed)|galat\s+(?:bola|kaha|thehraya)|ilzaam|daant(?:a|i)?|taunt|insult(?:ed)?|angry\s+at|gussa\s+(?:kiya|hua)|shout(?:ed)?|chilla(?:ya|i)?|fight|jhagda|jhagra|argu(?:e|ed|ment))\b/],
  ["a request or an ask", /\b(request(?:ed)?|ask(?:ed)?\s+(?:for|him|her|them)|favou?r|udhaar|udhar|paise|money|loan|help\s+(?:maangi|mangi|maanga)|maang(?:a|i)|mang(?:a|i)|permission|ijazat)\b/],
  ["a proposal or an offer", /\b(proposal|propose\s+kiya|shaadi\s+ki\s+baat|marriage|offer|resign(?:ed|ation)?|quit|leave\s+the\s+job|notice|suggest(?:ed|ion)?|idea|plan\s+bataya)\b/],
  ["news that may be hard to take", /\b(told\s+(?:him|her|them)|bataya|news|khabar|secret|sach|truth|reveal(?:ed)?|admit(?:ted)?|kabool|break\s?up|breakup|alag\s+ho|end\s+(?:it|this)|chhod)\b/],
  ["a question", /\b(asked|pucha|puchha|question|sawal)\b/],
  ["a joke or casual remark", /\b(joke|mazaak|mazak|kidding|funny)\b/],
  ["something you said", /\b(esa|aisa|aesa|yeh\s+sab|ye\s+sab|kuch\s+aisa)\s+(?:kaha|kha|bola|bol)\b|\b(maine|mene|mai\s+ne|main\s+ne)\s+(?:kaha|kha|bola|bol)\b|\bi\s+(?:said|told|asked|wrote|sent|texted|replied|shared)\b|\bkaha\s+ki\b|\bkha\s+ki\b/],
];

const DURATION_RE = /\b(\d+|ek|do|teen|char|paanch|chhe|saat|aath|nau|das|half|aadha|a|an|one|two|three|four|five|six|seven|few|couple\s+of|several|kai|kuch)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|ghanta|ghante|days?|din|weeks?|hafta|hafte|haftey|months?|mahina|mahine|years?|saal)\b/;
const NUMBER_WORDS: Record<string, number> = { ek: 1, a: 1, an: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, four: 4, paanch: 5, five: 5, chhe: 6, six: 6, saat: 7, seven: 7, aath: 8, nau: 9, das: 10, few: 3, kuch: 3, kai: 3, several: 4, "couple of": 2, half: 0.5, aadha: 0.5 };
const SHORT_PHRASES = /\b(kuch\s+der|thodi\s+der|thodi\s+der\s+ke\s+liye|ek\s+pal|kuch\s+pal|for\s+a\s+(?:bit|moment|while|second|few\s+seconds)|a\s+few\s+moments|moment|pal\s+bhar|kaafi\s+der|bahut\s+der|kaafi\s+time|long\s+time|abhi\s+tak)\b/;
const LONG_PHRASES = /\b(since\s+(?:then|that\s+day|last\s+week|last\s+month)|tab\s+se|us\s+din\s+se|ever\s+since|hafton\s+se|mahino\s+se|kaafi\s+din)\b/;

function readDuration(t: string): { bucket: DurationBucket; text: string | null } {
  const m = DURATION_RE.exec(t);
  if (m) {
    const n = NUMBER_WORDS[m[1]] ?? (Number(m[1]) || 1);
    const unit = m[2];
    let hours: number;
    if (/^(sec|second)/.test(unit)) hours = n / 3600;
    else if (/^(min)/.test(unit)) hours = n / 60;
    else if (/^(hour|hr|ghant)/.test(unit)) hours = n;
    else if (/^(day|din)/.test(unit)) hours = n * 24;
    else if (/^(week|haft)/.test(unit)) hours = n * 24 * 7;
    else if (/^(month|mahin)/.test(unit)) hours = n * 24 * 30;
    else hours = n * 24 * 365;
    const bucket: DurationBucket = hours < 0.0833 ? "moments" : hours < 1 ? "minutes" : hours < 24 ? "hours" : hours < 24 * 7 ? "days" : "weeks";
    return { bucket, text: m[0] };
  }
  const s = SHORT_PHRASES.exec(t);
  if (s) return { bucket: /kaafi|bahut|long time|abhi tak/.test(s[0]) ? "hours" : "moments", text: s[0] };
  const l = LONG_PHRASES.exec(t);
  if (l) return { bucket: "weeks", text: l[0] };
  return { bucket: "unknown", text: null };
}

// ---------------------------------------------------------------- cues that move the ranking

const CUES = {
  /** Silence is the usual behaviour ("always", "every time", "pehle bhi"). */
  pattern: /\b(always|every\s+time|everytime|usually|often|again|as\s+usual|hamesha|hmesha|har\s+baar|pehle\s+bhi|aksar|baar\s+baar|phir\s+se|fir\s+se)\b/,
  /** The other person saw it / was clearly there but did not answer. */
  saw: /\b(seen|read|online|active|on\s+read|story\s+(?:dekh|daal|dali)|status\s+(?:dekh|dala|dali)|last\s+seen)\b/,
  /** Visible hurt, anger or distance. */
  cold: /\b(glare[d]?|ghoor|ghur|cold|angry|gussa|gusse|naraz|naaraz|upset|hurt|cry|cried|roya|royi|ro\s+pad|walked\s+away|chale?\s+gaye?|chali\s+gayi|left\s+the\s+room|muh\s+(?:fer|pher)|face\s+turned|blocked|unfollow(?:ed)?|block\s+kar)\b|गुस्सा|नाराज़/,
  /** Visible warmth or thought. */
  warm: /\b(smil(?:e|ed|ing)|muskura|hasi|haste|laugh(?:ed)?|hug(?:ged)?|gale\s+lag|nodded|sar\s+hila|thinking|soch\s+(?:rahe|rahi|rha|rhi|me)|eyes\s+(?:wet|teared)|blush(?:ed)?|sharma|shy)\b/,
  /** The person was busy, travelling or unwell. */
  busy: /\b(busy|exam|travel(?:l?ing)?|meeting|deadline|sick|bimar|unwell|hospital|network|no\s+signal|phone\s+(?:kharab|off|switched)|switch(?:ed)?\s+off|vacation|holiday|festival|tyohar|wedding)\b/,
  /** The relationship is fragile or recently strained. */
  strained: /\b(fight|jhagda|jhagra|argu|breakup|break\s?up|toxic|distance|dooriyan|doori|trust|shak|doubt|cheat|dhokha|lie|jhooth|ex\b|naraaz)\b/,
  /** Warm or close history. */
  close: /\b(close|best\s+friend|bestie|love|loves|pyaar|pyar|care|caring|always\s+there|supportive|open|share\s+everything)\b/,
};

// ---------------------------------------------------------------- the meanings

type Rule = {
  meaning: string;
  /** Starting weight. */
  base: number;
  why: string;
  adjust?: (ctx: Ctx) => number;
};

type Ctx = {
  channel: SilenceChannel;
  subject: SilenceSubject;
  who: string | null;
  trigger: string;
  duration: DurationBucket;
  pattern: boolean;
  saw: boolean;
  cold: boolean;
  warm: boolean;
  busy: boolean;
  strained: boolean;
  close: boolean;
};

const heavy = (c: Ctx) => /confession|criticism|news|apology|proposal/.test(c.trigger);
const short = (c: Ctx) => c.duration === "moments" || c.duration === "minutes";
const long = (c: Ctx) => c.duration === "days" || c.duration === "weeks";

const IN_PERSON: Rule[] = [
  { meaning: "They are taking it in and need a moment to process", base: 3, why: "A short pause after something weighty is the most common reaction; people rarely answer instantly to big news or feelings.", adjust: (c) => (heavy(c) ? 2 : 0) + (short(c) ? 1.5 : -1) + (c.warm ? 1 : 0) - (c.cold ? 1.5 : 0) },
  { meaning: "They are choosing their words carefully so as not to hurt you or be misunderstood", base: 2, why: "When the matter is delicate people go quiet to find kind, accurate words.", adjust: (c) => (/confession|apology|criticism|news/.test(c.trigger) ? 1.5 : 0) + (c.close ? 1 : 0) + (c.warm ? 0.5 : 0) },
  { meaning: "They are surprised or uncomfortable and do not know how to respond", base: 2, why: "Unexpected feelings, requests or news can leave people without a ready answer.", adjust: (c) => (/confession|request|proposal|news/.test(c.trigger) ? 1.5 : 0) + (short(c) ? 0.5 : 0) },
  { meaning: "They are hurt or angry and are holding it back instead of arguing", base: 1.5, why: "Going quiet is a common way of avoiding a fight or of showing displeasure without words.", adjust: (c) => (c.cold ? 3 : 0) + (/criticism/.test(c.trigger) ? 1.5 : 0) + (c.strained ? 1.5 : 0) - (c.warm ? 1.5 : 0) },
  { meaning: "They disagree or are unsure but do not want to say so openly", base: 1.5, why: "Silence is often a polite way of not saying no, or of keeping the peace.", adjust: (c) => (/request|proposal/.test(c.trigger) ? 1.5 : 0) + (c.who === "boss" || c.who === "parent" ? 1 : 0) },
  { meaning: "They are simply listening and giving you space to continue", base: 1, why: "Some people stay quiet to let the other finish, especially when the talk is emotional.", adjust: (c) => (c.warm ? 1.5 : 0) + (c.trigger === "an apology" ? 1 : 0) + (short(c) ? 1 : -1.5) },
  { meaning: "They are shocked, guilty or afraid of what comes next", base: 0.8, why: "Hard truths can freeze people for a moment.", adjust: (c) => (/news/.test(c.trigger) ? 2 : 0) + (c.cold ? 0.5 : 0) },
  { meaning: "They are not interested, or this is how they usually shut down", base: 0.8, why: "If it keeps happening, silence is a pattern of withdrawing rather than a reaction to this one moment.", adjust: (c) => (c.pattern ? 3.5 : 0) + (long(c) ? 1 : 0) - (short(c) ? 0.8 : 0) },
];

const MESSAGE: Rule[] = [
  { meaning: "They are busy or have not properly seen the message yet", base: 3, why: "Most delays in replying come from ordinary life: work, travel, a phone left aside.", adjust: (c) => (short(c) || c.duration === "hours" ? 2.5 : -1) + (c.busy ? 2.5 : 0) - (c.saw ? 2 : 0) - (c.pattern ? 1 : 0) - (c.duration === "weeks" ? 3 : 0) },
  { meaning: "They need time to think about what to say", base: 2, why: "A reply to something emotional or important is often written, deleted and put off.", adjust: (c) => (heavy(c) ? 2 : 0) + (c.saw ? 1.5 : 0) + (c.duration === "hours" || c.duration === "days" ? 1 : 0) - (c.duration === "weeks" ? 1.5 : 0) },
  { meaning: "They are upset and are keeping distance to cool off", base: 1.5, why: "After a disagreement or something that hurt, many people withdraw for a while rather than answer in anger.", adjust: (c) => (c.cold ? 2.5 : 0) + (/criticism|apology/.test(c.trigger) ? 1.5 : 0) + (c.strained ? 1.5 : 0) + (c.duration === "days" ? 0.8 : 0) },
  { meaning: "They are unsure or uncomfortable with how to answer", base: 1.5, why: "Feelings, requests or favours can be hard to refuse or accept in writing, so the reply keeps slipping.", adjust: (c) => (/confession|request|proposal/.test(c.trigger) ? 2 : 0) + (c.saw ? 1 : 0) },
  { meaning: "The matter is low priority for them, or interest is fading", base: 1.2, why: "Repeated or long silences, especially when messages are seen, often show where something sits among their priorities.", adjust: (c) => (c.pattern ? 3 : 0) + (c.duration === "weeks" ? 2.5 : 0) + (c.saw ? 1 : 0) - (c.close ? 1.5 : 0) - (c.busy ? 1.5 : 0) },
  { meaning: "They are setting a boundary or deliberately ending the contact", base: 0.6, why: "Silence for weeks, blocking or no engagement at all can be a quiet way of saying no more.", adjust: (c) => (c.duration === "weeks" ? 2.5 : 0) + (c.strained ? 1.2 : 0) + (c.cold ? 1 : 0) - (short(c) ? 1.2 : 0) },
  { meaning: "A technical or practical problem got in the way (network, notifications, wrong number)", base: 0.6, why: "Messages sometimes simply do not arrive or get buried.", adjust: (c) => (c.busy ? 0.5 : 0) + (short(c) ? 0.5 : 0) - (c.saw ? 2 : 0) - (c.duration === "weeks" ? 1.5 : 0) },
];

const CALL: Rule[] = [
  { meaning: "They could not take the call (busy, driving, in a meeting, no signal)", base: 3, why: "Missed calls are usually about timing, not about you.", adjust: (c) => (short(c) || c.duration === "hours" ? 1.5 : -1) + (c.busy ? 2.5 : 0) - (c.pattern ? 1 : 0) },
  { meaning: "They saw the call and chose to answer later when they can talk properly", base: 2, why: "Many people avoid emotional or long conversations until they have time and a quiet place.", adjust: (c) => (heavy(c) ? 1.5 : 0) + (c.saw ? 1 : 0) },
  { meaning: "They are upset or avoiding the conversation", base: 1.5, why: "Declining calls after a disagreement is a common way of buying distance.", adjust: (c) => (c.cold ? 2.5 : 0) + (c.strained ? 1.5 : 0) + (/criticism|apology/.test(c.trigger) ? 1.5 : 0) },
  { meaning: "They are not keen to talk and the contact is fading", base: 1, why: "A pattern of unanswered calls points to lower priority or interest.", adjust: (c) => (c.pattern ? 3 : 0) + (c.duration === "weeks" ? 2 : 0) - (c.close ? 1.2 : 0) },
];

const ORGANISATION: Rule[] = [
  { meaning: "Internal process and approvals are slow; the delay is administrative", base: 3.5, why: "Hiring, approvals and replies from organisations routinely take longer than they say, with no signal either way.", adjust: (c) => (c.duration === "weeks" ? -0.5 : 1) + (c.busy ? 1 : 0) },
  { meaning: "They are still comparing options or waiting on someone else's decision", base: 2.5, why: "Silence often means the decision is not final yet, or is waiting for a senior person.", adjust: (c) => (long(c) ? 1 : 0) },
  { meaning: "They have moved on, and silence is their way of saying no", base: 1.5, why: "Some organisations never send a rejection; long silence after a follow-up often means no.", adjust: (c) => (c.duration === "weeks" ? 3 : 0) + (c.pattern ? 1.5 : 0) - (short(c) ? 1.5 : 0) },
  { meaning: "Your message was missed, filtered out or sent to the wrong person", base: 1, why: "Emails and applications do get lost.", adjust: (c) => (c.duration === "days" || c.duration === "weeks" ? 1 : 0) },
];

const SELF: Rule[] = [
  { meaning: "Your silence may have been read as agreement or acceptance", base: 2.5, why: "When someone says nothing, others often fill the gap with what suits them.", adjust: (c) => (c.who ? 0.5 : 0) },
  { meaning: "Your silence may have been read as coldness, anger or lack of interest", base: 2.5, why: "Without words, tone is guessed from the face and the timing; a long pause can look like distance.", adjust: (c) => (c.cold ? 1.5 : 0) + (long(c) ? 1.5 : 0) },
  { meaning: "It may have been read as hurt that you did not say aloud", base: 1.8, why: "People who know you well often sense a withheld feeling.", adjust: (c) => (c.close ? 1.5 : 0) + (c.strained ? 1 : 0) },
  { meaning: "It may simply have been seen as you needing time", base: 1.5, why: "A short pause is easily read as thinking.", adjust: (c) => (short(c) ? 2 : -1) },
];

// ---------------------------------------------------------------- detection

export function detectSilence(input: string): SilenceReading | null {
  if (!input || input.length < 10) return null;
  const t = norm(input).replace(NOT_SILENT, " ");

  const inPerson = IN_PERSON_SILENCE.some((r) => r.test(t));
  const message = MESSAGE_SILENCE.some((r) => r.test(t));
  const call = CALL_SILENCE.some((r) => r.test(t));
  if (!inPerson && !message && !call) return null;

  let channel: SilenceChannel;
  if (call) channel = "call";
  else if (message && !inPerson) channel = ORG_CUES.test(t) ? "organisation" : "message";
  else if (message && inPerson) channel = MESSAGE_CUES.test(t) ? "message" : "in_person";
  else channel = ORG_CUES.test(t) && !/\b(face|saamne|samne|baithe|in\s+person|mil(?:a|e|kar)|meeting\s+me)\b/.test(t) && /\b(hr|recruiter|interview|offer|application|client|company)\b/.test(t) ? "organisation" : "in_person";

  const subject: SilenceSubject = SELF_SILENCE.test(t) && !/\b(wo|woh|usne|usne\s+kuch|he|she|they)\b[^.!?\n]{0,25}\b(chup|silent|quiet|nahi\s+bola)\b/.test(t) ? "self" : "other";

  const who = WHO.find(([, re]) => re.test(t))?.[0] ?? null;
  const triggerHit = TRIGGERS.find(([, re]) => re.test(t));
  const trigger = triggerHit?.[0] ?? "something that was said or sent (not described)";
  const duration = readDuration(t);

  const ctx: Ctx = {
    channel, subject, who, trigger, duration: duration.bucket,
    pattern: CUES.pattern.test(t), saw: CUES.saw.test(t), cold: CUES.cold.test(t), warm: CUES.warm.test(t),
    busy: CUES.busy.test(t), strained: CUES.strained.test(t), close: CUES.close.test(t),
  };

  const rules = subject === "self" ? SELF : channel === "in_person" ? IN_PERSON : channel === "call" ? CALL : channel === "organisation" ? ORGANISATION : MESSAGE;
  const scored = rules
    .map((r) => ({ r, w: Math.max(0.1, r.base + (r.adjust ? r.adjust(ctx) : 0)) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 4);
  const top = scored[0].w;
  const meanings: SilenceMeaning[] = scored.map(({ r, w }, i) => ({
    meaning: r.meaning,
    likelihood: i === 0 && w >= top ? "more likely" : w >= top * 0.65 ? "possible" : "less likely",
    why: r.why,
  }));

  return {
    subject, channel, who, trigger, duration, meanings,
    unknowns: unknownsFor(ctx, !!triggerHit, duration.bucket === "unknown", channel === "in_person" && !ctx.cold && !ctx.warm),
    checks: checksFor(ctx),
    caution: CAUTION,
    source: "rules",
  };
}

function unknownsFor(c: Ctx, triggerKnown: boolean, durationUnknown: boolean, expressionUnknown: boolean): string[] {
  const out: string[] = [];
  if (!triggerKnown) out.push("What exactly was said or sent just before the silence");
  if (durationUnknown) out.push(c.channel === "in_person" ? "How long the silence lasted" : "How long it has been since you last heard back");
  if (!c.pattern) out.push("Whether this person is usually quiet or slow to reply, or whether this is new");
  if (expressionUnknown) out.push("How they looked or sounded during the silence (calm, hurt, smiling, tense)");
  if (c.channel !== "in_person" && !c.saw) out.push("Whether they have seen your message or been active elsewhere");
  if (!c.who) out.push("Who this person is to you");
  return out.slice(0, 4);
}

function checksFor(c: Ctx): string[] {
  if (c.subject === "self") {
    return [
      "Tell them in one line what your silence meant (for example: \"I went quiet because I needed time to think, not because I was upset\")",
      "Ask how they took it instead of assuming",
    ];
  }
  const out: string[] = [];
  if (c.channel === "in_person") {
    out.push("Give a few minutes, then ask gently: \"I can see you went quiet. How did that land with you?\"");
    out.push("Watch what they do afterwards (tone, eye contact, whether they bring it up) rather than the silence alone");
  } else if (c.channel === "organisation") {
    out.push("Send one polite follow-up that asks for a date or the next step, then wait a reasonable window");
    out.push("Keep other options moving so the silence does not decide your plans");
  } else {
    out.push(c.duration === "weeks" || c.duration === "days" ? "Send one short, low-pressure message that makes it easy to answer, then leave it" : "Give it a fair window before following up; most gaps are shorter than they feel");
    out.push("Do not send repeated messages; one clear follow-up shows interest, many create pressure");
  }
  out.push("Compare with how they usually behave: a new silence means more than their normal pace");
  return out;
}

// ---------------------------------------------------------------- the AI's refinement

const LIKELIHOODS: Likelihood[] = ["more likely", "possible", "less likely"];
const clean = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Merges the AI's reading into the rules' one. Anything unusable leaves the rules' reading unchanged. */
export function mergeSilence(base: SilenceReading, raw: unknown): SilenceReading {
  if (!raw || typeof raw !== "object") return base;
  const o = raw as { meanings?: unknown; checks?: unknown; unknowns?: unknown };
  const meanings: SilenceMeaning[] = Array.isArray(o.meanings)
    ? o.meanings
        .map((m): SilenceMeaning | null => {
          const r = m as { meaning?: unknown; likelihood?: unknown; why?: unknown } | null;
          const meaning = clean(r?.meaning, 200);
          const why = clean(r?.why, 300);
          const likelihood = LIKELIHOODS.find((l) => l === r?.likelihood);
          return meaning && why && likelihood ? { meaning, likelihood, why } : null;
        })
        .filter((m): m is SilenceMeaning => m !== null)
        .slice(0, 4)
    : [];
  if (meanings.length < 2) return base;
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => clean(x, 220)).filter((x): x is string => x !== null).slice(0, n) : []);
  const checks = list(o.checks, 4);
  const unknowns = list(o.unknowns, 4);
  return { ...base, meanings, checks: checks.length ? checks : base.checks, unknowns: unknowns.length ? unknowns : base.unknowns, source: "ai" };
}

/** All the text of a reading, for the output safety check. */
export function silenceTexts(s: SilenceReading): string[] {
  return [...s.meanings.flatMap((m) => [m.meaning, m.why]), ...s.checks, ...s.unknowns];
}

export function describeSilence(s: SilenceReading): string {
  const who = s.who ?? "the other person";
  const whose = s.subject === "self" ? "the person's OWN silence" : `${who}'s silence`;
  const ch = { in_person: "in conversation", message: "in messages", call: "on calls", organisation: "from an organisation" }[s.channel];
  return `Silence found: ${whose}, ${ch}, after ${s.trigger}; length ${s.duration.text ?? "not stated"}. Rule-based ranking: ${s.meanings.map((m) => `${m.meaning} (${m.likelihood})`).join("; ")}.`;
}
