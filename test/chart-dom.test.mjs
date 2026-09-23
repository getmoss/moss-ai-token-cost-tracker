import { test } from "node:test";
import assert from "node:assert/strict";
import { xScale, yScale, niceMax, bucketDailyLabels, reduceByBuckets } from "../lib/chart-dom.mjs";

// "YYYY-MM-DD" labels for `count` consecutive days starting at `startIso`.
function datesFrom(startIso, count) {
  const start = new Date(`${startIso}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

test("xScale: spreads indices evenly across the plot width", () => {
  const scale = xScale(5, 100, 10);
  assert.equal(scale(0), 10);
  assert.equal(scale(4), 110);
  assert.equal(scale(2), 60);
});

test("xScale: a single label centers instead of dividing by zero", () => {
  const scale = xScale(1, 100, 10);
  assert.equal(scale(0), 60);
});

test("yScale: maps 0 to the bottom of the plot and max to the top (inverted)", () => {
  const scale = yScale(200, 100, 10);
  assert.equal(scale(0), 110);
  assert.equal(scale(200), 10);
  assert.equal(scale(100), 60);
});

test("niceMax: adds 15% headroom then rounds up to the next multiple of its own order of magnitude", () => {
  assert.equal(niceMax(42), 50);
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(87), 110);
});

test("niceMax: applies the same rule at larger magnitudes", () => {
  assert.equal(niceMax(1000), 2000);
  assert.equal(niceMax(4321), 5000);
});

test("bucketDailyLabels: weekly splits an exact multiple of 7 into full weeks", () => {
  const labels = datesFrom("2026-01-01", 14);
  const buckets = bucketDailyLabels(labels, "weekly");
  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets[0].indices, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(buckets[0].label, "2026-01-01");
  assert.deepEqual(buckets[1].indices, [7, 8, 9, 10, 11, 12, 13]);
  assert.equal(buckets[1].label, "2026-01-08");
});

test("bucketDailyLabels: weekly drops the oldest few days so only complete trailing weeks remain", () => {
  const labels = datesFrom("2026-01-01", 10); // 10 % 7 = 3 leading days dropped
  const buckets = bucketDailyLabels(labels, "weekly");
  assert.equal(buckets.length, 1);
  assert.deepEqual(buckets[0].indices, [3, 4, 5, 6, 7, 8, 9]);
  assert.equal(buckets[0].label, "2026-01-04");
});

test("bucketDailyLabels: monthly groups by calendar month, allowing a shorter partial first month", () => {
  const labels = datesFrom("2026-01-30", 5); // Jan 30, 31, Feb 1, 2, 3
  const buckets = bucketDailyLabels(labels, "monthly");
  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets[0].indices, [0, 1]);
  assert.equal(buckets[0].label, "2026-01-30");
  assert.deepEqual(buckets[1].indices, [2, 3, 4]);
  assert.equal(buckets[1].label, "2026-02-01");
});

test("reduceByBuckets: sum adds every day in each bucket", () => {
  const buckets = [{ indices: [0, 1, 2] }, { indices: [3, 4] }];
  assert.deepEqual(reduceByBuckets([10, 20, 30, 40, 50], buckets), [60, 90]);
});

test("reduceByBuckets: sum treats a missing/undefined value as 0", () => {
  const buckets = [{ indices: [0, 1] }];
  assert.deepEqual(reduceByBuckets([5, undefined], buckets), [5]);
});

test("reduceByBuckets: sum:false takes the bucket's last available value (rate/snapshot metrics)", () => {
  const buckets = [{ indices: [0, 1, 2] }, { indices: [3, 4] }];
  assert.deepEqual(reduceByBuckets([70, 71, 72.5, 73, 74.2], buckets, { sum: false }), [72.5, 74.2]);
});
