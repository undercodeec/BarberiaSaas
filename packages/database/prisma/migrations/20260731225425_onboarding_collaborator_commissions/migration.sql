-- AlterTable
ALTER TABLE "onboarding_collaborators" ADD COLUMN     "commission_percentage" SMALLINT,
ADD COLUMN     "invitation_email" VARCHAR(254);

-- Retain the commission selected when a professional is invited. It becomes
-- a CommissionRule only after the invitation is accepted.
ALTER TABLE "team_invitations" ADD COLUMN "commission_percentage" SMALLINT;
