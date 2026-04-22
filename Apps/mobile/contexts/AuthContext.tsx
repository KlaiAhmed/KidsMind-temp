import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearRefreshToken, getRefreshToken, saveRefreshToken } from '@/auth/tokenStorage';
import type {
  AuthState as SessionAuthState,
  AuthTokenResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '@/auth/types';
import { Colors } from '@/constants/theme';
import { ApiClientError, configureApiClientAuthHandlers } from '@/services/apiClient';
import {
  getCurrentUserSummary,
  login as loginRequest,
  logout as logoutRequest,
  refreshToken as refreshTokenRequest,
  register as registerRequest,
} from '@/services/authApi';
import {
  createChildProfile,
  listChildProfiles,
  patchChildProfile,
} from '@/services/childService';
import { useAuthStore } from '@/store/authStore';
import type {
  AvatarOption,
  ChildProfile,
  CreateChildProfileInput,
  RecentActivity,
  Subject,
  Topic,
} from '@/types/child';

// ─── Types ────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  fullName?: string;
  pinConfigured: boolean;
}

export type LoginFormValues = LoginRequest;

export type RegisterFormValues = RegisterRequest;

interface ChildState {
  childProfile: ChildProfile | null;
  childDataLoading: boolean;
  childDataError: string | null;
  subjects: Subject[];
  topics: Topic[];
  avatars: AvatarOption[];
  recentActivity: RecentActivity[];
}

interface AuthContextValue extends SessionAuthState, ChildState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (values: LoginFormValues) => Promise<void>;
  register: (values: RegisterFormValues) => Promise<void>;
  logout: () => Promise<void>;
  setAuthenticated: (payload: AuthTokenResponse) => void;
  setUnauthenticated: () => void;
  setLoading: (isLoading: boolean) => void;
  clearError: () => void;
  markPinConfigured: () => void;
  saveChildProfile: (input: CreateChildProfileInput) => Promise<ChildProfile>;
  updateChildProfile: (updates: Partial<Omit<ChildProfile, 'id'>>) => void;
  refreshChildData: () => Promise<void>;
  markSubjectAccess: (subjectId: string) => void;
  completeTopic: (topicId: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}


function buildLevelProgress(xp: number): { level: number; xpToNextLevel: number } {
  const normalizedXp = Math.max(0, Math.floor(xp));
  const level = Math.floor(normalizedXp / 100) + 1;

  return {
    level,
    xpToNextLevel: level * 100,
  };
}

const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'avatar-1', label: 'Brainy Buddy', asset: require('../assets/images/icon.png') },
  {
    id: 'avatar-2',
    label: 'Spark Rocket',
    asset: require('../assets/images/android-icon-foreground.png'),
  },
  {
    id: 'avatar-3',
    label: 'Moon Explorer',
    asset: require('../assets/images/android-icon-monochrome.png'),
  },
  {
    id: 'avatar-4',
    label: 'Star Dreamer',
    asset: require('../assets/images/splash-icon.png'),
  },
  {
    id: 'avatar-5',
    label: 'Sky Builder',
    asset: require('../assets/images/android-icon-background.png'),
  },
  {
    id: 'avatar-6',
    label: 'Logic Llama',
    asset: require('../assets/images/react-logo.png'),
  },
  {
    id: 'avatar-7',
    label: 'Code Comet',
    asset: require('../assets/images/partial-react-logo.png'),
  },
  {
    id: 'avatar-8',
    label: 'Pixel Panda',
    asset: require('../assets/images/react-logo.png'),
  },
  {
    id: 'avatar-9',
    label: 'Nova Ninja',
    asset: require('../assets/images/react-logo.png'),
  },
];

