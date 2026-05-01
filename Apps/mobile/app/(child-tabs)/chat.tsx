import { SwipeableTabScreen } from '@/src/components/navigation/SwipeableTabScreen';
import AIChatScreen from '@/screens/AIChatScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useChildSessionGate } from '@/hooks/useChildSessionGate';

export default function ChildQubieTabRoute() {
  const { childProfile } = useAuth();
  const { gateState } = useChildSessionGate(childProfile?.id ?? null, {
    weekSchedule: childProfile?.rules?.weekSchedule ?? null,
    todayUsageSeconds: childProfile?.todayUsageSeconds,
    timeZone: childProfile?.timezone ?? null,
  });

  return (
    <SwipeableTabScreen space="child" disabled={gateState.status !== 'ACTIVE'}>
      <AIChatScreen />
    </SwipeableTabScreen>
  );
}
