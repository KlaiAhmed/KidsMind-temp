import { HomeLandingPage } from '../../features/home';

const HomePage = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return <HomeLandingPage isAuthenticated={isAuthenticated} />;
};

export default HomePage;
