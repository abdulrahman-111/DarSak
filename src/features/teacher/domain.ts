import { z } from 'zod';

const title = z.string().trim().min(1).max(180);
const safeUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, 'Use a safe HTTP or HTTPS link');

export const materialSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), title, url: safeUrl, content: z.string().optional() }),
  z.object({ kind: z.literal('note'), title, content: z.string().trim().min(1).max(20_000), url: z.string().optional() }),
]);

export const lessonStatusSchema = z.enum(['scheduled', 'cancelled', 'completed']);

const allowedExtension = /^(pdf|jpe?g|png|webp)$/i;

export function storageObjectPath(teacherId: string, lessonId: string, filename: string, objectId: string) {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (!allowedExtension.test(extension)) throw new Error('Unsupported file type');
  return `${teacherId}/${lessonId}/${objectId}.${extension === 'jpeg' ? 'jpg' : extension}`;
}
