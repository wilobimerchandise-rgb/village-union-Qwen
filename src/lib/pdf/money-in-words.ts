const ones = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const tens = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

function convertHundreds(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100) {
    const t = tens[Math.floor(n / 10)];
    const o = ones[n % 10];
    return o ? `${t}-${o}` : t;
  }
  const h = ones[Math.floor(n / 100)];
  const rem = n % 100;
  return rem ? `${h} hundred and ${convertHundreds(rem)}` : `${h} hundred`;
}

function convertGroup(n: number, suffix: string): string {
  if (n === 0) return "";
  return `${convertHundreds(n)} ${suffix}`;
}

function convert(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  if (n >= 1_000_000_000_000) {
    parts.push(convertGroup(Math.floor(n / 1_000_000_000_000), "trillion"));
    n %= 1_000_000_000_000;
  }
  if (n >= 1_000_000_000) {
    parts.push(convertGroup(Math.floor(n / 1_000_000_000), "billion"));
    n %= 1_000_000_000;
  }
  if (n >= 1_000_000) {
    parts.push(convertGroup(Math.floor(n / 1_000_000), "million"));
    n %= 1_000_000;
  }
  if (n >= 1_000) {
    parts.push(convertGroup(Math.floor(n / 1_000), "thousand"));
    n %= 1_000;
  }
  if (n > 0) parts.push(convertHundreds(n));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function moneyInWords(amountKobo: number): string {
  if (amountKobo < 0) return "Negative amount";
  if (amountKobo === 0) return "Zero naira only";

  const naira = Math.floor(amountKobo / 100);
  const kobo = amountKobo % 100;

  const nairaWords = convert(naira);
  const koboWords = kobo > 0 ? convert(kobo) : "";

  if (kobo === 0) {
    return `${nairaWords.charAt(0).toUpperCase() + nairaWords.slice(1)} naira only`;
  }
  return `${nairaWords.charAt(0).toUpperCase() + nairaWords.slice(1)} naira and ${koboWords} kobo only`;
}
