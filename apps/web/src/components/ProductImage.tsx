import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

// In-memory cache to avoid duplicate API requests across the page
const imgCache: Record<string, string | null> = {};
// Track in-flight requests to avoid simultaneous duplicates
const inFlight: Record<string, Promise<string | null>> = {};

interface Props {
  productId: string;
  size?: number;
}

export default function ProductImage({ productId, size = 40 }: Props) {
  const [url, setUrl] = useState<string | null | undefined>(
    productId in imgCache ? imgCache[productId] : undefined
  );

  useEffect(() => {
    if (!productId || productId in imgCache) return;

    const fetchImage = async () => {
      if (!inFlight[productId]) {
        inFlight[productId] = api
          .get(`/images/${productId}`)
          .then((r) => r.data.imageUrl ?? null)
          .catch(() => null);
      }
      const result = await inFlight[productId];
      imgCache[productId] = result;
      setUrl(result);
    };

    fetchImage();
  }, [productId]);

  if (!url) return null;

  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: 'cover',
        borderRadius: 4,
        flexShrink: 0,
        border: '1px solid var(--border)',
        background: 'var(--bg2)',
        display: 'block',
      }}
      onError={() => setUrl(null)}
    />
  );
}
