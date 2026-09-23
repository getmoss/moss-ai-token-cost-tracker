// Shared SVG chart-drawing helpers used by index.html's three chart renderers
// (drawCombinedChart, renderOverviewChart, renderChart) — extracted because all three
// duplicated an identical SVG element builder and identical x/y pixel-scale math.
// See test/chart-dom.test.mjs for xScale/yScale/niceMax coverage.

export function createSvgElement(tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Maps a label index (0..count-1) to a pixel x position across the plot area. A
// single-label series has nothing to interpolate between, so it's centered instead.
export function xScale(count, plotWidth, marginLeft) {
  return (i) =>
    marginLeft +
    (count === 1 ? plotWidth / 2 : (i / (count - 1)) * plotWidth);
}

// Maps a value (0..max) to a pixel y position, inverted so larger values plot higher.
export function yScale(max, plotHeight, marginTop) {
  return (v) => marginTop + plotHeight - (v / max) * plotHeight;
}

// Rounds a raw max value up to a "nice" number for the axis ceiling — headroom (+15%)
// then rounded up to the nearest power-of-10 step, so gridlines land on round numbers
// instead of the exact (typically ugly) data max.
export function niceMax(rawMax) {
  const power = 10 ** Math.floor(Math.log10(rawMax || 1));
  return Math.ceil((rawMax * 1.15) / power) * power || 1;
}

// Groups a daily "YYYY-MM-DD" labels array into buckets for the Company overview
// chart's Weekly/Monthly grouping picker. Unlike lib/savings.mjs's
// weeklyTotalsFromDaily (which requires an exact multiple of 7 and throws
// otherwise), this tolerates any length — the overview chart's daily-array length
// depends on whatever date range is selected, which won't generally be a clean
// multiple of 7.
//
// "weekly": trims the oldest few days so only complete trailing 7-day weeks
// remain (same convention as trimToWeeks — a predictable full week beats one
// short partial week at the edge). "monthly": groups by calendar month (each
// label's "YYYY-MM" prefix) instead, which CAN start with a shorter partial
// month rather than dropping data, since a "month" isn't a fixed length the way
// a week is. Each bucket is labelled by its first day (same shape as the daily
// labels array, so it drops straight into the existing x-axis rendering).
export function bucketDailyLabels(labels, unit) {
  if (unit === "monthly") {
    const buckets = [];
    let current = null;
    labels.forEach((label, i) => {
      const key = label.slice(0, 7); // "YYYY-MM"
      if (!current || current.key !== key) {
        current = { key, label, indices: [] };
        buckets.push(current);
      }
      current.indices.push(i);
    });
    return buckets.map(({ label, indices }) => ({ label, indices }));
  }
  const offset = labels.length % 7;
  const buckets = [];
  for (let i = offset; i < labels.length; i += 7) {
    const indices = [0, 1, 2, 3, 4, 5, 6].map((j) => i + j);
    buckets.push({ label: labels[i], indices });
  }
  return buckets;
}

// Reduces a daily values array into one value per bucket (from
// bucketDailyLabels). `sum: true` (spend, requests) adds every day in the
// bucket; `sum: false` (adoption — a rate, not additive) takes the bucket's
// last available value, mirroring lib/planning.mjs's chunkWeeklySnapshots.
export function reduceByBuckets(values, buckets, { sum = true } = {}) {
  return buckets.map(({ indices }) =>
    sum
      ? indices.reduce((total, i) => total + (values[i] ?? 0), 0)
      : values[indices[indices.length - 1]] ?? 0,
  );
}
