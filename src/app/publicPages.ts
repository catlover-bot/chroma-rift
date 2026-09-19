type PublicPageUrl = `https://${string}` | null;

/** Set each URL only after the approved page is publicly reachable and verified. */
export const PUBLIC_PAGES: Readonly<{ privacy: PublicPageUrl; support: PublicPageUrl }> = Object.freeze({
  privacy: 'https://catlover-bot.github.io/chroma-rift/privacy.html',
  support: 'https://catlover-bot.github.io/chroma-rift/support.html',
});
