/// <reference types="node" />
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function runProcess(command: string, args: string[], cwd: string, stdin: string): Promise<any> {
    return new Promise((resolve) => {
        const proc = spawn(command, args, { cwd });
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data: any) => stdout += data.toString());
        proc.stderr.on('data', (data: any) => stderr += data.toString());
        
        if (stdin) {
            proc.stdin.write(stdin);
            proc.stdin.end();
        }
        
        proc.on('close', (code: number | null) => {
            resolve({ stdout, stderr, exitCode: code });
        });
    });
}

async function testLanguage(name: string, ext: string, code: string, runCmd: string[], stdin: string, expectedOutput: string) {
    const workspace = fs.mkdtempSync(path.join(process.cwd(), 'sandbox-'));
    fs.writeFileSync(path.join(workspace, 'main' + ext), code);
    
    const dockerArgs = [
        'run', '--rm', 
        '-v', `${workspace}:/workspace`,
        '-w', '/workspace',
        'code-clash-judge:latest',
        ...runCmd
    ];
    
    console.log(`Testing ${name}...`);
    const result = await runProcess('docker', dockerArgs, workspace, stdin);
    
    if (result.stdout.trim() === expectedOutput.trim() && result.exitCode === 0) {
        console.log(`✅ ${name} test passed`);
    } else {
        console.log(`❌ ${name} test failed`);
        console.log(`Exit code: ${result.exitCode}`);
        console.log(`Stdout: ${result.stdout}`);
        console.log(`Stderr: ${result.stderr}`);
    }
    
    fs.rmSync(workspace, { recursive: true, force: true });
}

async function main() {
    await testLanguage('Python', '.py', 'import sys\nprint("Hello " + sys.stdin.read().strip() + " from Python 3.14.8!")', ['python3.14', 'main.py'], 'World', 'Hello World from Python 3.14.8!');
    await testLanguage('C', '.c', '#include <stdio.h>\nint main() { char name[100]; scanf("%s", name); printf("Hello %s from C17!", name); return 0; }', ['sh', '-c', 'gcc -std=c17 -O2 main.c -o main && ./main'], 'World', 'Hello World from C17!');
    await testLanguage('C++', '.cpp', '#include <iostream>\n#include <string>\nusing namespace std;\nint main() { string name; cin >> name; cout << "Hello " << name << " from C++17!" << endl; return 0; }', ['sh', '-c', 'g++ -std=c++17 -O2 main.cpp -o main && ./main'], 'World', 'Hello World from C++17!');
    await testLanguage('Java', '.java', 'import java.util.Scanner;\npublic class Main {\npublic static void main(String[] args) {\nScanner sc = new Scanner(System.in);\nSystem.out.println("Hello " + sc.nextLine() + " from Java 25!");\n}\n}', ['sh', '-c', 'javac Main.java && java Main'], 'World', 'Hello World from Java 25!');
}

main().catch(console.error);
