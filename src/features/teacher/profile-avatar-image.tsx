'use client';

import Image from 'next/image';
import { UserRound } from 'lucide-react';
import { useState } from 'react';

export function TeacherAvatarImage({
  src,
  name,
  size = 'size-28',
}: {
  src: string | null;
  name: string;
  size?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!src && failedSrc !== src;
  return (
    <div
      className={`${size} relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-teal/10 text-teal`}
    >
      {showImage ? (
        <Image
          src={src}
          alt={name}
          fill
          unoptimized
          onError={() => setFailedSrc(src)}
          className="object-cover"
        />
      ) : (
        <span aria-hidden="true" className="grid size-full place-items-center text-3xl font-black">
          {name.trim().charAt(0) || <UserRound size={32} />}
        </span>
      )}
    </div>
  );
}
