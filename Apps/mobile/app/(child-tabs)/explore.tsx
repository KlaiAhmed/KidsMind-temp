import { SwipeableTabScreen } from '@/src/components/navigation/SwipeableTabScreen';
import SubjectTopicBrowser from '@/screens/SubjectTopicBrowser';
import { useAuth } from '@/contexts/AuthContext';
import { useChildSessionGate } from '@/hooks/useChildSessionGate';

export default function ChildLearnTabRoute() {
  const { childProfile } = useAuth();
  const { gateState } = useChildSessionGate(childProfile?.id ?? null, {
    weekSchedule: childProfile?.rules?.weekSchedule ?? null,
    todayUsageSeconds: childProfile?.todayUsageSeconds,
    timeZone: childProfile?.timezone ?? null,
  });

  return (
    <SwipeableTabScreen space="child" disabled={gateState.status !== 'ACTIVE'}>
      <SubjectTopicBrowser />
    </SwipeableTabScreen>
  );
}
