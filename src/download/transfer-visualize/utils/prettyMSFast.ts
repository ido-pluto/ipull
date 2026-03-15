const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

const SECOND_BIGINT = 1000n;
const MINUTE_BIGINT = 60n * SECOND_BIGINT;
const HOUR_BIGINT = 60n * MINUTE_BIGINT;
const DAY_BIGINT = 24n * HOUR_BIGINT;
const YEAR_BIGINT = 365n * DAY_BIGINT;

function prettyMillisecondsCompactNumber(milliseconds: number): string {
	if (!Number.isFinite(milliseconds)) {
		throw new TypeError('Expected a finite number or bigint');
	}

	const sign = milliseconds < 0 ? '-' : '';
	let value = milliseconds < 0 ? -milliseconds : milliseconds;

	if (value >= YEAR) return sign + Math.trunc(value / YEAR) + 'y';
	if (value >= DAY) return sign + Math.trunc(value / DAY) + 'd';
	if (value >= HOUR) return sign + Math.trunc(value / HOUR) + 'h';
	if (value >= MINUTE) return sign + Math.trunc(value / MINUTE) + 'm';
	if (value >= SECOND) return sign + Math.trunc(value / SECOND) + 's';

	const roundedMilliseconds = value >= 1 ? Math.round(value) : Math.ceil(value);
	return sign + roundedMilliseconds + 'ms';
}

function prettyMillisecondsCompactBigInt(milliseconds: bigint): string {
	const sign = milliseconds < 0n ? '-' : '';
	let value = milliseconds < 0n ? -milliseconds : milliseconds;

	if (value >= YEAR_BIGINT) return sign + String(value / YEAR_BIGINT) + 'y';
	if (value >= DAY_BIGINT) return sign + String(value / DAY_BIGINT) + 'd';
	if (value >= HOUR_BIGINT) return sign + String(value / HOUR_BIGINT) + 'h';
	if (value >= MINUTE_BIGINT) return sign + String(value / MINUTE_BIGINT) + 'm';
	if (value >= SECOND_BIGINT) return sign + String(value / SECOND_BIGINT) + 's';
	return sign + String(value) + 'ms';
}

export default function prettyMillisecondsCompact(milliseconds: number | bigint): string {
	return typeof milliseconds === 'bigint'
		? prettyMillisecondsCompactBigInt(milliseconds)
		: prettyMillisecondsCompactNumber(milliseconds);
}
