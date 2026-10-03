import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { prisma } from './db';
import { recordSubmissionScore } from './services/scoringService';
import { LANGUAGE_REGISTRY, normalizeLanguage, type JudgeLanguage } from './judgeLanguages';

export { normalizeLanguage } from './judgeLanguages';

const MAX_OUTPUT_BYTES = 256 * 1024;

export class InfraError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'InfraError';
  }
}

type PreparedCommand =
  | { command: string; args: string[]; compilationTime: number | null }
  | { compilationError: string; compilationTime: number; compilationTimedOut?: boolean };

type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timeout: boolean;
  outputLimit: boolean;
  durationMs: number;
  spawnFailed: boolean;
};

function getSandboxConfig() {
  const sandboxImage = process.env.JUDGE_DOCKER_IMAGE?.trim() || '';
  const requireSandbox = process.env.NODE_ENV === 'production' || process.env.JUDGE_REQUIRE_SANDBOX === 'true';
  return { sandboxImage: sandboxImage || undefined, requireSandbox };
}

function assertSandboxReady() {
  const { sandboxImage, requireSandbox } = getSandboxConfig();
  if (requireSandbox && !sandboxImage) {
    throw new InfraError('Judge sandbox is required but JUDGE_DOCKER_IMAGE is not configured');
  }
  return { sandboxImage, requireSandbox };
}

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

  assertSandboxReady();

  const language = normalizeLanguage(submission.language);
  if (!language) {
    return finish(id, { status: 'COMPILE_ERROR', compilationTime: null, totalCases: submission.problem.testCases.length, error: 'Unsupported language' });
  }
  if (submission.problem.testCases.length === 0) {
    return finish(id, { status: 'JUDGE_FAILED', compilationTime: null, totalCases: 0, error: 'Problem has no test cases' });
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

    const totalCases = submission.problem.testCases.length;
    let passedCases = 0;
    let executionTime = 0;
    let maxTestCaseExecutionTime = 0;
    let hadTimeLimit = false;
    let hadOutputLimit = false;
    let hadRuntimeError = false;
    let hadWrongAnswer = false;
    let runtimeError = 'Process exited with an error';

    for (const testCase of submission.problem.testCases) {
      const result = await runProcess(prepared.command, prepared.args, workspace, testCase.input, submission.problem.timeLimit, submission.problem.memoryLimit);
      if (result.spawnFailed) throw new InfraError(`Failed to start the configured ${language} runtime`, new Error(result.stderr));
      executionTime += result.durationMs;
      maxTestCaseExecutionTime = Math.max(maxTestCaseExecutionTime, result.durationMs);

      if (result.timeout) {
        hadTimeLimit = true;
        continue;
      }
      if (result.outputLimit) {
        hadOutputLimit = true;
        continue;
      }
      if (result.exitCode !== 0) {
        hadRuntimeError = true;
        runtimeError = result.stderr || runtimeError;
        continue;
      }
      if (normalizeOutput(result.stdout) !== normalizeOutput(testCase.output)) {
        hadWrongAnswer = true;
        continue;
      }
      passedCases += 1;
    }

    if (passedCases === totalCases) {
      return finish(id, { status: 'ACCEPTED', compilationTime: prepared.compilationTime, executionTime, maxTestCaseExecutionTime, passedCases, totalCases });
    }
    // Fatal participant errors (TLE/OLE/RTE) keep their verdicts and earn no partial points.
    // Wrong answers on individual cases still finish the remaining cases and can score PARTIAL.
    if (hadTimeLimit) {
      return finish(id, { status: 'TIME_LIMIT_EXCEEDED', compilationTime: prepared.compilationTime, executionTime, maxTestCaseExecutionTime, passedCases, totalCases, error: 'Time limit exceeded' });
    }
    if (hadOutputLimit) {
      return finish(id, { status: 'OUTPUT_LIMIT_EXCEEDED', compilationTime: prepared.compilationTime, executionTime, maxTestCaseExecutionTime, passedCases, totalCases, error: 'Output limit exceeded' });
    }
    if (hadRuntimeError) {
      return finish(id, { status: 'RUNTIME_ERROR', compilationTime: prepared.compilationTime, executionTime, maxTestCaseExecutionTime, passedCases, totalCases, error: runtimeError });
    }
    if (hadWrongAnswer && passedCases > 0) {
      return finish(id, { status: 'PARTIAL', compilationTime: prepared.compilationTime, executionTime, maxTestCaseExecutionTime, passedCases, totalCases, error: 'Output did not match expected result' });
    }
    return finish(id, { status: 'WRONG_ANSWER', compilationTime: prepared.compilationTime, executionTime, maxTestCaseExecutionTime, passedCases, totalCases, error: 'Output did not match expected result' });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function prepareCommand(language: JudgeLanguage, sourceCode: string, workspace: string, memoryLimitMb: number): Promise<PreparedCommand> {
  const definition = LANGUAGE_REGISTRY[language];
  const { sandboxImage } = getSandboxConfig();
  try {
    await writeFile(path.join(workspace, definition.sourceFile), sourceCode);
  } catch (error) {
    throw new InfraError('Failed to write source code into the judge workspace', error);
  }

  if (!definition.compile || definition.compilationTimeoutMs == null) {
    return { ...definition.run(workspace, memoryLimitMb, Boolean(sandboxImage)), compilationTime: null };
  }

  const compileStarted = Date.now();
  const compiled = await runProcess(definition.compile.command, definition.compile.args, workspace, '', definition.compilationTimeoutMs, memoryLimitMb);
  const compilationTime = Date.now() - compileStarted;
  if (compiled.spawnFailed) throw new InfraError('Failed to start the configured compiler');
  if (compiled.exitCode !== 0 || compiled.timeout) {
    return {
      compilationError: compiled.timeout ? 'Compilation time limit exceeded' : compiled.stderr || compiled.stdout || 'Compilation failed',
      compilationTime,
      compilationTimedOut: compiled.timeout,
    };
  }
  return { ...definition.run(workspace, memoryLimitMb, Boolean(sandboxImage)), compilationTime };
}

function runProcess(command: string, args: string[], cwd: string, input: string, timeoutMs: number, memoryLimitMb = 128): Promise<ProcessResult> {
  const { sandboxImage, requireSandbox } = assertSandboxReady();

  return new Promise((resolve, reject) => {
    const processArgs = sandboxImage
      ? [
          'run', '--rm',
          '--network', 'none',
          '--read-only',
          '--tmpfs', '/tmp:rw,nosuid,size=128m',
          '--mount', `type=bind,src=${cwd},dst=/workspace`,
          '--workdir', '/workspace',
          '--memory', `${Math.max(32, memoryLimitMb)}m`,
          '--memory-swap', `${Math.max(32, memoryLimitMb)}m`,
          '--cpus', '1',
          '--pids-limit', '256',
          '--ulimit', 'nofile=64:64',
          '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges',
          sandboxImage, command, ...args,
        ]
      : args;

    let started = Date.now();
    const child = spawn(sandboxImage ? 'docker' : command, processArgs, {
      cwd: sandboxImage ? undefined : cwd,
      shell: false,
      windowsHide: true,
      env: sandboxImage ? { PATH: process.env.PATH || '' } : { ...process.env },
    });

    child.on('spawn', () => {
      started = Date.now();
    });

    let stdout = ''; let stderr = ''; let outputLimit = false; let settled = false; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      if (stdout.length + stderr.length + chunk.length > MAX_OUTPUT_BYTES) { outputLimit = true; child.kill('SIGKILL'); return; }
      if (target === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    const resolveOnce = (result: ProcessResult) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const duration = () => Date.now() - started;
    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
    child.on('error', (error) => {
      if (sandboxImage || requireSandbox) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new InfraError('Failed to start the judge sandbox', error));
        return;
      }
      resolveOnce({ exitCode: -1, stdout, stderr: error.message, timeout: timedOut, outputLimit, durationMs: duration(), spawnFailed: true });
    });
    child.on('close', (exitCode) => {
      if (sandboxImage && exitCode === 125) {
        settled = true;
        clearTimeout(timer);
        reject(new InfraError(stderr || 'Docker reported a sandbox infrastructure failure'));
        return;
      }
      if (sandboxImage && /cannot connect to the Docker daemon|error response from daemon|pull access denied|manifest unknown|invalid mount config/i.test(stderr)) {
        settled = true;
        clearTimeout(timer);
        reject(new InfraError(stderr));
        return;
      }
      resolveOnce({ exitCode, stdout, stderr, timeout: timedOut, outputLimit, durationMs: duration(), spawnFailed: false });
    });
    child.stdin.end(input);
  });
}

export function normalizeOutput(value: string) { return value.replace(/\r\n/g, '\n').trim().split('\n').map((line) => line.trimEnd()).join('\n'); }

async function finish(id: string, data: {
  status: string;
  compilationTime?: number | null;
  executionTime?: number;
  maxTestCaseExecutionTime?: number | null;
  passedCases?: number;
  totalCases: number;
  error?: string;
}) {
  const submission = await prisma.submission.update({
    where: { id },
    data: {
      status: data.status,
      compilationTime: data.compilationTime,
      executionTime: data.executionTime,
      maxTestCaseExecutionTime: data.maxTestCaseExecutionTime,
      passedCases: data.passedCases ?? 0,
      totalCases: data.totalCases,
    },
  });
  await recordSubmissionScore(id);
  return { ...submission, error: data.error };
}
