import React, { useState } from 'react';

// Correct FirstCry CDN URL pattern confirmed from live site:
// https://cdn.fcglcdn.com/brainbees/images/products/219x265/{productId}a.webp  (thumb)
// https://cdn.fcglcdn.com/brainbees/images/products/438x531/{productId}a.webp  (full)
function fcImageUrl(productId: string, full = false) {
  const size = full ? '438x531' : '219x265';
  return `https://cdn.fcglcdn.com/brainbees/images/products/${size}/${productId}a.webp`;
}

interface Props {
  productId: string;
  size?: number;
}

export default function ProductImage({ productId, size = 40 }: Props) {
  const [failed, setFailed] = useState(false);

  if (!productId || failed) return null;

  return (
    <a
      href={fcImageUrl(productId, true)}
      target="_blank"
      rel="noopener noreferrer"
      title="View full image"
      style={{ display: 'block', flexShrink: 0, lineHeight: 0 }}
      onClick={e => e.stopPropagation()}
    >
      <img
        src={fcImageUrl(productId)}
        alt=""
        referrerPolicy="no-referrer"
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          borderRadius: 4,
          border: '1px solid var(--border)',
          background: 'var(--bg2)',
          display: 'block',
          cursor: 'pointer',
        }}
        onError={() => setFailed(true)}
      />
    </a>
  );
}

export { fcImageUrl };
