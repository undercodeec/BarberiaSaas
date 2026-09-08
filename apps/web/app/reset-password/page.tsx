import { Suspense } from 'react';

import { ResetPasswordLauncher } from './ResetPasswordLauncher';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordLauncher />
    </Suspense>
  );
}
