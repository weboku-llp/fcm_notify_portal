import { z } from "zod";

/** Push template phases for CricRumble live-score alerts. */
export const CricNotifPhase = z.enum(["upcoming", "toss", "start", "live", "result"]);
export type CricNotifPhase = z.infer<typeof CricNotifPhase>;

export const CricNotifTemplate = z.object({
  phase: CricNotifPhase,
  label: z.string(),
  title: z.string(),
  body: z.string(),
  description: z.string(),
  shortHome: z.string(),
  shortAway: z.string(),
  /** Prefer team crest / flag image URLs for shade preview (emoji flags break on Windows). */
  flagHomeUrl: z.string().nullable(),
  flagAwayUrl: z.string().nullable(),
});
export type CricNotifTemplate = z.infer<typeof CricNotifTemplate>;

export const CricLiveMatchKind = z.enum(["live", "upcoming", "finished", "other"]);
export type CricLiveMatchKind = z.infer<typeof CricLiveMatchKind>;

export const CricLiveMatchRow = z.object({
  fixtureId: z.string(),
  teamHome: z.string(),
  teamAway: z.string(),
  shortHome: z.string().nullable(),
  shortAway: z.string().nullable(),
  flagHomeUrl: z.string().nullable(),
  flagAwayUrl: z.string().nullable(),
  flagHomeEmoji: z.string().nullable(),
  flagAwayEmoji: z.string().nullable(),
  kind: z.string(),
  /** Resolved phase used for the active send template. */
  phase: CricNotifPhase,
  status: z.string().nullable(),
  startingAt: z.string().nullable(),
  /** Human kickoff label, e.g. Fri, Aug 28, 05:30 PM */
  kickoffLabel: z.string().nullable(),
  scoreLine: z.string().nullable(),
  venue: z.string().nullable(),
  toss: z.string().nullable(),
  resultLine: z.string().nullable(),
  roundLabel: z.string().nullable(),
  leagueName: z.string().nullable(),
  alertsEnabled: z.boolean(),
  autoOnScoreUpdate: z.boolean(),
  lastNotifiedScore: z.string().nullable(),
  lastNotifiedAt: z.string().nullable(),
  lastPollError: z.string().nullable(),
  /** All phase templates for preview (always 4). */
  templates: z.array(CricNotifTemplate),
});
export type CricLiveMatchRow = z.infer<typeof CricLiveMatchRow>;

export const UpdateCricLiveMatchAlertInput = z
  .object({
    alertsEnabled: z.boolean().optional(),
    autoOnScoreUpdate: z.boolean().optional(),
    teamHome: z.string().max(200).optional(),
    teamAway: z.string().max(200).optional(),
    shortHome: z.string().max(40).nullable().optional(),
    shortAway: z.string().max(40).nullable().optional(),
    scoreLine: z.string().max(500).nullable().optional(),
    venue: z.string().max(300).nullable().optional(),
    startingAt: z.string().max(64).nullable().optional(),
    kickoffLabel: z.string().max(120).nullable().optional(),
    toss: z.string().max(300).nullable().optional(),
    kind: z.string().max(40).optional(),
    status: z.string().max(500).nullable().optional(),
    phase: CricNotifPhase.optional(),
  })
  .refine((v) => v.alertsEnabled !== undefined || v.autoOnScoreUpdate !== undefined, {
    message: "Provide alertsEnabled and/or autoOnScoreUpdate",
  });
export type UpdateCricLiveMatchAlertInput = z.infer<typeof UpdateCricLiveMatchAlertInput>;

export const LiveScoreTickJob = z.object({
  tickAt: z.string().datetime().optional(),
});
export type LiveScoreTickJob = z.infer<typeof LiveScoreTickJob>;
