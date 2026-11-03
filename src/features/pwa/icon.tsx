import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

const iconSvg = readFileSync(join(process.cwd(), 'public/brand/darsak/favicon.svg'), 'utf8');
const iconData = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`;

export function renderPwaIcon(size: 192 | 512, maskable = false): ImageResponse {
  const imageSize = maskable ? Math.round(size * 0.54) : size;
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: maskable ? '#12352E' : 'transparent',
      }}
    >
      {/* ImageResponse needs a raw image element to render the bundled SVG into PNG. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconData} width={imageSize} height={imageSize} alt="" />
    </div>,
    { width: size, height: size },
  );
}
