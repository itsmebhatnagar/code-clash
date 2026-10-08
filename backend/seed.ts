import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Wiping existing questions data...");
  await prisma.testCase.deleteMany({});
  await prisma.problemExample.deleteMany({});
  await prisma.problem.deleteMany({});
  console.log("Old questions wiped.");

  let codeRunRound = await prisma.round.findFirst({
    where: { roundType: 'CODE_RUN' },
    orderBy: { startTime: 'desc' }
  });

  let codeInDarkRound = await prisma.round.findFirst({
    where: { roundType: 'CODE_IN_DARK' },
    orderBy: { startTime: 'desc' }
  });

  if (!codeRunRound) {
    console.log("Creating CODE_RUN round...");
    codeRunRound = await prisma.round.create({
      data: { name: 'Round 1: Code Run', roundType: 'CODE_RUN', duration: 45, status: 'PENDING' }
    });
  }

  if (!codeInDarkRound) {
    console.log("Creating CODE_IN_DARK round...");
    codeInDarkRound = await prisma.round.create({
      data: { name: 'Round 2: Code In The Dark', roundType: 'CODE_IN_DARK', duration: 30, status: 'PENDING' }
    });
  }

  console.log(`Seeding CODE_RUN round: ${codeRunRound.name} (${codeRunRound.id})`);
  
  const codeRunProblems = [
    {
      title: "Sum of Array",
      description: "Given an array of integers, find the sum of its elements.",
      inputFormat: "The first line contains an integer N (the size of the array).\nThe second line contains N space-separated integers.",
      outputFormat: "Output a single integer, the sum of the array.",
      constraints: "1 <= N <= 100\n-1000 <= arr[i] <= 1000",
      difficulty: "EASY",
      position: 0,
      examples: [{ input: "3\n1 2 3", output: "6", position: 0 }],
      testCases: [
        { input: "3\n1 2 3", output: "6", isHidden: false },
        { input: "5\n-1 -2 -3 -4 -5", output: "-15", isHidden: true },
        { input: "1\n1000", output: "1000", isHidden: true }
      ]
    },
    {
      title: "Palindrome Check",
      description: "Given a string, check if it is a palindrome.",
      inputFormat: "A single string containing lowercase English letters.",
      outputFormat: "Output 'YES' if it is a palindrome, otherwise 'NO'.",
      constraints: "1 <= string length <= 1000",
      difficulty: "EASY",
      position: 1,
      examples: [{ input: "racecar", output: "YES", position: 0 }, { input: "hello", output: "NO", position: 1 }],
      testCases: [
        { input: "racecar", output: "YES", isHidden: false },
        { input: "hello", output: "NO", isHidden: false },
        { input: "a", output: "YES", isHidden: true },
        { input: "ab", output: "NO", isHidden: true }
      ]
    },
    {
      title: "Factorial",
      description: "Calculate the factorial of a given integer N.",
      inputFormat: "A single integer N.",
      outputFormat: "Output a single integer, the factorial of N.",
      constraints: "0 <= N <= 12",
      difficulty: "EASY",
      position: 2,
      examples: [{ input: "5", output: "120", position: 0 }],
      testCases: [
        { input: "5", output: "120", isHidden: false },
        { input: "0", output: "1", isHidden: false },
        { input: "10", output: "3628800", isHidden: true }
      ]
    },
    {
      title: "Fibonacci Number",
      description: "Find the Nth number in the Fibonacci sequence. (0th is 0, 1st is 1).",
      inputFormat: "A single integer N.",
      outputFormat: "Output the Nth Fibonacci number.",
      constraints: "0 <= N <= 30",
      difficulty: "EASY",
      position: 3,
      examples: [{ input: "5", output: "5", position: 0 }, { input: "6", output: "8", position: 1 }],
      testCases: [
        { input: "5", output: "5", isHidden: false },
        { input: "6", output: "8", isHidden: false },
        { input: "20", output: "6765", isHidden: true }
      ]
    },
    {
      title: "Reverse String",
      description: "Given a string, output its reverse.",
      inputFormat: "A single string containing any printable characters.",
      outputFormat: "Output the reversed string.",
      constraints: "1 <= string length <= 1000",
      difficulty: "EASY",
      position: 4,
      examples: [{ input: "hello", output: "olleh", position: 0 }],
      testCases: [
        { input: "hello", output: "olleh", isHidden: false },
        { input: "world", output: "dlrow", isHidden: false },
        { input: "codeclash", output: "hsalcedoc", isHidden: true }
      ]
    }
  ];

  for (const prob of codeRunProblems) {
    await prisma.problem.create({
      data: {
        title: prob.title, description: prob.description, inputFormat: prob.inputFormat, outputFormat: prob.outputFormat,
        constraints: prob.constraints, difficulty: prob.difficulty, timeLimit: 1000, memoryLimit: 256, points: 100,
        roundId: codeRunRound.id, position: prob.position,
        examples: { create: prob.examples },
        testCases: { create: prob.testCases }
      }
    });
  }

  console.log(`Seeding CODE_IN_DARK round: ${codeInDarkRound.name} (${codeInDarkRound.id})`);

  const codeInDarkProblems = [
    {
      title: "Find Maximum Element",
      description: "Given an array of integers, output the maximum element.",
      inputFormat: "The first line contains an integer N. The second line contains N space-separated integers.",
      outputFormat: "Output the maximum integer.",
      constraints: "1 <= N <= 100",
      difficulty: "EASY",
      position: 0,
      examples: [{ input: "3\n1 5 2", output: "5", position: 0 }],
      testCases: [
        { input: "3\n1 5 2", output: "5", isHidden: false },
        { input: "5\n-1 -2 -3 -4 -5", output: "-1", isHidden: true },
        { input: "1\n42", output: "42", isHidden: true }
      ]
    },
    {
      title: "Anagram Check",
      description: "Check if two strings are anagrams of each other.",
      inputFormat: "Two space-separated strings on a single line.",
      outputFormat: "Output 'YES' if they are anagrams, otherwise 'NO'.",
      constraints: "1 <= string length <= 1000",
      difficulty: "EASY",
      position: 1,
      examples: [{ input: "listen silent", output: "YES", position: 0 }, { input: "hello world", output: "NO", position: 1 }],
      testCases: [
        { input: "listen silent", output: "YES", isHidden: false },
        { input: "hello world", output: "NO", isHidden: false },
        { input: "a a", output: "YES", isHidden: true },
        { input: "ab ba", output: "YES", isHidden: true }
      ]
    },
    {
      title: "Power of Two",
      description: "Determine if a given integer is a power of 2.",
      inputFormat: "A single integer N.",
      outputFormat: "Output 'YES' if N is a power of 2, otherwise 'NO'.",
      constraints: "1 <= N <= 10^9",
      difficulty: "EASY",
      position: 2,
      examples: [{ input: "16", output: "YES", position: 0 }, { input: "14", output: "NO", position: 1 }],
      testCases: [
        { input: "16", output: "YES", isHidden: false },
        { input: "14", output: "NO", isHidden: false },
        { input: "1", output: "YES", isHidden: true },
        { input: "1024", output: "YES", isHidden: true }
      ]
    },
    {
      title: "Vowel Count",
      description: "Count the number of vowels (a, e, i, o, u) in a given string.",
      inputFormat: "A single string containing lowercase English letters.",
      outputFormat: "Output the integer count of vowels.",
      constraints: "1 <= string length <= 1000",
      difficulty: "EASY",
      position: 3,
      examples: [{ input: "hello", output: "2", position: 0 }],
      testCases: [
        { input: "hello", output: "2", isHidden: false },
        { input: "programming", output: "3", isHidden: false },
        { input: "rhythm", output: "0", isHidden: true }
      ]
    },
    {
      title: "Odd or Even",
      description: "Determine if a given integer is odd or even.",
      inputFormat: "A single integer N.",
      outputFormat: "Output 'EVEN' if N is even, otherwise 'ODD'.",
      constraints: "-1000 <= N <= 1000",
      difficulty: "EASY",
      position: 4,
      examples: [{ input: "4", output: "EVEN", position: 0 }, { input: "7", output: "ODD", position: 1 }],
      testCases: [
        { input: "4", output: "EVEN", isHidden: false },
        { input: "7", output: "ODD", isHidden: false },
        { input: "0", output: "EVEN", isHidden: true },
        { input: "-5", output: "ODD", isHidden: true }
      ]
    }
  ];

  for (const prob of codeInDarkProblems) {
    await prisma.problem.create({
      data: {
        title: prob.title, description: prob.description, inputFormat: prob.inputFormat, outputFormat: prob.outputFormat,
        constraints: prob.constraints, difficulty: prob.difficulty, timeLimit: 1000, memoryLimit: 256, points: 100,
        roundId: codeInDarkRound.id, position: prob.position,
        examples: { create: prob.examples },
        testCases: { create: prob.testCases }
      }
    });
  }

  console.log("10 unique problems seeded successfully (5 for each round)!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
