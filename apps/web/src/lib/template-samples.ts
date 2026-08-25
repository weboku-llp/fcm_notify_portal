/**
 * Sample / placeholder values for template variables in compose, resend, and
 * template management UIs. Keys are {{variable}} names used in templates.
 */

function todayParts(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    dateLabel: `${d.getDate()} ${months[d.getMonth()]}`,
    updateId: `upd-${yyyy}${mm}${dd}`,
  };
}

/** Realistic sample values so previews read like a real push. */
export const TEMPLATE_SAMPLE_VALUES: Record<string, string> = {
  // CricRumble / sports
  dateLabel: "24 Aug",
  headline: "Padikkal ton puts India on top in Colombo",
  summary: "India 300/5 after Day 1; Australia level series vs Bangladesh",
  imageUrl: "https://images.unsplash.com/photo-1531415079815-fe2729c43362?w=800&q=80",
  updateId: "upd-20260824",
  teamA: "India",
  teamB: "Australia",
  matchTime: "7:30 PM",
  matchId: "m42",
  firstName: "Alex",
  appName: "CricRumble",
  // Influventure / influencer marketing
  message: "Your campaign brief is live — open the app for deliverables.",
  campaignId: "cmp-iv-1042",
  campaignName: "Summer Glow Skincare",
  brandName: "Lumina Beauty",
  influencerName: "Priya",
  deadline: "28 Aug, 6 PM",
  amount: "₹12,500",
  payoutId: "pay-8841",
  opportunityId: "opp-220",
  productName: "Vitamin C Serum Kit",
  deliverable: "1 Reel + 3 Stories",
  revisionNote: "Please reshoot with product in natural light",
};

/** Influventure-oriented samples when the active project is Influventure. */
export const INFLUVENTURE_SAMPLE_VALUES: Record<string, string> = {
  ...TEMPLATE_SAMPLE_VALUES,
  headline: "Lumina Beauty · Summer Glow campaign is live",
  message: "Post your Reel by Friday and tag @luminabeauty.",
  summary: "Brief, creative direction, and payout details are ready in the app.",
  imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&q=80",
  appName: "Influventure",
  firstName: "Priya",
};

export function templateSampleValue(
  key: string,
  opts?: { influventure?: boolean },
): string {
  const today = todayParts();
  if (key === "dateLabel") return today.dateLabel;
  if (key === "updateId") return today.updateId;
  const map = opts?.influventure ? INFLUVENTURE_SAMPLE_VALUES : TEMPLATE_SAMPLE_VALUES;
  return map[key] ?? `Value for ${key}`;
}

export function templateVarPlaceholder(
  key: string,
  opts?: { influventure?: boolean },
): string {
  return templateSampleValue(key, opts);
}
