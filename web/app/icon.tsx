// Generated PWA icon. Pure type — wordmark on a dark square. No emoji.

import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%',
          background: '#09090b',
          color: '#fafafa',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 180, fontWeight: 700, letterSpacing: '-0.04em',
          fontFamily: 'system-ui',
        }}
      >
        H
      </div>
    ),
    size,
  );
}
