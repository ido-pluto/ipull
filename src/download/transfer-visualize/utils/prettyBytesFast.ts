export interface PrettyBytesOptions {
    bits?: boolean;
    binary?: boolean;
    space?: boolean;
    nonBreakingSpace?: boolean;
    signed?: boolean;
    locale?: string | string[] | boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    fixedWidth?: number;
}

const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
const BIBYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
const BIT_UNITS = ['b', 'kbit', 'Mbit', 'Gbit', 'Tbit', 'Pbit', 'Ebit', 'Zbit', 'Ybit'];
const BIBIT_UNITS = ['b', 'kibit', 'Mibit', 'Gibit', 'Tibit', 'Pibit', 'Eibit', 'Zibit', 'Yibit'];

const DECIMAL_DIVISORS = [1, 1e3, 1e6, 1e9, 1e12, 1e15, 1e18, 1e21, 1e24];
const BINARY_DIVISORS = Array.from({ length: 9 }, (_, i) => 1024 ** i);
const LOG10_1024 = Math.log10(1024);

const SIG3_GE100 = new Array<string>(901);
const SIG3_GE10 = new Array<string>(901);
const SIG3_GE1 = new Array<string>(901);

for (let i = 0; i <= 900; i++) {
    const v = i + 100;

    SIG3_GE100[i] = String(v);

    const hi10 = (v / 10) | 0;
    const lo10 = v - hi10 * 10;
    SIG3_GE10[i] = lo10 === 0 ? String(hi10) : hi10 + '.' + lo10;

    const hi1 = (v / 100) | 0;
    const rem1 = v - hi1 * 100;
    const d1 = (rem1 / 10) | 0;
    const d2 = rem1 - d1 * 10;
    SIG3_GE1[i] = d2 === 0
        ? (d1 === 0 ? String(hi1) : hi1 + '.' + d1)
        : hi1 + '.' + d1 + '' + d2;
}

function sig3(n: number): string {
    if (n >= 100) {
        const i = (n + 0.5) | 0;
        return SIG3_GE100[(i <= 999 ? i : 1000) - 100];
    }
    if (n >= 10) {
        const i = (n * 10 + 0.5) | 0;
        return SIG3_GE10[(i <= 999 ? i : 1000) - 100];
    }
    const i = (n * 100 + 0.5) | 0;
    return SIG3_GE1[(i <= 999 ? i : 1000) - 100];
}

function sig3Binary(n: number): string {
    if (n >= 1000) return String((n + 0.5) | 0);
    return sig3(n);
}

// Fast trunc-mode fraction formatter — avoids toLocaleString when no locale is set
const TRUNC_POWERS = [1, 10, 100, 1000, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10];

export function formatTrunc(n: number, minFrac: number, maxFrac: number): string {
    const intPart = (n | 0);
    const frac = n - intPart;

    if (maxFrac === 0 || (frac === 0 && minFrac === 0)) return String(intPart);

    const scale = TRUNC_POWERS[maxFrac];
    let fracInt = (frac * scale) | 0;

    let digits = maxFrac;
    while (digits > minFrac && fracInt % 10 === 0) {
        fracInt = (fracInt / 10) | 0;
        digits--;
    }

    if (digits === 0) return String(intPart);

    let fracStr = String(fracInt);
    while (fracStr.length < digits) fracStr = '0' + fracStr;
    return intPart + '.' + fracStr;
}

function toLocaleStr(
    num: number,
    locale: string | string[] | boolean,
    opts: Intl.NumberFormatOptions | undefined,
): string {
    if (typeof locale === 'string' || Array.isArray(locale)) {
        return num.toLocaleString(locale as string | string[], opts);
    }
    return num.toLocaleString(undefined, opts);
}

function applyFixedWidth(result: string, fixedWidth: number): string {
    if (typeof fixedWidth !== 'number' || !Number.isSafeInteger(fixedWidth) || fixedWidth < 0) {
        throw new TypeError(`Expected fixedWidth to be a non-negative integer, got ${typeof fixedWidth}: ${fixedWidth}`);
    }
    return fixedWidth > 0 && result.length < fixedWidth ? result.padStart(fixedWidth, ' ') : result;
}

function decimalExp(n: number): number {
    if (n < 1e6) return n < 1e3 ? 0 : 1;
    if (n < 1e12) return n < 1e9 ? 2 : 3;
    if (n < 1e18) return n < 1e15 ? 4 : 5;
    return n < 1e21 ? 6 : n < 1e24 ? 7 : 8;
}

function binaryExp(n: number): number {
    if (n < 1048576) return n < 1024 ? 0 : 1;
    if (n < 1099511627776) return n < 1073741824 ? 2 : 3;
    if (n < 1125899906842624) return 4;
    if (n < BINARY_DIVISORS[6]) return 5;
    if (n < BINARY_DIVISORS[7]) return 6;
    if (n < BINARY_DIVISORS[8]) return 7;
    return 8;
}

function bigintLog10(n: bigint): number {
    const s = n.toString(10);
    return s.length + Math.log10(Number('0.' + s.slice(0, 15)));
}

