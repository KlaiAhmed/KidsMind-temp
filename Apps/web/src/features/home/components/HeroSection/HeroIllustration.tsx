/** HeroIllustration — Animated SVG owl with graduation cap on a planet, surrounded by twinkling stars. */
const HeroIllustration = () => {
  return (
    <svg
      width="400"
      height="400"
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ maxWidth: '100%', height: 'auto' }}
    >
      {/* Planet */}
      <ellipse cx="200" cy="320" rx="120" ry="30" fill="var(--accent-learn)" opacity="0.2" />
      <ellipse cx="200" cy="300" rx="80" ry="8" fill="var(--accent-learn)" opacity="0.15" />

      {/* Owl body */}
      <g style={{ animation: 'float 6s ease-in-out infinite' }}>
        {/* Body */}
        <ellipse cx="200" cy="240" rx="55" ry="65" fill="var(--accent-main)" />
        {/* Belly */}
        <ellipse cx="200" cy="255" rx="35" ry="40" fill="var(--bg-surface)" opacity="0.3" />
        {/* Head */}
        <circle cx="200" cy="175" r="50" fill="var(--accent-main)" />
        {/* Left ear */}
        <polygon points="160,140 150,100 180,145" fill="var(--accent-main)" />
        <polygon points="163,138 158,112 177,143" fill="var(--accent-main-hover)" opacity="0.5" />
        {/* Right ear */}
        <polygon points="240,140 250,100 220,145" fill="var(--accent-main)" />
        <polygon points="237,138 242,112 223,143" fill="var(--accent-main-hover)" opacity="0.5" />
        {/* Left eye area */}
        <circle cx="180" cy="175" r="22" fill="var(--bg-surface)" />
        <circle cx="180" cy="175" r="14" fill="var(--text-primary)" />
        <circle cx="185" cy="170" r="5" fill="var(--bg-surface)" />
        {/* Right eye area */}
        <circle cx="220" cy="175" r="22" fill="var(--bg-surface)" />
        <circle cx="220" cy="175" r="14" fill="var(--text-primary)" />
        <circle cx="225" cy="170" r="5" fill="var(--bg-surface)" />
        {/* Beak */}
        <polygon points="200,190 192,200 208,200" fill="var(--accent-fun)" />
        {/* Left wing */}
        <ellipse cx="140" cy="230" rx="20" ry="35" fill="var(--accent-main-hover)" transform="rotate(-15 140 230)" />
        {/* Right wing */}
        <ellipse cx="260" cy="230" rx="20" ry="35" fill="var(--accent-main-hover)" transform="rotate(15 260 230)" />
        {/* Feet */}
        <ellipse cx="185" cy="300" rx="12" ry="6" fill="var(--accent-fun)" />
        <ellipse cx="215" cy="300" rx="12" ry="6" fill="var(--accent-fun)" />
        {/* Graduation cap */}
        <polygon points="160,145 200,125 240,145 200,155" fill="var(--text-primary)" />
        <rect x="197" y="120" width="6" height="15" fill="var(--text-primary)" />
        <circle cx="200" cy="118" r="4" fill="var(--accent-fun)" style={{ animation: 'softPulse 2s ease-in-out infinite' }} />
      </g>

      {/* Stars with varied animations */}
      <circle cx="80" cy="80" r="3" fill="var(--accent-fun)" style={{ animation: 'starTwinkle 3s ease-in-out infinite alternate' }} />
      <circle cx="320" cy="60" r="2.5" fill="var(--accent-fun)" style={{ animation: 'starTwinkle 4s ease-in-out infinite alternate', animationDelay: '0.5s' }} />
      <circle cx="50" cy="200" r="2" fill="var(--accent-fun)" style={{ animation: 'starTwinkle 2.5s ease-in-out infinite alternate', animationDelay: '0.3s' }} />
      <circle cx="350" cy="180" r="3" fill="var(--accent-fun)" style={{ animation: 'starTwinkle 3.5s ease-in-out infinite alternate', animationDelay: '1s' }} />
      <circle cx="100" cy="320" r="2" fill="var(--accent-learn)" style={{ animation: 'starTwinkle 4.5s ease-in-out infinite alternate', animationDelay: '0.7s' }} />
      <circle cx="310" cy="300" r="2.5" fill="var(--accent-learn)" style={{ animation: 'starTwinkle 2s ease-in-out infinite alternate', animationDelay: '1.2s' }} />
      <circle cx="140" cy="50" r="2" fill="var(--accent-grow)" style={{ animation: 'starTwinkle 3.2s ease-in-out infinite alternate', animationDelay: '0.2s' }} />
      <circle cx="280" cy="120" r="2" fill="var(--accent-grow)" style={{ animation: 'starTwinkle 2.8s ease-in-out infinite alternate', animationDelay: '0.9s' }} />

      {/* Small orbiting star */}
      <circle cx="0" cy="0" r="4" fill="var(--accent-fun)" style={{ animation: 'orbit 10s linear infinite', transformOrigin: '200px 200px' }} />

      {/* Sparkle shapes */}
      <g transform="translate(60, 140)" style={{ animation: 'starTwinkle 3s ease-in-out infinite alternate' }}>
        <line x1="0" y1="-6" x2="0" y2="6" stroke="var(--accent-fun)" strokeWidth="2" strokeLinecap="round" />
        <line x1="-6" y1="0" x2="6" y2="0" stroke="var(--accent-fun)" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g transform="translate(340, 240)" style={{ animation: 'starTwinkle 4s ease-in-out infinite alternate', animationDelay: '0.5s' }}>
        <line x1="0" y1="-5" x2="0" y2="5" stroke="var(--accent-learn)" strokeWidth="2" strokeLinecap="round" />
        <line x1="-5" y1="0" x2="5" y2="0" stroke="var(--accent-learn)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Additional decorative elements */}
      <circle cx="120" cy="250" r="5" fill="var(--accent-grow)" opacity="0.4" style={{ animation: 'gentleFloat 5s ease-in-out infinite' }} />
      <circle cx="290" cy="150" r="4" fill="var(--accent-fun)" opacity="0.5" style={{ animation: 'gentleFloat 7s ease-in-out infinite reverse' }} />
    </svg>
  );
};

export default HeroIllustration;
