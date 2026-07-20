# WeChat Official Account Compatibility

Use this reference when producing or modifying WeChat article HTML.

## Practical Target

The local preview should approximate the WeChat App article page, but WeChat can filter and normalize HTML/CSS after paste or API submission. Always recommend a final check with the official WeChat preview before publishing.

## Safe Output Shape

- Use a single outer `<section>` container.
- Use inline styles on every exported element.
- Use mobile-friendly width constraints: `max-width: 677px`, `width: 100%` for images.
- Prefer semantic elements that WeChat commonly keeps: `section`, `p`, `h1`-`h3`, `blockquote`, `ul`, `ol`, `li`, `strong`, `img`, `br`.
- Keep decoration simple: borders, background colors, spacing, font size, line height.

## Avoid

- JavaScript, event handlers, forms, iframes, external CSS, custom fonts loaded from URLs.
- Complex absolute/fixed positioning.
- Wide tables and multi-column desktop layouts.
- Effects that often degrade after paste, such as heavy shadows, animations, filters, and advanced selectors.

## Publishing Notes

Direct API publishing is optional and should be treated as an advanced integration.

Typical flow:

1. Configure AppID and AppSecret in a local-only secret store.
2. Configure the calling machine or server IP in the WeChat Official Account IP allowlist.
3. Fetch `access_token`.
4. Upload cover image as permanent material to get `thumb_media_id`.
5. Upload in-article images to get WeChat-compatible image URLs.
6. Create a draft.
7. Optionally submit the draft for publish and poll publish status.

Never put AppSecret in frontend code or committed files.
