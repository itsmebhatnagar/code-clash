import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { prisma } from './db';
import { recordSubmissionScore } from './services/scoringService';

const MAX_OUTPUT_BYTES = 256 * 1024;
const sandboxImage = process.env.JUDGE_DOCKER_IMAGE;
const isProduction = process.env.NODE_ENV === 'production';
const requireSandbox = isProduction || process.env.JUDGE_REQUIRE_SANDBOX === 'true';

export class InfraError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'InfraError';
  }
}

type Language = 'c' | 'cpp' | 'java' | 'python' | 'javascript';
type PreparedCommand =
  | { command: string; args: string[]; compilationTime: number | null }
  | { compilationError: string; compilationTime: number; compilationTimedOut?: boolean };

export async function judgeSubmission(id: string) {
  let submission;
  try {
    submission = await prisma.submission.findUnique({
      where: { id },
      include: { problem: { include: { testCases: true } } },
    });
  } catch (err) {
    throw new InfraError(`DB lookup failed for submission ${id}`, err);
  }

  if (!submission) throw new InfraError(`Submission ${id} not found – may not have been persisted yet`);

  const language = normalizeLanguage(submission.language);
  if (!language) {
    return finish(id, { status: 'COMPILE_ERROR', compilationTime: null, totalCases: submission.problem.testCases.length, error: 'Unsupported language' });
  }
  if (submission.problem.testCases.length === 0) {
    return finish(id, { status: 'COMPILE_ERROR', compilationTime: null, totalCases: 0, error: 'Problem has no test cases' });
  }

  if (requireSandbox && !sandboxImage) {
    console.warn('Sandbox is not configured (JUDGE_DOCKER_IMAGE is unset). Running insecurely natively.');
  }

  let workspace: string;
  try {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'code-clash-'));
  } catch (err) {
    throw new InfraError('Failed to create workspace directory', err);
  }

  try {
    const prepared = await prepareCommand(language, submission.sourceCode, workspace, submission.problem.memoryLimit);
    if ('compilationError' in prepared) {
      return finish(id, {
        status: prepared.compilationTimedOut ? 'COMPILATION_TIME_LIMIT_EXCEEDED' : 'COMPILE_ERROR',
        compilationTime: prepared.compilationTime,
        totalCases: submission.problem.testCases.length,
        error: prepared.compilationError,
      });
    }

    const started = Date.now();
    let passedCases = 0;
    for (const testCase of submission.problem.testCases) {
      const result = await runProcess(prepared.command, prepared.args, workspace, testCase.input, submission.problem.timeLimit, submission.problem.memoryLimit);
      if (result.timeout) {
        return finish(id, { status: passedCases ? 'PARTIAL' : 'TIME_LIMIT_EXCEEDED', compilationTime: prepared.compilationTime, executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: 'Time limit exceeded' });
      }
      if (result.outputLimit) {
        return finish(id, { status: passedCases ? 'PARTIAL' : 'OUTPUT_LIMIT_EXCEEDED', compilationTime: prepared.compilationTime, executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: 'Output limit exceeded' });
      }
      if (result.exitCode !== 0) {
        return finish(id, { status: passedCases ? 'PARTIAL' : 'RUNTIME_ERROR', compilationTime: prepared.compilationTime, executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: result.stderr || 'Process exited with an error' });
      }
      if (normalizeOutput(result.stdout) !== normalizeOutput(testCase.output)) {
        return finish(id, { status: passedCases ? 'PARTIAL' : 'WRONG_ANSWER', compilationTime: prepared.compilationTime, executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: 'Output did not match expected result' });
      }
      passedCases += 1;
    }
    return finish(id, { status: passedCases === submission.problem.testCases.length ? 'ACCEPTED' : 'WRONG_ANSWER', compilationTime: prepared.compilationTime, executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export function normalizeLanguage(language: string): Language | null {
  const value = language.toLowerCase();
  if (value === 'javascript' || value === 'js' || value === 'node') return 'javascript';
  if (value === 'python' || value === 'python3') return 'python';
  if (value === 'c') return 'c';
  if (value === 'cpp' || value === 'c++') return 'cpp';
  if (value === 'java') return 'java';
  return null;
}

async function prepareCommand(language: Language, sourceCode: string, workspace: string, memoryLimitMb: number): Promise<PreparedCommand> {
  if (language === 'javascript') {
    await writeFile(path.join(workspace, 'Main.js'), sourceCode);
    return { command: sandboxImage ? 'node' : process.execPath, args: [`--max-old-space-size=${Math.max(16, memoryLimitMb)}`, 'Main.js'], compilationTime: null };
  }
  if (language === 'python') {
    await writeFile(path.join(workspace, 'main.py'), sourceCode);
    return { command: sandboxImage ? 'python3' : (process.platform === 'win32' ? 'python' : 'python3'), args: ['-u', 'main.py'], compilationTime: null };
  }
  if (language === 'c' || language === 'cpp') {
    const isCpp = language === 'cpp';
    await writeFile(path.join(workspace, isCpp ? 'main.cpp' : 'main.c'), sourceCode);
    const compileStarted = Date.now();
    const compiled = await runProcess(isCpp ? 'g++' : 'gcc', [isCpp ? '-std=c++17' : '-std=c17', '-O2', isCpp ? 'main.cpp' : 'main.c', '-o', 'main'], workspace, '', 10_000, memoryLimitMb);
    const compilationTime = Date.now() - compileStarted;
    if (compiled.exitCode !== 0 || compiled.timeout) return {
      compilationError: compiled.timeout ? 'Compilation time limit exceeded' : compiled.stderr || compiled.stdout || 'Compilation failed',
      compilationTime,
      compilationTimedOut: compiled.timeout,
    };
    return { command: sandboxImage ? '/workspace/main' : path.join(workspace, process.platform === 'win32' ? 'main.exe' : 'main'), args: [], compilationTime };
  }
  await writeFile(path.join(workspace, 'Main.java'), sourceCode);
  const compileStarted = Date.now();
  const compiled = await runProcess(sandboxImage ? 'javac' : 'javac', ['Main.java'], workspace, '', 10_000, memoryLimitMb);
  const compilationTime = Date.now() - compileStarted;
  if (compiled.exitCode !== 0 || compiled.timeout) return {
    compilationError: compiled.timeout ? 'Compilation time limit exceeded' : compiled.stderr || compiled.stdout || 'Compilation failed',
    compilationTime,
    compilationTimedOut: compiled.timeout,
  };
  return { command: 'java', args: ['-Xmx' + Math.max(16, memoryLimitMb) + 'm', 'Main'], compilationTime };
}

function runProcess(command: string, args: string[], cwd: string, input: string, timeoutMs: number, memoryLimitMb = 128): Promise<{ exitCode: number | null; stdout: string; stderr: string; timeout: boolean; outputLimit: boolean }> {
  // Warning: Running without sandbox in production is insecure
  if (requireSandbox && !sandboxImage) {
      console.warn('Running code without sandbox because JUDGE_DOCKER_IMAGE is unset.');
  }

  return new Promise((resolve) => {
    const processArgs = sandboxImage
      ? [
          'run', '--rm',
          '--network', 'none',
          '--read-only',
          '--tmpfs', '/tmp:rw,nosuid,size=64m',
          '--mount', `type=bind,src=${cwd},dst=/workspace`,
          '--workdir', '/workspace',
          '--memory', `${Math.max(16, memoryLimitMb)}m`,
          '--cpus', '1',
          '--pids-limit', '64',
          '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges',
          sandboxImage, command, ...args,
        ]
      : args;
      
    const child = spawn(sandboxImage ? 'docker' : command, processArgs, { 
        cwd: sandboxImage ? undefined : cwd, 
        shell: false, 
        windowsHide: true, 
        env: sandboxImage ? { PATH: process.env.PATH || '' } : { ...process.env } 
    });

    let stdout = ''; let stderr = ''; let outputLimit = false; let settled = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolveOnce({ exitCode: null, stdout, stderr, timeout: true, outputLimit }); }, timeoutMs);
    const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      if (stdout.length + stderr.length + chunk.length > MAX_OUTPUT_BYTES) { outputLimit = true; child.kill('SIGKILL'); return; }
      if (target === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    const resolveOnce = (result: { exitCode: number | null; stdout: string; stderr: string; timeout: boolean; outputLimit: boolean }) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
    child.on('error', (error) => resolveOnce({ exitCode: -1, stdout, stderr: error.message, timeout: false, outputLimit }));
    child.on('close', (exitCode) => resolveOnce({ exitCode, stdout, stderr, timeout: false, outputLimit }));
    child.stdin.end(input);
  });
}

export function normalizeOutput(value: string) { return value.replace(/\r\n/g, '\n').trim().split('\n').map((line) => line.trimEnd()).join('\n'); }

async function finish(id: string, data: { status: string; compilationTime?: number | null; executionTime?: number; passedCases?: number; totalCases: number; error?: string }) {
  const submission = await prisma.submission.update({ 
      where: { id }, 
  data: { status: data.status, compilationTime: data.compilationTime, executionTime: data.executionTime, passedCases: data.passedCases ?? 0, totalCases: data.totalCases }
  });
  await recordSubmissionScore(id);
  return { ...submission, error: data.error };
}