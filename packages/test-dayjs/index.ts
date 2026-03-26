import dayjs from '@esm-repacks/dayjs';
import utc from '@esm-repacks/dayjs/plugin/utc';
import duration from '@esm-repacks/dayjs/plugin/duration';

dayjs.extend(utc);
dayjs.extend(duration);

const d = dayjs();

// Should pass now
d.utc();

// Should also pass
dayjs.duration(100);

// Should fail because quarter is not imported
// @ts-expect-error
d.quarter();

export {};
