import { ImageResponse } from 'next/og';

export const alt = 'Sidle — People. Moments. Possibilities.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '84px 96px',
        background: '#F7F6F2',
        color: '#14181F',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ position: 'relative', width: 122, height: 104, display: 'flex' }}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 82,
                height: 82,
                borderRadius: 999,
                background: '#1F4FD8',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 76,
                top: 58,
                width: 42,
                height: 42,
                borderRadius: 999,
                background: '#A9BDF2',
              }}
            />
          </div>
          <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -6 }}>sidle</div>
        </div>
        <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
          People. Moments. Possibilities.
        </div>
        <div style={{ fontSize: 27, lineHeight: 1.35, color: '#59626E' }}>
          Low-pressure campus connection built around people, conversations, groups and real plans —
          not popularity.
        </div>
      </div>
      <div
        style={{
          width: 260,
          height: 260,
          borderRadius: 64,
          background: '#FFFFFF',
          border: '1px solid #DCE4F7',
          boxShadow: '0 28px 70px rgba(31,79,216,.14)',
          position: 'relative',
          display: 'flex',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 48,
            top: 46,
            width: 132,
            height: 132,
            borderRadius: 999,
            background: '#1F4FD8',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 168,
            top: 155,
            width: 64,
            height: 64,
            borderRadius: 999,
            background: '#A9BDF2',
          }}
        />
      </div>
    </div>,
    size,
  );
}
