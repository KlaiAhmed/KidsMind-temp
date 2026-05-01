import { SwipeableTabScreen } from '@/src/components/navigation/SwipeableTabScreen';
import { ParentOverviewScreen } from '@/src/screens/parent';
import { useAuth } from '@/contexts/AuthContext';

const PARENT_LOCKED_INDICES = [1, 2, 3];

export default function HomeScreen() {
  const { childProfileStatus } = useAuth();

  return (
    <SwipeableTabScreen
      space="parent"
      lockedIndices={childProfileStatus === 'missing' ? PARENT_LOCKED_INDICES : undefined}
    >
      <ParentOverviewScreen />
    </SwipeableTabScreen>
  );
}
