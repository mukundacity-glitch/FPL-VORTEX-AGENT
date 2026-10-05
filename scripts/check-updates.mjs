import { readFile, mkdir, writeFile } from "node:fs/promises";
const headers = {
  Accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};
async function json(url, extra = {}) {
  const response = await fetch(url, {
    headers:
      new URL(url).hostname === "api.github.com"
        ? headers
        : { Accept: "application/json" },
    ...extra,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error(
      `Update source returned ${response.status}: ${new URL(url).hostname}`,
    );
  return response.json();
}
const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const lock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const baseline = (
  await readFile(new URL("../.upstream/ruflo.sha", import.meta.url), "utf8")
).trim();
const report = {
  checkedAt: new Date().toISOString(),
  upstream: null,
  dependencies: [],
  models: {
    openai: "not checked: no API key",
    anthropic: "not checked: no API key",
  },
  policy:
    "Report only. Updates require a branch, tests, regression evaluation, review, and explicit promotion; no production mutations.",
};
const upstream = await json(
  "https://api.github.com/repos/ruvnet/ruflo/commits/main",
);
report.upstream = {
  baseline,
  latest: upstream.sha,
  changed: upstream.sha !== baseline,
  compare: `https://github.com/ruvnet/ruflo/compare/${baseline}...${upstream.sha}`,
};
for (const [name, version] of Object.entries({
  ...manifest.dependencies,
  ...manifest.devDependencies,
})) {
  const latest = await json(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
  );
  report.dependencies.push({
    name,
    configured: version,
    current: lock.packages[`node_modules/${name}`]?.version ?? version,
    latest: latest.version,
    reviewNeeded:
      (lock.packages[`node_modules/${name}`]?.version ?? version) !==
      latest.version,
  });
}
if (process.env.OPENAI_API_KEY) {
  const data = await json("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  report.models.openai = data.data.map((m) => m.id).sort();
}
if (process.env.ANTHROPIC_API_KEY) {
  const data = await json("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
  });
  report.models.anthropic = data.data.map((m) => m.id).sort();
}
await mkdir(".vortex", { recursive: true, mode: 0o700 });
await writeFile(
  ".vortex/update-report.json",
  JSON.stringify(report, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  "Update report saved to .vortex/update-report.json. No dependencies or production state changed.",
);
