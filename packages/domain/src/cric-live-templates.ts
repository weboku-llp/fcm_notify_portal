import type { CricNotifPhase, CricNotifTemplate } from "@notif/contracts";

/** Cricket team short code → ISO 3166-1 alpha-2 for flag emoji. */
const TEAM_ISO2: Record<string, string> = {
  NAM: "NA",
  SA: "ZA",
  RSA: "ZA",
  ZIM: "ZW",
  ZW: "ZW",
  IND: "IN",
  AUS: "AU",
  ENG: "GB",
  "ENG-W": "GB",
  ENGW: "GB",
  IRE: "IE",
  "IRE-W": "IE",
  IREW: "IE",
  PAK: "PK",
  NZ: "NZ",
  WI: "BB",
  BAN: "BD",
  SL: "LK",
  AFG: "AF",
  NED: "NL",
  SCO: "GB",
  UAE: "AE",
  USA: "US",
  OMA: "OM",
  NEP: "NP",
  PNG: "PG",
  CAN: "CA",
  KEN: "KE",
  HKG: "HK",
};

function iso2FromTeamCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  if (TEAM_ISO2[key]) return TEAM_ISO2[key];
  const base = key.replace(/-W$/i, "").replace(/W$/i, "");
  if (TEAM_ISO2[base]) return TEAM_ISO2[base];
  if (/^[A-Z]{2}$/.test(key)) return key;
  return null;
}

export { iso2FromTeamCode };

/** PNG flag from flagcdn (reliable in UI; FCM title cannot embed images). */
export function flagImageUrlForTeamCode(code: string | null | undefined): string | null {
  const iso = iso2FromTeamCode(code);
  if (!iso) return null;
  return `https://flagcdn.com/w80/${iso.toLowerCase()}.png`;
}

/** Regional-indicator flag emoji from ISO2 (e.g. NA → 🇳🇦). Avoid in FCM titles on Windows — renders as "NA". */
export function flagEmojiFromIso2(iso2: string | null | undefined): string | null {
  if (!iso2 || iso2.length !== 2) return null;
  const A = 0x1f1e6;
  const c = iso2.toUpperCase();
  const a = c.charCodeAt(0);
  const b = c.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return null;
  return String.fromCodePoint(A + a - 65, A + b - 65);
}

export function flagEmojiForTeamCode(code: string | null | undefined): string | null {
  return flagEmojiFromIso2(iso2FromTeamCode(code));
}

export function formatKickoffLabel(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  } catch {
    return iso;
  }
}

