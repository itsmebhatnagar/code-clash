import path from 'path'

export type JudgeLanguage = 'c' | 'cpp' | 'java' | 'python'

type Command = { command: string; args: string[] }
type RuntimeFactory = (workspace: string, memoryLimitMb: number, sandboxed: boolean) => Command

type LanguageDefinition = {
  aliases: readonly string[]
  sourceFile: string
  compile?: Command
  compilationTimeoutMs?: number
  run: RuntimeFactory
}

const nativeBinary = (workspace: string) => path.join(workspace, process.platform === 'win32' ? 'main.exe' : 'main')

export const LANGUAGE_REGISTRY: Record<JudgeLanguage, LanguageDefinition> = {
  c: {
    aliases: ['c'],
    sourceFile: 'main.c',
    compile: { command: 'gcc', args: ['-std=c17', '-O2', 'main.c', '-o', 'main', '-lm'] },
    compilationTimeoutMs: 10_000,
    run: (workspace, _memoryLimitMb, sandboxed) => ({ command: sandboxed ? '/workspace/main' : nativeBinary(workspace), args: [] }),
  },
  cpp: {
    aliases: ['cpp', 'c++'],
    sourceFile: 'main.cpp',
    compile: { command: 'g++', args: ['-std=c++17', '-O2', 'main.cpp', '-o', 'main', '-lm'] },
    compilationTimeoutMs: 10_000,
    run: (workspace, _memoryLimitMb, sandboxed) => ({ command: sandboxed ? '/workspace/main' : nativeBinary(workspace), args: [] }),
  },
  java: {
    aliases: ['java'],
    sourceFile: 'Main.java',
    compile: { command: 'javac', args: ['-encoding', 'UTF-8', 'Main.java'] },
    compilationTimeoutMs: 30_000,
    run: (_workspace, memoryLimitMb) => {
      const heapMb = Math.max(32, memoryLimitMb)
      return { command: 'java', args: ['-XX:+UseSerialGC', `-Xms${heapMb}m`, `-Xmx${heapMb}m`, '-Dfile.encoding=UTF-8', 'Main'] }
    },
  },
  python: {
    aliases: ['python', 'python3'],
    sourceFile: 'main.py',
    run: (_workspace, _memoryLimitMb, sandboxed) => ({
      command: sandboxed ? 'python3.14' : process.platform === 'win32' ? 'python' : 'python3',
      args: ['-u', 'main.py'],
    }),
  },
}

const languageByAlias = new Map<string, JudgeLanguage>(
  Object.entries(LANGUAGE_REGISTRY).flatMap(([language, definition]) => definition.aliases.map((alias) => [alias, language as JudgeLanguage])),
)

export function normalizeLanguage(language: string): JudgeLanguage | null {
  return languageByAlias.get(language.toLowerCase()) ?? null
}

export function supportedLanguageAliases(): string[] {
  return [...languageByAlias.keys()]
}
