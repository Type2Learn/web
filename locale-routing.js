(() => {
  "use strict";

  const preferenceKey = "type2learn-locale";
  const url = new URL(window.location.href);
  const routePairs = new Map([
    ["/", "/ur/"],
    ["/how-it-works/", "/ur/how-it-works/"],
    ["/learning-together/", "/ur/learning-together/"],
    ["/participation-trust/", "/ur/participation-trust/"],
    ["/team/", "/ur/team/"]
  ]);
  const urduToEnglish = new Map([...routePairs].map(([english, urdu]) => [urdu, english]));
  const normalizedPath = url.pathname === "/index.html"
    ? "/"
    : url.pathname.replace(/index\.html$/, "");
  const requested = url.searchParams.get("lang");
  const supported = requested === "ur" || requested === "en" ? requested : null;

  const remember = (language) => {
    try { window.localStorage.setItem(preferenceKey, language); } catch (error) { /* Cookie preference still works. */ }
    document.cookie = "t2l_locale=" + language + "; Path=/; Max-Age=31536000; SameSite=Lax; Secure";
  };

  const saved = () => {
    try {
      const value = window.localStorage.getItem(preferenceKey);
      return value === "ur" || value === "en" ? value : null;
    } catch (error) {
      return null;
    }
  };

  if (supported) {
    remember(supported);
    url.searchParams.delete("lang");
    const englishPath = urduToEnglish.get(normalizedPath) || normalizedPath;
    const destination = supported === "ur"
      ? (routePairs.get(englishPath) || "/ur/")
      : (urduToEnglish.get(normalizedPath) || englishPath || "/");
    if (url.pathname !== destination) {
      url.pathname = destination;
      window.location.replace(url.toString());
      return;
    }
    window.history.replaceState({}, "", url.pathname + (url.search || "") + (url.hash || ""));
    return;
  }

  if (!routePairs.has(normalizedPath) || saved() === "en") return;

  const languagePreferences = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  const browserPrefersUrdu = languagePreferences.some((language) => String(language).toLowerCase().startsWith("ur"));
  if (saved() === "ur" || browserPrefersUrdu) {
    url.pathname = routePairs.get(normalizedPath);
    window.location.replace(url.toString());
  }
})();
