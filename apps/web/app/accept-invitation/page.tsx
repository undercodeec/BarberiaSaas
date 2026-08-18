import { Suspense } from 'react';

import { InvitationLauncher } from './InvitationLauncher';

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <InvitationLauncher />
    </Suspense>
  );
}
