Frontend Deployment Steps:
1) eas login
2) npx expo install (if not installed)
3) eas build:configure
4) eas build -p android --profile preview
5) eas build -p android --profile production (Generate Production AAB for Play Store)