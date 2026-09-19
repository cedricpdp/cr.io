export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function serviceWorkerUrl(baseUrl: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}sw.js`;
}

export function isStaticDemoHost(hostname: string) {
  return hostname === "cedricpdp.github.io" || hostname.endsWith(".github.io");
}

export function isStandaloneApp() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export async function registerServiceWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register(serviceWorkerUrl(import.meta.env.BASE_URL), {
      scope: import.meta.env.BASE_URL
    });
  } catch {
    // L'application reste entièrement utilisable si le navigateur refuse le service worker.
  }
}
