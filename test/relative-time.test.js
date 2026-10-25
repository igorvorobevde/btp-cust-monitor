"use strict";
const { waitingText } = require("../srv/lib/relative-time");
const text = (key, args) => (args ? `${key}:${args.join(",")}` : key);
const NOW = Date.parse("2026-10-25T12:00:00Z");
test.each([
	["2026-10-25T11:59:30Z", "WAITING_NOW"],
	["2026-10-25T11:15:00Z", "WAITING_MINUTES:45"],
	["2026-10-25T08:00:00Z", "WAITING_HOURS:4"],
	["2026-10-24T11:00:00Z", "WAITING_DAY"],
	["2026-10-22T12:00:00Z", "WAITING_DAYS:3"],
	["2026-10-25T13:00:00Z", "WAITING_NOW"]
])("%s → %s", (since, expected) => expect(waitingText(since, NOW, text)).toBe(expected));
test("null or garbage → null", () => {
	expect(waitingText(null, NOW, text)).toBeNull();
	expect(waitingText("nope", NOW, text)).toBeNull();
});
