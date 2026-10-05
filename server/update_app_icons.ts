import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sourceImg = path.join(process.cwd(), 'src/assets/images/butterfly_app_icon_1790614343651.jpg');

const androidResDir = path.join(process.cwd(), 'flutter_app/android/app/src/main/res');

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function generateIcons() {
  if (!fs.existsSync(sourceImg)) {
    console.error(`🔴 Source image does not exist: ${sourceImg}`);
    process.exit(1);
  }

  console.log(`🚀 Starting icon conversion from: ${sourceImg}`);

  for (const [folder, size] of Object.entries(sizes)) {
    const targetFolder = path.join(androidResDir, folder);
    
    if (!fs.existsSync(targetFolder)) {
      console.warn(`⚠️ Folder ${targetFolder} does not exist, creating it.`);
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const standardPath = path.join(targetFolder, 'ic_launcher.png');
    const roundPath = path.join(targetFolder, 'ic_launcher_round.png');

    // 1. Generate standard square/rounded-rect icon
    await sharp(sourceImg)
      .resize(size, size)
      .png()
      .toFile(standardPath);
    console.log(`✅ Generated: ${standardPath} (${size}x${size})`);

    // 2. Generate circular icon for Android Round Icons
    const circleSvg = Buffer.from(
      `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" /></svg>`
    );

    await sharp(sourceImg)
      .resize(size, size)
      .composite([{
        input: circleSvg,
        blend: 'dest-in'
      }])
      .png()
      .toFile(roundPath);
    console.log(`✅ Generated: ${roundPath} (${size}x${size} - Circular)`);
  }

  console.log('🎉 Android Launcher Icons updated successfully!');

  console.log('🌐 Starting Web App icon update...');
  const publicDir = path.join(process.cwd(), 'public');

  if (fs.existsSync(publicDir)) {
    // Generate Web icons
    await sharp(sourceImg).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.png'));
    console.log('✅ Generated public/favicon.png (32x32)');

    await sharp(sourceImg).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
    console.log('✅ Generated public/apple-touch-icon.png (180x180)');

    await sharp(sourceImg).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
    console.log('✅ Generated public/icon-192.png (192x192)');

    await sharp(sourceImg).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
    console.log('✅ Generated public/icon-512.png (512x512)');

    console.log('🎉 Web App Icons updated successfully!');
  } else {
    console.warn('⚠️ Public directory not found, skipping web icons.');
  }
}

generateIcons().catch(err => {
  console.error('🔴 Error updating icons:', err);
  process.exit(1);
});
