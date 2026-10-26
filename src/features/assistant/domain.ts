import { z } from 'zod';

export type AssistantLocale = 'en' | 'ar';
export type AssistantRole = 'student' | 'teacher' | 'admin';
export type AssistantAccess = { role: AssistantRole; canTeach: boolean };

export const groupDraftInputSchema = z
  .object({
    locale: z.enum(['en', 'ar']),
    topic: z.string().trim().min(2).max(120),
    level: z.enum(['beginner', 'intermediate', 'advanced']),
    format: z.enum(['online', 'in_person', 'hybrid']),
    guidance: z.string().trim().max(500),
  })
  .strict();

export type GroupDraftInput = z.infer<typeof groupDraftInputSchema>;

export const groupDraftSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000),
    outcomes: z.string().trim().max(2000),
    prerequisites: z.string().trim().max(1500),
  })
  .strict();

export type GroupDraft = z.infer<typeof groupDraftSchema>;

export const assistantChatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1).max(2000),
  })
  .strict();

const chatRequestSchema = z
  .object({
    mode: z.literal('chat'),
    locale: z.enum(['en', 'ar']),
    acknowledged: z.literal(true),
    messages: z.array(assistantChatMessageSchema).min(1).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.messages.at(-1)?.role !== 'user') {
      context.addIssue({
        code: 'custom',
        path: ['messages'],
        message: 'Last message must be from the user.',
      });
    }
    if (value.messages.reduce((total, message) => total + message.text.length, 0) > 8000) {
      context.addIssue({
        code: 'custom',
        path: ['messages'],
        message: 'Message history is too long.',
      });
    }
  });

export const assistantRequestSchema = z.discriminatedUnion('mode', [
  chatRequestSchema,
  z
    .object({
      mode: z.literal('group_draft'),
      acknowledged: z.literal(true),
      ...groupDraftInputSchema.shape,
    })
    .strict(),
]);

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantSuccess =
  { ok: true; mode: 'chat'; text: string } | { ok: true; mode: 'group_draft'; draft: GroupDraft };
export type AssistantErrorCode =
  'invalid_input' | 'unauthenticated' | 'unavailable' | 'rate_limited' | 'provider_unavailable';
export const assistantChatTextSchema = z.string().trim().min(1).max(6000);

export type GroupDraftResult =
  | { ok: true; source: 'provider'; draft: GroupDraft }
  | { ok: false; code: 'invalid_input' | 'unauthorized' | 'unavailable' };

/** Live provider drafting is intentionally unavailable for this deployment. */
export const LIVE_ASSISTANT_AVAILABLE = false as const;

const levels = {
  en: { beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced' },
  ar: { beginner: 'مبتدئ', intermediate: 'متوسط', advanced: 'متقدم' },
} as const;

const formats = {
  en: { online: 'online', in_person: 'in person', hybrid: 'hybrid' },
  ar: { online: 'عن بُعد', in_person: 'حضوري', hybrid: 'هجين' },
} as const;

function boundedName(topic: string, suffix: string): string {
  const availableTopicLength = 120 - suffix.length;
  let shortenedTopic = '';
  for (const character of topic) {
    if (shortenedTopic.length + character.length > availableTopicLength) break;
    shortenedTopic += character;
  }
  return `${shortenedTopic}${suffix}`;
}

/** Builds an authored local template. It does not call a model or save anything. */
export function buildPreviewDraft(input: GroupDraftInput): GroupDraft {
  const { locale, topic, level, format, guidance } = groupDraftInputSchema.parse(input);
  const levelName = levels[locale][level];
  const formatName = formats[locale][format];
  const name = boundedName(topic, ` (${levelName})`);

  const draft =
    locale === 'en'
      ? {
          name,
          description: `A ${levelName} group template about ${topic}, planned for ${formatName} delivery. Review and adapt this outline to the learners and your teaching approach before saving.`,
          outcomes: `Learners can describe key ideas in ${topic} and practise applying them to examples appropriate to the ${levelName} level.`,
          prerequisites: `No additional prerequisites are stated in this template. Set any needed starting knowledge after reviewing the group plan.${guidance ? ` Teacher guidance to review: ${guidance}` : ''}`,
        }
      : {
          name,
          description: `قالب مجموعة بمستوى ${levelName} حول ${topic}، مخطط لبيئة ${formatName}. راجع هذا التصور وعدّله بما يناسب المتعلمين وطريقة تدريسك قبل الحفظ.`,
          outcomes: `يستطيع المتعلمون شرح أفكار أساسية في ${topic} والتدرب على تطبيقها في أمثلة مناسبة للمستوى ${levelName}.`,
          prerequisites: `لا يحدد هذا القالب متطلبات مسبقة إضافية. راجع خطة المجموعة وحدد المعرفة اللازمة عند الحاجة.${guidance ? ` ملاحظات المعلم للمراجعة: ${guidance}` : ''}`,
        };

  return groupDraftSchema.parse(draft);
}
