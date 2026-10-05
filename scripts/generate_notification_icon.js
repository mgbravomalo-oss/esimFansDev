import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Pure white silhouette on transparent background (Android requirement for notification small icons)
const notificationSvg = Buffer.from(`
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Left Wing -->
  <path d="M256 256 C200 130 120 80 70 120 C20 160 80 270 170 270 C90 270 30 350 90 410 C150 470 256 256 256 256 Z" fill="white"/>
  <!-- Right Wing -->
  <path d="M256 256 C312 130 392 80 442 120 C492 160 432 270 342 270 C422 270 482 350 422 410 C362 470 256 256 256 256 Z" fill="white"/>
  <!-- Central Body -->
  <rect x="246" y="150" width="20" height="212" rx="10" fill="white"/>
  <!-- Antennas -->
  <path d="M246 170 Q220 120 190 125" stroke="white" stroke-width="16" stroke-linecap="round" fill="none"/>
  <path d="M266 170 Q292 120 322 125" stroke="white" stroke-width="16" stroke-linecap="round" fill="none"/>
</svg>
`);

const notificationTargets = [
  { path: 'flutter_app/android/app/src/main/res/drawable-mdpi/ic_stat_notification.png', size: 24 },
  { path: 'flutter_app/android/app/src/main/res/drawable-hdpi/ic_stat_notification.png', size: 36 },
  { path: 'flutter_app/android/app/src/main/res/drawable-xhdpi/ic_stat_notification.png', size: 48 },
  { path: 'flutter_app/android/app/src/main/res/drawable-xxhdpi/ic_stat_notification.png', size: 72 },
  { path: 'flutter_app/android/app/src/main/res/drawable-xxxhdpi/ic_stat_notification.png', size: 96 },
  // Also default drawable folder
  { path: 'flutter_app/android/app/src/main/res/drawable/ic_stat_notification.png', size: 96 },
];

async function generateNotificationIcons() {
  for (const target of notificationTargets) {
    const fullPath = path.resolve(process.cwd(), target.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    await sharp(notificationSvg)
      .resize(target.size, target.size)
      .png()
      .toFile(fullPath);
    console.log(`✅ Generated Notification Icon: ${target.path} (${target.size}x${target.size})`);
  }
  console.log('🎉 All notification icons generated successfully!');
}

generateNotificationIcons().catch(err => {
  console.error('❌ Error generating notification icons:', err);
  process.exit(1);
});
