import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPhaseTemplates,
  flagEmojiForTeamCode,
  pickTemplate,
  resolveAutoSendPhase,
  resolveNotifPhase,
  teamsTitleLine,
} from "../cric-live-templates.js";

describe("cric-live-templates", () => {
  const base = {
    shortHome: "NAM",
    shortAway: "SA",
    teamHome: "Namibia",
    teamAway: "South Africa",
    startingAt: "2026-08-28T12:00:00.000Z",
    venue: "Namibia Cricket Ground, Windhoek",
    kickoffLabel: "Fri, Aug 28, 05:30 PM",
  };

  it("builds flag + code title", () => {
    const title = teamsTitleLine(base);
    assert.match(title, /NAM vs/);
    assert.match(title, /SA/);
    assert.ok(title.includes("🇳🇦") || title.startsWith("NAM") === false);
    assert.equal(flagEmojiForTeamCode("NAM"), "🇳🇦");
    assert.equal(flagEmojiForTeamCode("SA"), "🇿🇦");
    assert.equal(title, "🇳🇦 NAM vs 🇿🇦 SA");
  });

  it("returns five distinct phase templates", () => {
    const tpls = buildPhaseTemplates({
      ...base,
      scoreLine: "NAM 120/2 (15.0 ov)",
      flagHomeUrl: "https://cdn.sportmonks.com/images/cricket/teams/5/293.png",
    });
    assert.equal(tpls.length, 5);
    assert.deepEqual(
      tpls.map((t) => t.phase),
      ["upcoming", "toss", "start", "live", "result"],
    );
    assert.equal(tpls[0]!.title, "🇳🇦 NAM vs 🇿🇦 SA");
    assert.match(tpls[2]!.body, /Match started/);
    assert.match(tpls[3]!.body, /120\/2/);
  });

  it("resolves upcoming vs live phase", () => {
    assert.equal(resolveNotifPhase({ ...base, kind: "upcoming" }, new Date("2026-08-20T00:00:00Z")), "upcoming");
    assert.equal(
      resolveNotifPhase({ ...base, kind: "live", scoreLine: "120/2" }, new Date()),
      "live",
    );
    assert.equal(
      resolveNotifPhase({ ...base, kind: "live", scoreLine: null }, new Date()),
      "start",
    );
    assert.equal(
      resolveNotifPhase({ ...base, kind: "upcoming" }, new Date("2026-08-28T08:00:00Z")),
      "toss",
    );
  });

  it("auto-send chooses toss/start/live/result transitions", () => {
    assert.equal(
      resolveAutoSendPhase({ ...base, kind: "upcoming" }, "upcoming|NAM vs SA|x", new Date("2026-08-20T00:00:00Z")),
      null,
    );
    assert.equal(
      resolveAutoSendPhase({ ...base, kind: "upcoming" }, "upcoming|x|y", new Date("2026-08-28T08:00:00Z")),
      "toss",
    );
    assert.equal(
      resolveAutoSendPhase({ ...base, kind: "live", scoreLine: null }, "toss|x|y"),
      "start",
    );
    assert.equal(
      resolveAutoSendPhase({ ...base, kind: "live", scoreLine: "10/0" }, "start|x|y"),
      "live",
    );
    assert.equal(
      resolveAutoSendPhase({ ...base, kind: "finished", scoreLine: "NAM won" }, "live|x|y"),
      "result",
    );
  });

  it("pickTemplate respects forced phase", () => {
    const live = pickTemplate({ ...base, scoreLine: "IND 10/0" }, "live");
    assert.equal(live.phase, "live");
    assert.match(live.body, /10\/0/);
  });
});
