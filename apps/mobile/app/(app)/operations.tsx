import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacyOperationsRedirect() {
  const params = useLocalSearchParams<{
    readonly section?: string | string[];
  }>();
  const section = Array.isArray(params.section)
    ? params.section[0]
    : params.section;

  if (section === 'team') return <Redirect href="/team-management" />;
  if (section === 'services') return <Redirect href="/service-management" />;
  return <Redirect href="/dashboard" />;
}
