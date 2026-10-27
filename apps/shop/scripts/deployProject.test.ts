import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { deployProject } from './deployProject.mjs';

// Plan 1.19: the deploy workflows take the Firebase project as an input instead of naming the test shop, and only
// ever deploy to the shop profile's own project.
const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const profileProject = read('public/shop-profile.js').match(/"projectId": "([^"]+)"/)![1];
const WORKFLOWS = ['.github/workflows/deploy-firebase.yml', '.github/workflows/deploy-pages.yml'];
const profile = (projectId: string) => ({ firebase: { projectId } });

describe('deployProject', () => {
  it("defaults to the profile's project", () => {
    expect(deployProject('', profile('press-one'))).toBe('press-one');
    expect(deployProject(undefined, profile('press-one'))).toBe('press-one');
    expect(deployProject('  ', profile('press-one'))).toBe('press-one');
    expect(deployProject('')).toBe(profileProject);
  });

  it("accepts the profile's own project when asked for it", () => {
    expect(deployProject(' press-one ', profile('press-one'))).toBe('press-one');
  });

  it('refuses another project, so one shop never deploys into another', () => {
    expect(() => deployProject('press-two', profile('press-one'))).toThrow(/profile is for press-one. Nothing was deployed/);
  });

  it('refuses malformed ids, including ones that would break out of a shell word', () => {
    for (const bad of ['Press-One', 'p', 'press_one', 'press-one;rm -rf /', '$(id)', 'press-one\nFOO=1', '-press', 'press-']) {
      expect(() => deployProject(bad, profile('press-one'))).toThrow(/isn't a Firebase project id/);
    }
  });

  it('refuses a profile with no valid project', () => {
    expect(() => deployProject('', profile(''))).toThrow(/names no valid Firebase project/);
    expect(() => deployProject('', {})).toThrow(/names no valid Firebase project/);
    expect(() => deployProject('', profile('Bad Id'))).toThrow(/names no valid Firebase project/);
  });

  it('prints the project from the command line, or exits 1 with the reason', () => {
    const script = join(root, 'scripts/deployProject.mjs');
    expect(execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })).toBe(profileProject);
    const wrong = spawnSync(process.execPath, [script, 'press-two'], { cwd: root, encoding: 'utf8' });
    expect(wrong.status).toBe(1);
    expect(wrong.stdout).toBe('');
    expect(wrong.stderr).toContain('Nothing was deployed');
  });
});

/** The `run: |` body of the step named `name` in a workflow file. */
function stepScript(workflow: string, name: string) {
  const lines = workflow.split('\n');
  const at = lines.findIndex(line => line.trim() === `- name: ${name}`);
  expect(at, `step "${name}"`).toBeGreaterThan(-1);
  const runAt = lines.findIndex((line, i) => i > at && line.trim() === 'run: |');
  const indent = lines[runAt + 1].match(/^ */)![0].length;
  const body: string[] = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() && line.match(/^ */)![0].length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}

describe('the deploy workflows take the project as an input', () => {
  const temp = mkdtempSync(join(tmpdir(), 'deploy-project-'));
  afterAll(() => rmSync(temp, { recursive: true, force: true }));

  for (const file of WORKFLOWS) {
    const workflow = read(file);

    it(`${file} names no project of its own`, () => {
      expect(workflow).not.toContain(profileProject);
      expect(workflow).not.toMatch(/FIREBASE_PROJECT: \S/);
      expect(workflow).not.toMatch(/--project (?!"\$FIREBASE_PROJECT"|demo-)/);
      expect(workflow).not.toMatch(/functions\/\.env\.(?!\$FIREBASE_PROJECT")/);
    });

    it(`${file} has a project input, passed to the shell through env`, () => {
      expect(workflow).toMatch(/workflow_dispatch:\n {4}inputs:\n(?: {6}.*\n)*? {6}project:\n {8}description:/);
      expect(workflow).toContain('PROJECT_INPUT: ${{ inputs.project || vars.FIREBASE_PROJECT_ID }}');
      expect(stepScript(workflow, 'Firebase project')).not.toContain('${{');
    });

    it(`${file} picks the project before anything uses it`, () => {
      const chosen = workflow.indexOf('- name: Firebase project');
      for (const use of ['"$FIREBASE_PROJECT"', '.env.$FIREBASE_PROJECT']) {
        const first = workflow.indexOf(use);
        if (first !== -1) expect(first).toBeGreaterThan(chosen);
      }
      expect(workflow).toContain('--project "$FIREBASE_PROJECT"');
    });

    // Workflow dry run: the step's own script, run as the runner would, with each kind of input.
    const dryRun = (input: string) => {
      const env = join(temp, `env-${Math.random().toString(36).slice(2)}`);
      writeFileSync(env, '');
      const result = spawnSync('bash', ['-c', stepScript(workflow, 'Firebase project')], {
        cwd: root,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, PROJECT_INPUT: input, GITHUB_ENV: env },
      });
      return { status: result.status, stderr: result.stderr, githubEnv: readFileSync(env, 'utf8') };
    };

    it(`${file} dry run: no input deploys to the profile's project`, () => {
      const run = dryRun('');
      expect(run.status).toBe(0);
      expect(run.githubEnv).toBe(`FIREBASE_PROJECT=${profileProject}\n`);
    });

    it(`${file} dry run: the profile's project as input is accepted`, () => {
      expect(dryRun(profileProject).githubEnv).toBe(`FIREBASE_PROJECT=${profileProject}\n`);
    });

    it(`${file} dry run: another or malformed project stops the run and sets nothing`, () => {
      for (const input of ['press-two', '$(touch pwned)', 'x\nFIREBASE_PROJECT=press-two']) {
        const run = dryRun(input);
        expect(run.status).toBe(1);
        expect(run.githubEnv).toBe('');
      }
    });
  }
});
