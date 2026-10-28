import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LearningText, learningLines } from '@/features/teacher/learning-text';

describe('LearningText', () => {
  it('renders multi-line text as a bullet list', () => {
    const html = renderToStaticMarkup(<LearningText text={'One\r\n\n Two \nThree'} />);
    expect(html).toContain('<ul');
    expect(html.match(/<li>/g)).toHaveLength(3);
  });
  it('keeps single-line text as a paragraph', () => {
    const html = renderToStaticMarkup(<LearningText text="Only one" />);
    expect(html).toContain('<p');
    expect(html).not.toContain('<li');
  });
  it('escapes HTML instead of injecting it', () => {
    const html = renderToStaticMarkup(<LearningText text={'<img src=x onerror=alert(1)>\nok'} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
  it('returns nothing for blank input', () => {
    expect(learningLines('  \n ')).toEqual([]);
    expect(renderToStaticMarkup(<LearningText text={null} />)).toBe('');
  });
});
