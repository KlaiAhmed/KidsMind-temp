/** HomePage — Main landing page combining all marketing sections with theme and language support. */
import React, { Suspense } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useLanguage } from '../../hooks/useLanguage';
import NavBar from '../../components/NavBar/NavBar';
import HeroSection from '../../components/HeroSection/HeroSection';

const AgeGroupSelector = React.lazy(() => import('../../components/AgeGroupSelector/AgeGroupSelector'));
const FeaturesGrid = React.lazy(() => import('../../components/FeaturesGrid/FeaturesGrid'));
const HowItWorks = React.lazy(() => import('../../components/HowItWorks/HowItWorks'));
const SafetyBanner = React.lazy(() => import('../../components/SafetyBanner/SafetyBanner'));
const TestimonialCarousel = React.lazy(() => import('../../components/TestimonialCarousel/TestimonialCarousel'));
const CTASection = React.lazy(() => import('../../components/CTASection/CTASection'));
const Footer = React.lazy(() => import('../../components/Footer/Footer'));

const SectionSkeleton: React.FC = () => (
  <div
    style={{
      height: '400px',
      background: 'var(--bg-surface)',
      borderRadius: '24px',
      margin: '2rem',
      opacity: 0.5,
    }}
    aria-hidden="true"
  />
);

interface HomePageProps {
  isAuthenticated: boolean;
}

const HomePage = ({ isAuthenticated }: HomePageProps) => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, translations, isRTL } = useLanguage();

  return (
    <div
      data-theme={theme}
      dir={isRTL ? 'rtl' : 'ltr'}
      lang={language}
      style={{
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        minHeight: '100vh',
      }}
    >
      <NavBar
        theme={theme}
        onToggleTheme={toggleTheme}
        language={language}
        onLanguageChange={setLanguage}
        translations={translations}
        isAuthenticated={isAuthenticated}
      />
      <main id="main-content">
        <HeroSection translations={translations} language={language} />
        <Suspense fallback={<SectionSkeleton />}>
          <AgeGroupSelector translations={translations} />
          <FeaturesGrid translations={translations} />
          <HowItWorks translations={translations} />
          <SafetyBanner translations={translations} />
          <TestimonialCarousel translations={translations} />
          <CTASection translations={translations} isAuthenticated={isAuthenticated} />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer translations={translations} language={language} onLanguageChange={setLanguage} />
      </Suspense>
    </div>
  );
};

export default HomePage;
