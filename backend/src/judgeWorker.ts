import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const queue: Array<{ id: string; io: Server }> = [];
let running = false;
const MAX_OUTPUT_BYTES = 256 * 1024;

type Language = 'javascript' | 'python' | 'cpp' | 'java';

export function enqueueSubmission(id: string, io: Server) {
  queue.push({ id, io });
  void processQueue();
}

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const item = queue.shift();
    if (item) await judgeSubmission(item.id, item.io);
  }
  running = false;
}

async function judgeSubmission(id: string, io: Server) {
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { problem: { include: { testCases: true } } }
  });
  if (!submission) return;

  const language = normalizeLanguage(submission.language);
  if (!language) {
    await finish(id, io, { status: 'COMPILE_ERROR', totalCases: submission.problem.testCases.length, error: 'Unsupported language' });
    return;
  }

  const workspace = await mkdtemp(path.join(os.tmpdir(), 'code-clash-'));
  try {
    const command = await prepareCommand(language, submission.sourceCode, workspace, submission.problem.memoryLimit);
    if (!command) {
      await finish(id, io, { status: 'COMPILE_ERROR', totalCases: submission.problem.testCases.length, error: 'Compiler or runtime is not installed' });
      return;
    }

    const started = Date.now();
    let passedCases = 0;
    for (const testCase of submission.problem.testCases) {
      const result = await runProcess(command.command, command.args, workspace, testCase.input, submission.problem.timeLimit);
      if (result.timeout) {
        await finish(id, io, { status: 'TIME_LIMIT_EXCEEDED', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: 'Time limit exceeded' });
        return;
      }
      if (result.outputLimit) {
        await finish(id, io, { status: 'OUTPUT_LIMIT_EXCEEDED', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: 'Output limit exceeded' });
        return;
      }
      if (result.exitCode !== 0) {
        await finish(id, io, { status: 'RUNTIME_ERROR', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: result.stderr || 'Process exited with an error' });
        return;
      }
      if (normalizeOutput(result.stdout) !== normalizeOutput(testCase.output)) {
        await finish(id, io, { status: 'WRONG_ANSWER', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length, error: 'Output did not match expected result' });
        return;
      }
      passedCases += 1;
    }
    await finish(id, io, { status: passedCases === submission.problem.testCases.length ? 'ACCEPTED' : 'WRONG_ANSWER', executionTime: Date.now() - started, passedCases, totalCases: submission.problem.testCases.length });
  } catch (error) {
    await finish(id, io, { status: 'RUNTIME_ERROR', totalCases: submission.problem.testCases.length, error: error instanceof Error ? error.message : 'Judge worker failed' });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function normalizeLanguage(language: string): Language | null {
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
    return { command: process.execPath, args: [`--max-old-space-size=${Math.max(16, memoryLimitMb)}`, 'Main.js'] };
  }
  if (language === 'python') {
    await writeFile(path.join(workspace, 'main.py'), sourceCode);
    return { command: process.platform === 'win32' ? 'python' : 'python3', args: ['main.py'] };
  }
  if (language === 'cpp') {
    await writeFile(path.join(workspace, 'main.cpp'), sourceCode);
    const compiled = await runProcess('g++', ['-std=c++17', '-O2', 'main.cpp', '-o', 'main'], workspace, '', 10_000);
    if (compiled.exitCode !== 0 || compiled.timeout) return null;
    return { command: path.join(workspace, process.platform === 'win32' ? 'main.exe' : 'main'), args: [] };
  }
  await writeFile(path.join(workspace, 'Main.java'), sourceCode);
  const compiled = await runProcess('javac', ['Main.java'], workspace, '', 10_000);
  if (compiled.exitCode !== 0 || compiled.timeout) return null;
  return { command: 'java', args: ['-Xmx' + Math.max(16, memoryLimitMb) + 'm', 'Main'] };
}

function runProcess(command: string, args: string[], cwd: string, input: string, timeoutMs: number): Promise<{ exitCode: number | null; stdout: string; stderr: string; timeout: boolean; outputLimit: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, env: { ...process.env, NO_PROXY: '*', no_proxy: '*' } });
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

function normalizeOutput(value: string) { return value.replace(/\r\n/g, '\n').trim().split('\n').map((line) => line.trimEnd()).join('\n'); }

async function finish(id: string, io: Server, data: { status: string; executionTime?: number; passedCases?: number; totalCases: number; error?: string }) {
  const submission = await prisma.submission.update({ where: { id }, data: { status: data.status, executionTime: data.executionTime, passedCases: data.passedCases ?? 0, totalCases: data.totalCases } });
  io.to(`PARTICIPANT:${submission.participantId}`).emit('SUBMISSION_RESULT', { ...submission, error: data.error });
}