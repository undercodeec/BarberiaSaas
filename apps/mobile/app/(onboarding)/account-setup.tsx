import { Redirect, useRouter } from 'expo-router';

import { AccountSetupWelcomeScreen } from '../../src/components/AccountSetupWelcomeScreen';
import { useAuth } from '../../src/providers/AuthProvider';

export default function AccountSetupScreen() {
  const router = useRouter();
  const { session, user } = useAuth();

  if (!session || !user) return <Redirect href="/(auth)/login" />;

  return (
    <AccountSetupWelcomeScreen
      fullName={user.fullName}
      onContinue={() => router.push('/(onboarding)/organization')}
    />
  );
}