const TOPIC_SEED: Topic[] = [
  {
    id: 'topic-math-1',
    subjectId: 'math',
    title: 'Count to 100 with Rockets',
    duration: 12,
    isCompleted: true,
    completedAt: hoursAgo(5),
    thumbnailAsset: require('../assets/images/icon.png'),
    difficulty: 'easy',
    description: 'Practice counting using fun launch patterns.',
  },
  {
    id: 'topic-math-2',
    subjectId: 'math',
    title: 'Quick Addition Quest',
    duration: 10,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/react-logo.png'),
    difficulty: 'medium',
    description: 'Find the missing number to complete each mission.',
  },
  {
    id: 'topic-reading-1',
    subjectId: 'reading',
    title: 'Story Detectives: Clues & Characters',
    duration: 14,
    isCompleted: true,
    completedAt: hoursAgo(20),
    thumbnailAsset: require('../assets/images/splash-icon.png'),
    difficulty: 'medium',
    description: 'Read short stories and discover hidden clues.',
  },
  {
    id: 'topic-reading-2',
    subjectId: 'reading',
    title: 'Build New Words',
    duration: 9,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/partial-react-logo.png'),
    difficulty: 'easy',
    description: 'Combine letters and sounds to create words.',
  },
  {
    id: 'topic-science-1',
    subjectId: 'science',
    title: 'Plant Power Lab',
    duration: 11,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/android-icon-background.png'),
    difficulty: 'easy',
    description: 'Learn how plants grow through playful experiments.',
  },
  {
    id: 'topic-science-2',
    subjectId: 'science',
    title: 'Weather Wizards',
    duration: 13,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/android-icon-monochrome.png'),
    difficulty: 'medium',
    description: 'Explore clouds, rain, and sunshine patterns.',
  },
  {
    id: 'topic-art-1',
    subjectId: 'art',
    title: 'Color Mixing Jam',
    duration: 8,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/android-icon-foreground.png'),
    difficulty: 'easy',
    description: 'Create playful palettes using primary colors.',
  },
  {
    id: 'topic-art-2',
    subjectId: 'art',
    title: 'Shape Adventure Collage',
    duration: 10,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/react-logo.png'),
    difficulty: 'easy',
    description: 'Build creative scenes with circles, stars, and triangles.',
  },
];

function buildSubjects(topics: Topic[]): Subject[] {
  const subjectMap: Subject[] = [
    {
      id: 'math',
      title: 'Math',
      iconAsset: require('../assets/images/icon.png'),
      color: Colors.primary,
      progressPercent: 0,
      topicCount: 0,
      lastAccessedAt: hoursAgo(3),
      description: 'Numbers, puzzles, and pattern adventures.',
    },
    {
      id: 'reading',
      title: 'Reading',
      iconAsset: require('../assets/images/splash-icon.png'),
      color: Colors.secondaryContainer,
      progressPercent: 0,
      topicCount: 0,
      lastAccessedAt: hoursAgo(6),
      description: 'Stories, vocabulary, and comprehension quests.',
    },
    {
      id: 'science',
      title: 'Science',
      iconAsset: require('../assets/images/android-icon-background.png'),
      color: Colors.accentAmber,
      progressPercent: 0,
      topicCount: 0,
      lastAccessedAt: hoursAgo(18),
      description: 'Discover the world through experiments and wonder.',
    },
    {
      id: 'art',
      title: 'Art',
      iconAsset: require('../assets/images/android-icon-foreground.png'),
      color: Colors.tertiary,
      progressPercent: 0,
      topicCount: 0,
      lastAccessedAt: hoursAgo(26),
      description: 'Draw, color, and design playful creations.',
    },
  ];

  return subjectMap.map((subject) => {
    const subjectTopics = topics.filter((topic) => topic.subjectId === subject.id);
    const completedCount = subjectTopics.filter((topic) => topic.isCompleted).length;
    const progressPercent = subjectTopics.length
      ? Math.round((completedCount / subjectTopics.length) * 100)
      : 0;

    return {
      ...subject,
      topicCount: subjectTopics.length,
      progressPercent,
    };
  });
}

