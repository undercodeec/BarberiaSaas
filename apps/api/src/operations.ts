import {
  InvitationStatus,
  MembershipRole,
  MembershipStatus,
  SubscriptionStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import {
  hasPermission,
  type MembershipRole as PermissionRole,
  type OrganizationPermission,
} from '@barber-saas/permissions';
import {
  acceptTeamInvitationSchema,
  assignProfessionalServiceSchema,
  createScheduleBlockSchema,
  createServiceCategorySchema,
  createServiceSchema,
  createTeamInvitationSchema,
  replaceWeeklySchedulesSchema,
  updateServiceSchema,
  updateTeamMemberSchema,
} from '@barber-saas/validation';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { ApiConfig } from './config';
import { ApiError } from './errors';
import type { InvitationMailer } from './recovery-mailer';
import { createOpaqueToken, hashOpaqueToken } from './security';

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 14;
const GRACE_DAYS = 7;
const teamRecordParamsSchema = z.object({ id: z.uuid() });
const SUBSCRIPTION_PLANS = [
  {
    available: true,
    code: 'essential',
    features: [
      'Una sucursal',
      'Colaboradores ilimitados',
      'Agenda, clientes, servicios y reservas',
      'Página pública y enlace de reservas',
      'Caja, Nava Wallet y comisiones',
      'Permisos por perfil de acceso',
      'Reportes esenciales',
    ],
    limits: { locations: 1, teamMembers: null },
    name: 'Esencial',
    sortOrder: 10,
  },
  {
    available: false,
    code: 'multi',
    features: [
      'Hasta cinco sucursales',
      'Agenda y reportes consolidados',
      'Caja y configuración por sucursal',
      'Permisos con alcance por sucursal',
      'Soporte prioritario',
    ],
    limits: { locations: 5, teamMembers: null },
    name: 'Multi',
    sortOrder: 20,
  },
] as const;

interface AuthenticatedIdentity {
  readonly user: {
    readonly email: string;
    readonly fullName: string;
    readonly id: string;
  };
}

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<AuthenticatedIdentity>;

function permissionRole(role: MembershipRole): PermissionRole {
  return role.toLowerCase() as PermissionRole;
}

async function requireMembership(
  database: DatabaseClient,
  userId: string,
  permission?: OrganizationPermission,
) {
  const membership = await database.membership.findFirst({
    include: { memberLocations: true },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (!membership) {
    throw new ApiError(
      403,
      'ORGANIZATION_REQUIRED',
      'Tu cuenta no pertenece a una barbería activa.',
    );
  }
  if (
    permission &&
    !hasPermission(permissionRole(membership.role), permission)
  ) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'No tienes permiso para realizar esta acción.',
    );
  }
  return membership;
}

async function requireLocation(
  database: DatabaseClient,
  organizationId: string,
  locationId: string,
) {
  const location = await database.location.findFirst({
    where: { id: locationId, isActive: true, organizationId },
  });
  if (!location) {
    throw new ApiError(404, 'LOCATION_NOT_FOUND', 'La sucursal no existe.');
  }
  return location;
}

async function requireProfessional(
  database: DatabaseClient,
  organizationId: string,
  membershipId: string,
) {
  const professional = await database.membership.findFirst({
    include: { user: true },
    where: {
      id: membershipId,
      organizationId,
      role: MembershipRole.BARBER,
      status: { in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] },
    },
  });
  if (!professional) {
    throw new ApiError(
      404,
      'PROFESSIONAL_NOT_FOUND',
      'El profesional no existe o no está activo.',
    );
  }
  return professional;
}

function assertNoScheduleOverlaps(
  schedules: ReadonlyArray<{
    endMinute: number;
    startMinute: number;
    weekday: number;
  }>,
) {
  const ordered = [...schedules].sort(
    (left, right) =>
      left.weekday - right.weekday || left.startMinute - right.startMinute,
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      previous &&
      current &&
      previous.weekday === current.weekday &&
      previous.endMinute > current.startMinute
    ) {
      throw new ApiError(
        400,
        'SCHEDULE_OVERLAP',
        'Los intervalos del horario no pueden superponerse.',
      );
    }
  }
}

