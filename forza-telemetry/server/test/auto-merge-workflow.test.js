import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../');
const workflowPath = path.join(repoRoot, '.github/workflows/auto-merge-jules.yml');

test('auto-merge-jules workflow contains repository and author checks', async () => {
  const content = await fs.readFile(workflowPath, 'utf8');

  // Verify mandatory security checks exist in workflow definition
  assert.match(content, /github\.event\.pull_request\.head\.repo\.full_name/);
  assert.match(content, /github\.repository_owner/);
  assert.match(content, /github\.event\.pull_request\.user\.login/);

  // Ensure no checkout of untrusted PR head branch code
  assert.ok(!content.includes('ref: ${{ github.event.pull_request.head.ref }}'));
  assert.ok(!content.includes('ref: ${{ github.event.pull_request.head.sha }}'));
});

async function getIdentifyStepScript() {
  const content = await fs.readFile(workflowPath, 'utf8');

  // Find the Identify Jules PR section and extract the multiline run script
  const identifyMatch = content.match(/name:\s*Identify Jules PR[\s\S]*?run:\s*\|([\s\S]*?)(?=\n\s*-\s*name:|\n\s*jobs:|$)/);
  assert.ok(identifyMatch, 'Could not locate Identify Jules PR run block in workflow');

  let script = identifyMatch[1];
  // Replace GITHUB_OUTPUT redirection so the script outputs result directly to stdout
  script = script.replaceAll('>> "$GITHUB_OUTPUT"', '');
  return script;
}

async function evaluateIdentifyStep(envVars) {
  const script = await getIdentifyStepScript();

  const tempOutputFile = path.join(__dirname, `temp_output_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
  try {
    const output = execFileSync('bash', ['-c', script], {
      env: { ...process.env, GITHUB_OUTPUT: tempOutputFile, ...envVars },
      encoding: 'utf8'
    }).trim();

    if (output) return output;

    // Fallback: read GITHUB_OUTPUT file if created
    const fileContent = await fs.readFile(tempOutputFile, 'utf8').catch(() => '');
    const match = fileContent.match(/is_jules=(true|false)/);
    return match ? `is_jules=${match[1]}` : fileContent.trim();
  } finally {
    await fs.rm(tempOutputFile, { force: true });
  }
}

test('auto-merge-jules identification rejects fork PRs even with spoofed body/branch', async () => {
  const result = await evaluateIdentifyStep({
    PR_USER: 'attacker',
    REPO_OWNER: 'owner',
    HEAD_REPO: 'attacker/repo',
    TARGET_REPO: 'owner/repo',
    BODY: 'PR created automatically by Jules',
    BRANCH: '123456789012345'
  });
  assert.strictEqual(result, 'is_jules=false');
});

test('auto-merge-jules identification rejects untrusted author PRs from same repo', async () => {
  const result = await evaluateIdentifyStep({
    PR_USER: 'untrusted_contributor',
    REPO_OWNER: 'owner',
    HEAD_REPO: 'owner/repo',
    TARGET_REPO: 'owner/repo',
    BODY: 'PR created automatically by Jules',
    BRANCH: '123456789012345'
  });
  assert.strictEqual(result, 'is_jules=false');
});

test('auto-merge-jules identification accepts legitimate Jules PRs', async () => {
  const result1 = await evaluateIdentifyStep({
    PR_USER: 'google-labs-jules[bot]',
    REPO_OWNER: 'owner',
    HEAD_REPO: 'owner/repo',
    TARGET_REPO: 'owner/repo',
    BODY: 'PR created automatically by Jules',
    BRANCH: 'jules-fix'
  });
  assert.strictEqual(result1, 'is_jules=true');

  const result2 = await evaluateIdentifyStep({
    PR_USER: 'owner',
    REPO_OWNER: 'owner',
    HEAD_REPO: 'owner/repo',
    TARGET_REPO: 'owner/repo',
    BODY: 'Regular PR',
    BRANCH: '123456789012345'
  });
  assert.strictEqual(result2, 'is_jules=true');
});

test('auto-merge-jules identification rejects PRs without matching Jules pattern', async () => {
  const result = await evaluateIdentifyStep({
    PR_USER: 'owner',
    REPO_OWNER: 'owner',
    HEAD_REPO: 'owner/repo',
    TARGET_REPO: 'owner/repo',
    BODY: 'Manual PR body',
    BRANCH: 'feature-branch'
  });
  assert.strictEqual(result, 'is_jules=false');
});
