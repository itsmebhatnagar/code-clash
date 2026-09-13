import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { recordAuditLog } from '../audit';
import { AppError } from '../middleware/errorMiddleware';

export interface CreateParticipantInput {
  name: string;
  email: string;
  password: string;
  college?: string;
  collegeId?: string;
  phone?: string;
}

export interface UpdateParticipantInput {
  name?: string;
  email?: string;
  college?: string;
  collegeId?: string;
  phone?: string;
}

export interface UpdateParticipantStatusInput {
  status: 'REGISTERED' | 'CHECKED_IN' | 'DISQUALIFIED';
  reason?: string;
  collegeIdVerified?: boolean;
}

export async function listParticipants() {
  return prisma.user.findMany({
    where: { role: 'PARTICIPANT' },
    select: {
      id: true,
      name: true,
      email: true,
      college: true,
      collegeId: true,
      status: true,
      workstation: true,
    },
  });
}

export async function searchParticipants(query?: string, status?: string) {
  return prisma.user.findMany({
    where: {
      role: 'PARTICIPANT',
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { email: { contains: query } },
              { collegeId: { contains: query } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      college: true,
      collegeId: true,
      phone: true,
      status: true,
      workstation: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getParticipantById(id: string) {
  const participant = await prisma.user.findFirst({
    where: { id, role: 'PARTICIPANT' },
    select: {
      id: true,
      name: true,
      email: true,
      college: true,
      collegeId: true,
      phone: true,
      status: true,
      collegeIdVerified: true,
      checkedInAt: true,
      disqualificationReason: true,
      workstation: true,
    },
  });
  if (!participant) throw new AppError(404, 'Participant not found');
  return participant;
}

export async function getParticipantSubmissions(participantId: string) {
  return prisma.submission.findMany({
    where: { participantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getParticipantEvaluation(participantId: string) {
  return prisma.evaluation.findUnique({
    where: { participantId },
  });
}

export async function createParticipant(data: CreateParticipantInput, adminId: string) {
  const { name, email, password, college, collegeId, phone } = data;
  if (!name || !email || !password) {
    throw new AppError(400, 'Name, email, and password are required');
  }

  const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
  const participant = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      college,
      collegeId,
      phone,
      role: 'PARTICIPANT',
    },
  });

  await recordAuditLog(adminId, 'PARTICIPANT_CHECKIN', `Participant ${participant.id} manually registered`);

  return {
    id: participant.id,
    name: participant.name,
    email: participant.email,
    college: participant.college,
    collegeId: participant.collegeId,
    phone: participant.phone,
    role: participant.role,
    status: participant.status,
  };
}

export async function updateParticipant(id: string, data: UpdateParticipantInput) {
  const participant = await prisma.user.update({
    where: { id },
    data: {
      name: data.name,
      email: data.email,
      college: data.college,
      collegeId: data.collegeId,
      phone: data.phone,
    },
  });

  return {
    id: participant.id,
    name: participant.name,
    email: participant.email,
    college: participant.college,
    collegeId: participant.collegeId,
    phone: participant.phone,
    role: participant.role,
    status: participant.status,
  };
}

export async function cancelParticipant(id: string, adminId: string) {
  await prisma.user.update({
    where: { id },
    data: { status: 'CANCELLED', lockedAt: new Date() },
  });
  await recordAuditLog(adminId, 'PARTICIPANT_DISQUALIFY', `Participant ${id} registration cancelled`);
}

export async function getParticipantStatusHistory(participantId: string) {
  return prisma.participantStatusHistory.findMany({
    where: { participantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateParticipantStatus(
  id: string,
  input: UpdateParticipantStatusInput,
  adminId: string
) {
  const { status, reason, collegeIdVerified } = input;
  if (!['REGISTERED', 'CHECKED_IN', 'DISQUALIFIED'].includes(status)) {
    throw new AppError(400, 'Invalid status');
  }

  const current = await prisma.user.findUnique({
    where: { id },
    select: { status: true, role: true },
  });

  if (!current || current.role !== 'PARTICIPANT') {
    throw new AppError(404, 'Participant not found');
  }

  if (status === 'DISQUALIFIED' && !reason) {
    throw new AppError(400, 'Disqualification reason is required');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status,
      checkedInAt: status === 'CHECKED_IN' ? new Date() : undefined,
      collegeIdVerified: status === 'CHECKED_IN' ? Boolean(collegeIdVerified ?? true) : undefined,
      disqualificationReason: status === 'DISQUALIFIED' ? reason : undefined,
      lockedAt: status === 'DISQUALIFIED' ? new Date() : undefined,
    },
  });

  await prisma.participantStatusHistory.create({
    data: {
      participantId: id,
      adminId,
      fromStatus: current.status,
      toStatus: status,
      reason,
    },
  });

  if (status === 'CHECKED_IN' || status === 'DISQUALIFIED') {
    await recordAuditLog(
      adminId,
      status === 'CHECKED_IN' ? 'PARTICIPANT_CHECKIN' : 'PARTICIPANT_DISQUALIFY',
      `Participant ${id} status changed to ${status}`
    );
  }

  return updated;
}
