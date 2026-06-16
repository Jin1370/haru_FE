// Real raw app screenshots (no device frame baked in — the frame is drawn by
// <PhoneShot>). `header` is the app-header colour at the top of each screen and
// `footer` the bottom nav-bar colour, both sampled from the source image, so
// the mockup status bar blends into the top and the home-indicator strip blends
// into the bottom. Source assets: public/screenshots/*.png (1080×2086).
export const SCREENS = {
  explore: { src: '/screenshots/explore.png', header: '#FFF4EE', footer: '#FEFAF9' },
  profile: { src: '/screenshots/profile.png', header: '#FFF4EE', footer: '#FEFAF9' },
  voice: { src: '/screenshots/voice.png', header: '#F7ECE7', footer: '#FFF2EC' },
  chat: { src: '/screenshots/chat.png', header: '#FDF1EC', footer: '#FEFAF9' },
  match: { src: '/screenshots/match.png', header: '#FAEFEA', footer: '#FFF2EC' },
} as const;

export type ScreenKey = keyof typeof SCREENS;
