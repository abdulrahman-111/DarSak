import { describe, expect, it } from 'vitest';
import { isMeetingUrl, parseMeetingUrl } from '@/features/lessons/meeting-url';

describe('lesson meeting URLs', () => {
  it('accepts supported provider hosts and normalizes URL casing', () => {
    for (const value of [
      'https://meet.google.com/abc-defg-hij',
      'https://teams.microsoft.com/l/meetup-join/123',
      'https://teams.live.com/meet/123',
      'https://meet.jit.si/classroom',
      'https://zoom.us/j/123',
      'https://us02.zoom.us/j/123',
      'https://whereby.com/classroom',
      'https://rooms.whereby.com/classroom',
    ]) {
      expect(isMeetingUrl(value)).toBe(true);
    }

    expect(parseMeetingUrl('HTTPS://MEET.GOOGLE.COM/AbC')).toBe('https://meet.google.com/AbC');
  });

  it('allows only exact trusted configured hostnames', () => {
    expect(isMeetingUrl('https://school.example/room', ['school.example'])).toBe(true);
    expect(isMeetingUrl('https://meet.school.example/room', ['school.example'])).toBe(false);
    expect(isMeetingUrl('https://school.example/room', ['*.example'])).toBe(false);
    expect(isMeetingUrl('https://school.example/room', ['https://school.example'])).toBe(false);
    expect(isMeetingUrl('https://*.example/room', ['*.example'])).toBe(false);
  });

  it('treats blank values as absent and rejects whitespace and controls', () => {
    expect(parseMeetingUrl('')).toBeNull();
    expect(parseMeetingUrl(null)).toBeNull();
    expect(parseMeetingUrl(undefined)).toBeNull();
    expect(isMeetingUrl('   ')).toBe(false);
    expect(isMeetingUrl('https://meet.google.com/room name')).toBe(false);
    expect(isMeetingUrl('https://meet.google.com/room\n')).toBe(false);
    expect(isMeetingUrl('https://meet.google.com/room\u007f')).toBe(false);
  });

  it('requires HTTPS and rejects credentials, non-default ports, and deceptive hosts', () => {
    for (const value of [
      'http://meet.google.com/abc',
      'javascript://meet.google.com/abc',
      'https://user@meet.google.com/abc',
      'https://user:pass@meet.google.com/abc',
      'https://meet.google.com:444/abc',
      'https://meet.google.com.evil.example/abc',
      'https://zoom.us.evil.example/abc',
      'https://notzoom.us/abc',
      'https://whereby.com.evil.example/abc',
      'https://meet.google.com./abc',
    ]) {
      expect(isMeetingUrl(value)).toBe(false);
    }
  });

  it('rejects IP literals, IDNs, and overlong URLs', () => {
    for (const value of [
      'https://127.0.0.1/room',
      'https://127.1/room',
      'https://[::1]/room',
      'https://ｍｅｅｔ.google.com/room',
      'https://xn--e1afmkfd.example/room',
      `https://meet.google.com/${'a'.repeat(500)}`,
      `https://meet.google.com/${'é'.repeat(100)}`,
    ]) {
      expect(isMeetingUrl(value)).toBe(false);
    }

    expect(parseMeetingUrl('https://meet.google.com/é')).toBe('https://meet.google.com/%C3%A9');
  });
});
