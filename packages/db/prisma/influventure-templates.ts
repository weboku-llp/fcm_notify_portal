import type { Prisma } from "@notif/db";

/**
 * Influventure (influencer marketing) push templates.
 * Used by seed and one-off upsert scripts.
 */
export interface InfluventureTemplateDef {
  name: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  deepLink?: string | null;
  dataJson: Prisma.InputJsonValue;
  variables: string[];
}

export const INFLUVENTURE_TEMPLATES: InfluventureTemplateDef[] = [
  {
    name: "Campaign Update",
    title: "{{headline}}",
    body: "{{message}}",
    deepLink: "/campaigns/{{campaignId}}",
    dataJson: {
      type: "CAMPAIGN_UPDATE",
      campaignId: "{{campaignId}}",
      deepLink: "/campaigns/{{campaignId}}",
    },
    variables: ["headline", "message", "campaignId"],
  },
  {
    name: "New Campaign Invite",
    title: "{{brandName}} invited you",
    body: "Join {{campaignName}} — {{deliverable}}. Tap to review the brief and accept.",
    deepLink: "/campaigns/{{campaignId}}",
    dataJson: {
      type: "CAMPAIGN_INVITE",
      campaignId: "{{campaignId}}",
      brandName: "{{brandName}}",
      deepLink: "/campaigns/{{campaignId}}",
    },
    variables: ["brandName", "campaignName", "deliverable", "campaignId"],
  },
  {
    name: "Brief Ready",
    title: "Brief ready · {{campaignName}}",
    body: "{{brandName}} shared creative direction for {{productName}}. Open to start creating.",
    deepLink: "/campaigns/{{campaignId}}/brief",
    dataJson: {
      type: "BRIEF_READY",
      campaignId: "{{campaignId}}",
      deepLink: "/campaigns/{{campaignId}}/brief",
    },
    variables: ["campaignName", "brandName", "productName", "campaignId"],
  },
  {
    name: "Content Deadline",
    title: "Due {{deadline}} · {{campaignName}}",
    body: "Reminder: submit {{deliverable}} for {{brandName}} before the deadline.",
    deepLink: "/campaigns/{{campaignId}}",
    dataJson: {
      type: "CONTENT_DEADLINE",
      campaignId: "{{campaignId}}",
      deadline: "{{deadline}}",
      deepLink: "/campaigns/{{campaignId}}",
    },
    variables: ["deadline", "campaignName", "deliverable", "brandName", "campaignId"],
  },
  {
    name: "Content Approved",
    title: "Approved · {{campaignName}}",
    body: "Great work, {{influencerName}}! {{brandName}} approved your content. You can go live.",
    deepLink: "/campaigns/{{campaignId}}",
    dataJson: {
      type: "CONTENT_APPROVED",
      campaignId: "{{campaignId}}",
      deepLink: "/campaigns/{{campaignId}}",
    },
    variables: ["campaignName", "influencerName", "brandName", "campaignId"],
  },
  {
    name: "Revision Requested",
    title: "Changes needed · {{campaignName}}",
    body: "{{revisionNote}}. Update and resubmit when ready.",
    deepLink: "/campaigns/{{campaignId}}",
    dataJson: {
      type: "CONTENT_REVISION",
      campaignId: "{{campaignId}}",
      deepLink: "/campaigns/{{campaignId}}",
    },
    variables: ["campaignName", "revisionNote", "campaignId"],
  },
  {
    name: "Payout Sent",
    title: "Payout of {{amount}} sent",
    body: "Your earnings for {{campaignName}} are on the way. Details in Payouts.",
    deepLink: "/payouts/{{payoutId}}",
    dataJson: {
      type: "PAYOUT_SENT",
      payoutId: "{{payoutId}}",
      campaignId: "{{campaignId}}",
      deepLink: "/payouts/{{payoutId}}",
    },
    variables: ["amount", "campaignName", "payoutId", "campaignId"],
  },
  {
    name: "New Opportunity",
    title: "{{brandName}} wants to collaborate",
    body: "{{campaignName}} · {{deliverable}}. Review the offer and apply in the app.",
    deepLink: "/opportunities/{{opportunityId}}",
    dataJson: {
      type: "NEW_OPPORTUNITY",
      opportunityId: "{{opportunityId}}",
      deepLink: "/opportunities/{{opportunityId}}",
    },
    variables: ["brandName", "campaignName", "deliverable", "opportunityId"],
  },
  {
    name: "Welcome Creator",
    title: "Welcome to Influventure, {{firstName}}!",
    body: "Complete your profile to get matched with brand campaigns that fit your niche.",
    deepLink: "/profile",
    dataJson: {
      type: "WELCOME_CREATOR",
      deepLink: "/profile",
    },
    variables: ["firstName"],
  },
];
