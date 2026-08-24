import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractVariables, renderTemplateStrict, TemplateVariableError } from "../templates.js";

describe("template rendering", () => {
  it("extracts variables from title/body/data", () => {
    const vars = extractVariables(
      "{{teamA}} vs {{teamB}}",
      "starts at {{matchTime}}",
      "/matches/{{matchId}}",
    );
    assert.deepEqual(vars.sort(), ["matchId", "matchTime", "teamA", "teamB"]);
  });

  it("renders Match Starting template", () => {
    const rendered = renderTemplateStrict(
      {
        title: "{{teamA}} vs {{teamB}}",
        body: "Live action starts at {{matchTime}}. Open CricRumble now.",
        imageUrl: "{{imageUrl}}",
        deepLink: "/matches/{{matchId}}",
        dataJson: {
          type: "MATCH_START",
          matchId: "{{matchId}}",
          deepLink: "/matches/{{matchId}}",
        },
      },
      ["teamA", "teamB", "matchTime", "imageUrl", "matchId"],
      {
        teamA: "India",
        teamB: "Australia",
        matchTime: "7:30 PM",
        imageUrl: "https://cdn.example/m.png",
        matchId: "m42",
      },
    );
    assert.equal(rendered.title, "India vs Australia");
    assert.equal(rendered.dataJson?.matchId, "m42");
    assert.equal(rendered.deepLink, "/matches/m42");
  });

  it("renders Daily Update template", () => {
    const rendered = renderTemplateStrict(
      {
        title: "Daily Update · {{dateLabel}}",
        body: "{{headline}} — {{summary}}",
        imageUrl: "{{imageUrl}}",
        deepLink: "/updates/{{updateId}}",
        dataJson: {
          type: "DAILY_UPDATE",
          updateId: "{{updateId}}",
          deepLink: "/updates/{{updateId}}",
        },
      },
      ["dateLabel", "headline", "summary", "imageUrl", "updateId"],
      {
        dateLabel: "23 Aug",
        headline: "Kohli century seals the series",
        summary: "India chase 278 with 6 wickets and 8 balls to spare.",
        imageUrl: "https://cdn.example/daily.png",
        updateId: "upd-42",
      },
    );
    assert.equal(rendered.title, "Daily Update · 23 Aug");
    assert.equal(rendered.body, "Kohli century seals the series — India chase 278 with 6 wickets and 8 balls to spare.");
    assert.equal(rendered.deepLink, "/updates/upd-42");
    assert.equal(rendered.dataJson?.type, "DAILY_UPDATE");
  });

  it("rejects missing required variables", () => {
    assert.throws(
      () =>
        renderTemplateStrict(
          { title: "{{teamA}} vs {{teamB}}", body: "go" },
          ["teamA", "teamB"],
          { teamA: "India" },
        ),
      (err: unknown) => err instanceof TemplateVariableError && err.missing.includes("teamB"),
    );
  });
});
