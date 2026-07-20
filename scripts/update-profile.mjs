import { readFile, writeFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const profileRepository = process.env.GITHUB_REPOSITORY;
const profileOwner = process.env.PROFILE_OWNER;

if (!token || !profileRepository || !profileOwner) {
  throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY, and PROFILE_OWNER are required.');
}

const query = `
  query ProfileData($login: String!, $from: DateTime!, $to: DateTime!) {
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
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
        }
      }
    }
  }
`;

const to = new Date();
const from = new Date(to);
from.setUTCFullYear(from.getUTCFullYear() - 1);

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'profile-readme-updater',
  },
  body: JSON.stringify({
    query,
    variables: {
      login: profileOwner,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  }),
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
const status = `<!-- status:start -->
\`\`\`text
john@github:~$ status

+-- public contributions / last 12 months : ${contributionCount}
+-- public projects                       : ${paddedProjects}
\`-- last worked on                       : ${latestName} (${latestDate})
\`\`\`
<!-- status:end -->`;

const readme = await readFile('README.md', 'utf8');
const startMarker = '<!-- status:start -->';
const endMarker = '<!-- status:end -->';
const start = readme.indexOf(startMarker);
const end = readme.indexOf(endMarker);

if (start === -1 || end === -1 || end < start) {
  throw new Error('README status markers are missing or invalid.');
}

const updatedReadme = `${readme.slice(0, start)}${status}${readme.slice(end + endMarker.length)}`;
if (updatedReadme !== readme) {
  await writeFile('README.md', updatedReadme);
}
