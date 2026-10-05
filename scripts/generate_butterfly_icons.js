import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgBuffer = Buffer.from(`
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="512" x2="512" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="50%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#082F49"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#22D3EE" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#22D3EE" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="leftWing" x1="256" y1="256" x2="100" y2="100" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="50%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#22D3EE"/>
    </linearGradient>
    <linearGradient id="rightWing" x1="256" y1="256" x2="412" y2="100" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="50%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#22D3EE"/>
    </linearGradient>
  </defs>
  
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <rect width="512" height="512" rx="112" fill="url(#glow)"/>
  
  <!-- Outer border -->
  <rect x="8" y="8" width="496" height="496" rx="104" stroke="#22D3EE" stroke-opacity="0.4" stroke-width="12" fill="none"/>
  
  <!-- Butterfly Left Wing -->
  <path d="M256 256 C200 130 120 80 70 120 C20 160 80 270 170 270 C90 270 30 350 90 410 C150 470 256 256 256 256 Z" fill="url(#leftWing)"/>
  <path d="M256 256 C200 130 120 80 70 120 C20 160 80 270 170 270" stroke="white" stroke-opacity="0.6" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M256 256 C140 280 80 350 90 410" stroke="white" stroke-opacity="0.6" stroke-width="6" fill="none" stroke-linecap="round"/>

  <!-- Butterfly Right Wing -->
  <path d="M256 256 C312 130 392 80 442 120 C492 160 432 270 342 270 C422 270 482 350 422 410 C362 470 256 256 256 256 Z" fill="url(#rightWing)"/>
  <path d="M256 256 C312 130 392 80 442 120 C492 160 432 270 342 270" stroke="white" stroke-opacity="0.6" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M256 256 C372 280 432 350 422 410" stroke="white" stroke-opacity="0.6" stroke-width="6" fill="none" stroke-linecap="round"/>

  <!-- Antennas -->
  <path d="M248 180 Q230 140 210 145" stroke="#E2E8F0" stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="210" cy="145" r="8" fill="#22D3EE"/>
  
  <path d="M264 180 Q282 140 302 145" stroke="#E2E8F0" stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="302" cy="145" r="8" fill="#818CF8"/>

  <!-- Central Body -->
  <rect x="246" y="170" width="20" height="180" rx="10" fill="white" stroke="#CBD5E1" stroke-width="2"/>
</svg>
`);

const targets = [
  // Android mipmap icons
  { path: 'flutter_app/android/app/src/main/res/mipmap-mdpi/ic_launcher.png', size: 48 },
  { path: 'flutter_app/android/app/src/main/res/mipmap-hdpi/ic_launcher.png', size: 72 },
  { path: 'flutter_app/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', size: 96 },
  { path: 'flutter_app/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', size: 144 },
  { path: 'flutter_app/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', size: 192 },

  // iOS AppIcon
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png', size: 40 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png', size: 60 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png', size: 29 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png', size: 58 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png', size: 87 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png', size: 40 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png', size: 80 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png', size: 120 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png', size: 120 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png', size: 180 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png', size: 76 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png', size: 152 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png', size: 167 },
  { path: 'flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png', size: 1024 },

  // Web Icons
  { path: 'flutter_app/web/favicon.png', size: 32 },
  { path: 'flutter_app/web/icons/Icon-192.png', size: 192 },
  { path: 'flutter_app/web/icons/Icon-512.png', size: 512 },
  { path: 'flutter_app/web/icons/Icon-maskable-192.png', size: 192 },
  { path: 'flutter_app/web/icons/Icon-maskable-512.png', size: 512 },
];

async function generate() {
  for (const target of targets) {
    const fullPath = path.resolve(process.cwd(), target.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    await sharp(svgBuffer)
      .resize(target.size, target.size)
      .png()
      .toFile(fullPath);
    console.log(`✅ Generated: ${target.path} (${target.size}x${target.size})`);
  }
  console.log('🎉 All butterfly launcher icons successfully generated!');
}

generate().catch(err => {
  console.error('❌ Error generating icons:', err);
  process.exit(1);
});
