import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { Colors } from '@/constants/theme';
import type {
  AvatarOption,
  ChildProfile,
  RecentActivity,
  Subject,
  Topic,
} from '@/types/child';

// ─── Types ────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  fullName: string;
}

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface RegisterFormValues {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface SaveChildProfileInput {
  id?: string;
  name: string;
  age: number;
  avatarId: string;
  subjectIds: string[];
  streakDays: number;
  dailyGoalMinutes: number;
  dailyCompletedMinutes: number;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  childProfile: ChildProfile | null;
  childDataLoading: boolean;
  childDataError: string | null;
  subjects: Subject[];
  topics: Topic[];
  avatars: AvatarOption[];
  recentActivity: RecentActivity[];
}

interface AuthContextValue extends AuthState {
  login: (values: LoginFormValues) => Promise<void>;
  register: (values: RegisterFormValues) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  saveChildProfile: (profile: SaveChildProfileInput) => void;
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
    subjectId: 'subject-math',
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
    subjectId: 'subject-math',
    title: 'Quick Addition Quest',
    duration: 10,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/react-logo.png'),
    difficulty: 'medium',
    description: 'Find the missing number to complete each mission.',
  },
  {
    id: 'topic-reading-1',
    subjectId: 'subject-reading',
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
    subjectId: 'subject-reading',
    title: 'Build New Words',
    duration: 9,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/partial-react-logo.png'),
    difficulty: 'easy',
    description: 'Combine letters and sounds to create words.',
  },
  {
    id: 'topic-science-1',
    subjectId: 'subject-science',
    title: 'Plant Power Lab',
    duration: 11,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/android-icon-background.png'),
    difficulty: 'easy',
    description: 'Learn how plants grow through playful experiments.',
  },
  {
    id: 'topic-science-2',
    subjectId: 'subject-science',
    title: 'Weather Wizards',
    duration: 13,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/android-icon-monochrome.png'),
    difficulty: 'medium',
    description: 'Explore clouds, rain, and sunshine patterns.',
  },
  {
    id: 'topic-art-1',
    subjectId: 'subject-art',
    title: 'Color Mixing Jam',
    duration: 8,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/android-icon-foreground.png'),
    difficulty: 'easy',
    description: 'Create playful palettes using primary colors.',
  },
  {
    id: 'topic-art-2',
    subjectId: 'subject-art',
    title: 'Shape Adventure Collage',
    duration: 10,
    isCompleted: false,
    thumbnailAsset: require('../assets/images/react-logo.png'),
    difficulty: 'easy',
    description: 'Build creative scenes with circles, stars, and triangles.',
  },
];

function buildSubjects(topics: Topic[]): Subject[] {
  const subjectMap = [
    {
      id: 'subject-math',
      title: 'Math',
      iconAsset: require('../assets/images/icon.png'),
      color: Colors.primary,
      lastAccessedAt: hoursAgo(3),
      description: 'Numbers, puzzles, and pattern adventures.',
    },
    {
      id: 'subject-reading',
      title: 'Reading',
      iconAsset: require('../assets/images/splash-icon.png'),
      color: Colors.secondaryContainer,
      lastAccessedAt: hoursAgo(6),
      description: 'Stories, vocabulary, and comprehension quests.',
    },
    {
      id: 'subject-science',
      title: 'Science',
      iconAsset: require('../assets/images/android-icon-background.png'),
      color: Colors.accentAmber,
      lastAccessedAt: hoursAgo(18),
      description: 'Discover the world through experiments and wonder.',
    },
    {
      id: 'subject-art',
      title: 'Art',
      iconAsset: require('../assets/images/android-icon-foreground.png'),
      color: Colors.tertiary,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const seededTopics = TOPIC_SEED;
  const seededSubjects = buildSubjects(seededTopics);

  const [state, setState] = useState<AuthState>({
    user: null,
    loading: false,
    error: null,
    childProfile: null,
    childDataLoading: false,
    childDataError: null,
    subjects: seededSubjects,
    topics: seededTopics,
    avatars: AVATAR_OPTIONS,
    recentActivity: buildRecentActivity(seededTopics),
  });

  const login = useCallback(async (values: LoginFormValues) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // TODO: Replace with real API call
      await new Promise((r) => setTimeout(r, 1500));
      const mockUser: User = {
        id: '1',
        email: values.email,
        fullName: 'Parent',
      };
      setState((current) => ({
        ...current,
        user: mockUser,
        loading: false,
        error: null,
      }));
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        error: 'Invalid email or password. Please try again.',
      }));
    }
  }, []);

  const register = useCallback(async (values: RegisterFormValues) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // TODO: Replace with real API call
      await new Promise((r) => setTimeout(r, 1500));
      const mockUser: User = {
        id: '1',
        email: values.email,
        fullName: values.fullName,
      };
      setState((current) => ({
        ...current,
        user: mockUser,
        loading: false,
        error: null,
      }));
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        error: 'Registration failed. Please try again.',
      }));
    }
  }, []);

  const logout = useCallback(() => {
    setState((prev) => ({
      ...prev,
      user: null,
      loading: false,
      error: null,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  const saveChildProfile = useCallback((profile: SaveChildProfileInput) => {
    setState((current) => {
      const nextProfile: ChildProfile = {
        id: profile.id ?? current.childProfile?.id ?? 'child-1',
        name: profile.name,
        age: profile.age,
        avatarId: profile.avatarId,
        subjectIds: profile.subjectIds,
        streakDays: profile.streakDays,
        dailyGoalMinutes: profile.dailyGoalMinutes,
        dailyCompletedMinutes: profile.dailyCompletedMinutes,
      };

      return {
        ...current,
        childProfile: nextProfile,
        childDataError: null,
      };
    });
  }, []);

  const updateChildProfile = useCallback((updates: Partial<Omit<ChildProfile, 'id'>>) => {
    setState((current) => {
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
    setState((current) => ({
      ...current,
      childDataLoading: true,
      childDataError: null,
    }));

    try {
      await new Promise((resolve) => setTimeout(resolve, 550));
      setState((current) => ({
        ...current,
        childDataLoading: false,
        childDataError: null,
      }));
    } catch {
      setState((current) => ({
        ...current,
        childDataLoading: false,
        childDataError: 'Unable to refresh progress right now.',
      }));
    }
  }, []);

  const markSubjectAccess = useCallback((subjectId: string) => {
    setState((current) => ({
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
    setState((current) => {
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
        ...state,
        login,
        register,
        logout,
        clearError,
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
