export type RuntimeMode = "extension" | "web";
export type StorageProvider = "chrome-storage" | "local-storage";

export function isExtensionRuntime(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

export function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export function hasChromeTabs(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.tabs?.create);
}

export function hasChromeSidePanel(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.sidePanel?.open);
}

export function getRuntimeMode(): RuntimeMode {
  return isExtensionRuntime() ? "extension" : "web";
}

export function getStorageProvider(): StorageProvider {
  return hasChromeStorage() ? "chrome-storage" : "local-storage";
}

export function getAppUrl(): string {
  if (isExtensionRuntime() && chrome.runtime?.getURL) {
    return chrome.runtime.getURL("app.html");
  }

  if (typeof window !== "undefined") {
    return new URL("/", window.location.href).toString();
  }

  return "/";
}
