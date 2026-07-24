import { useLocalSearchParams } from 'expo-router';

import { LoginFullScreen } from '../../src/components/LoginFullScreen';

export default function LoginScreen() {
  const { invitationToken } = useLocalSearchParams<{
    invitationToken?: string;
  }>();

  return <LoginFullScreen invitationToken={invitationToken ?? undefined} />;
}
