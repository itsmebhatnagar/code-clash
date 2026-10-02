import { prisma } from './db';

export type AuditAction =
  | 'ADMIN_LOGIN'
  | 'PARTICIPANT_CHECKIN'
  | 'WORKSTATION_ASSIGN'
  | 'PARTICIPANT_DISQUALIFY'
  | 'ROUND_CREATE'
  | 'ROUND_UPDATE'
  | 'ROUND_RESET'
  | 'ROUND_DELETE'
  | 'PROBLEM_CREATE'
  | 'PROBLEM_UPDATE'
  | 'PROBLEM_DELETE'
  | 'PROBLEM_DUPLICATE'
  | 'PROBLEM_REORDER'
  | 'EXAMPLE_CREATE'
  | 'EXAMPLE_UPDATE'
  | 'EXAMPLE_DELETE'
  | 'TEST_CASE_CREATE'
  | 'TEST_CASE_UPDATE'
  | 'TEST_CASE_DELETE'
  | 'BULK_IMPORT'
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
