// site/ 디렉터리(루트 사이트 배포 대상)의 검색엔진용 파일을 확인합니다.
// Node.js 기본 모듈만 사용합니다. 사용: node scripts/validate-site.mjs
import fs from "fs";
import path from "path";

const siteDir = path.join(process.cwd(), "site");
const ROOT_URL = "https://nimkoes.github.io/";
const CHILD_SITEMAPS = [
  "https://nimkoes.github.io/sitemap-root.xml",
  "https://nimkoes.github.io/tech-blog/sitemap.xml",
  "https://nimkoes.github.io/portfolio/sitemap.xml",
];

const errors = [];
const fail = (message) => errors.push(message);

function read(name) {
  const filePath = path.join(siteDir, name);
  if (!fs.existsSync(filePath)) {
    fail(`site/${name} 파일이 없습니다.`);
    return "";
  }
  const content = fs.readFileSync(filePath, "utf8");
  // 빈 파일이면 아래 검사가 건너뛰어지므로 여기서 실패로 기록합니다.
  if (content.trim() === "") fail(`site/${name} 파일이 비어 있습니다.`);
  return content;
}

// robots.txt 와 사이트맵 두 파일은 계획서가 정확한 내용을 정해 둔 파일입니다.
// 규칙을 해석해 검사하면 Disallow: /*, 특정 로봇 전용 차단 같은 변형을 놓치므로 기대 내용과 완전히 같은지 비교합니다.
// 이 파일들을 의도적으로 바꿀 때는 아래 기대 내용도 함께 고칩니다.
const EXPECTED = {
  "robots.txt": `User-agent: *
Allow: /

User-agent: GPTBot
Disallow: /

User-agent: CCBot
Disallow: /

Sitemap: https://nimkoes.github.io/sitemap.xml`,
  "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://nimkoes.github.io/sitemap-root.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://nimkoes.github.io/tech-blog/sitemap.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://nimkoes.github.io/portfolio/sitemap.xml</loc>
  </sitemap>
</sitemapindex>`,
  "sitemap-root.xml": `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://nimkoes.github.io/</loc>
  </url>
</urlset>`,
};

const normalize = (text) =>
  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

function metaContent(html, attr, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((value) => new RegExp(`${attr}="${name}"`, "i").test(value));
  return tag?.match(/content="([^"]*)"/i)?.[1];
}

const locsOf = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc.trim());

const html = read("index.html");
const robots = read("robots.txt");
const sitemapIndex = read("sitemap.xml");
const sitemapRoot = read("sitemap-root.xml");

if (html) {
  if (!/^<!DOCTYPE html>/i.test(html.trim())) fail("index.html 에 DOCTYPE 이 없습니다.");
  if (!/<html\b[^>]*lang="ko"/i.test(html)) fail('index.html 에 lang="ko" 가 없습니다.');
  if (!/<title>[^<]+<\/title>/i.test(html)) fail("title 이 없습니다.");
  if (!metaContent(html, "name", "description")) fail("meta description 이 없습니다.");

  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
  if (canonical !== ROOT_URL) fail(`Canonical 이 ${ROOT_URL} 가 아닙니다: ${canonical ?? "(없음)"}`);
  if (metaContent(html, "property", "og:url") !== ROOT_URL) fail("og:url 이 Canonical 과 다릅니다.");
  for (const name of ["og:title", "og:description", "og:image"]) {
    if (!metaContent(html, "property", name)) fail(`${name} 가 없습니다.`);
  }
  if (!metaContent(html, "name", "twitter:card")) fail("twitter:card 가 없습니다.");

  const robotsMetas = (html.match(/<meta\b[^>]*name="(robots|googlebot)"[^>]*>/gi) ?? []).join(" ");
  if (/noindex|none/i.test(robotsMetas)) fail("index.html 의 robots 메타 태그가 색인을 막고 있습니다.");

  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  if (h1Count !== 1) fail(`H1 은 1개여야 합니다. 현재 ${h1Count}개입니다.`);

  if (!/<a\b[^>]*href="https:\/\/nimkoes\.github\.io\/tech-blog\/"/i.test(html)) fail("기술 블로그 링크가 없습니다.");
  if (!/<a\b[^>]*href="https:\/\/nimkoes\.github\.io\/portfolio\/"/i.test(html)) fail("포트폴리오 링크가 없습니다.");

  // 검증 값 자체는 출력하지 않고 존재 여부만 봅니다.
  if (!metaContent(html, "name", "google-site-verification")) fail("Google 소유 확인 메타 태그가 없습니다.");
  if (!metaContent(html, "name", "naver-site-verification")) fail("네이버 소유 확인 메타 태그가 없습니다.");

  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
  if (!jsonLd) fail("JSON-LD 가 없습니다.");
  else {
    try {
      const data = JSON.parse(jsonLd);
      const types = (data["@graph"] ?? [data]).map((node) => node["@type"]);
      if (!types.includes("WebSite")) fail("JSON-LD 에 WebSite 가 없습니다.");
      if (!types.includes("Person") && !types.includes("ProfilePage")) fail("JSON-LD 에 Person 또는 ProfilePage 가 없습니다.");
    } catch {
      fail("JSON-LD 를 JSON 으로 읽을 수 없습니다.");
    }
  }
}

if (robots) {
  const lines = robots.split(/\r?\n/).map((line) => line.trim());
  const groups = [];
  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(key)) groups.push({ agent: value, rules: [] });
    else if (/^(allow|disallow)$/i.test(key) && groups.length) groups.at(-1).rules.push({ type: key.toLowerCase(), value });
  }
  const wildcard = groups.find((group) => group.agent === "*");
  if (!wildcard) fail("robots.txt 에 User-agent: * 그룹이 없습니다.");
  else if (wildcard.rules.some((rule) => rule.type === "disallow" && rule.value === "/")) fail("robots.txt 가 모든 수집을 막고 있습니다.");
  else if (!wildcard.rules.some((rule) => rule.type === "allow" && rule.value === "/")) fail("robots.txt 가 / 수집을 허용하지 않습니다.");
  if (!lines.includes(`Sitemap: ${ROOT_URL}sitemap.xml`)) fail("robots.txt 가 루트 사이트맵을 가리키지 않습니다.");
  if (lines.some((line) => /^host:/i.test(line))) fail("robots.txt 에 비표준 Host 지시문이 있습니다.");
}

if (sitemapIndex) {
  if (!/<sitemapindex\b/.test(sitemapIndex)) fail("sitemap.xml 이 사이트맵 인덱스 형식이 아닙니다.");
  const locs = locsOf(sitemapIndex);
  for (const child of CHILD_SITEMAPS) {
    if (!locs.includes(child)) fail(`사이트맵 인덱스에 ${child} 가 없습니다.`);
  }
  for (const loc of locs) {
    if (!loc.endsWith(".xml")) fail(`사이트맵 인덱스에 사이트맵이 아닌 URL 이 있습니다: ${loc}`);
  }
}

if (sitemapRoot) {
  const locs = locsOf(sitemapRoot);
  if (locs.length !== 1 || locs[0] !== ROOT_URL) fail(`sitemap-root.xml 에는 ${ROOT_URL} 하나만 있어야 합니다.`);
}

// index.html 이 참조하는 정적 자원이 배포 디렉터리에 있는지 확인합니다.
for (const asset of ["og-image.png", "favicon.ico"]) {
  const assetPath = path.join(siteDir, asset);
  if (!fs.existsSync(assetPath) || fs.statSync(assetPath).size === 0) fail(`site/${asset} 파일이 없거나 비어 있습니다.`);
}

for (const [name, expected] of Object.entries(EXPECTED)) {
  const actual = { "robots.txt": robots, "sitemap.xml": sitemapIndex, "sitemap-root.xml": sitemapRoot }[name];
  if (actual && normalize(actual) !== normalize(expected)) {
    fail(`site/${name} 내용이 기대 내용과 다릅니다. 의도한 변경이면 scripts/validate-site.mjs 의 EXPECTED 도 고칩니다.`);
  }
}

for (const [name, content] of Object.entries({ "index.html": html, "robots.txt": robots, "sitemap.xml": sitemapIndex, "sitemap-root.xml": sitemapRoot })) {
  if (/localhost|127\.0\.0\.1/.test(content)) fail(`site/${name} 에 로컬 주소가 있습니다.`);
}

if (errors.length > 0) {
  console.error("Root site validation failed.");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Root site validation passed.");
