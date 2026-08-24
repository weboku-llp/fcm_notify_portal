import {
  CreateCampaignInput,
  type CampaignPublic,
  type CricLiveMatchRow,
  type CricNotifTemplate,
  type UpdateCricLiveMatchAlertInput,
} from "@notif/contracts";
import { prisma, type Project } from "@notif/db";
import { createLogger } from "@notif/logger";
import { createCampaign, runCampaign } from "./campaigns.js";
import {
  buildPhaseTemplates,
  flagEmojiForTeamCode,
  formatKickoffLabel,
  notificationFlagImageUrl,
  pickTemplate,
  resolveAutoSendPhase,
  resolveNotifPhase,
  type MatchTemplateInput,
} from "./cric-live-templates.js";
import { DomainError } from "./errors.js";
import { getProjectOrThrow } from "./projects.js";
import { decryptTokenSourceApiKey } from "./token-source.js";

const log = createLogger("cric-live");

export const CRICRUMBLE_SLUG = "cricrumble";
const FETCH_TIMEOUT_MS = 20_000;
const MATCHES_PATH = "/api/live/matches";
const EXPERIENCE_PATH = (id: string) => `/api/live/match/${encodeURIComponent(id)}/experience`;

type RemoteMatch = {
  id: string;
  teamA?: string;
  teamB?: string;
  teamHome?: string;
  teamAway?: string;
  teamACode?: string;
  teamBCode?: string;
  teamALogoUrl?: string;
  teamBLogoUrl?: string;
  teamHomeLogoUrl?: string;
  teamAwayLogoUrl?: string;
  scoreA?: string;
  scoreB?: string;
  overs?: string;
  status?: string;
  startingAt?: string;
  kind?: string;
  venue?: string;
  roundLabel?: string;
  leagueName?: string;
};

type Hero = {
  status?: string | null;
  teamHome?: string | null;
  teamAway?: string | null;
  shortHome?: string | null;
  shortAway?: string | null;
  scoreHome?: string | null;
  scoreAway?: string | null;
  overs?: string | null;
  venue?: string | null;
  toss?: string | null;
};

function assertCricRumble(project: Project): void {
  if (project.slug !== CRICRUMBLE_SLUG) {
    throw new DomainError("Live score alerts are only available for CricRumble", "FORBIDDEN", 403);
  }
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveBaseUrl(project: Project): string {
  const base = project.tokenSourceApiBaseUrl?.trim();
  if (!base) {
    throw new DomainError(
      "CricRumble Main API URL is not configured. Set it under Project settings → Main project API.",
      "LIVE_API_NOT_CONFIGURED",
      400,
    );
  }
  return normalizeBaseUrl(base);
}

function authHeaders(project: Project): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (project.tokenSourceApiKeyEncrypted) {
    try {
      headers["X-Notif-Portal-Key"] = decryptTokenSourceApiKey(project.tokenSourceApiKeyEncrypted);
    } catch {
      // optional; live endpoints are often public
    }
  }
  return headers;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      throw new DomainError(`Live API returned non-JSON (HTTP ${res.status})`, "LIVE_API_BAD_RESPONSE", 502);
    }
    if (!res.ok) {
      const msg =
        typeof json === "object" && json && "message" in json && typeof (json as { message: unknown }).message === "string"
          ? (json as { message: string }).message
          : `Live API HTTP ${res.status}`;
      throw new DomainError(msg, "LIVE_API_ERROR", res.status >= 500 ? 502 : res.status);
    }
    return json;
  } catch (err) {
    if (err instanceof DomainError) throw err;
    const message = err instanceof Error ? err.message : "Live API request failed";
    throw new DomainError(message, "LIVE_API_ERROR", 502);
  } finally {
    clearTimeout(timer);
  }
}

function isPlaceholderScore(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return !v || v === "-" || v === "—" || v === "NS";
}

const NON_SCORE_STATUSES = new Set([
  "ns",
  "live",
  "upcoming",
  "finished",
  "abandoned",
  "cancelled",
  "canceled",
  "postponed",
]);

/**
 * Build the notification / UI score line. Prefer a real score string; never marketing copy.
 */
