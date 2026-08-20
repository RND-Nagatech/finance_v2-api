export const fiscalMonthsForYear = (year: number) => {
  const prevYearShort = String(year - 1).slice(-2);
  const thisYearShort = String(year).slice(-2);
  return [
    `DEC - ${prevYearShort}`,
    `JAN - ${thisYearShort}`,
    `FEB - ${thisYearShort}`,
    `MAR - ${thisYearShort}`,
    `APR - ${thisYearShort}`,
    `MAY - ${thisYearShort}`,
    `JUN - ${thisYearShort}`,
    `JUL - ${thisYearShort}`,
    `AUG - ${thisYearShort}`,
    `SEP - ${thisYearShort}`,
    `OCT - ${thisYearShort}`,
    `NOV - ${thisYearShort}`,
  ];
};

export const periodeToTahunFiskal = (periode: string) => {
  const parts = periode.split('-').map(p => p.trim());
  if (parts.length !== 2) return null;
  const month = parts[0];
  const yy = parts[1];
  const year = Number('20' + yy);
  if (month === 'DEC') return year + 1;
  return year;
};
