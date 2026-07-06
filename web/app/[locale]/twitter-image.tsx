// Twitter uses the same card as Open Graph. Re-export so twitter:image is set
// explicitly rather than relying on scraper fallback to og:image.
export { default, size, contentType, alt, generateStaticParams } from './opengraph-image';
