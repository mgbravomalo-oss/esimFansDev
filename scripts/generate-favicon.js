import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#083344" />
    </linearGradient>
    <linearGradient id="logo-blue-wing-grad" x1="1" y1="0.5" x2="0" y2="0.5">
      <stop offset="0%" stop-color="#22d3ee" />
      <stop offset="60%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>
    <linearGradient id="logo-indigo-wing-grad" x1="0" y1="0.5" x2="1" y2="0.5">
      <stop offset="0%" stop-color="#22d3ee" />
      <stop offset="60%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background rounded squircle with subtle cyan border -->
  <rect x="16" y="16" width="480" height="480" rx="108" ry="108" fill="url(#bgGrad)" stroke="#22d3ee" stroke-width="6" stroke-opacity="0.4" />

  <!-- Ambient inner light -->
  <circle cx="256" cy="256" r="200" fill="#06b6d4" opacity="0.12" filter="url(#glow)" />

  <!-- Butterfly scaled & centered -->
  <g transform="translate(256, 256) scale(1.68) translate(-110, -67.5)" filter="url(#glow)">
    <!-- Left Wing (Cyan to Blue Gradient) -->
    <g>
      <path
        fill="url(#logo-blue-wing-grad)"
        d="M 110 65 C 110 65, 90 5, 30 5 C 0 5, 15 65, 60 65 C 15 65, 5 125, 35 125 C 85 125, 110 65, 110 65 Z"
      />
      <!-- Veins -->
      <path
        fill="none"
        stroke="#ffffff"
        stroke-width="2.6"
        opacity="0.75"
        stroke-linecap="round"
        d="M 110 65 Q 70 40 35 15 M 110 65 Q 60 65 25 65 M 110 65 Q 70 90 40 115"
      />
    </g>

    <!-- Right Wing (Blue to Indigo Gradient) -->
    <g>
      <path
        fill="url(#logo-indigo-wing-grad)"
        d="M 110 65 C 110 65, 130 5, 190 5 C 220 5, 205 65, 160 65 C 205 65, 225 125, 185 125 C 135 125, 110 65, 110 65 Z"
      />
      <!-- Veins -->
      <path
        fill="none"
        stroke="#ffffff"
        stroke-width="2.6"
        opacity="0.75"
        stroke-linecap="round"
        d="M 110 65 Q 150 40 185 15 M 110 65 Q 160 65 195 65 M 110 65 Q 150 90 180 115"
      />
    </g>

    <!-- Antennas -->
    <path
      d="M 109 38 Q 98 16 88 18"
      fill="none"
      stroke="#f1f5f9"
      stroke-width="2.2"
      stroke-linecap="round"
    />
    <circle cx="88" cy="18" r="3.2" fill="#22d3ee" />

    <path
      d="M 111 38 Q 122 16 132 18"
      fill="none"
      stroke="#f1f5f9"
      stroke-width="2.2"
      stroke-linecap="round"
    />
    <circle cx="132" cy="18" r="3.2" fill="#818cf8" />

    <!-- Body -->
    <rect
      x="108"
      y="35"
      width="4.5"
      height="60"
      rx="2.25"
      fill="#ffffff"
      stroke="#cbd5e1"
      stroke-width="0.8"
    />
  </g>
</svg>`;

async function run() {
  const publicDir = path.resolve('public');
  const buf512 = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon.png'), buf512);
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), buf512);
  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), buf512);
  fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), buf512);

  const buf192 = await sharp(Buffer.from(svg)).resize(192, 192).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), buf192);
  fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), buf192);

  const buf180 = await sharp(Buffer.from(svg)).resize(180, 180).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), buf180);

  console.log('✅ Favicon and icon assets successfully generated!');
}

run().catch(console.error);