function buildRecentActivity(topics: Topic[]): RecentActivity[] {
  return topics
    .filter((topic) => topic.isCompleted && topic.completedAt)
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())
    .map((topic) => ({
      id: `activity-${topic.id}`,
      topicId: topic.id,
      subjectId: topic.subjectId,
      title: topic.title,
      completedAt: topic.completedAt ?? minutesAgo(30),
      thumbnailAsset: topic.thumbnailAsset,
    }));
}

function toUser(authUser: AuthUser): User {
  return {
    id: authUser.id,
    email: authUser.email,
    fullName: authUser.fullName,
    pinConfigured: Boolean(authUser.pin_configured),
  };
}

export function toApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.message.trim().length > 0) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const seededTopics = TOPIC_SEED;
  const seededSubjects = buildSubjects(seededTopics);

  const queryClient = useQueryClient();

  const {
    isLoading,
    isAuthenticated,
    accessToken,
    user: sessionUser,
    authError,
    setLoading: setStoreLoading,
    setAuthError,
    setAuthenticatedFromTokenResponse,
    setUser,
    clearAuth,
  } = useAuthStore();

  const [childState, setChildState] = useState<ChildState>({
    childProfile: null,
    childDataLoading: false,
    childDataError: null,
    subjects: seededSubjects,
    topics: seededTopics,
    avatars: AVATAR_OPTIONS,
    recentActivity: buildRecentActivity(seededTopics),
  });

  const setLoading = useCallback((nextLoading: boolean) => {
    setStoreLoading(nextLoading);
  }, [setStoreLoading]);

  const setAuthenticated = useCallback((payload: AuthTokenResponse) => {
    setAuthenticatedFromTokenResponse(payload);
  }, [setAuthenticatedFromTokenResponse]);

  const setUnauthenticated = useCallback(() => {
    clearAuth();
    setChildState((current) => ({
      ...current,
      childProfile: null,
      childDataError: null,
    }));
  }, [clearAuth]);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, [setAuthError]);

  const pinConfiguredFromLocal = useRef(false);

  const markPinConfigured = useCallback(() => {
    if (!sessionUser) {
      return;
    }

    pinConfiguredFromLocal.current = true;
    setUser({
      ...sessionUser,
      pin_configured: true,
    });
  }, [sessionUser, setUser]);

  const refreshMutation = useMutation({
    mutationFn: refreshTokenRequest,
  });

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const storedRefreshToken = await getRefreshToken();

    if (!storedRefreshToken) {
      await clearRefreshToken();
      setUnauthenticated();
      return null;
    }

    try {
      const refreshed = await refreshMutation.mutateAsync({ refreshToken: storedRefreshToken });
      await saveRefreshToken(refreshed.refresh_token);
      setAuthenticated(refreshed);
      return refreshed.access_token;
    } catch (error) {
      await clearRefreshToken();
      setUnauthenticated();
      setAuthError(toApiErrorMessage(error));
      return null;
    }
  }, [refreshMutation, setAuthenticated, setAuthError, setUnauthenticated]);

  const accessTokenRef = useRef<string | null>(accessToken);
  const refreshAccessTokenRef = useRef<(() => Promise<string | null>) | null>(refreshAccessToken);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    refreshAccessTokenRef.current = refreshAccessToken;
  }, [refreshAccessToken]);

  useEffect(() => {
    configureApiClientAuthHandlers({
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken: () => refreshAccessTokenRef.current?.() ?? Promise.resolve(null),
    });

    return () => {
      configureApiClientAuthHandlers(null);
    };
  }, []);

  const bootstrapSessionQuery = useQuery({
    queryKey: ['auth', 'bootstrap-session'],
    queryFn: async (): Promise<AuthTokenResponse | null> => {
      const storedRefreshToken = await getRefreshToken();

      if (!storedRefreshToken) {
        return null;
      }

      const refreshed = await refreshTokenRequest({ refreshToken: storedRefreshToken });
      await saveRefreshToken(refreshed.refresh_token);

      return refreshed;
    },
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    setLoading(bootstrapSessionQuery.isPending);
  }, [bootstrapSessionQuery.isPending, setLoading]);

  useEffect(() => {
    if (!bootstrapSessionQuery.isSuccess) {
      return;
    }

    if (bootstrapSessionQuery.data) {
      setAuthenticated(bootstrapSessionQuery.data);
      setAuthError(null);
      return;
    }

    setUnauthenticated();
  }, [
    bootstrapSessionQuery.data,
    bootstrapSessionQuery.isSuccess,
    setAuthenticated,
    setAuthError,
    setUnauthenticated,
  ]);

  useEffect(() => {
    if (!bootstrapSessionQuery.isError) {
      return;
    }

    void clearRefreshToken();
    setUnauthenticated();
    setAuthError(toApiErrorMessage(bootstrapSessionQuery.error));
  }, [bootstrapSessionQuery.error, bootstrapSessionQuery.isError, setAuthError, setUnauthenticated]);

  const currentUserSummaryQuery = useQuery({
    queryKey: ['auth', 'current-user-summary', accessToken],
    queryFn: getCurrentUserSummary,
    enabled: isAuthenticated && Boolean(accessToken),
  });

  useEffect(() => {
    if (!currentUserSummaryQuery.data) {
      return;
    }

    if (pinConfiguredFromLocal.current) {
      pinConfiguredFromLocal.current = false;
      return;
    }

    const nextPinConfigured = currentUserSummaryQuery.data.pin_configured;
    if (sessionUser && sessionUser.pin_configured === nextPinConfigured) {
      return;
    }

    setUser(
      sessionUser
        ? {
            ...sessionUser,
            pin_configured: nextPinConfigured,
          }
        : {
            id: currentUserSummaryQuery.data.id,
            email: currentUserSummaryQuery.data.email,
            pin_configured: nextPinConfigured,
          }
    );
  }, [currentUserSummaryQuery.data, sessionUser, setUser]);

  useEffect(() => {
    if (!currentUserSummaryQuery.isError) {
      return;
    }

    setAuthError(toApiErrorMessage(currentUserSummaryQuery.error));
  }, [currentUserSummaryQuery.error, currentUserSummaryQuery.isError, setAuthError]);

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: async (authPayload) => {
      await saveRefreshToken(authPayload.refresh_token);
      setAuthenticated(authPayload);
      setAuthError(null);
      void queryClient.invalidateQueries({ queryKey: ['auth', 'current-user-summary'] });
    },
    onError: (error) => {
      setAuthError(toApiErrorMessage(error));
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: async (authPayload) => {
      await saveRefreshToken(authPayload.refresh_token);
      setAuthenticated(authPayload);
      setAuthError(null);
      void queryClient.invalidateQueries({ queryKey: ['auth', 'current-user-summary'] });
    },
    onError: (error) => {
      setAuthError(toApiErrorMessage(error));
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const storedRefreshToken = await getRefreshToken();
      if (!storedRefreshToken) {
        return;
      }

      await logoutRequest({ refreshToken: storedRefreshToken });
    },
    onSettled: async () => {
      await clearRefreshToken();
      setUnauthenticated();
      queryClient.removeQueries({ queryKey: ['auth'] });
    },
  });

  const login = useCallback(async (values: LoginFormValues) => {
    clearError();
    await loginMutation.mutateAsync(values).catch(() => undefined);
  }, [clearError, loginMutation]);

  const register = useCallback(async (values: RegisterFormValues) => {
    clearError();
    await registerMutation.mutateAsync(values).catch(() => undefined);
  }, [clearError, registerMutation]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync().catch(() => undefined);
  }, [logoutMutation]);

  const loading = loginMutation.isPending || registerMutation.isPending;
  const error = authError;

  const saveChildProfile = useCallback(async (input: CreateChildProfileInput) => {
    try {
      const profile = childState.childProfile?.id
        ? await patchChildProfile(childState.childProfile.id, input)
        : await createChildProfile(input);

      setChildState((current) => ({
        ...current,
        childProfile: profile,
        childDataError: null,
      }));
      return profile;
    } catch (err) {
      const message = toApiErrorMessage(err);
      setChildState((current) => ({
        ...current,
        childDataError: message,
      }));
      throw err;
    }
  }, [childState.childProfile?.id]);

  const updateChildProfile = useCallback((updates: Partial<Omit<ChildProfile, 'id'>>) => {
    setChildState((current) => {
      if (!current.childProfile) {
        return current;
      }

      return {
        ...current,
        childProfile: {
          ...current.childProfile,
          ...updates,
        },
      };
    });
  }, []);

  const refreshChildData = useCallback(async () => {
    setChildState((current) => ({
      ...current,
      childDataLoading: true,
      childDataError: null,
    }));

    try {
      const profiles = await listChildProfiles();
      setChildState((current) => ({
        ...current,
        childProfile: profiles.length > 0 ? profiles[0] : current.childProfile,
        childDataLoading: false,
        childDataError: null,
      }));
    } catch {
      setChildState((current) => ({
        ...current,
        childDataLoading: false,
        childDataError: 'Unable to refresh progress right now.',
      }));
    }
  }, []);

  const markSubjectAccess = useCallback((subjectId: string) => {
    setChildState((current) => ({
      ...current,
      subjects: current.subjects.map((subject) =>
        subject.id === subjectId
          ? {
              ...subject,
              lastAccessedAt: new Date().toISOString(),
            }
          : subject
      ),
    }));
  }, []);

  const completeTopic = useCallback((topicId: string) => {
    setChildState((current) => {
      const targetTopic = current.topics.find((topic) => topic.id === topicId);
      if (!targetTopic || targetTopic.isCompleted) {
        return current;
      }

      const completedAt = new Date().toISOString();
      const updatedTopics = current.topics.map((topic) =>
        topic.id === topicId
          ? {
              ...topic,
              isCompleted: true,
              completedAt,
            }
          : topic
      );

      const updatedSubjects = buildSubjects(updatedTopics).map((subject) => {
        const existing = current.subjects.find((existingSubject) => existingSubject.id === subject.id);
        if (!existing) {
          return subject;
        }

        return {
          ...subject,
          lastAccessedAt: subject.id === targetTopic.subjectId ? completedAt : existing.lastAccessedAt,
        };
      });

      const nextActivity: RecentActivity = {
        id: `activity-${topicId}-${Date.now()}`,
        topicId,
        subjectId: targetTopic.subjectId,
        title: targetTopic.title,
        completedAt,
        thumbnailAsset: targetTopic.thumbnailAsset,
      };

      const updatedChildProfile = current.childProfile
        ? {
            ...current.childProfile,
            dailyCompletedMinutes:
              current.childProfile.dailyCompletedMinutes + targetTopic.duration,
            xp: current.childProfile.xp + 25,
            ...buildLevelProgress(current.childProfile.xp + 25),
            totalExercisesCompleted: current.childProfile.totalExercisesCompleted + 1,
            totalSubjectsExplored: current.childProfile.subjectIds.length,
            totalBadgesEarned: Math.max(
              current.childProfile.totalBadgesEarned,
              Math.floor((current.childProfile.totalExercisesCompleted + 1) / 2)
            ),
          }
        : current.childProfile;

      return {
        ...current,
        topics: updatedTopics,
        subjects: updatedSubjects,
        childProfile: updatedChildProfile,
        recentActivity: [nextActivity, ...current.recentActivity].slice(0, 10),
      };
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        accessToken,
        user: sessionUser ? toUser(sessionUser) : null,
        loading,
        error,
        ...childState,
        login,
        register,
        logout,
        setAuthenticated,
        setUnauthenticated,
        setLoading,
        clearError,
        markPinConfigured,
        saveChildProfile,
        updateChildProfile,
        refreshChildData,
        markSubjectAccess,
        completeTopic,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