export function buildScoreLine(input: {
  status?: string | null;
  teamHome?: string | null;
  teamAway?: string | null;
  shortHome?: string | null;
  shortAway?: string | null;
  scoreHome?: string | null;
  scoreAway?: string | null;
  overs?: string | null;
}): string | null {
  const status = (input.status ?? "").trim();
  if (status && !NON_SCORE_STATUSES.has(status.toLowerCase()) && /\d/.test(status)) {
    return status;
  }

  const homeScore = (input.scoreHome ?? "").trim();
  const awayScore = (input.scoreAway ?? "").trim();
  if (isPlaceholderScore(homeScore) && isPlaceholderScore(awayScore)) {
    return null;
  }

  const home = (input.shortHome || input.teamHome || "Home").trim();
  const away = (input.shortAway || input.teamAway || "Away").trim();
  const overs = !isPlaceholderScore(input.overs) ? ` (${String(input.overs).trim()} ov)` : "";
  const left = isPlaceholderScore(homeScore) ? home : `${home} ${homeScore}`;
  const right = isPlaceholderScore(awayScore) ? away : `${away} ${awayScore}`;
  return `${left} · ${right}${overs}`;
}

function normalizeLogoUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  // Sportmonks sometimes returns the CDN root without a team asset.
  if (/cdn\.sportmonks\.com\/?$/i.test(u)) return null;
  if (!/\.(png|jpe?g|webp|svg|gif)(\?|$)/i.test(u) && !/\/teams\//i.test(u)) return null;
  return u;
}

function mapRemoteMatch(m: RemoteMatch): Omit<
  CricLiveMatchRow,
  | "alertsEnabled"
  | "autoOnScoreUpdate"
  | "lastNotifiedScore"
  | "lastNotifiedAt"
  | "lastPollError"
  | "templates"
  | "phase"
  | "flagHomeEmoji"
  | "flagAwayEmoji"
  | "kickoffLabel"
  | "toss"
  | "resultLine"
> & {
  toss: string | null;
  resultLine: string | null;
  kickoffLabel: string | null;
  flagHomeEmoji: string | null;
  flagAwayEmoji: string | null;
  phase: CricLiveMatchRow["phase"];
  templates: CricNotifTemplate[];
} {
  const teamHome = m.teamA ?? m.teamHome ?? "TBC";
  const teamAway = m.teamB ?? m.teamAway ?? "TBC";
  const shortHome = m.teamACode ?? null;
  const shortAway = m.teamBCode ?? null;
  const startingAt = m.startingAt ?? null;
  const scoreLine = buildScoreLine({
    status: m.status,
    teamHome,
    teamAway,
    shortHome,
    shortAway,
    scoreHome: m.scoreA,
    scoreAway: m.scoreB,
    overs: m.overs,
  });
  const kind = m.kind ?? "other";
  const tplInput: MatchTemplateInput = {
    shortHome,
    shortAway,
    teamHome,
    teamAway,
    startingAt,
    kickoffLabel: formatKickoffLabel(startingAt),
    venue: m.venue ?? null,
    toss: null,
    scoreLine,
    resultLine: kind === "finished" ? scoreLine : null,
    status: m.status ?? null,
    kind,
    flagHomeUrl: normalizeLogoUrl(m.teamALogoUrl ?? m.teamHomeLogoUrl),
    flagAwayUrl: normalizeLogoUrl(m.teamBLogoUrl ?? m.teamAwayLogoUrl),
  };
  const phase = resolveNotifPhase(tplInput);
  const templates = buildPhaseTemplates(tplInput);

  return {
    fixtureId: String(m.id),
    teamHome,
    teamAway,
    shortHome,
    shortAway,
    flagHomeUrl: normalizeLogoUrl(m.teamALogoUrl ?? m.teamHomeLogoUrl),
    flagAwayUrl: normalizeLogoUrl(m.teamBLogoUrl ?? m.teamAwayLogoUrl),
    flagHomeEmoji: flagEmojiForTeamCode(shortHome),
    flagAwayEmoji: flagEmojiForTeamCode(shortAway),
    kind,
    phase,
    status: m.status ?? null,
    startingAt,
    kickoffLabel: formatKickoffLabel(startingAt),
    scoreLine,
    venue: m.venue ?? null,
    toss: null,
    resultLine: kind === "finished" ? scoreLine : null,
    roundLabel: m.roundLabel ?? null,
    leagueName: m.leagueName ?? null,
    templates,
  };
}

