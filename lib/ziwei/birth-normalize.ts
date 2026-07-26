import type { BirthInfo } from './types';

export interface BirthFormLike {
  name?: string;
  year: string | number;
  month: string | number;
  day: string | number;
  clockHour: string | number;
  clockMinute: string | number;
  unknownTime?: boolean;
  province?: string;
  city?: string;
  longitude?: number;
  gender: 'male' | 'female';
}

const MINUTES_PER_DAY = 1440;
const STANDARD_LONGITUDE = 120;

function toInteger(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export function calcTrueSolarMinutes(
  clockHour: number,
  clockMinute: number,
  longitude = STANDARD_LONGITUDE,
): number {
  const safeLongitude = Number.isFinite(longitude) ? longitude : STANDARD_LONGITUDE;
  const clockMinutes = clockHour * 60 + clockMinute;
  const longitudeOffsetMinutes = (safeLongitude - STANDARD_LONGITUDE) * 4;
  return ((clockMinutes + longitudeOffsetMinutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function calcTrueSolarBranch(
  clockHour: number,
  clockMinute: number,
  longitude = STANDARD_LONGITUDE,
): number {
  const solarMinutes = calcTrueSolarMinutes(clockHour, clockMinute, longitude);
  if (solarMinutes >= 1380 || solarMinutes < 60) return 0;
  return Math.floor((solarMinutes - 60) / 120) + 1;
}

/**
 * 将表单出生信息统一转换为排盘输入。
 *
 * 口径：时辰与晚子时换日都以同一套真太阳时为准。
 * 真太阳时 23:00—23:59 属晚子时，按次日排盘；00:00—00:59 属早子时，按本日排盘。
 */
export function normalizeBirthForm(input: BirthFormLike): BirthInfo {
  if (input.unknownTime) {
    throw new Error('出生时辰未知，无法可靠定位命宫、身宫和十二宫。请补充出生时间后再排盘或合盘。');
  }

  let year = toInteger(input.year);
  let month = toInteger(input.month);
  let day = toInteger(input.day);
  const clockHour = toInteger(input.clockHour);
  const clockMinute = toInteger(input.clockMinute);
  const longitude = Number.isFinite(input.longitude) ? Number(input.longitude) : STANDARD_LONGITUDE;
  const solarMinutes = calcTrueSolarMinutes(clockHour, clockMinute, longitude);

  if (solarMinutes >= 1380) {
    const nextDay = new Date(year, month - 1, day + 1);
    year = nextDay.getFullYear();
    month = nextDay.getMonth() + 1;
    day = nextDay.getDate();
  }

  return {
    year,
    month,
    day,
    hour: calcTrueSolarBranch(clockHour, clockMinute, longitude),
    gender: input.gender,
    name: input.name?.trim() || undefined,
    province: input.province || undefined,
    city: input.city || undefined,
    longitude: input.province ? longitude : undefined,
  };
}
