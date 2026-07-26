import type { BirthFormState } from '@/components/BirthForm';
import { calcTrueSolarBranch, normalizeBirthForm } from './birth-normalize';
import type { BirthInfo } from './types';

export { calcTrueSolarBranch };

/**
 * BirthFormState → BirthInfo。
 *
 * 所有单盘、合盘与分享恢复入口统一使用 normalizeBirthForm，避免真太阳时和晚子时规则分叉。
 */
export function formToBirthInfo(form: BirthFormState): BirthInfo {
  return normalizeBirthForm(form);
}

/**
 * BirthFormState → URLSearchParams（用于分享链接）
 *
 * 姓名、省份和城市不写入 URL。为保证接收者重新排出的真太阳时命盘与原盘一致，
 * 仅保留四舍五入到 0.1° 的经度；这个精度足以校正时辰，同时不会直接暴露城市名称。
 */
export function formToSearchParams(form: BirthFormState): URLSearchParams {
  const p = new URLSearchParams();
  p.set('y', form.year);
  p.set('m', form.month);
  p.set('d', form.day);
  if (form.unknownTime) {
    p.set('u', '1');
  } else {
    p.set('h', form.clockHour);
    p.set('mi', form.clockMinute);
  }

  if (Number.isFinite(form.longitude)) {
    const roundedLongitude = Math.round(form.longitude * 10) / 10;
    if (Math.abs(roundedLongitude - 120) >= 0.05) {
      p.set('lo', String(roundedLongitude));
    }
  }

  p.set('g', form.gender === 'male' ? 'm' : 'f');
  return p;
}

/** URLSearchParams → Partial<BirthFormState>，不完整时返回 null */
export function searchParamsToForm(params: URLSearchParams): Partial<BirthFormState> | null {
  const year = params.get('y');
  const month = params.get('m');
  const day = params.get('d');
  if (!year || !month || !day) return null;

  const parsedLongitude = Number.parseFloat(params.get('lo') || '120');
  const longitude = Number.isFinite(parsedLongitude) && parsedLongitude >= -180 && parsedLongitude <= 180
    ? parsedLongitude
    : 120;

  return {
    name: '',
    year,
    month,
    day,
    unknownTime: params.get('u') === '1',
    clockHour: params.get('h') || '8',
    clockMinute: params.get('mi') || '0',
    province: '',
    city: '',
    longitude,
    gender: params.get('g') === 'f' ? 'female' : 'male',
  };
}
