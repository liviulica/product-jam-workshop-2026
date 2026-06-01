// Typed loaders for the portal data contract.
// The /h: slash commands write these files into public/data/; the portal only reads them.
// Every loader returns a typed empty value if the file is missing or blank, so pages
// can render a friendly empty state instead of crashing.

export type LastUpdated = {
  releaseNotes: string | null;
  docs: string | null;
  prioritization: string | null;
  competition: string | null;
};

export type Meta = {
  repo: string;
  lastUpdated: LastUpdated;
};

export type PR = {
  number: number;
  title: string;
  type: string;
  author: { login: string; name: string | null };
  mergedAt: string;
  url: string;
  description: string;
  labels: string[];
};

export type LeaderboardEntry = {
  login: string;
  name: string | null;
  count: number;
  additions: number;
  deletions: number;
  prNumbers: number[];
};

export type ReleaseNotes = {
  generatedAt: string | null;
  range: { since: string; until: string; label: string } | null;
  summary: string;
  prs: PR[];
  leaderboard: LeaderboardEntry[];
};

export type DocSection = {
  id: string;
  title: string;
  file: string;
  category: string;
  order: number;
};

export type DocsIndex = {
  generatedAt: string | null;
  sections: DocSection[];
};

export type IssueScores = {
  comments: number;
  severity: number;
  priority: number;
  total: number;
};

export type IssueSignals = {
  commentCount: number;
  participants: number;
  thumbsUp: number;
  maintainerEngaged: boolean;
  ageDays: number;
};

export type Issue = {
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  scores: IssueScores;
  rationale: string;
  recommendedAction: string;
  signals: IssueSignals;
};

export type Prioritization = {
  generatedAt: string | null;
  weights: { comments: number; severity: number; priority: number };
  issues: Issue[];
};

export type NewsItem = {
  date: string;
  headline: string;
  url: string;
  summary: string;
};

export type Competitor = {
  name: string;
  url: string;
  positioning: string;
  pricing: string;
  platforms: string[];
  openSource: boolean;
  local: boolean;
  strengths: string[];
  weaknesses: string[];
  recentNews: NewsItem[];
  vsHandy: string;
};

export type Competition = {
  generatedAt: string | null;
  summary: string;
  competitors: Competitor[];
  opportunities: string[];
};

const base = import.meta.env.BASE_URL;

async function getJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${base}data/${file}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    const text = (await res.text()).trim();
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

async function getText(file: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}data/${file}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export const emptyMeta: Meta = {
  repo: "cjpais/Handy",
  lastUpdated: {
    releaseNotes: null,
    docs: null,
    prioritization: null,
    competition: null,
  },
};

export const loadMeta = () => getJson<Meta>("meta.json", emptyMeta);

export const loadReleaseNotes = () =>
  getJson<ReleaseNotes>("release-notes.json", {
    generatedAt: null,
    range: null,
    summary: "",
    prs: [],
    leaderboard: [],
  });

export const loadDocsIndex = () =>
  getJson<DocsIndex>("docs-index.json", { generatedAt: null, sections: [] });

export const loadDocContent = (file: string) => getText(`docs/${file}`);

export const loadPrioritization = () =>
  getJson<Prioritization>("prioritization.json", {
    generatedAt: null,
    weights: { comments: 0.3, severity: 0.4, priority: 0.3 },
    issues: [],
  });

export const loadCompetition = () =>
  getJson<Competition>("competition.json", {
    generatedAt: null,
    summary: "",
    competitors: [],
    opportunities: [],
  });

export const avatarUrl = (login: string) =>
  `https://github.com/${login}.png?size=80`;
