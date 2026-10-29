import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isMain, projectRoot } from './development-environment.mjs';
import { runPrivateCommand } from './private-command.mjs';

export function containsRecognizableCredential(contents) {
  return (
    /\bvck_[A-Za-z0-9_-]{40,}\b/.test(contents) ||
    /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/.test(contents) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents)
  );
}

export function sourceFileContainsCredential(path) {
  try {
    if (!lstatSync(path).isFile()) return false;
    return containsRecognizableCredential(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new Error('Public-content check could not read a source file.');
  }
}

if (isMain(import.meta.url)) {
  try {
    const paths = new Set(
      runPrivateCommand('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: projectRoot })
        .split('\0')
        .filter(Boolean)
    );
    let found = false;
    for (const path of paths) {
      if (sourceFileContainsCredential(resolve(projectRoot, path))) {
        found = true;
        console.error(`Recognizable credential in ${JSON.stringify(path)}. Value suppressed.`);
      }
    }
    if (found) process.exitCode = 1;
    else console.log('No recognizable Gateway/OpenAI keys or private-key headers found in non-ignored source files.');
  } catch {
    console.error('Public-content credential check failed; file contents were suppressed.');
    process.exitCode = 1;
  }
}
