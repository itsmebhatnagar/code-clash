import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type AuditAction =
  | 'ADMIN_LOGIN'
  | 'PARTICIPANT_CHECKIN'
  | 'WORKSTATION_ASSIGN'
  | 'PARTICIPANT_DISQUALIFY'
  | 'PROBLEM_CREATE'
  | 'PROBLEM_UPDATE'
  | 'ROUND_START'
  | 'ROUND_PAUSE'
  | 'ROUND_END'
  | 'SCORE_ADJUSTMENT';

export async function recordAuditLog(adminId: string, actionType: AuditAction, description: string) {
  try {
    await prisma.auditLog.create({ data: { adminId, actionType, description } });
  } catch (error) {
    console.error(`Failed to record audit event ${actionType}:`, error);
  }
}
