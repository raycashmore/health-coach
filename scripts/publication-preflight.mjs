import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Read-only: refresh refs separately before using this report to publish.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const branch = git('branch', '--show-current');
const base = process.argv[2] ?? 'origin/main';
const config = JSON.parse(readFileSync(new URL('../apps/web/vercel.json', import.meta.url), 'utf8'));
const deployment = config.git?.deploymentEnabled;
const branchDeployment = typeof deployment === 'boolean' ? deployment : deployment?.[branch];
const outstanding = git('for-each-ref', '--format=%(refname:short)', 'refs/heads')
  .split('\n')
  .filter(Boolean)
  .filter((name) => {
    const tip = git('rev-parse', name);
    return !git('rev-list', base, 'HEAD').split('\n').includes(tip);
  });
console.log(
  JSON.stringify(
    {
      branch,
      base,
      workingTree: git('status', '--short'),
      commits: git('log', '--oneline', `${base}..HEAD`),
      branchesOutsideBaseAndHead: outstanding,
      vercelBranchDeployment:
        branchDeployment === false
          ? 'disabled by repository config'
          : 'not disabled; inspect linked project before pushing',
      workflows: git('ls-files', '.github/workflows'),
      openPullRequests: JSON.parse(
        execFileSync('gh', ['pr', 'list', '--state', 'open', '--json', 'number,url,headRefName'], { encoding: 'utf8' })
      )
    },
    null,
    2
  )
);
