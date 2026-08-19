function datePartsInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');

  if (!year || !month || !day) {
    throw new Error('No se pudo calcular la fecha civil del negocio.');
  }

  return { day, month, year };
}

export function settlementPeriodForTimeZone(
  timeZone: string,
  value = new Date(),
) {
  const { day, month, year } = datePartsInTimeZone(value, timeZone);

  return {
    periodEnd: `${year}-${month}-${day}`,
    periodStart: `${year}-${month}-01`,
  };
}
