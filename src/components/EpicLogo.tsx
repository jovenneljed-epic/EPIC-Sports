import React from 'react';

interface EpicLogoProps {
  className?: string;
  size?: number;
}

export const EpicLogo: React.FC<EpicLogoProps> = ({ className = '', size = 56 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`rounded-2xl shadow-xl select-none ${className}`}
    >
      <defs>
        <linearGradient id="epicBlue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E6BFF" />
          <stop offset="100%" stopColor="#0544D6" />
        </linearGradient>
      </defs>

      {/* Rounded Squircle Container */}
      <rect width="512" height="512" rx="120" fill="url(#epicBlue)" />

      {/* Stylized 'E' */}
      <path
        d="M 145 205 L 225 205 M 145 205 L 145 320 L 225 320 M 145 262 L 205 262"
        stroke="white"
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Latin Cross merging into Heart Bottom */}
      <path
        d="M 265 170 L 265 330 
           C 265 355 240 375 220 355 
           L 185 320"
        stroke="white"
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 225 215 L 305 215"
        stroke="white"
        strokeWidth="24"
        strokeLinecap="round"
      />

      {/* Right Heart Wing */}
      <path
        d="M 265 245 
           C 310 235 340 270 325 310 
           C 310 350 265 375 250 385 
           L 220 355"
        stroke="white"
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Signal Broadcast Waves */}
      <path
        d="M 305 185 A 35 35 0 0 1 340 220"
        stroke="white"
        strokeWidth="22"
        strokeLinecap="round"
      />
      <path
        d="M 305 145 A 75 75 0 0 1 380 220"
        stroke="white"
        strokeWidth="22"
        strokeLinecap="round"
      />
    </svg>
  );
};