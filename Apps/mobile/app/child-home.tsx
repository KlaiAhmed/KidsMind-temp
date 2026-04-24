import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ChildHomeRoute() {
  const params = useLocalSearchParams<{ childId?: string }>();
  const childId = typeof params.childId === 'string' ? params.childId.trim() : '';

  if (childId) {
    return <Redirect href={`/(child-tabs)?childId=${encodeURIComponent(childId)}` as never} />;
  }

  return <Redirect href="/(child-tabs)" />;
}