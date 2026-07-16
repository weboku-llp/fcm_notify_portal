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