async function fetchRemoteMatches(project: Project): Promise<ReturnType<typeof mapRemoteMatch>[]> {
  const base = resolveBaseUrl(project);
  const url = new URL(`${base}${MATCHES_PATH}`);
  url.searchParams.set("includeUpcoming", "1");
  url.searchParams.set("upcomingLimit", "20");
  url.searchParams.set("upcomingDays", "21");
  const json = await fetchJson(url.toString(), authHeaders(project));
  const data =
    typeof json === "object" && json && "data" in json && Array.isArray((json as { data: unknown }).data)
      ? ((json as { data: RemoteMatch[] }).data)
      : [];
  return data.filter((m) => m?.id != null).map(mapRemoteMatch);
}

export type MatchExperienceSnapshot = {
  scoreLine: string | null;
  toss: string | null;
  venue: string | null;
  status: string | null;
  matchPhase: string | null;
  shortHome: string | null;
  shortAway: string | null;
  teamHome: string | null;
  teamAway: string | null;
};

export async function fetchMatchExperienceSnapshot(
  project: Project,
  fixtureId: string,
): Promise<MatchExperienceSnapshot | null> {
  const base = resolveBaseUrl(project);
  const url = new URL(`${base}${EXPERIENCE_PATH(fixtureId)}`);
  url.searchParams.set("refreshLive", "1");
  const json = await fetchJson(url.toString(), authHeaders(project));
  const root = typeof json === "object" && json ? (json as Record<string, unknown>) : null;
  const data = root && typeof root.data === "object" && root.data ? (root.data as Record<string, unknown>) : null;
  const hero = data && typeof data.hero === "object" && data.hero ? (data.hero as Hero) : null;
  if (!hero) return null;
  const matchPhase = typeof root?.matchPhase === "string" ? root.matchPhase : null;
  return {
    scoreLine: buildScoreLine(hero),
    toss: hero.toss && hero.toss !== "-" ? String(hero.toss) : null,
    venue: hero.venue ?? null,
    status: hero.status ?? null,
    matchPhase,
    shortHome: hero.shortHome ?? null,
    shortAway: hero.shortAway ?? null,
    teamHome: hero.teamHome ?? null,
    teamAway: hero.teamAway ?? null,
  };
}

export async function fetchMatchScoreLine(project: Project, fixtureId: string): Promise<string | null> {
  const snap = await fetchMatchExperienceSnapshot(project, fixtureId);
  return snap?.scoreLine ?? null;
}

function toPublicRow(
  remote: ReturnType<typeof mapRemoteMatch>,
  alert: {
    alertsEnabled: boolean;
    autoOnScoreUpdate: boolean;
    lastNotifiedScore: string | null;
    lastNotifiedAt: Date | null;
    lastPollError: string | null;
  } | null,
): CricLiveMatchRow {
  return {
    ...remote,
    alertsEnabled: alert?.alertsEnabled ?? false,
    autoOnScoreUpdate: alert?.autoOnScoreUpdate ?? false,
    lastNotifiedScore: alert?.lastNotifiedScore ?? null,
    lastNotifiedAt: alert?.lastNotifiedAt ? alert.lastNotifiedAt.toISOString() : null,
    lastPollError: alert?.lastPollError ?? null,
  };
}

function templateInputFromAlertSend(input: {
  shortHome?: string | null;
  shortAway?: string | null;
  teamHome?: string | null;
  teamAway?: string | null;
  startingAt?: string | null;
  kickoffLabel?: string | null;
  venue?: string | null;
  toss?: string | null;
  scoreLine?: string | null;
  kind?: string | null;
  status?: string | null;
  phase?: CricLiveMatchRow["phase"] | null;
}): MatchTemplateInput {
  return {
    shortHome: input.shortHome,
    shortAway: input.shortAway,
    teamHome: input.teamHome,
    teamAway: input.teamAway,
    startingAt: input.startingAt,
    kickoffLabel: input.kickoffLabel || formatKickoffLabel(input.startingAt),
    venue: input.venue,
    toss: input.toss,
    scoreLine: input.scoreLine,
    resultLine: input.scoreLine,
    status: input.status,
    kind: input.kind,
  };
}

