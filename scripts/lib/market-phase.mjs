const taipeiFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export function taipeiClock(now = new Date()) {
  const parts = Object.fromEntries(
    taipeiFormatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

export function isTaipeiMarketWindow(now = new Date()) {
  const { minutes } = taipeiClock(now);
  return minutes >= 9 * 60 && minutes < 13 * 60 + 34;
}

export function marketPhaseAt(quoteDate, now = new Date()) {
  const clock = taipeiClock(now);
  return quoteDate === clock.date && isTaipeiMarketWindow(now)
    ? "intraday"
    : "closed";
}
