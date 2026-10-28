import { spriteRects, SPRITE_HEADROOM, SPRITE_SIZE, type SandakMood } from './sprite';

export type { SandakMood } from './sprite';

/**
 * SanDak the pocket-notebook companion, drawn as one inline SVG of rects.
 * `scale` is the number of CSS pixels per sprite pixel. Decorative: the parent
 * control supplies the accessible name.
 */
export function SandakPet({
  mood,
  scale = 4,
  className = '',
}: {
  mood: SandakMood;
  scale?: number;
  className?: string;
}): React.JSX.Element {
  const rects = spriteRects(mood);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-mood={mood}
      viewBox={`0 ${-SPRITE_HEADROOM} ${SPRITE_SIZE} ${SPRITE_SIZE + SPRITE_HEADROOM}`}
      width={SPRITE_SIZE * scale}
      height={(SPRITE_SIZE + SPRITE_HEADROOM) * scale}
      shapeRendering="crispEdges"
      className={`sandak-pet sandak-pet--${mood} ${className}`.trim()}
    >
      <g className="sandak-sprite">
        {rects.map(rect => (
          <rect
            key={`${rect.x},${rect.y}`}
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={1}
            fill={rect.fill}
          />
        ))}
      </g>
    </svg>
  );
}
