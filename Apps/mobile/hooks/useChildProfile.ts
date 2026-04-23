import { useAuth } from '@/contexts/AuthContext';
import { getChildProfile } from '@/services/childService';
import type { AvatarOption } from '@/types/child';

const DEFAULT_AVATAR_ID = 'avatar-1';

export function useChildProfile() {
  const {
    childProfile,
    childProfileStatus,
    avatars,
    childDataLoading,
    childDataError,
    saveChildProfile,
    updateChildProfile,
    refreshChildData,
  } = useAuth();

  const hasCompletedProfile = childProfileStatus === 'exists';

  function getAvatarById(avatarId: string): AvatarOption {
    return avatars.find((avatar) => avatar.id === avatarId) ?? avatars[0];
  }

  const defaultAvatarId = avatars[0]?.id ?? DEFAULT_AVATAR_ID;

  async function refreshProfileFromApi(): Promise<void> {
    if (!childProfile?.id) {
      return;
    }

    try {
      const serverProfile = await getChildProfile(childProfile.id);
      const { id: _id, ...updates } = serverProfile;
      updateChildProfile(updates);
    } catch {
      await refreshChildData();
    }
  }

  return {
    profile: childProfile,
    avatars,
    defaultAvatarId,
    hasCompletedProfile,
    isLoading: childDataLoading,
    error: childDataError,
    getAvatarById,
    refreshProfileFromApi,
    updateProfile: updateChildProfile,
    refreshChildData,
    saveChildProfile,
  };
}
