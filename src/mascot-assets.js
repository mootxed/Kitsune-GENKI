/* src/mascot-assets.js — Central mascot image assets registry */

export const MASCOT_ASSETS = {
  home: 'assets/mascot/mascot-hero-medium.webp',
  onboarding: 'assets/mascot/mascot-greeting.webp',
  sensei: 'assets/mascot/mascot-explaining.webp',
  completion: 'assets/mascot/mascot-celebrating.webp',
  empty: 'assets/mascot/mascot-confused.webp',
  error: 'assets/mascot/mascot-worried.webp',
  achievement: 'assets/mascot/mascot-cheering.webp',
  grammar: 'assets/mascot/mascot-holding-notebook.webp',
  dictionary: 'assets/mascot/mascot-thinking.webp',
  loader: 'assets/mascot/mascot-peeking.webp',

  // Semantic alias helpers
  greeting: 'assets/mascot/mascot-greeting.webp',
  explaining: 'assets/mascot/mascot-explaining.webp',
  celebrating: 'assets/mascot/mascot-celebrating.webp',
  confused: 'assets/mascot/mascot-confused.webp',
  curious: 'assets/mascot/mascot-curious.webp',
  worried: 'assets/mascot/mascot-worried.webp',
  cheering: 'assets/mascot/mascot-cheering.webp',
  holdingNotebook: 'assets/mascot/mascot-holding-notebook.webp',
  thinking: 'assets/mascot/mascot-thinking.webp',
  peeking: 'assets/mascot/mascot-peeking.webp',
};

/**
 * Get mascot image asset path by role or screen identifier
 * @param {string} roleOrScreen
 * @returns {string} Relative URL to mascot asset
 */
export function getMascotAsset(roleOrScreen) {
  return MASCOT_ASSETS[roleOrScreen] || MASCOT_ASSETS.home;
}
