import { readFile, writeFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const profileRepository = process.env.GITHUB_REPOSITORY;
const profileOwner = process.env.PROFILE_OWNER;

if (!token || !profileRepository || !profileOwner) {
  throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY, and PROFILE_OWNER are required.');
}

const query = `
  query ProfileData($login: String!) {
    user(login: $login) {
      repositories(
        first: 100
        ownerAffiliations: OWNER
        privacy: PUBLIC
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        totalCount
        nodes {
          name
          nameWithOwner
          pushedAt
        }
      }
      contributionsCollection {
        contributionCalendar {
          totalContributions
        }
      }
    }
  }
`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'profile-readme-updater',
  },
  body: JSON.stringify({ query, variables: { login: profileOwner } }),
});

if (!response.ok) {
  throw new Error(`GitHub API request failed: ${response.status}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join('; '));
}

const { user } = payload.data;
if (!user) {
  throw new Error(`GitHub user not found: ${profileOwner}`);
}

const latest = user.repositories.nodes.find(
  (repository) => repository.nameWithOwner.toLowerCase() !== profileRepository.toLowerCase(),
);

const contributionCount = user.contributionsCollection.contributionCalendar.totalContributions;
const projectCount = user.repositories.totalCount;
const latestName = latest?.name ?? '—';
const latestDate = latest?.pushedAt
  ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(latest.pushedAt))
      .toUpperCase()
  : '—';

const paddedProjects = String(projectCount).padStart(2, '0');
const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const svg = `<svg width="1280" height="300" viewBox="0 0 1280 300" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Live profile statistics</title>
  <desc id="desc">${escapeXml(contributionCount)} contributions in the last 12 months, ${escapeXml(projectCount)} public projects, and ${escapeXml(latestName)} last worked on in ${escapeXml(latestDate)}.</desc>
  <defs>
    <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r=".65" fill="#F2EEE5" fill-opacity=".1"/>
    </pattern>
  </defs>
  <rect width="1280" height="300" fill="#101318"/>
  <rect width="1280" height="300" fill="url(#dots)"/>
  <path d="M0 52H1280M0 248H1280M440 52V248M780 52V248" stroke="#F2EEE5" stroke-opacity=".18"/>
  <path d="M58 53V248" stroke="#D64034" stroke-width="8"/>
  <text x="91" y="91" fill="#F2EEE5" font-family="Impact, Haettenschweiler, sans-serif" font-size="21" letter-spacing="2.4">PROFILE STATUS</text>
  <text x="91" y="116" fill="#A9AFB7" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="13" letter-spacing="1.2">LIVE DATA · UPDATED DAILY</text>
  <text x="91" y="181" fill="#F2EEE5" font-family="Impact, Haettenschweiler, sans-serif" font-size="42" letter-spacing="1">${escapeXml(contributionCount)}</text>
  <text x="91" y="211" fill="#C7CBD0" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="14" letter-spacing="1.25">CONTRIBUTIONS · 12 MONTHS</text>
  <text x="479" y="181" fill="#F2EEE5" font-family="Impact, Haettenschweiler, sans-serif" font-size="42" letter-spacing="1">${escapeXml(paddedProjects)}</text>
  <text x="479" y="211" fill="#C7CBD0" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="14" letter-spacing="1.25">PUBLIC PROJECTS</text>
  <text x="820" y="91" fill="#D64034" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="13" letter-spacing="1.4">LAST WORKED ON</text>
  <text x="820" y="151" fill="#F2EEE5" font-family="Impact, Haettenschweiler, sans-serif" font-size="48" letter-spacing="1.5">${escapeXml(latestName.toUpperCase())}</text>
  <text x="820" y="184" fill="#C7CBD0" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="14" letter-spacing="1.2">${escapeXml(latestDate)} · PUBLIC REPOSITORY</text>
  <path d="M820 217H1171" stroke="#D64034" stroke-width="3"/>
  <path d="M1195 208L1224 223L1195 238" stroke="#F2EEE5" stroke-width="2"/>
</svg>
`;

await writeFile('assets/profile-status.svg', svg);
