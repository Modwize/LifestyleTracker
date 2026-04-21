// iOS home-screen icon. Apple expects 180x180 with no transparency.

import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%',
          background: '#09090b',
          color: '#fafafa',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 110, fontWeight: 700, letterSpacing: '-0.04em',
          fontFamily: 'system-ui',
        }}
      >
        H
      </div>
    ),
    size,
  );
}
