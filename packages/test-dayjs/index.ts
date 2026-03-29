import dayjs from '@esm-repacks/dayjs';
import type { Dayjs, ConfigType, DayjsStatic, PluginFunc } from '@esm-repacks/dayjs';
import utc from '@esm-repacks/dayjs/plugin/utc';
import duration from '@esm-repacks/dayjs/plugin/duration';
import timezone from '@esm-repacks/dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(duration);
dayjs.extend(timezone);

// --- 1. Basic usage: import dayjs and create instances ---
const d: Dayjs = dayjs();
const d2: Dayjs = dayjs('2023-01-15');
const d3: Dayjs = dayjs('2023-01-15', 'YYYY-MM-DD');
const d4: Dayjs = dayjs('2023-01-15', 'YYYY-MM-DD', true);
const d5: Dayjs = dayjs('2023-01-15', 'YYYY-MM-DD', 'en', true);

// --- 2. Instance methods (core) ---
const valid: boolean = d.isValid();
const cloned: Dayjs = d.clone();
const year: number = d.year();
const formatted: string = d.format('YYYY-MM-DD');
const diffMs: number = d.diff(d2);
const unixTs: number = d.unix();
const added: Dayjs = d.add(1, 'day');
const subtracted: Dayjs = d.subtract(1, 'month');
const startOf: Dayjs = d.startOf('year');
const endOf: Dayjs = d.endOf('month');
const isBefore: boolean = d.isBefore(d2);
const isSame: boolean = d.isSame(d2, 'year');
const isAfter: boolean = d.isAfter(d2);
const nativeDate: Date = d.toDate();
const iso: string = d.toISOString();

// --- 3. Static methods (core DayjsStatic) ---
const staticResult: Dayjs = dayjs.unix(1548381600);
const isDayjsResult: boolean = dayjs.isDayjs(d);
const localeStr: string = dayjs.locale();
const extended: DayjsStatic = dayjs.extend(utc);

// --- 4. PluginFunc type uses DayjsStatic ---
const myPlugin: PluginFunc = (_option, _c, _dayjs) => {
  // _dayjs should be DayjsStatic
  const _staticCheck: DayjsStatic = _dayjs;
};

// --- 5. UTC plugin — instance method augmentation (Pattern D) ---
const utcInstance: Dayjs = d.utc();
const localInstance: Dayjs = d.local();
const isUtc: boolean = d.isUTC();

// --- 6. UTC plugin — static method augmentation (Pattern G) ---
const utcStatic: Dayjs = dayjs.utc('2023-06-15T12:00:00Z');
const utcStaticFormatted: Dayjs = dayjs.utc('2023-06-15', 'YYYY-MM-DD', true);

// --- 7. Duration plugin — static const augmentation (Pattern H) ---
const dur = dayjs.duration(100);
const durHours = dayjs.duration(72, 'hours');
const durObj = dayjs.duration({ hours: 1, minutes: 30 });
const asDays: number = durHours.asDays();
const asHours: number = durHours.asHours();
const isDur: boolean = dayjs.isDuration(dur);

// --- 8. Duration plugin — instance method augmentation ---
const addedDuration: Dayjs = d.add(dur);
const subtractedDuration: Dayjs = d.subtract(dur);

// --- 9. Timezone plugin — instance method augmentation ---
const tzInstance: Dayjs = d.tz('America/New_York');
const offsetName: string | undefined = d.offsetName('long');

// --- 10. Timezone plugin — static property augmentation (Pattern I) ---
const tzStatic: Dayjs = dayjs.tz('2023-06-15', 'America/New_York');
const tzStaticFormat: Dayjs = dayjs.tz('2023-06-15', 'YYYY-MM-DD', 'America/New_York');
const guessed: string = dayjs.tz.guess();
dayjs.tz.setDefault('America/New_York');

// --- 11. Conditional augmentation: quarter is NOT imported ---
// @ts-expect-error quarter() should not exist without importing quarterOfYear plugin
d.quarter();

// @ts-expect-error isBetween() should not exist without importing isBetween plugin
d.isBetween('2023-01-01', '2023-12-31');

// @ts-expect-error fromNow() should not exist without importing relativeTime plugin
d.fromNow();

// @ts-expect-error localeData() should not exist without importing localeData plugin
d.localeData();

// @ts-expect-error max() should not exist without importing minMax plugin
dayjs.max(d, d2);

// @ts-expect-error isMoment() should not exist without importing isMoment plugin
dayjs.isMoment(d);

// @ts-expect-error updateLocale() should not exist without importing updateLocale plugin
dayjs.updateLocale('en', {});

export {};