export async function listCricLiveMatches(projectId: string): Promise<CricLiveMatchRow[]> {
  const project = await getProjectOrThrow(projectId);
  assertCricRumble(project);

  const [remote, alerts] = await Promise.all([
    fetchRemoteMatches(project),
    prisma.cricLiveMatchAlert.findMany({ where: { projectId: project.id } }),
  ]);
  const byFixture = new Map(alerts.map((a) => [a.fixtureId, a]));

  // Upsert metadata for known remotes (non-blocking prefs sync).
  await Promise.all(
    remote.map((m) => {
      const existing = byFixture.get(m.fixtureId);
      if (!existing) return Promise.resolve();
      return prisma.cricLiveMatchAlert.update({
        where: { id: existing.id },
        data: {
          teamHome: m.teamHome,
          teamAway: m.teamAway,
          kind: m.kind,
          status: m.status,
        },
      });
    }),
  );

  return remote.map((m) => toPublicRow(m, byFixture.get(m.fixtureId) ?? null));
}

export async function updateCricLiveMatchAlert(
  projectId: string,
  fixtureId: string,
  input: UpdateCricLiveMatchAlertInput,
): Promise<{ match: CricLiveMatchRow; campaign?: CampaignPublic; enqueue?: boolean }> {
  const project = await getProjectOrThrow(projectId);
  assertCricRumble(project);

  const existing = await prisma.cricLiveMatchAlert.findUnique({
    where: { projectId_fixtureId: { projectId: project.id, fixtureId } },
  });
  const wasAlertsEnabled = existing?.alertsEnabled ?? false;

  const data: {
    alertsEnabled?: boolean;
    autoOnScoreUpdate?: boolean;
    teamHome?: string;
    teamAway?: string;
    kind?: string;
    status?: string | null;
  } = {};
  if (input.alertsEnabled !== undefined) data.alertsEnabled = input.alertsEnabled;
  if (input.autoOnScoreUpdate !== undefined) data.autoOnScoreUpdate = input.autoOnScoreUpdate;
  if (input.teamHome !== undefined) data.teamHome = input.teamHome;
  if (input.teamAway !== undefined) data.teamAway = input.teamAway;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.status !== undefined) data.status = input.status;

  // Turning alerts off also clears auto to avoid surprise re-enables later.
  if (input.alertsEnabled === false) data.autoOnScoreUpdate = false;
  // Auto on implies alerts on.
  if (input.autoOnScoreUpdate === true) data.alertsEnabled = true;

  const alert = await prisma.cricLiveMatchAlert.upsert({
    where: { projectId_fixtureId: { projectId: project.id, fixtureId } },
    create: {
      projectId: project.id,
      fixtureId,
      alertsEnabled: data.alertsEnabled ?? false,
      autoOnScoreUpdate: data.autoOnScoreUpdate ?? false,
      teamHome: data.teamHome,
      teamAway: data.teamAway,
      kind: data.kind,
      status: data.status ?? undefined,
    },
    update: data,
  });

  // When auto is first armed, baseline current score so we don't spam the present line.
  if (alert.alertsEnabled && alert.autoOnScoreUpdate && !alert.lastNotifiedScore) {
    try {
      const score = await fetchMatchScoreLine(project, fixtureId);
      if (score) {
        await prisma.cricLiveMatchAlert.update({
          where: { id: alert.id },
          data: { lastNotifiedScore: score, lastPolledAt: new Date(), lastPollError: null },
        });
        alert.lastNotifiedScore = score;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to baseline score";
      await prisma.cricLiveMatchAlert.update({
        where: { id: alert.id },
        data: { lastPollError: message, lastPolledAt: new Date() },
      });
    }
  }

  const tplInput = templateInputFromAlertSend({
    shortHome: input.shortHome,
    shortAway: input.shortAway,
    teamHome: input.teamHome ?? alert.teamHome,
    teamAway: input.teamAway ?? alert.teamAway,
    startingAt: input.startingAt,
    kickoffLabel: input.kickoffLabel,
    venue: input.venue,
    toss: input.toss,
    scoreLine: input.scoreLine ?? alert.lastNotifiedScore,
    kind: input.kind ?? alert.kind,
    status: input.status ?? alert.status,
  });
  const templates = buildPhaseTemplates(tplInput);
  const phase = input.phase ?? resolveNotifPhase(tplInput);
  const activeTpl = pickTemplate(tplInput, phase);

  const match: CricLiveMatchRow = {
    fixtureId: alert.fixtureId,
    teamHome: alert.teamHome ?? "TBC",
    teamAway: alert.teamAway ?? "TBC",
    shortHome: input.shortHome ?? null,
    shortAway: input.shortAway ?? null,
    flagHomeUrl: null,
    flagAwayUrl: null,
    flagHomeEmoji: flagEmojiForTeamCode(input.shortHome),
    flagAwayEmoji: flagEmojiForTeamCode(input.shortAway),
    kind: alert.kind ?? "other",
    phase,
    status: alert.status,
    startingAt: input.startingAt ?? null,
    kickoffLabel: input.kickoffLabel ?? formatKickoffLabel(input.startingAt),
    scoreLine: input.scoreLine ?? alert.lastNotifiedScore,
    venue: input.venue ?? null,
    toss: input.toss ?? null,
    resultLine: null,
    roundLabel: null,
    leagueName: null,
    alertsEnabled: alert.alertsEnabled,
    autoOnScoreUpdate: alert.autoOnScoreUpdate,
    lastNotifiedScore: alert.lastNotifiedScore,
    lastNotifiedAt: alert.lastNotifiedAt ? alert.lastNotifiedAt.toISOString() : null,
    lastPollError: alert.lastPollError,
    templates,
  };

  // Turning Match alerts ON → immediate campaign to all devices (broadcast topic).
  const justEnabledAlerts = alert.alertsEnabled && !wasAlertsEnabled && input.alertsEnabled === true;
  if (justEnabledAlerts) {
    const { campaign } = await createCampaign(
      project.id,
      CreateCampaignInput.parse({
        action: "send_now",
        mode: "BROADCAST_TOPIC",
        targetTopic: project.defaultBroadcastTopic,
        title: activeTpl.title,
        body: activeTpl.body,
        imageUrl: notificationFlagImageUrl({
          shortHome: activeTpl.shortHome,
          shortAway: activeTpl.shortAway,
          flagHomeUrl: activeTpl.flagHomeUrl,
        }) ?? undefined,
        deepLink: `/match/${fixtureId}`,
        dataJson: {
          type: "LIVE_SCORE",
          fixtureId,
          phase: activeTpl.phase,
          trigger: "match_alerts_on",
        },
        createdBy: "cric-live-alerts",
        refreshFromApiBeforeSend: false,
      }),
    );

    // Send inline (do not wait on BullMQ / Redis) so History leaves QUEUED immediately.
    const sent = await runCampaign(campaign.id);
    const fingerprint = `${activeTpl.phase}|${activeTpl.title}|${activeTpl.body}`;

    await prisma.cricLiveMatchAlert.update({
      where: { id: alert.id },
      data: {
        lastNotifiedScore: fingerprint,
        lastNotifiedAt: new Date(),
        lastPollError: null,
      },
    });
    match.lastNotifiedScore = fingerprint;
    match.lastNotifiedAt = new Date().toISOString();

    log.info(
      {
        fixtureId,
        campaignId: sent.id,
        status: sent.status,
        phase: activeTpl.phase,
        topic: project.defaultBroadcastTopic,
      },
      "match alerts on → sent instantly",
    );
    return { match, campaign: sent, enqueue: false };
  }

  return { match };
}

