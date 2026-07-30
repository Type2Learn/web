const PAKISTAN_COUNTRY_CODE = "PK";
const PREFERENCE_COOKIE = "t2l_locale";
const ONE_YEAR = 31_536_000;
const ROUTE_PAIRS = new Map([
  ["/", "/ur/"],
  ["/how-it-works/", "/ur/how-it-works/"],
  ["/pathways/", "/ur/pathways/"],
  ["/learners/", "/ur/learners/"],
  ["/families/", "/ur/families/"],
  ["/schools/", "/ur/schools/"],
  ["/team/", "/ur/team/"],
  ["/co-design/", "/ur/co-design/"],
  ["/community/", "/ur/community/"],
  ["/trust/", "/ur/trust/"]
]);
const URDU_TO_ENGLISH = new Map([...ROUTE_PAIRS].map(([english, urdu]) => [urdu, english]));

const cookieValue = (request, name) => {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : null;
};

const looksLikeCrawler = (request) => /bot|crawler|spider|slurp|facebookexternalhit|linkedinbot/i.test(request.headers.get("User-Agent") || "");

const browserPrefersUrdu = (request) => /(?:^|,)\s*ur(?:-|;|,|$)/i.test(request.headers.get("Accept-Language") || "");

const redirect = (request, language, setPreference = false) => {
  const destination = new URL(request.url);
  const normalizedPath = destination.pathname === "/index.html"
    ? "/"
    : destination.pathname.replace(/index\.html$/, "");
  const englishPath = URDU_TO_ENGLISH.get(normalizedPath) || normalizedPath;
  destination.pathname = language === "ur"
    ? (ROUTE_PAIRS.get(englishPath) || "/ur/")
    : (URDU_TO_ENGLISH.get(normalizedPath) || englishPath || "/");
  destination.searchParams.delete("lang");
  const headers = new Headers({
    Location: destination.toString(),
    "Cache-Control": "private, no-store",
    Vary: "Accept-Language, Cookie"
  });
  if (setPreference) headers.append("Set-Cookie", PREFERENCE_COOKIE + "=" + language + "; Path=/; Max-Age=" + ONE_YEAR + "; SameSite=Lax; Secure");
  return new Response(null, { status: 302, headers });
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const normalizedPath = url.pathname === "/index.html"
      ? "/"
      : url.pathname.replace(/index\.html$/, "");
    const isSupportedRoute = ROUTE_PAIRS.has(normalizedPath) || URDU_TO_ENGLISH.has(normalizedPath);
    if (!isSupportedRoute || !["GET", "HEAD"].includes(request.method) || looksLikeCrawler(request)) return fetch(request);

    const requested = url.searchParams.get("lang");
    if (requested === "ur" || requested === "en") return redirect(request, requested, true);

    const preference = cookieValue(request, PREFERENCE_COOKIE);
    if (preference === "ur" && ROUTE_PAIRS.has(normalizedPath)) return redirect(request, "ur");
    if (preference === "en" && URDU_TO_ENGLISH.has(normalizedPath)) return redirect(request, "en");
    if (preference === "en") return fetch(request);

    const country = request.cf?.country;
    if (ROUTE_PAIRS.has(normalizedPath) && (country === PAKISTAN_COUNTRY_CODE || browserPrefersUrdu(request))) return redirect(request, "ur");

    return fetch(request);
  }
};
