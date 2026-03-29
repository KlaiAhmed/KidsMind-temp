const PARENT_PROFILE_ACCESS_KEY = 'km_parent_profile_access_granted_at';
const PARENT_PROFILE_ACCESS_TTL_MS = 15 * 60 * 1000;

const getNow = (): number => Date.now();

const isTimestampFresh = (timestamp: number): boolean => {
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return getNow() - timestamp <= PARENT_PROFILE_ACCESS_TTL_MS;
};

const grantParentProfileAccess = (): void => {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PARENT_PROFILE_ACCESS_KEY, String(getNow()));
};

const hasParentProfileAccess = (): boolean => {
  if (typeof window === 'undefined') return false;

  const rawTimestamp = sessionStorage.getItem(PARENT_PROFILE_ACCESS_KEY);
  if (!rawTimestamp) return false;

  const timestamp = Number(rawTimestamp);
  const hasAccess = isTimestampFresh(timestamp);

  if (!hasAccess) {
    sessionStorage.removeItem(PARENT_PROFILE_ACCESS_KEY);
  }

  return hasAccess;
};

const clearParentProfileAccess = (): void => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PARENT_PROFILE_ACCESS_KEY);
};

export {
  grantParentProfileAccess,
  hasParentProfileAccess,
  clearParentProfileAccess,
};
