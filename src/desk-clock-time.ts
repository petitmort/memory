const pad = (value: number) => String(value).padStart(2, '0');
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

/** Device-local civil time; deliberately independent of the outdoor debug calendar. */
export function clockReading(timestampMs: number) {
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Clock time must be finite and representable.');
  const year = date.getFullYear(), month = date.getMonth() + 1, day = date.getDate();
  const hour = pad(date.getHours()), minute = pad(date.getMinutes()), weekday = weekdays[date.getDay()];
  const dateKey = `${year}-${pad(month)}-${pad(day)}`;
  return {
    key: `${dateKey}T${hour}:${minute}`, dateKey, hour, minute,
    date: `${pad(month)}月${pad(day)}日  周${weekday}`,
    accessible: `${year}年${month}月${day}日，星期${weekday}，${hour}点${minute}分`,
  };
}
