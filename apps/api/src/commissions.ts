import {
  AppointmentPaymentStatus,
  AppointmentStatus,
  CommissionEntryStatus,
  CommissionRuleType,
  type Prisma,
} from '@barber-saas/database';

interface CommissionRuleCandidate {
  readonly createdAt: Date;
  readonly id: string;
  readonly priority: number;
  readonly serviceId: string | null;
  readonly type: CommissionRuleType;
  readonly value: number;
}

function selectRule(
  rules: readonly CommissionRuleCandidate[],
  serviceId: string,
) {
  return [...rules].sort((left, right) => {
    const specificity =
      Number(right.serviceId === serviceId) -
      Number(left.serviceId === serviceId);
    if (specificity !== 0) return specificity;
    if (right.priority !== left.priority) return right.priority - left.priority;
    return right.createdAt.getTime() - left.createdAt.getTime();
  })[0];
}

function commissionAmount(
  rule: CommissionRuleCandidate,
  baseAmountCents: number,
) {
  if (rule.type === CommissionRuleType.SERVICE_PERCENTAGE) {
    return Math.round((baseAmountCents * rule.value) / 100);
  }
  return rule.value;
}

async function applicableRules(
  transaction: Prisma.TransactionClient,
  input: {
    occurredAt: Date;
    organizationId: string;
    professionalMembershipId: string;
    serviceId: string;
  },
) {
  return transaction.commissionRule.findMany({
    where: {
      effectiveFrom: { lte: input.occurredAt },
      organizationId: input.organizationId,
      professionalMembershipId: input.professionalMembershipId,
      AND: [
        { OR: [{ serviceId: input.serviceId }, { serviceId: null }] },
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: input.occurredAt } },
          ],
        },
      ],
    },
  });
}

export async function reconcileAppointmentCommissions(
  transaction: Prisma.TransactionClient,
  appointmentId: string,
) {
  const appointment = await transaction.appointment.findUnique({
    include: { services: { orderBy: { sortOrder: 'asc' } } },
    where: { id: appointmentId },
  });
  if (
    !appointment ||
    appointment.status !== AppointmentStatus.COMPLETED ||
    appointment.paymentStatus !== AppointmentPaymentStatus.PAID
  ) {
    return [];
  }

  const entries = [];
  for (const service of appointment.services) {
    const existing = await transaction.commissionEntry.findUnique({
      where: { appointmentServiceId: service.id },
    });
    if (existing) {
      entries.push(existing);
      continue;
    }
    const rule = selectRule(
      await applicableRules(transaction, {
        occurredAt: appointment.startsAt,
        organizationId: appointment.organizationId,
        professionalMembershipId: appointment.professionalMembershipId,
        serviceId: service.serviceId,
      }),
      service.serviceId,
    );
    if (!rule) continue;

    const amount = commissionAmount(rule, service.priceCents);
    const entry = await transaction.commissionEntry.upsert({
      create: {
        appointmentId: appointment.id,
        appointmentServiceId: service.id,
        baseAmountCents: service.priceCents,
        calculationSnapshot: {
          baseAmountCents: service.priceCents,
          commissionAmountCents: amount,
          professionalMembershipId: appointment.professionalMembershipId,
          ruleId: rule.id,
          ruleType: rule.type,
          ruleValue: rule.value,
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          source: 'appointment',
        },
        commissionAmountCents: amount,
        locationId: appointment.locationId,
        organizationId: appointment.organizationId,
        professionalMembershipId: appointment.professionalMembershipId,
        ruleId: rule.id,
        status: CommissionEntryStatus.PENDING,
      },
      update: {},
      where: { appointmentServiceId: service.id },
    });
    entries.push(entry);
  }
  return entries;
}

export async function createManualSaleCommission(
  transaction: Prisma.TransactionClient,
  input: {
    amountCents: number;
    cashMovementId: string;
    locationId: string;
    occurredAt: Date;
    organizationId: string;
    professionalMembershipId: string;
    serviceId: string;
    serviceName: string;
  },
) {
  const existing = await transaction.commissionEntry.findUnique({
    where: { cashMovementId: input.cashMovementId },
  });
  if (existing) return existing;

  const rule = selectRule(
    await applicableRules(transaction, input),
    input.serviceId,
  );
  if (!rule) return null;
  const amount = commissionAmount(rule, input.amountCents);
  return transaction.commissionEntry.upsert({
    create: {
      baseAmountCents: input.amountCents,
      calculationSnapshot: {
        baseAmountCents: input.amountCents,
        cashMovementId: input.cashMovementId,
        commissionAmountCents: amount,
        professionalMembershipId: input.professionalMembershipId,
        ruleId: rule.id,
        ruleType: rule.type,
        ruleValue: rule.value,
        serviceId: input.serviceId,
        serviceName: input.serviceName,
        source: 'manual_sale',
      },
      cashMovementId: input.cashMovementId,
      commissionAmountCents: amount,
      locationId: input.locationId,
      organizationId: input.organizationId,
      professionalMembershipId: input.professionalMembershipId,
      ruleId: rule.id,
      status: CommissionEntryStatus.PENDING,
    },
    update: {},
    where: { cashMovementId: input.cashMovementId },
  });
}
