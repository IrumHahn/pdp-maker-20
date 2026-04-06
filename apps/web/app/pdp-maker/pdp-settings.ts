"use client";

export interface PdpClientSettings {
  customGeminiApiKey: string;
}

const PDP_SETTINGS_STORAGE_KEY = "hanirum-pdp-maker-settings-v1";

const DEFAULT_SETTINGS: PdpClientSettings = {
  customGeminiApiKey: ""
};

export function loadPdpClientSettings(): PdpClientSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const rawValue = window.localStorage.getItem(PDP_SETTINGS_STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(rawValue) as Partial<PdpClientSettings>;
    return normalizePdpClientSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function savePdpClientSettings(settings: PdpClientSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PDP_SETTINGS_STORAGE_KEY, JSON.stringify(normalizePdpClientSettings(settings)));
}

export function resolveGeminiApiKeyHeaderValue(settings?: PdpClientSettings) {
  const nextSettings = settings ?? loadPdpClientSettings();
  const trimmed = nextSettings.customGeminiApiKey.trim();
  return trimmed || null;
}

export function maskGeminiApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return "";
  }

  const visiblePrefixLength = Math.min(10, trimmed.length);
  return `${trimmed.slice(0, visiblePrefixLength)}${"•".repeat(Math.max(6, trimmed.length - visiblePrefixLength))}`;
}

function normalizePdpClientSettings(settings?: Partial<PdpClientSettings> | null): PdpClientSettings {
  return {
    customGeminiApiKey: settings?.customGeminiApiKey?.trim() ?? ""
  };
}