export function registerOperationsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  invitationMailer: InvitationMailer | null,
  config: ApiConfig,
) {
  app.get('/v1/subscription', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
    const graceEndsAt = new Date(trialEndsAt.getTime() + GRACE_DAYS * DAY_MS);
    const { plans, subscription } = await database.$transaction(
      async (transaction) => {
        const storedPlans = [];
        for (const definition of SUBSCRIPTION_PLANS) {
          storedPlans.push(
            await transaction.plan.upsert({
              create: {
                code: definition.code,
                features: [...definition.features],
                isPublic: definition.available,
                limits: definition.limits,
                name: definition.name,
                sortOrder: definition.sortOrder,
              },
              update: {
                features: [...definition.features],
                isActive: true,
                isPublic: definition.available,
                limits: definition.limits,
                name: definition.name,
                sortOrder: definition.sortOrder,
              },
              where: { code: definition.code },
            }),
          );
        }
        const essential = storedPlans.find(({ code }) => code === 'essential');
        if (!essential) throw new Error('El plan Esencial no está disponible.');
        let activeSubscription = await transaction.subscription.upsert({
          create: {
            currentPeriodEnd: trialEndsAt,
            currentPeriodStart: now,
            graceEndsAt,
            organizationId: current.organizationId,
            planId: essential.id,
            status: SubscriptionStatus.TRIAL,
            trialEndsAt,
          },
          update: {},
          where: { organizationId: current.organizationId },
        });
        if (
          activeSubscription.status === SubscriptionStatus.TRIAL &&
          activeSubscription.trialEndsAt &&
          activeSubscription.trialEndsAt <= now
        ) {
          activeSubscription = await transaction.subscription.update({
            data: { status: SubscriptionStatus.PAST_DUE },
            where: { id: activeSubscription.id },
          });
        }
        if (
          activeSubscription.status === SubscriptionStatus.PAST_DUE &&
          activeSubscription.graceEndsAt &&
          activeSubscription.graceEndsAt <= now
        ) {
          activeSubscription = await transaction.subscription.update({
            data: { status: SubscriptionStatus.SUSPENDED },
            where: { id: activeSubscription.id },
          });
        }
        return { plans: storedPlans, subscription: activeSubscription };
      },
    );
    const [locations, teamMembers] = await Promise.all([
      database.location.count({
        where: { isActive: true, organizationId: current.organizationId },
      }),
      database.membership.count({
        where: {
          organizationId: current.organizationId,
          status: MembershipStatus.ACTIVE,
        },
      }),
    ]);
    const currentPlan = plans.find(({ id }) => id === subscription.planId);
    if (!currentPlan)
      throw new Error('La suscripción no tiene un plan válido.');
    return {
      current: {
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
        planCode: currentPlan.code,
        readOnly:
          subscription.status === SubscriptionStatus.CANCELLED ||
          subscription.status === SubscriptionStatus.SUSPENDED,
        status: subscription.status.toLowerCase(),
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      },
      plans: plans.map((plan) => {
        const definition = SUBSCRIPTION_PLANS.find(
          ({ code }) => code === plan.code,
        );
        return {
          available: definition?.available ?? false,
          code: plan.code,
          currencyCode: plan.currencyCode,
          features: plan.features,
          limits: plan.limits,
          monthlyPriceCents: plan.monthlyPriceCents,
          name: plan.name,
        };
      }),
      usage: { locations, teamMembers },
    };
  });

  app.get('/v1/team', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    const canReadTeam = hasPermission(
      permissionRole(current.role),
      'membership.read',
    );
    const canManageTeam = hasPermission(
      permissionRole(current.role),
      'membership.manage',
    );
    const [members, pendingInvitations, commissionRules] = await Promise.all([
      database.membership.findMany({
        include: {
          memberLocations: { include: { location: true } },
          user: true,
        },
        orderBy: { createdAt: 'asc' },
        where: {
          organizationId: current.organizationId,
          status: MembershipStatus.ACTIVE,
          ...(canReadTeam ? {} : { id: current.id }),
        },
      }),
      canManageTeam
        ? database.teamInvitation.findMany({
            orderBy: { createdAt: 'desc' },
            where: {
              expiresAt: { gt: new Date() },
              organizationId: current.organizationId,
              status: InvitationStatus.PENDING,
            },
          })
        : Promise.resolve([]),
      database.commissionRule.findMany({
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        where: {
          isActive: true,
          organizationId: current.organizationId,
          serviceId: null,
          type: 'SERVICE_PERCENTAGE',
        },
      }),
    ]);
    const commissionByMembership = new Map<string, number>();
    for (const rule of commissionRules) {
      if (!commissionByMembership.has(rule.professionalMembershipId)) {
        commissionByMembership.set(rule.professionalMembershipId, rule.value);
      }
    }
    return {
      members: members.map((member) => ({
        commissionPercentage: commissionByMembership.get(member.id) ?? null,
        id: member.id,
        locations: member.memberLocations.map(({ location }) => ({
          id: location.id,
          name: location.name,
        })),
        role: member.role.toLowerCase(),
        status: member.status.toLowerCase(),
        user: {
          email: member.user.email,
          fullName: member.user.fullName,
          id: member.user.id,
        },
      })),
      pendingInvitations: pendingInvitations.map((invitation) => ({
        activationStatus: 'pending_acceptance' as const,
        commissionPercentage: invitation.commissionPercentage,
        email: invitation.email,
        expiresAt: invitation.expiresAt.toISOString(),
        id: invitation.id,
        role: invitation.role.toLowerCase(),
      })),
    };
  });

  app.patch('/v1/team/members/:id', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'membership.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const input = updateTeamMemberSchema.parse(request.body);
    const member = await database.membership.findFirst({
      include: { user: true },
      where: {
        id,
        organizationId: current.organizationId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new ApiError(
        404,
        'TEAM_MEMBER_NOT_FOUND',
        'El colaborador no existe o ya no está activo.',
      );
    }
    if (member.role === MembershipRole.OWNER || member.id === current.id) {
      throw new ApiError(
        403,
        'TEAM_MEMBER_PROTECTED',
        'No puedes modificar al propietario ni tu propia membresía desde esta pantalla.',
      );
    }
    const role = input.role.toUpperCase() as MembershipRole;
    const updated = await database.$transaction(async (transaction) => {
      const now = new Date();
      const updatedMembership = await transaction.membership.update({
        data: { role },
        where: { id: member.id },
      });
      const updatedUser = await transaction.user.update({
        data: { fullName: input.fullName.trim() },
        where: { id: member.userId },
      });
      const activeRules = await transaction.commissionRule.findMany({
        where: {
          isActive: true,
          organizationId: current.organizationId,
          professionalMembershipId: member.id,
          serviceId: null,
          type: 'SERVICE_PERCENTAGE',
        },
      });
      const commissionPercentage =
        role === MembershipRole.BARBER
          ? (input.commissionPercentage ?? null)
          : null;
      const unchangedRule =
        activeRules.length === 1 &&
        activeRules[0]?.value === commissionPercentage;
      if (!unchangedRule && activeRules.length > 0) {
        await transaction.commissionRule.updateMany({
          data: { effectiveTo: now, isActive: false },
          where: { id: { in: activeRules.map(({ id: ruleId }) => ruleId) } },
        });
      }
      if (commissionPercentage !== null && !unchangedRule) {
        await transaction.commissionRule.create({
          data: {
            effectiveFrom: now,
            organizationId: current.organizationId,
            professionalMembershipId: member.id,
            type: 'SERVICE_PERCENTAGE',
            value: commissionPercentage,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'team.member.updated',
          actorUserId: user.id,
          afterData: {
            commissionPercentage,
            fullName: updatedUser.fullName,
            role: input.role,
          },
          beforeData: {
            fullName: member.user.fullName,
            role: member.role.toLowerCase(),
          },
          entityId: member.id,
          entityType: 'membership',
          organizationId: current.organizationId,
        },
      });
      return { membership: updatedMembership, user: updatedUser };
    });
    return {
      member: {
        commissionPercentage:
          role === MembershipRole.BARBER
            ? (input.commissionPercentage ?? null)
            : null,
        id: updated.membership.id,
        role: updated.membership.role.toLowerCase(),
        status: updated.membership.status.toLowerCase(),
        user: {
          email: updated.user.email,
          fullName: updated.user.fullName,
          id: updated.user.id,
        },
      },
    };
  });

  app.delete('/v1/team/members/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'membership.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const member = await database.membership.findFirst({
      include: { user: true },
      where: {
        id,
        organizationId: current.organizationId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new ApiError(
        404,
        'TEAM_MEMBER_NOT_FOUND',
        'El colaborador no existe o ya no está activo.',
      );
    }
    if (member.role === MembershipRole.OWNER || member.id === current.id) {
      throw new ApiError(
        403,
        'TEAM_MEMBER_PROTECTED',
        'No puedes eliminar al propietario ni tu propia membresía.',
      );
    }
    await database.$transaction(async (transaction) => {
      await transaction.membership.update({
        data: { status: MembershipStatus.SUSPENDED },
        where: { id: member.id },
      });
      await transaction.commissionRule.updateMany({
        data: { effectiveTo: new Date(), isActive: false },
        where: {
          isActive: true,
          organizationId: current.organizationId,
          professionalMembershipId: member.id,
        },
      });
      await transaction.teamInvitation.updateMany({
        data: { status: InvitationStatus.REVOKED },
        where: {
          email: member.user.email,
          organizationId: current.organizationId,
          status: InvitationStatus.PENDING,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'team.member.suspended',
          actorUserId: user.id,
          beforeData: {
            email: member.user.email,
            role: member.role.toLowerCase(),
            status: member.status.toLowerCase(),
          },
          entityId: member.id,
          entityType: 'membership',
          organizationId: current.organizationId,
        },
      });
    });
    return reply.code(204).send();
  });

  app.delete('/v1/team/invitations/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'membership.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const invitation = await database.teamInvitation.findFirst({
      where: {
        id,
        organizationId: current.organizationId,
        status: InvitationStatus.PENDING,
      },
    });
    if (!invitation) {
      throw new ApiError(
        404,
        'TEAM_INVITATION_NOT_FOUND',
        'La invitación no existe o ya no está pendiente.',
      );
    }
    await database.$transaction(async (transaction) => {
      await transaction.teamInvitation.update({
        data: { status: InvitationStatus.REVOKED },
        where: { id: invitation.id },
      });
      const invitedMembership = await transaction.membership.findFirst({
        where: {
          organizationId: current.organizationId,
          status: MembershipStatus.INVITED,
          user: { email: invitation.email },
        },
      });
      if (invitedMembership) {
        await transaction.membership.update({
          data: { status: MembershipStatus.SUSPENDED },
          where: { id: invitedMembership.id },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'team.invitation.revoked',
          actorUserId: user.id,
          beforeData: {
            email: invitation.email,
            role: invitation.role.toLowerCase(),
          },
          entityId: invitation.id,
          entityType: 'team_invitation',
          locationId: invitation.locationId,
          organizationId: current.organizationId,
        },
      });
    });
    return reply.code(204).send();
  });

  app.post('/v1/team/invitations', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'membership.manage',
    );
    const input = createTeamInvitationSchema.parse(request.body);
    if (!invitationMailer) {
      throw new ApiError(
        503,
        'INVITATION_EMAIL_NOT_CONFIGURED',
        'Configura el servicio SMTP antes de invitar integrantes.',
      );
    }
    const [location, organization] = await Promise.all([
      requireLocation(database, current.organizationId, input.locationId),
      database.organization.findUniqueOrThrow({
        where: { id: current.organizationId },
      }),
    ]);
    const token = createOpaqueToken();
    const normalizedEmail = input.email.trim().toLowerCase();
    const role = input.role.toUpperCase() as MembershipRole;
    const { invitation, membership } = await database.$transaction(
      async (transaction) => {
        let invitedUser = await transaction.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (!invitedUser) {
          invitedUser = await transaction.user.create({
            data: {
              email: normalizedEmail,
              fullName: input.fullName.trim(),
              passwordHash: null,
            },
          });
        }
        const existingMembership = await transaction.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: current.organizationId,
              userId: invitedUser.id,
            },
          },
        });
        if (existingMembership?.status === MembershipStatus.ACTIVE) {
          throw new ApiError(
            409,
            'TEAM_MEMBER_ALREADY_ACTIVE',
            'Este correo ya pertenece al equipo.',
          );
        }
        const invitedMembership = await transaction.membership.upsert({
          create: {
            organizationId: current.organizationId,
            role,
            status: MembershipStatus.INVITED,
            userId: invitedUser.id,
          },
          update: { role, status: MembershipStatus.INVITED },
          where: {
            organizationId_userId: {
              organizationId: current.organizationId,
              userId: invitedUser.id,
            },
          },
        });
        await transaction.memberLocation.upsert({
          create: {
            locationId: location.id,
            membershipId: invitedMembership.id,
          },
          update: {},
          where: {
            membershipId_locationId: {
              locationId: location.id,
              membershipId: invitedMembership.id,
            },
          },
        });
        await transaction.teamInvitation.updateMany({
          data: { status: InvitationStatus.REVOKED },
          where: {
            email: normalizedEmail,
            organizationId: current.organizationId,
            status: InvitationStatus.PENDING,
          },
        });
        const createdInvitation = await transaction.teamInvitation.create({
          data: {
            commissionPercentage: input.commissionPercentage ?? null,
            email: normalizedEmail,
            expiresAt: new Date(Date.now() + INVITATION_DURATION_MS),
            inviterUserId: user.id,
            locationId: location.id,
            organizationId: current.organizationId,
            role,
            tokenHash: hashOpaqueToken(token),
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'team.invitation.created',
            actorUserId: user.id,
            afterData: {
              email: createdInvitation.email,
              membershipId: invitedMembership.id,
              role: input.role,
            },
            entityId: createdInvitation.id,
            entityType: 'team_invitation',
            locationId: createdInvitation.locationId,
            organizationId: current.organizationId,
          },
        });
        return {
          invitation: createdInvitation,
          membership: invitedMembership,
        };
      },
    );
    const separator = config.MOBILE_INVITATION_URL.includes('?') ? '&' : '?';
    const invitationUrl = `${config.MOBILE_INVITATION_URL}${separator}token=${encodeURIComponent(token)}`;
    try {
      await invitationMailer.send({
        email: invitation.email,
        invitationUrl,
        invitedBy: user.fullName,
        organizationName: organization.name,
      });
    } catch (error) {
      await database.teamInvitation.update({
        data: { status: InvitationStatus.REVOKED },
        where: { id: invitation.id },
      });
      throw error;
    }
    return reply.code(201).send({
      invitation: {
        expiresAt: invitation.expiresAt.toISOString(),
        id: invitation.id,
        status: invitation.status.toLowerCase(),
      },
      member: {
        id: membership.id,
        status: membership.status.toLowerCase(),
      },
    });
  });

  app.post('/v1/team/invitations/accept', async (request) => {
    const { user } = await authenticate(database, request);
    const acceptingUser = await database.user.findUnique({
      select: { emailVerifiedAt: true },
      where: { id: user.id },
    });
    if (!acceptingUser?.emailVerifiedAt) {
      throw new ApiError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verifica tu correo antes de aceptar una invitación.',
      );
    }
    const input = acceptTeamInvitationSchema.parse(request.body);
    const now = new Date();
    const invitation = await database.teamInvitation.findFirst({
      where: {
        email: user.email.toLowerCase(),
        expiresAt: { gt: now },
        status: InvitationStatus.PENDING,
        tokenHash: hashOpaqueToken(input.token),
      },
    });
    if (!invitation) {
      throw new ApiError(
        400,
        'INVALID_INVITATION',
        'La invitación no es válida o ya venció.',
      );
    }
    const membershipInAnotherOrganization = await database.membership.findFirst(
      {
        where: {
          organizationId: { not: invitation.organizationId },
          status: MembershipStatus.ACTIVE,
          userId: user.id,
        },
      },
    );
    if (membershipInAnotherOrganization) {
      throw new ApiError(
        409,
        'MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED',
        'Esta versión permite operar una sola barbería por cuenta.',
      );
    }
    const membership = await database.$transaction(async (transaction) => {
      const claimedInvitation = await transaction.teamInvitation.updateMany({
        data: { acceptedAt: now, status: InvitationStatus.ACCEPTED },
        where: {
          expiresAt: { gt: now },
          id: invitation.id,
          status: InvitationStatus.PENDING,
        },
      });
      if (claimedInvitation.count !== 1) {
        throw new ApiError(
          400,
          'INVALID_INVITATION',
          'La invitación no es válida, ya fue utilizada o venció.',
        );
      }
      const acceptedMembership = await transaction.membership.upsert({
        create: {
          organizationId: invitation.organizationId,
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
          userId: user.id,
        },
        update: { role: invitation.role, status: MembershipStatus.ACTIVE },
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
      });
      await transaction.memberLocation.upsert({
        create: {
          locationId: invitation.locationId,
          membershipId: acceptedMembership.id,
        },
        update: {},
        where: {
          membershipId_locationId: {
            locationId: invitation.locationId,
            membershipId: acceptedMembership.id,
          },
        },
      });
      if (
        invitation.role === MembershipRole.BARBER &&
        invitation.commissionPercentage !== null
      ) {
        await transaction.commissionRule.create({
          data: {
            effectiveFrom: new Date(),
            organizationId: invitation.organizationId,
            professionalMembershipId: acceptedMembership.id,
            type: 'SERVICE_PERCENTAGE',
            value: invitation.commissionPercentage,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'team.invitation.accepted',
          actorUserId: user.id,
          afterData: {
            membershipId: acceptedMembership.id,
            role: invitation.role,
          },
          entityId: acceptedMembership.id,
          entityType: 'membership',
          locationId: invitation.locationId,
          organizationId: invitation.organizationId,
        },
      });
      return acceptedMembership;
    });
    return {
      membership: { id: membership.id, role: membership.role.toLowerCase() },
    };
  });

  app.get('/v1/services', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id, 'service.read');
    const [categories, services] = await Promise.all([
      database.serviceCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        where: { isActive: true, organizationId: current.organizationId },
      }),
      database.service.findMany({
        include: { professionalServices: true },
        orderBy: { name: 'asc' },
        where: { isActive: true, organizationId: current.organizationId },
      }),
    ]);
    return {
      categories,
      services: services.map((service) => ({
        assignments: service.professionalServices.map((assignment) => ({
          locationId: assignment.locationId,
          membershipId: assignment.membershipId,
        })),
        categoryId: service.categoryId,
        description: service.description,
        durationMinutes: service.durationMinutes,
        id: service.id,
        name: service.name,
        onlineBooking: service.onlineBooking,
        priceCents: service.priceCents,
      })),
    };
  });

  app.post('/v1/service-categories', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const input = createServiceCategorySchema.parse(request.body);
    const category = await database.serviceCategory.create({
      data: { ...input, organizationId: current.organizationId },
    });
    await database.auditLog.create({
      data: {
        action: 'service_category.created',
        actorUserId: user.id,
        afterData: input,
        entityId: category.id,
        entityType: 'service_category',
        organizationId: current.organizationId,
      },
    });
    return reply.code(201).send({ category });
  });

  app.post('/v1/services', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const input = createServiceSchema.parse(request.body);
    if (input.categoryId) {
      const category = await database.serviceCategory.findFirst({
        where: { id: input.categoryId, organizationId: current.organizationId },
      });
      if (!category)
        throw new ApiError(
          404,
          'CATEGORY_NOT_FOUND',
          'La categoría no existe.',
        );
    }
    const existing = await database.service.findUnique({
      where: {
        organizationId_name: {
          name: input.name,
          organizationId: current.organizationId,
        },
      },
    });
    if (existing?.isActive) {
      throw new ApiError(
        409,
        'SERVICE_NAME_ALREADY_EXISTS',
        'Ya existe un servicio activo con ese nombre.',
      );
    }
    const service = await database.$transaction(async (transaction) => {
      const record = existing
        ? await transaction.service.update({
            data: {
              categoryId: input.categoryId ?? null,
              description: input.description ?? null,
              durationMinutes: input.durationMinutes,
              isActive: true,
              onlineBooking: input.onlineBooking,
              priceCents: input.priceCents,
            },
            where: { id: existing.id },
          })
        : await transaction.service.create({
            data: {
              categoryId: input.categoryId ?? null,
              description: input.description ?? null,
              durationMinutes: input.durationMinutes,
              name: input.name,
              onlineBooking: input.onlineBooking,
              organizationId: current.organizationId,
              priceCents: input.priceCents,
            },
          });
      await transaction.auditLog.create({
        data: {
          action: existing ? 'service.reactivated' : 'service.created',
          actorUserId: user.id,
          afterData: input,
          ...(existing
            ? {
                beforeData: {
                  isActive: existing.isActive,
                  name: existing.name,
                  onlineBooking: existing.onlineBooking,
                },
              }
            : {}),
          entityId: record.id,
          entityType: 'service',
          organizationId: current.organizationId,
        },
      });
      return record;
    });
    return reply.code(201).send({ service });
  });

  app.patch('/v1/services/:id', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const input = updateServiceSchema.parse(request.body);
    const service = await database.service.findFirst({
      where: { id, isActive: true, organizationId: current.organizationId },
    });
    if (!service) {
      throw new ApiError(404, 'SERVICE_NOT_FOUND', 'El servicio no existe.');
    }
    if (input.categoryId) {
      const category = await database.serviceCategory.findFirst({
        where: {
          id: input.categoryId,
          isActive: true,
          organizationId: current.organizationId,
        },
      });
      if (!category) {
        throw new ApiError(
          404,
          'CATEGORY_NOT_FOUND',
          'La categoría no existe.',
        );
      }
    }
    const duplicate = await database.service.findFirst({
      where: {
        id: { not: service.id },
        name: input.name,
        organizationId: current.organizationId,
      },
    });
    if (duplicate) {
      throw new ApiError(
        409,
        'SERVICE_NAME_ALREADY_EXISTS',
        'Ya existe otro servicio con ese nombre.',
      );
    }
    const updated = await database.$transaction(async (transaction) => {
      const record = await transaction.service.update({
        data: {
          categoryId: input.categoryId ?? null,
          description: input.description ?? null,
          durationMinutes: input.durationMinutes,
          name: input.name,
          onlineBooking: input.onlineBooking,
          priceCents: input.priceCents,
        },
        where: { id: service.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'service.updated',
          actorUserId: user.id,
          afterData: input,
          beforeData: {
            categoryId: service.categoryId,
            description: service.description,
            durationMinutes: service.durationMinutes,
            name: service.name,
            onlineBooking: service.onlineBooking,
            priceCents: service.priceCents,
          },
          entityId: service.id,
          entityType: 'service',
          organizationId: current.organizationId,
        },
      });
      return record;
    });
    return { service: updated };
  });

  app.delete('/v1/services/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const service = await database.service.findFirst({
      where: { id, isActive: true, organizationId: current.organizationId },
    });
    if (!service) {
      throw new ApiError(404, 'SERVICE_NOT_FOUND', 'El servicio no existe.');
    }
    await database.$transaction(async (transaction) => {
      await transaction.professionalService.deleteMany({
        where: { serviceId: service.id },
      });
      await transaction.service.update({
        data: { isActive: false, onlineBooking: false },
        where: { id: service.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'service.archived',
          actorUserId: user.id,
          beforeData: {
            isActive: service.isActive,
            name: service.name,
            onlineBooking: service.onlineBooking,
          },
          entityId: service.id,
          entityType: 'service',
          organizationId: current.organizationId,
        },
      });
    });
    return reply.code(204).send();
  });

  app.post('/v1/services/assignments', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const input = assignProfessionalServiceSchema.parse(request.body);
    await requireLocation(database, current.organizationId, input.locationId);
    await requireProfessional(
      database,
      current.organizationId,
      input.membershipId,
    );
    const service = await database.service.findFirst({
      where: {
        id: input.serviceId,
        isActive: true,
        organizationId: current.organizationId,
      },
    });
    if (!service)
      throw new ApiError(404, 'SERVICE_NOT_FOUND', 'El servicio no existe.');
    const memberLocation = await database.memberLocation.findUnique({
      where: {
        membershipId_locationId: {
          locationId: input.locationId,
          membershipId: input.membershipId,
        },
      },
    });
    if (!memberLocation)
      throw new ApiError(
        400,
        'PROFESSIONAL_LOCATION_REQUIRED',
        'El profesional no pertenece a la sucursal.',
      );
    const assignment = await database.professionalService.upsert({
      create: {
        customDurationMinutes: input.customDurationMinutes ?? null,
        customPriceCents: input.customPriceCents ?? null,
        locationId: input.locationId,
        membershipId: input.membershipId,
        serviceId: input.serviceId,
      },
      update: {
        customDurationMinutes: input.customDurationMinutes ?? null,
        customPriceCents: input.customPriceCents ?? null,
      },
      where: {
        membershipId_serviceId_locationId: {
          locationId: input.locationId,
          membershipId: input.membershipId,
          serviceId: input.serviceId,
        },
      },
    });
    await database.auditLog.create({
      data: {
        action: 'professional_service.assigned',
        actorUserId: user.id,
        afterData: input,
        entityId: input.serviceId,
        entityType: 'professional_service',
        locationId: input.locationId,
        organizationId: current.organizationId,
      },
    });
    return reply.code(201).send({ assignment });
  });

  app.get('/v1/schedules', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id, 'schedule.read');
    const ownOnly = current.role === MembershipRole.BARBER;
    const [schedules, blocks] = await Promise.all([
      database.weeklySchedule.findMany({
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        where: {
          membership: { organizationId: current.organizationId },
          ...(ownOnly ? { membershipId: current.id } : {}),
        },
      }),
      database.scheduleBlock.findMany({
        orderBy: { startsAt: 'asc' },
        where: {
          endsAt: { gt: new Date() },
          organizationId: current.organizationId,
          ...(ownOnly ? { membershipId: current.id } : {}),
        },
      }),
    ]);
    return { blocks, schedules };
  });

  app.put('/v1/schedules', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'schedule.manage',
    );
    const input = replaceWeeklySchedulesSchema.parse(request.body);
    assertNoScheduleOverlaps(input.schedules);
    await requireLocation(database, current.organizationId, input.locationId);
    await requireProfessional(
      database,
      current.organizationId,
      input.membershipId,
    );
    const memberLocation = await database.memberLocation.findUnique({
      where: {
        membershipId_locationId: {
          locationId: input.locationId,
          membershipId: input.membershipId,
        },
      },
    });
    if (!memberLocation)
      throw new ApiError(
        400,
        'PROFESSIONAL_LOCATION_REQUIRED',
        'El profesional no pertenece a la sucursal.',
      );
    await database.$transaction(async (transaction) => {
      await transaction.weeklySchedule.deleteMany({
        where: {
          locationId: input.locationId,
          membershipId: input.membershipId,
        },
      });
      if (input.schedules.length > 0) {
        await transaction.weeklySchedule.createMany({
          data: input.schedules.map((schedule) => ({
            ...schedule,
            locationId: input.locationId,
            membershipId: input.membershipId,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'weekly_schedule.replaced',
          actorUserId: user.id,
          afterData: input.schedules,
          entityId: input.membershipId,
          entityType: 'weekly_schedule',
          locationId: input.locationId,
          organizationId: current.organizationId,
        },
      });
    });
    return { schedules: input.schedules };
  });

  app.post('/v1/schedule-blocks', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'schedule.manage',
    );
    const input = createScheduleBlockSchema.parse(request.body);
    await requireLocation(database, current.organizationId, input.locationId);
    await requireProfessional(
      database,
      current.organizationId,
      input.membershipId,
    );
    const block = await database.scheduleBlock.create({
      data: {
        endsAt: new Date(input.endsAt),
        locationId: input.locationId,
        membershipId: input.membershipId,
        organizationId: current.organizationId,
        reason: input.reason ?? null,
        startsAt: new Date(input.startsAt),
      },
    });
    await database.auditLog.create({
      data: {
        action: 'schedule_block.created',
        actorUserId: user.id,
        afterData: input,
        entityId: block.id,
        entityType: 'schedule_block',
        locationId: input.locationId,
        organizationId: current.organizationId,
      },
    });
    return reply.code(201).send({ block });
  });
}
