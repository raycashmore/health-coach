import { execFileSync } from 'node:child_process';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const output = execFileSync(pnpmCommand, ['exec', 'turbo', 'run', 'dev', 'inngest:dev', '--dry-run=json'], {
  encoding: 'utf8'
});
const dryRun = JSON.parse(output);

if (!Array.isArray(dryRun.tasks)) {
  throw new Error('Turbo did not return a task graph for local development.');
}

const commandsByTask = new Map(
  dryRun.tasks.map((task) => {
    if (typeof task.taskId !== 'string' || typeof task.command !== 'string') {
      throw new Error('Turbo returned an invalid local-development task.');
    }

    return [task.taskId, task.command];
  })
);
const expectedCommands = new Map([
  ['@health-coach/mobile#dev', 'expo start'],
  ['@health-coach/web#dev', 'INNGEST_DEV=1 next dev'],
  ['@health-coach/web#inngest:dev', 'inngest dev --no-discovery -u http://localhost:3000/api/inngest']
]);

for (const [taskId, command] of expectedCommands) {
  if (commandsByTask.get(taskId) !== command) {
    throw new Error(`Expected ${taskId} to run \`${command}\` from pnpm dev.`);
  }
}

console.log('Local development starts the web app, Android app, and Inngest Dev Server.');
