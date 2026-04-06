export const BRAND_PRIMARY = "#1F6F5C";
export const DEFAULT_MODEL = "gpt-4o-mini";

export type ProviderType = "openai" | "gemini" | "claude";

export interface WidgetInitConfig {
  siteId: string;
  position?: "bottom-right" | "bottom-left";
  theme?: "light" | "dark";
}

export * from "./pdp";
export * from "./tennis";