function bigintDivide(n: bigint, divisor: number): number {
    const d = BigInt(divisor);
    return Number(n / d) + (Number(n % d) / divisor);
}

export default function prettyBytes(number: number | bigint, options?: PrettyBytesOptions): string {
    if (options === undefined && typeof number === 'number') {
        if (!Number.isFinite(number)) {
            throw new TypeError(`Expected a finite number, got ${typeof number}: ${number}`);
        }
        const neg = number < 0;
        if (neg) number = -number;

        let s: string;
        if (number < 1) {
            s = number + ' B';
        } else if (number < 1e3) {
            s = sig3(number) + ' B';
        } else if (number < 1e6) {
            s = sig3(number / 1e3) + ' kB';
        } else if (number < 1e9) {
            s = sig3(number / 1e6) + ' MB';
        } else if (number < 1e12) {
            s = sig3(number / 1e9) + ' GB';
        } else if (number < 1e15) {
            s = sig3(number / 1e12) + ' TB';
        } else if (number < 1e18) {
            s = sig3(number / 1e15) + ' PB';
        } else if (number < 1e21) {
            s = sig3(number / 1e18) + ' EB';
        } else if (number < 1e24) {
            s = sig3(number / 1e21) + ' ZB';
        } else {
            s = sig3(number / 1e24) + ' YB';
        }
        return neg ? '-' + s : s;
    }

    return prettyBytesFull(number, options);
}

function prettyBytesFull(number: number | bigint, options: PrettyBytesOptions | undefined): string {
    if (typeof number !== 'bigint' && !Number.isFinite(number)) {
        throw new TypeError(`Expected a finite number, got ${typeof number}: ${number}`);
    }

    const bits = options?.bits ?? false;
    const binary = options?.binary ?? false;
    const space = options?.space ?? true;
    const signed = options?.signed ?? false;
    const locale = options?.locale;
    const fixedWidth = options?.fixedWidth;
    const minimumFractionDigits = options?.minimumFractionDigits;
    const maximumFractionDigits = options?.maximumFractionDigits;

    const units = bits
        ? (binary ? BIBIT_UNITS : BIT_UNITS)
        : (binary ? BIBYTE_UNITS : BYTE_UNITS);
    const separator = space ? (options?.nonBreakingSpace ? '\u00A0' : ' ') : '';

    const isZero = typeof number === 'number' ? number === 0 : number === 0n;
    if (signed && isZero) {
        const result = ` 0${separator}${units[0]}`;
        return fixedWidth !== undefined ? applyFixedWidth(result, fixedWidth) : result;
    }

    const isNegative = number < 0;
    const prefix = isNegative ? '-' : (signed ? '+' : '');
    if (isNegative) {
        number = typeof number === 'bigint' ? -number : -(number as number);
    }

    const hasFracOpts = minimumFractionDigits !== undefined || maximumFractionDigits !== undefined;
    const useLocale = locale !== undefined;

    let result: string;

    const ltOne = typeof number === 'bigint' ? number < 1n : (number as number) < 1;
    if (ltOne) {
        const n = Number(number);
        let ns: string;
        if (useLocale) {
            const localeOpts = hasFracOpts ? {
                ...(minimumFractionDigits !== undefined && { minimumFractionDigits }),
                ...(maximumFractionDigits !== undefined && { maximumFractionDigits }),
                roundingMode: 'trunc',
            } as Intl.NumberFormatOptions : undefined;
            ns = toLocaleStr(n, locale, localeOpts);
        } else if (hasFracOpts) {
            ns = formatTrunc(n, minimumFractionDigits ?? 0, maximumFractionDigits ?? 20);
        } else {
            ns = String(n);
        }
        result = prefix + ns + separator + units[0];
    } else {
        let exp: number;
        let divided: number;

        if (typeof number === 'bigint') {
            const l = bigintLog10(number);
            exp = Math.min(Math.floor(binary ? l / LOG10_1024 : l / 3), units.length - 1);
            divided = bigintDivide(number, (binary ? 1024 : 1000) ** exp);
        } else {
            exp = binary ? binaryExp(number as number) : decimalExp(number as number);
            divided = (number as number) / (binary ? BINARY_DIVISORS[exp] : DECIMAL_DIVISORS[exp]);
        }

        let ns: string;
        if (useLocale) {
            const localeOpts = hasFracOpts ? {
                ...(minimumFractionDigits !== undefined && { minimumFractionDigits }),
                ...(maximumFractionDigits !== undefined && { maximumFractionDigits }),
                roundingMode: 'trunc',
            } as Intl.NumberFormatOptions : undefined;
            const val = hasFracOpts ? divided : Number(binary ? sig3Binary(divided) : sig3(divided));
            ns = toLocaleStr(val, locale, localeOpts);
        } else if (hasFracOpts) {
            ns = formatTrunc(divided, minimumFractionDigits ?? 0, maximumFractionDigits ?? 20);
        } else {
            ns = binary ? sig3Binary(divided) : sig3(divided);
        }

        result = prefix + ns + separator + units[exp];
    }

    return fixedWidth !== undefined ? applyFixedWidth(result, fixedWidth) : result;
}