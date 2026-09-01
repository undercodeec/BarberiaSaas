import type { GuideId } from './guide-types';

export function shouldStartDashboardTour({
  activeGuideId,
  canAccessFinancialReports,
  firstStepsVisible,
  hasBlockingOverlay,
}: {
  readonly activeGuideId: GuideId | null;
  readonly canAccessFinancialReports: boolean;
  readonly firstStepsVisible: boolean;
  readonly hasBlockingOverlay: boolean;
}) {
  return (
    activeGuideId === null &&
    canAccessFinancialReports &&
    firstStepsVisible &&
    !hasBlockingOverlay
  );
}
