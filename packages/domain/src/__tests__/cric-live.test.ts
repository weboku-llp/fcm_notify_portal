import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScoreLine } from "../cric-live.js";

describe("buildScoreLine", () => {
  it("prefers a rich status that contains digits", () => {
    assert.equal(
      buildScoreLine({
        status: "India 245/4 (42.3 ov)",
        shortHome: "IND",
        shortAway: "AUS",
        scoreHome: "245/4",
        scoreAway: "-",
      }),
      "India 245/4 (42.3 ov)",
    );
  });

  it("returns null for upcoming placeholders", () => {
    assert.equal(
      buildScoreLine({
        status: "NS",
        scoreHome: "-",
        scoreAway: "-",
        shortHome: "NAM",
        shortAway: "SA",
      }),
      null,
    );
  });

  it("composes from team scores when status is generic", () => {
    assert.equal(
      buildScoreLine({
        status: "Live",
        shortHome: "IND",
        shortAway: "AUS",
        scoreHome: "245/4",
        scoreAway: "-",
        overs: "42.3",
      }),
      "IND 245/4 · AUS (42.3 ov)",
    );
  });
});
