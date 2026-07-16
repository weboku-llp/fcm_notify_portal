export * from "./enums.js";
export * from "./service-account.js";
export * from "./project.js";
export * from "./token.js";
export * from "./segment.js";
export * from "./template.js";
export * from "./campaign.js";
export * from "./queue.js";

/** Standard API error envelope. */
export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
