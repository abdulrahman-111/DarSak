import { z } from 'zod';

export const localeSchema = z.enum(['ar','en']);
export const roleSchema = z.enum(['student','teacher']);
export const signupSchema = z.object({ fullName:z.string().trim().min(2).max(100), email:z.string().email(), password:z.string().min(8).max(72), role:roleSchema });
export const profileSchema = z.object({ fullName:z.string().trim().min(2).max(100), preferredLanguage:localeSchema });
export const groupSchema = z.object({ name:z.string().trim().min(2).max(120), description:z.string().max(2000), offeringId:z.string().uuid(), capacity:z.coerce.number().int().min(1).max(500), location:z.string().max(200), status:z.enum(['draft','published','archived']) });
export const slotSchema = z.object({ weekday:z.coerce.number().int().min(0).max(6), startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), slotId:z.string().uuid().optional() }).refine(v=>v.startTime<v.endTime,{message:'End time must be after start time'});
export const lessonSchema = z.object({ groupId:z.string().uuid(), title:z.string().trim().min(2).max(160), startsAt:z.string().datetime({ offset: true }), endsAt:z.string().datetime({ offset: true }), notes:z.string().max(5000), lessonId:z.string().uuid().optional() }).refine(v=>Date.parse(v.startsAt)<Date.parse(v.endsAt),{message:'End time must be after start time'});
export const reportSchema = z.object({ subject:z.string().trim().min(2).max(160), description:z.string().trim().min(10).max(5000), page_path:z.string().trim().max(500).optional().default('') });
export function validateWebLink(value:string){ try { const u=new URL(value); return (u.protocol==='http:'||u.protocol==='https:') && !u.username && !u.password; } catch { return false; } }
export function slotsOverlap(a:{weekday:number,start:string,end:string},b:{weekday:number,start:string,end:string}) { return a.weekday===b.weekday && a.start<b.end && b.start<a.end; }
export function safeFile(file:{type:string,size:number}) { return ['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type) && Number.isSafeInteger(file.size) && file.size>0 && file.size<=10*1024*1024; }
export function formatDate(value:string,locale:'ar'|'en') { return new Intl.DateTimeFormat(locale==='ar'?'ar-EG':'en-GB',{dateStyle:'medium',timeZone:'Africa/Cairo'}).format(new Date(value)); }

export const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(256) });

/** Convert a datetime-local form value in Cairo; reject DST gaps and ambiguous hours. */
export function cairoDateTimeToUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Invalid Cairo date and time');
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0,16) !== value) throw new Error('Invalid Cairo date and time');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  function localEpoch(instant: number) {
    const p = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  }
  const offsets = new Set([-86400000,0,86400000].map(delta => localEpoch(wall+delta)-(wall+delta)));
  const matches = [...offsets].map(offset => wall-offset).filter(instant => localEpoch(instant)===wall);
  if (matches.length !== 1) throw new Error('Cairo time is missing or ambiguous during a daylight-saving change; choose another time');
  return new Date(matches[0]).toISOString();
}

export const forgotPasswordSchema = z.object({ email: z.string().trim().email() });
export const resetPasswordSchema = z.object({ password: z.string().min(8).max(72), confirmPassword: z.string() })
  .refine(v => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