export type LiveScoreTickResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  campaignIds: string[];
};

/**
 * Poll matches with auto alerts and instantly send phase campaigns:
 * toss day → match start → live score updates → result.
 */
export async function runCricLiveScoreTick(): Promise<LiveScoreTickResult> {
  const project = await prisma.project.findUnique({ where: { slug: CRICRUMBLE_SLUG } });
  if (!project || project.status !== "ACTIVE") {
    return { checked: 0, sent: 0, skipped: 0, errors: 0, campaignIds: [] };
  }

  const alerts = await prisma.cricLiveMatchAlert.findMany({
    where: { projectId: project.id, alertsEnabled: true, autoOnScoreUpdate: true },
  });

  const result: LiveScoreTickResult = {
    checked: alerts.length,
    sent: 0,
    skipped: 0,
    errors: 0,
    campaignIds: [],
  };

  if (alerts.length === 0) return result;

  let remotes: Awaited<ReturnType<typeof fetchRemoteMatches>> = [];
  try {
    remotes = await fetchRemoteMatches(project);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : err }, "live fixtures list failed during auto tick");
  }
  const remoteById = new Map(remotes.map((m) => [m.fixtureId, m]));

  for (const alert of alerts) {
    try {
      const remote = remoteById.get(alert.fixtureId);
      const snap = await fetchMatchExperienceSnapshot(project, alert.fixtureId).catch(() => null);

      await prisma.cricLiveMatchAlert.update({
        where: { id: alert.id },
        data: {
          lastPolledAt: new Date(),
          lastPollError: null,
          kind: remote?.kind ?? snap?.matchPhase ?? alert.kind,
          status: snap?.status ?? remote?.status ?? alert.status,
          teamHome: remote?.teamHome ?? snap?.teamHome ?? alert.teamHome,
          teamAway: remote?.teamAway ?? snap?.teamAway ?? alert.teamAway,
        },
      });

      const kind =
        (snap?.matchPhase || remote?.kind || alert.kind || "upcoming").toLowerCase() === "live"
          ? "live"
          : remote?.kind ?? alert.kind ?? "upcoming";

      const tplInput: MatchTemplateInput = {
        shortHome: snap?.shortHome ?? remote?.shortHome ?? null,
        shortAway: snap?.shortAway ?? remote?.shortAway ?? null,
        teamHome: snap?.teamHome ?? remote?.teamHome ?? alert.teamHome,
        teamAway: snap?.teamAway ?? remote?.teamAway ?? alert.teamAway,
        startingAt: remote?.startingAt ?? null,
        kickoffLabel: remote?.kickoffLabel ?? formatKickoffLabel(remote?.startingAt),
        venue: snap?.venue ?? remote?.venue ?? null,
        toss: snap?.toss ?? null,
        scoreLine: snap?.scoreLine ?? remote?.scoreLine ?? null,
        resultLine: snap?.scoreLine ?? remote?.scoreLine ?? null,
        status: snap?.status ?? remote?.status ?? alert.status,
        kind,
        matchPhase: snap?.matchPhase ?? null,
        flagHomeUrl: remote?.flagHomeUrl ?? null,
        flagAwayUrl: remote?.flagAwayUrl ?? null,
      };

      const sendPhase = resolveAutoSendPhase(tplInput, alert.lastNotifiedScore);
      if (!sendPhase) {
        result.skipped += 1;
        continue;
      }

      if (sendPhase === "live" && !tplInput.scoreLine) {
        result.skipped += 1;
        continue;
      }

      const tpl = pickTemplate(tplInput, sendPhase);
      const fingerprint = `${tpl.phase}|${tpl.title}|${tpl.body}`;

      if (alert.lastNotifiedScore === fingerprint) {
        result.skipped += 1;
        continue;
      }

      if (!alert.lastNotifiedScore) {
        await prisma.cricLiveMatchAlert.update({
          where: { id: alert.id },
          data: { lastNotifiedScore: fingerprint },
        });
        result.skipped += 1;
        continue;
      }

      const { campaign } = await createCampaign(
        project.id,
        CreateCampaignInput.parse({
          action: "send_now",
          mode: "BROADCAST_TOPIC",
          targetTopic: project.defaultBroadcastTopic,
          title: tpl.title,
          body: tpl.body,
          imageUrl: notificationFlagImageUrl(tplInput) ?? undefined,
          deepLink: `/match/${alert.fixtureId}`,
          dataJson: {
            type: "LIVE_SCORE",
            fixtureId: alert.fixtureId,
            phase: tpl.phase,
            trigger: "auto_phase",
          },
          createdBy: "cric-live-auto",
          refreshFromApiBeforeSend: false,
        }),
      );

      const sent = await runCampaign(campaign.id);

      await prisma.cricLiveMatchAlert.update({
        where: { id: alert.id },
        data: {
          lastNotifiedScore: fingerprint,
          lastNotifiedAt: new Date(),
          status: snap?.status ?? alert.status,
        },
      });

      result.sent += 1;
      result.campaignIds.push(sent.id);
      log.info(
        { fixtureId: alert.fixtureId, phase: tpl.phase, campaignId: sent.id, status: sent.status },
        "auto phase notification sent",
      );
    } catch (err) {
      result.errors += 1;
      const message = err instanceof Error ? err.message : "poll failed";
      log.warn({ fixtureId: alert.fixtureId, err: message }, "live score poll failed");
      await prisma.cricLiveMatchAlert
        .update({
          where: { id: alert.id },
          data: { lastPolledAt: new Date(), lastPollError: message },
        })
        .catch(() => undefined);
    }
  }

  return result;
}

