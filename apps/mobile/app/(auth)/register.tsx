import { useLocalSearchParams } from 'expo-router';

import { RegistrationFlow } from '../../src/components/RegistrationFlow';

export default function RegisterScreen() {
  const { invitationToken } = useLocalSearchParams<{
    invitationToken?: string;
  }>();

  return <RegistrationFlow invitationToken={invitationToken ?? undefined} />;
}
