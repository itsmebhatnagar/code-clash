import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { prisma } from './db';

const MAX_OUTPUT_BYTES = 256 * 1024;
const sandboxImage = process.env.JUDGE_DOCKER_IMAGE;
const isProduction = process.env.NODE_ENV === 'production';
const requireSandbox = isProduction || process.env.JUDGE_REQUIRE_SANDBOX === 'true';

type Language = 'javascript' | 'python' | 'cpp' | 'java';

export async function judgeSubmission(id: string) {
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { problem: { include: { testCases: true } } }
  });
  if (!submission) throw new Error('Submission not found');

  const language = normalizeLanguage(submission.language);
  if (!language) {
    return finish(id, { status: 'COMPILE_ERROR', totalCases: submission.problem.testCases.length, error: 'Unsupported language' });
  }
  if (submission.problem.testCases.length === 0) {
    return finish(id, { status: 'COMPILE_ERROR', totalCases: 0, error: 'Problem has no test cases' });
  }
  
  if (requireSandbox && !sandboxImage) {
    throw new Error('Sandbox is not configured');
  }

  const workspace = await mkdtemp(path.join(os.tmpdir(), 'code-clash-'));
  try {
    const command = await prepareCommand(language, submission.sourceCode, workspace, submission.problem.memoryLimit);
    if (!command) {
      return finish(id, { status: 'COMPILE_ERROR', totalCases: submission.problem.testCases.length, error: 'Compiler or runtime is not installed' });
    }

    const started = Date.now();
    let passedCases = 0;
    for (const testCase of submission.problem.testCases) {
      const result = await runProcess(command.command, command.args, workspace, testCase.input, submission.problem.timeLimit, submission.problem.memoryLimit);
      if (result.timeout) {
        return finish(id, { status: 'TIME_LIMIT_EXCEEDED', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: 'Time limit exceeded' });
      }
      if (result.outputLimit) {
        return finish(id, { status: 'OUTPUT_LIMIT_EXCEEDED', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: 'Output limit exceeded' });
      }
      if (result.exitCode !== 0) {
        return finish(id, { status: 'RUNTIME_ERROR', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: result.stderr || 'Process exited with an error' });
      }
      if (normalizeOutput(result.stdout) !== normalizeOutput(testCase.output)) {
        return finish(id, { status: 'WRONG_ANSWER', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: 'Output did not match expected result' });
      }
      passedCases += 1;
    }
    return finish(id, { status: passedCases === submission.problem.testCases.length ? 'ACCEPTED' : 'WRONG_ANSWER', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length });
  } catch (error) {
    throw error;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export function normalizeLanguage(language: string): Language | null {
  const value = language.toLowerCase();
  if (value === 'javascript' || value === 'js' || value === 'node') return 'javascript';
  if (value === 'python' || value === 'python3') return 'python';
  if (value === 'cpp' || value === 'c++') return 'cpp';
  if (value === 'java') return 'java';
  return null;
}

async function prepareCommand(language: Language, sourceCode: string, workspace: string, memoryLimitMb: number) {
  if (language === 'javascript') {
    await writeFile(path.join(workspace, 'Main.js'), sourceCode);
    return { command: sandboxImage ? 'node' : process.execPath, args: [`--max-old-space-size=${Math.max(16, memoryLimitMb)}`, 'Main.js'] };
  }
  if (language === 'python') {
    await writeFile(path.join(workspace, 'main.py'), sourceCode);
    return { command: sandboxImage ? 'python3' : (process.platform === 'win32' ? 'python' : 'python3'), args: ['-u', 'main.py'] };
  }
  if (language === 'cpp') {
    await writeFile(path.join(workspace, 'main.cpp'), sourceCode);
    const compiled = await runProcess(sandboxImage ? 'g++' : 'g++', ['-std=c++17', '-O2', 'main.cpp', '-o', 'main'], workspace, '', 10_000, memoryLimitMb);
    if (compiled.exitCode !== 0 || compiled.timeout) return null;
    return { command: sandboxImage ? '/workspace/main' : path.join(workspace, process.platform === 'win32' ? 'main.exe' : 'main'), args: [] };
  }
  await writeFile(path.join(workspace, 'Main.java'), sourceCode);
  const compiled = await runProcess(sandboxImage ? 'javac' : 'javac', ['Main.java'], workspace, '', 10_000, memoryLimitMb);
  if (compiled.exitCode !== 0 || compiled.timeout) return null;
  return { command: sandboxImage ? 'java' : 'java', args: ['-Xmx' + Math.max(16, memoryLimitMb) + 'm', 'Main'] };
}

function runProcess(command: string, args: string[], cwd: string, input: string, timeoutMs: number, memoryLimitMb = 128): Promise<{ exitCode: number | null; stdout: string; stderr: string; timeout: boolean; outputLimit: boolean }> {
  // Never fall back to host execution in production!
  if (requireSandbox && !sandboxImage) {
      throw new Error('Sandbox is strictly required, execution blocked.');
  }

  return new Promise((resolve) => {
    const processArgs = sandboxImage
      ? ['run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,nosuid,size=64m', '--mount', `type=bind,src=${cwd},dst=/workspace`, '--workdir', '/workspace', '--memory', `${Math.max(16, memoryLimitMb)}m`, '--cpus', '1', '--pids-limit', '64', sandboxImage, command, ...args]
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

async function finish(id: string, data: { status: string; executionTime?: number; passedCases?: number; totalCases: number; error?: string }) {
  const submission = await prisma.submission.update({ 
      where: { id }, 
      data: { status: data.status, executionTime: data.executionTime, passedCases: data.passedCases ?? 0, totalCases: data.totalCases } 
  });
  return { ...submission, error: data.error };
}