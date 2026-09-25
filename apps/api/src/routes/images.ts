import { Router } from 'express';
import { db } from '../lib/db';

const router = Router();

// GET /api/images/:productId — returns cached FirstCry og:image URL
router.get('/:productId', async (req, res) => {
  const { productId } = req.params;

  if (!productId || !/^\d+$/.test(productId)) {
    return res.json({ imageUrl: null });
  }

  // Check DB cache
  const cached = db.prepare(
    'SELECT imageUrl, fetchedAt FROM "ProductImageCache" WHERE productId = ?'
  ).get(productId) as { imageUrl: string | null; fetchedAt: string } | undefined;

  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
    // Return cached result if under 14 days old
    if (ageMs < 14 * 24 * 60 * 60 * 1000) {
      return res.json({ imageUrl: cached.imageUrl });
    }
  }

  // Fetch from FirstCry
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `https://www.firstcry.com/products/details/${productId}`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
        },
      }
    );

    clearTimeout(timeout);

    let imageUrl: string | null = null;

    if (response.ok) {
      const html = await response.text();

      // Match og:image in either attribute order
      const m =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

      imageUrl = m ? m[1] : null;
    }

    // Persist to cache
    db.prepare(
      `INSERT OR REPLACE INTO "ProductImageCache"(productId, imageUrl, fetchedAt)
       VALUES(?, ?, datetime('now'))`
    ).run(productId, imageUrl);

    return res.json({ imageUrl });
  } catch {
    // On error, return whatever we have cached (even stale)
    return res.json({ imageUrl: cached?.imageUrl ?? null });
  }
});

export default router;
