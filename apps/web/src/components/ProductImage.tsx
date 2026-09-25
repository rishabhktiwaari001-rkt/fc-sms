import React, { useState } from 'react';

// FirstCry image CDN URL — constructed directly from productId, no backend needed.
// referrerpolicy="no-referrer" bypasses hotlink protection.
function fcImageUrl(productId: string, size: 'sm' | 'md' | 'lg' = 'md') {
  const dim = { sm: '109x133', md: '218x266', lg: '438x531' }[size];
  return `https://cdn.fcglcdn.com/brainbees/images/products/${dim}/${productId}s.jpg`;
}

interface Props {
  productId: string;
  size?: number;
}

export default function ProductImage({ productId, size = 40 }: Props) {
  const [failed, setFailed] = useState(false);

  if (!productId || failed) return null;

  const thumbUrl = fcImageUrl(productId, size >= 60 ? 'md' : 'sm');
  const fullUrl  = fcImageUrl(productId, 'lg');

  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="View full image"
      style={{ display: 'block', flexShrink: 0, lineHeight: 0 }}
      onClick={e => e.stopPropagation()}
    >
      <img
        src={thumbUrl}
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

// Standalone helper so other pages can use the same URL without the component
export { fcImageUrl };