/** Default toss line: 30 minutes before kickoff when API has no toss yet. */
export function defaultTossLabel(startingAt: string | null | undefined): string | null {
  if (!startingAt) return null;
  try {
    const t = new Date(startingAt);
    if (Number.isNaN(t.getTime())) return null;
    t.setMinutes(t.getMinutes() - 30);
    const label = t.toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Toss at ${label}`;
  } catch {
    return null;
  }
}

export type MatchTemplateInput = {
  shortHome?: string | null;
  shortAway?: string | null;
  teamHome?: string | null;
  teamAway?: string | null;
  startingAt?: string | null;
  kickoffLabel?: string | null;
  venue?: string | null;
  toss?: string | null;
  scoreLine?: string | null;
  resultLine?: string | null;
  status?: string | null;
  kind?: string | null;
  matchPhase?: string | null;
  flagHomeUrl?: string | null;
  flagAwayUrl?: string | null;
};

function codes(input: MatchTemplateInput): {
  home: string;
  away: string;
  flagHomeUrl: string | null;
  flagAwayUrl: string | null;
} {
  const home = (input.shortHome || input.teamHome || "TBC").trim();
  const away = (input.shortAway || input.teamAway || "TBC").trim();
  const flagHomeUrl =
    input.flagHomeUrl?.trim() ||
    flagImageUrlForTeamCode(input.shortHome) ||
    flagImageUrlForTeamCode(home);
  const flagAwayUrl =
    input.flagAwayUrl?.trim() ||
    flagImageUrlForTeamCode(input.shortAway) ||
    flagImageUrlForTeamCode(away);
  return { home, away, flagHomeUrl, flagAwayUrl };
}

/**
 * FCM title for mobile: flag emoji + three-letter code.
 * Example: "🇳🇦 NAM vs 🇿🇦 SA"
 * (Portal preview still paints crest/flag images separately — Windows often
 * cannot render regional-indicator emoji and shows "NA"/"ZA" instead.)
 */
export function teamsTitleLine(input: MatchTemplateInput): string {
  const { home, away } = codes(input);
  const homeFlag = flagEmojiForTeamCode(input.shortHome) || flagEmojiForTeamCode(home);
  const awayFlag = flagEmojiForTeamCode(input.shortAway) || flagEmojiForTeamCode(away);
  const left = homeFlag ? `${homeFlag} ${home}` : home;
  const right = awayFlag ? `${awayFlag} ${away}` : away;
  return `${left} vs ${right}`;
}

/** Public https national-flag PNG for FCM rich notification image. */
export function notificationFlagImageUrl(input: MatchTemplateInput): string | null {
  return (
    flagImageUrlForTeamCode(input.shortHome) ||
    flagImageUrlForTeamCode(input.teamHome) ||
    (input.flagHomeUrl && /^https:\/\//i.test(input.flagHomeUrl.trim()) ? input.flagHomeUrl.trim() : null)
  );
}

function kickoff(input: MatchTemplateInput): string | null {
  return input.kickoffLabel?.trim() || formatKickoffLabel(input.startingAt) || null;
}

function venueLine(input: MatchTemplateInput): string | null {
  const v = input.venue?.trim();
  return v || null;
}

function tossLine(input: MatchTemplateInput): string | null {
  const t = input.toss?.trim();
  if (t && t !== "-" && !/^toss\s*$/i.test(t)) return t.startsWith("Toss") ? t : `Toss · ${t}`;
  return defaultTossLabel(input.startingAt);
}

export function buildPhaseTemplates(input: MatchTemplateInput): CricNotifTemplate[] {
  const { home, away, flagHomeUrl, flagAwayUrl } = codes(input);
  const title = teamsTitleLine(input);
  const when = kickoff(input);
  const venue = venueLine(input);
  const toss = tossLine(input);
  const score =
    input.scoreLine?.trim() ||
    (input.status && /\d/.test(input.status) ? input.status.trim() : null) ||
    `${home} 0/0 · ${away} —`;
  const result =
    input.resultLine?.trim() ||
    input.scoreLine?.trim() ||
    `${home} won (sample result)`;

  const upcomingBody = [when, venue].filter(Boolean).join(" · ") || "Match details soon";
  const tossBody = [toss || "Toss timing soon", when, venue].filter(Boolean).join(" · ");
  const liveBody = score;
  const resultBody = [result, venue].filter(Boolean).join(" · ");

  const flagMeta = { shortHome: home, shortAway: away, flagHomeUrl, flagAwayUrl };

  return [
    {
      phase: "upcoming",
      label: "Upcoming",
      title,
      body: upcomingBody,
      description: "Before match day — codes + date, venue, timing (flags in preview)",
      ...flagMeta,
    },
    {
      phase: "toss",
      label: "Toss day",
      title,
      body: tossBody,
      description: "Same date reached — toss timing with match schedule",
      ...flagMeta,
    },
    {
      phase: "start",
      label: "Match start",
      title,
      body: ["Match started", when, venue].filter(Boolean).join(" · "),
      description: "Match kicked off — start alert",
      ...flagMeta,
    },
    {
      phase: "live",
      label: "Live score",
      title,
      body: liveBody,
      description: "In play — score line updates",
      ...flagMeta,
    },
    {
      phase: "result",
      label: "Result",
      title,
      body: resultBody,
      description: "After result — final outcome",
      ...flagMeta,
    },
  ];
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const FINISHED_HINTS = /finish|result|won|lost|draw|tied|abandon|complete|ended/i;

function hasRealScore(scoreLine: string | null | undefined): boolean {
  const s = (scoreLine ?? "").trim();
  return Boolean(s && /\d/.test(s) && s !== "-" && !/^NS$/i.test(s));
}

/**
 * Pick active phase from live feed + clock.
 * - finished → result
 * - live with score → live
 * - live without score / just started → start
 * - match day before/around kickoff → toss
 * - else → upcoming
 */
export function resolveNotifPhase(input: MatchTemplateInput, now = new Date()): CricNotifPhase {
  const kind = (input.kind || "").toLowerCase();
  const phase = (input.matchPhase || "").toLowerCase();
  const status = (input.status || "").trim();
  const scored = hasRealScore(input.scoreLine);

  if (kind === "finished" || phase === "finished" || phase === "result" || FINISHED_HINTS.test(status)) {
    return "result";
  }

  const isLive =
    kind === "live" ||
    phase === "live" ||
    /^live$/i.test(status) ||
    (scored && (kind === "live" || phase === "live"));

  if (isLive || (scored && kind !== "upcoming" && kind !== "finished")) {
    // Prefer live when we already have a batting score; otherwise announce start.
    if (scored) return "live";
    return "start";
  }

  if (input.startingAt) {
    try {
      const start = new Date(input.startingAt);
      if (!Number.isNaN(start.getTime())) {
        const ms = now.getTime() - start.getTime();
        // Past kickoff but feed still NS → treat as start window for a few hours.
        if (ms >= 0 && ms < 4 * 60 * 60 * 1000 && !FINISHED_HINTS.test(status)) {
          return scored ? "live" : "start";
        }
        // Same calendar day as kickoff → toss window.
        if (sameCalendarDay(now, start) && now.getTime() < start.getTime()) {
          return "toss";
        }
        if (sameCalendarDay(now, start) && ms < 3 * 60 * 60 * 1000 && !scored) {
          return "toss";
        }
      }
    } catch {
      /* ignore */
    }
  }

  return "upcoming";
}

/**
 * Choose which template to send for auto-triggers, including the one-shot
 * "match start" when entering live from toss/upcoming.
 */
export function resolveAutoSendPhase(
  input: MatchTemplateInput,
  lastFingerprint: string | null | undefined,
  now = new Date(),
): CricNotifPhase | null {
  const phase = resolveNotifPhase(input, now);
  const lastPhase = lastFingerprint?.split("|")[0] ?? null;

  // Auto never re-sends plain upcoming (that fires when Match alerts is turned on).
  if (phase === "upcoming") return null;

  if (phase === "toss") {
    return lastPhase === "toss" ? null : "toss";
  }

  if (phase === "start") {
    return lastPhase === "start" || lastPhase === "live" || lastPhase === "result" ? null : "start";
  }

  if (phase === "live") {
    // Entering live for the first time → announce start once, then score ticks follow.
    if (lastPhase !== "start" && lastPhase !== "live" && lastPhase !== "result") {
      return "start";
    }
    return "live";
  }

  if (phase === "result") {
    return lastPhase === "result" ? null : "result";
  }

  return null;
}

export function pickTemplate(
  input: MatchTemplateInput,
  phase?: CricNotifPhase | null,
): CricNotifTemplate {
  const templates = buildPhaseTemplates(input);
  const active = phase ?? resolveNotifPhase(input);
  return templates.find((t) => t.phase === active) ?? templates[0]!;
}
