"use strict";

(function exposeWarningLogic(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AutoShiftWarnings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createWarningLogic() {
  const WORK_SHIFTS = new Set(["日", "遅", "入", "明"]);
  const DEFAULT_RULES = {
    minDayStaff: 3,
    minDayPower: 7,
  };

  function getWarningRules(data) {
    const saved = data.settings?.warningRules ?? {};
    return {
      minDayStaff: Number(saved.minDayStaff) || DEFAULT_RULES.minDayStaff,
      minDayPower: Number(saved.minDayPower) || DEFAULT_RULES.minDayPower,
    };
  }

  function getDateParts(year, month, day) {
    const date = new Date(year, month, day);
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
    };
  }

  function getShift(data, staffId, year, month, day) {
    const target = getDateParts(year, month, day);
    const monthKey = `${target.year}-${String(target.month + 1).padStart(2, "0")}`;
    return data.schedules?.[monthKey]?.[staffId]?.[target.day] ?? "";
  }

  function getDailyAssignments(data, year, month, day) {
    return data.staff.map((staff) => ({
      staff,
      shift: getShift(data, staff.id, year, month, day),
    }));
  }

  function getDailyTotals(assignments) {
    const dayStaff = assignments.filter(({ shift }) => shift === "日");
    return {
      dayStaff,
      dayCount: dayStaff.length,
      dayPower: dayStaff.reduce((sum, { staff }) => sum + staff.power, 0),
      nightStaff: assignments.filter(({ shift }) => shift === "入"),
      lateCount: assignments.filter(({ shift }) => shift === "遅").length,
    };
  }

  function hasFiveConsecutiveWorkDays(data, staffId, year, month, day) {
    for (let offset = 0; offset < 5; offset += 1) {
      if (!WORK_SHIFTS.has(getShift(data, staffId, year, month, day - offset))) {
        return false;
      }
    }
    return true;
  }

  function getPairIds(pair) {
    if (Array.isArray(pair)) return [pair[0], pair[1]];
    if (!pair || typeof pair !== "object") return [];
    return [
      pair.staffId1 ?? pair.firstStaffId ?? pair.a ?? pair.first,
      pair.staffId2 ?? pair.secondStaffId ?? pair.b ?? pair.second,
    ];
  }

  function getNgPairWarnings(data, year, month, day) {
    const warnings = [];
    const seen = new Set();

    (data.ngPairs ?? data.settings?.ngPairs ?? []).forEach((pair) => {
      const [firstId, secondId] = getPairIds(pair);
      if (!firstId || !secondId || firstId === secondId) return;

      const pairKey = [firstId, secondId].sort().join(":");
      if (seen.has(pairKey)) return;
      seen.add(pairKey);

      const first = data.staff.find((staff) => staff.id === firstId);
      const second = data.staff.find((staff) => staff.id === secondId);
      if (!first || !second) return;

      const firstShift = getShift(data, firstId, year, month, day);
      const secondShift = getShift(data, secondId, year, month, day);
      if (firstShift === "日" && secondShift === "日") {
        warnings.push(
          `NGペア：${first.name}さんと${second.name}さんが同じ日勤です。`,
        );
      }
      if (firstShift === "入" && secondShift === "入") {
        warnings.push(
          `NGペア：${first.name}さんと${second.name}さんが同じ夜勤入りです。`,
        );
      }
    });

    return warnings;
  }

  function getWarnings(data, year, month, day) {
    const warnings = [];
    const rules = getWarningRules(data);
    const assignments = getDailyAssignments(data, year, month, day);
    const totals = getDailyTotals(assignments);

    if (totals.dayCount < rules.minDayStaff) {
      warnings.push(
        `日勤人数不足：日勤${totals.dayCount}人。最低${rules.minDayStaff}人必要。`,
      );
    }

    const hasMiddleOrVeteran = totals.dayStaff.some(
      ({ staff }) => staff.power === 2 || staff.power === 3,
    );
    if (!hasMiddleOrVeteran) {
      warnings.push("日勤の中堅以上不足：P2またはP3が日勤にいません。");
    }

    if (totals.dayPower < rules.minDayPower) {
      warnings.push(
        `Power不足：日勤Powerが${totals.dayPower}です。目安は${rules.minDayPower}以上です。`,
      );
    }

    assignments.forEach(({ staff, shift }) => {
      const nextShift = getShift(data, staff.id, year, month, day + 1);

      if (shift === "入" && nextShift !== "明") {
        warnings.push(`${staff.name}さん：入の翌日が明ではありません。`);
      }
      if (shift === "明" && nextShift !== "休") {
        warnings.push(`${staff.name}さん：明の翌日が休ではありません。`);
      }
      if (shift === "遅" && (nextShift === "日" || nextShift === "明")) {
        warnings.push(`${staff.name}さん：遅出の翌日が日または明になっています。`);
      }
      if (
        WORK_SHIFTS.has(shift) &&
        hasFiveConsecutiveWorkDays(data, staff.id, year, month, day)
      ) {
        warnings.push(`${staff.name}さん：5連勤以上になっています。`);
      }
    });

    const supportedNightExists = totals.nightStaff.some(({ staff }) => staff.power >= 2);
    totals.nightStaff
      .filter(({ staff }) => staff.power === 1)
      .forEach(({ staff }) => {
        if (!supportedNightExists) {
          warnings.push(
            `${staff.name}さんがP1で入ですが、同日にP2以上の入がいません。`,
          );
        }
      });

    if (
      totals.nightStaff.length === 1 &&
      totals.nightStaff[0].staff.power >= 2 &&
      totals.lateCount === 0
    ) {
      warnings.push("通常夜勤ですが、遅出がいません。");
    }

    warnings.push(...getNgPairWarnings(data, year, month, day));
    return warnings;
  }

  return {
    DEFAULT_RULES,
    getWarnings,
  };
});
