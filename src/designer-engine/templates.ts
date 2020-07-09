import { randomInt } from 'src/utils/maths';

const TEMPLATES: string[] = [
  '0CuHVzHFTHFXHW3UNHiNHVwHiKHiRHiUHW6HFaH3CDrH39H35HFQH32',
  '0CuHFTHFYHW4HVzUNH32HFQH35H38H3EHFcHiQHiNDrHVwHiKHW8HiWFjHFWH3BHW2HiT',
  '0CuHeFHeKHuqHul0lIeIPzINnINiINdIiMH7LH7HH7DUNHRoHeCHRrHRuHS0HeOI7CI79DrHuiI76I7IHuu1gH321jIe8FjHeIHRxHuoI7F',
];

export function randomTemplate(): string {
  return TEMPLATES[randomInt(0, TEMPLATES.length - 1)];
}
