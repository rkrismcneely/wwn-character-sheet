export function formatRecapDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(date + "T12:00:00Z"));
}

