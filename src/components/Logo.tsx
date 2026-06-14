import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  isDarkBackground?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = "h-8", showText = true, isDarkBackground = false }) => {
  return (
    <svg 
      viewBox="0 0 520 200" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <defs>
        <linearGradient id="goldRing" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#E2C06A' }} />
          <stop offset="40%" style={{ stopColor: '#C9A030' }} />
          <stop offset="70%" style={{ stopColor: '#F0D080' }} />
          <stop offset="100%" style={{ stopColor: '#A87820' }} />
        </linearGradient>

        <linearGradient id="goldIcon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#F0D880' }} />
          <stop offset="50%" style={{ stopColor: '#C9A030' }} />
          <stop offset="100%" style={{ stopColor: '#E2C06A' }} />
        </linearGradient>

        <linearGradient id="innerCircle" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#112040' }} />
          <stop offset="100%" style={{ stopColor: '#0A1830' }} />
        </linearGradient>

        <linearGradient id="textGold" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: '#E8CC70' }} />
          <stop offset="50%" style={{ stopColor: '#F5E090' }} />
          <stop offset="100%" style={{ stopColor: '#C9A030' }} />
        </linearGradient>

        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.4"/>
        </filter>

        <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feFlood floodColor="#C9A030" floodOpacity="0.6" result="color"/>
          <feComposite in="color" in2="blur" operator="in" result="glow"/>
          <feMerge>
            <feMergeNode in="glow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <filter id="brightGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feFlood floodColor="#FFFFFF" floodOpacity="0.2" result="whiteFlood"/>
          <feComposite in="whiteFlood" in2="blur" operator="in" result="softGlow"/>
          <feMerge>
            <feMergeNode in="softGlow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <clipPath id="innerClip">
          <circle cx="100" cy="100" r="73"/>
        </clipPath>
      </defs>

      {/* Emblem Section */}
      <circle cx="100" cy="100" r="82" fill="url(#goldRing)" filter="url(#shadow)"/>
      <circle cx="100" cy="100" r="73" fill="url(#innerCircle)"/>
      <circle cx="100" cy="100" r="73" fill="none" stroke="#C9A030" strokeWidth="0.6" opacity="0.5"/>

      <g filter="url(#goldGlow)" clipPath="url(#innerClip)">
        <polyline
          points="34,100 50,100 58,82 65,118 72,76 79,118 85,100 100,100 115,100 125,90 135,82 145,72 155,62"
          fill="none"
          stroke="url(#goldIcon)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="148,68 155,62 149,70"
          fill="none"
          stroke="url(#goldIcon)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="57" y="46" width="6" height="18" rx="2" fill="url(#goldIcon)"/>
        <rect x="51" y="52" width="18" height="6" rx="2" fill="url(#goldIcon)"/>
        <rect x="110" y="120" width="7" height="16" rx="2" fill="url(#goldIcon)" opacity="0.75"/>
        <rect x="121" y="113" width="7" height="23" rx="2" fill="url(#goldIcon)" opacity="0.85"/>
        <rect x="132" y="106" width="7" height="30" rx="2" fill="url(#goldIcon)"/>
      </g>

      {showText && (
        <g filter={isDarkBackground ? "url(#brightGlow)" : ""}>
          <text
            x="202"
            y="95"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="64"
            fontWeight="700"
            letterSpacing="-1"
            fill="#B8962E"
          >Med</text>

          <text
            x="345"
            y="95"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="48"
            fontWeight="400"
            letterSpacing="-1"
            fill="#FFFFFF"
          >Note</text>

          <line x1="202" y1="105" x2="430" y2="105" stroke="#B8962E" strokeWidth="0.8" opacity="0.55"/>

          <text
            x="202"
            y="130"
            fontFamily="var(--font-sans), sans-serif"
            fontSize="8"
            fontWeight="400"
            fill="rgba(255,255,255,0.45)"
            style={{ letterSpacing: '0.12em', fontSize: '8px' }}
          >GESTÃO FINANCEIRA MÉDICA</text>
        </g>
      )}
    </svg>
  );
};
