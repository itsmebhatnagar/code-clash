import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const round = await prisma.round.findFirst({
    where: { roundType: 'CODE_RUN', status: 'PENDING' },
    orderBy: { startTime: 'desc' } // using a valid field for ordering
  });

  if (!round) {
    console.error("No PENDING CODE_RUN round found! Please ensure you created one.");
    return;
  }

  console.log(`Seeding problems into round: ${round.name} (${round.id})`);

  await prisma.problem.create({
    data: {
      title: "Sum of Array",
      description: "Given an array of integers, find the sum of its elements.",
      inputFormat: "The first line contains an integer N (the size of the array).\nThe second line contains N space-separated integers.",
      outputFormat: "Output a single integer, the sum of the array.",
      constraints: "1 <= N <= 100\n-1000 <= arr[i] <= 1000",
      difficulty: "EASY",
      timeLimit: 1000,
      memoryLimit: 256,
      points: 100,
      roundId: round.id,
      position: 0,
      examples: {
        create: [
          { input: "3\n1 2 3", output: "6", position: 0 }
        ]
      },
      testCases: {
        create: [
          { input: "3\n1 2 3", output: "6", isHidden: false },
          { input: "5\n-1 -2 -3 -4 -5", output: "-15", isHidden: true },
          { input: "1\n1000", output: "1000", isHidden: true }
        ]
      }
    }
  });

  await prisma.problem.create({
    data: {
      title: "Palindrome Check",
      description: "Given a string, check if it is a palindrome.",
      inputFormat: "A single string containing lowercase English letters.",
      outputFormat: "Output 'YES' if it is a palindrome, otherwise 'NO'.",
      constraints: "1 <= string length <= 1000",
      difficulty: "EASY",
      timeLimit: 1000,
      memoryLimit: 256,
      points: 100,
      roundId: round.id,
      position: 1,
      examples: {
        create: [
          { input: "racecar", output: "YES", position: 0 },
          { input: "hello", output: "NO", position: 1 }
        ]
      },
      testCases: {
        create: [
          { input: "racecar", output: "YES", isHidden: false },
          { input: "hello", output: "NO", isHidden: false },
          { input: "a", output: "YES", isHidden: true },
          { input: "ab", output: "NO", isHidden: true }
        ]
      }
    }
  });

  console.log("Problems seeded successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
