/**
 * ExamGuard Icon Generator
 * Run from the backend directory (where sharp is installed):
 *   node ../generate-icons.js
 *
 * Generates all required app icon sizes for Expo:
 *  - icon.png        1024×1024  (iOS / general)
 *  - adaptive-icon.png  1024×1024  (Android foreground)
 *  - splash.png      1284×2778  (Splash screen)
 *  - favicon.png     196×196    (Web)
 */

const sharp = require('sharp');
const path  = require('path');

const ASSETS = path.join(__dirname, 'mobile', 'assets');

// ─── Brand colours ────────────────────────────────────────────────────────────
const BLUE   = '#1D4ED8';   // primary dark
const VIOLET = '#7C3AED';   // secondary
const WHITE  = '#FFFFFF';

// ─── App Icon SVG ─────────────────────────────────────────────────────────────
// Shield + face-scan corner markers + verification check
const iconSVG = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="${BLUE}"/>
      <stop offset="100%" stop-color="${VIOLET}"/>
    </linearGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="rgba(255,255,255,0.95)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.75)"/>
    </linearGradient>
  </defs>

  <!-- Background with rounded corners -->
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>

  <!-- Subtle background pattern circles -->
  <circle cx="100"  cy="100"  r="180" fill="rgba(255,255,255,0.04)"/>
  <circle cx="924"  cy="924"  r="220" fill="rgba(255,255,255,0.05)"/>
  <circle cx="900"  cy="120"  r="140" fill="rgba(255,255,255,0.03)"/>

  <!-- Shield body -->
  <path d="M512 108 L820 238 L820 530
           C820 710 668 838 512 908
           C356 838 204 710 204 530
           L204 238 Z"
        fill="none"
        stroke="url(#shieldGrad)"
        stroke-width="44"
        stroke-linejoin="round"
        stroke-linecap="round"/>

  <!-- Shield fill (semi-transparent) -->
  <path d="M512 108 L820 238 L820 530
           C820 710 668 838 512 908
           C356 838 204 710 204 530
           L204 238 Z"
        fill="rgba(255,255,255,0.08)"/>

  <!-- Face scan box (identity verification icon) -->
  <rect x="364" y="350" width="296" height="296" rx="28"
        fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="26"/>

  <!-- Scan corner markers — top-left -->
  <path d="M364 420 L364 350 L434 350"
        stroke="white" stroke-width="34" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <!-- top-right -->
  <path d="M590 350 L660 350 L660 420"
        stroke="white" stroke-width="34" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <!-- bottom-left -->
  <path d="M364 576 L364 646 L434 646"
        stroke="white" stroke-width="34" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <!-- bottom-right -->
  <path d="M660 576 L660 646 L590 646"
        stroke="white" stroke-width="34" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Verification checkmark inside scan box -->
  <path d="M438 502 L490 554 L586 446"
        stroke="white" stroke-width="34" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Horizontal scan line (animated feel) -->
  <line x1="374" y1="498" x2="650" y2="498"
        stroke="rgba(255,255,255,0.35)" stroke-width="10" stroke-dasharray="18 12"/>
</svg>`;

// ─── Splash Screen SVG ────────────────────────────────────────────────────────
const splashSVG = `
<svg width="1284" height="2778" viewBox="0 0 1284 2778" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="splashBg" x1="0%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%"   stop-color="#1D4ED8"/>
      <stop offset="50%"  stop-color="${VIOLET}"/>
      <stop offset="100%" stop-color="#1D4ED8"/>
    </linearGradient>
  </defs>

  <!-- Full background -->
  <rect width="1284" height="2778" fill="url(#splashBg)"/>

  <!-- Decorative circles -->
  <circle cx="0"    cy="0"    r="600" fill="rgba(255,255,255,0.04)"/>
  <circle cx="1284" cy="2778" r="700" fill="rgba(255,255,255,0.05)"/>
  <circle cx="1200" cy="300"  r="350" fill="rgba(255,255,255,0.03)"/>
  <circle cx="100"  cy="2500" r="280" fill="rgba(255,255,255,0.03)"/>

  <!-- Centered icon -->
  <g transform="translate(542, 1189)">
    <!-- Icon background pill -->
    <rect width="200" height="200" rx="48" fill="white" x="0" y="0"
          style="filter: drop-shadow(0px 12px 32px rgba(0,0,0,0.3))"/>
    <!-- Mini shield in white icon -->
    <path d="M100 24 L168 52 L168 116 C168 154 136 178 100 194 C64 178 32 154 32 116 L32 52 Z"
          fill="none" stroke="${BLUE}" stroke-width="11" stroke-linejoin="round"/>
    <path d="M76 106 L96 126 L128 90"
          stroke="${VIOLET}" stroke-width="10" fill="none"
          stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Corner markers in icon -->
    <path d="M52 74 L52 52 L74 52" stroke="${BLUE}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M126 52 L148 52 L148 74" stroke="${BLUE}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M52 126 L52 148 L74 148" stroke="${BLUE}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M148 126 L148 148 L126 148" stroke="${BLUE}" stroke-width="9" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

// ─── Favicon SVG ──────────────────────────────────────────────────────────────
const faviconSVG = `
<svg width="196" height="196" viewBox="0 0 196 196" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="${BLUE}"/>
      <stop offset="100%" stop-color="${VIOLET}"/>
    </linearGradient>
  </defs>
  <rect width="196" height="196" rx="40" fill="url(#fg)"/>
  <path d="M98 22 L158 46 L158 102 C158 136 128 160 98 174 C68 160 38 136 38 102 L38 46 Z"
        fill="none" stroke="white" stroke-width="10" stroke-linejoin="round"/>
  <path d="M76 98 L92 114 L122 82"
        stroke="white" stroke-width="10" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function generate() {
  console.log('Generating ExamGuard icons...');

  // 1. App Icon 1024×1024
  await sharp(Buffer.from(iconSVG(1024)))
    .png()
    .toFile(path.join(ASSETS, 'icon.png'));
  console.log('✅ icon.png (1024×1024)');

  // 2. Adaptive Icon (Android foreground) 1024×1024
  await sharp(Buffer.from(iconSVG(1024)))
    .png()
    .toFile(path.join(ASSETS, 'adaptive-icon.png'));
  console.log('✅ adaptive-icon.png (1024×1024)');

  // 3. Splash screen 1284×2778
  await sharp(Buffer.from(splashSVG))
    .png()
    .toFile(path.join(ASSETS, 'splash.png'));
  console.log('✅ splash.png (1284×2778)');

  // 4. Favicon 196×196
  await sharp(Buffer.from(faviconSVG))
    .png()
    .toFile(path.join(ASSETS, 'favicon.png'));
  console.log('✅ favicon.png (196×196)');

  console.log('\n🎉 All ExamGuard icons generated successfully!');
  console.log('   Run: eas build -p android --profile preview  to build with new icons.');
}

generate().catch(console.error);
