import { useEffect, useMemo } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useChildProfile } from '@/hooks/useChildProfile';
import { getChildAvatarMap } from '@/services/parentDashboardService';
import type { ChildProfile } from '@/types/child';

export function useParentDashboardChild(routeChildId?: string) {
  const { childProfiles, childProfile, selectedChildId, selectChild } = useAuth();
  const { getAvatarById } = useChildProfile();

  useEffect(() => {
    if (routeChildId && routeChildId !== selectedChildId) {
      selectChild(routeChildId);
    }
  }, [routeChildId, selectChild, selectedChildId]);

  const avatarQuery = useQuery({
    queryKey: ['parent-dashboard', 'avatar-map', childProfiles.map((child) => `${child.id}:${child.avatarId ?? ''}`).join('|')],
    queryFn: async () => getChildAvatarMap(childProfiles),
    enabled: childProfiles.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const activeChild = useMemo(() => {
    if (routeChildId) {
      return childProfiles.find((child) => child.id === routeChildId) ?? childProfile;
    }

    return childProfile;
  }, [childProfile, childProfiles, routeChildId]);

  function getChildAvatarSource(child: ChildProfile): ImageSourcePropType {
    const remoteUri = avatarQuery.data?.[child.id];
    if (remoteUri) {
      return { uri: remoteUri };
    }

    return getAvatarById(child.avatarId).asset;
  }

  return {
    children: childProfiles,
    activeChild,
    selectedChildId,
    selectChild,
    getChildAvatarSource,
    avatarMapLoading: avatarQuery.isPending,
  };
}
