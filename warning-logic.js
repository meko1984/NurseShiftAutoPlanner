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
      afterCount: assignments.filter(({ shift }) => shift === "明").length,
      lateCount: assignments.filter(({ shift }) => shift === "遅").length,
    };
  }

  function hasConsecutiveWorkDays(data, staffId, year, month, day, length) {
    for (let offset = 0; offset < length; offset += 1) {
      if (!WORK_SHIFTS.has(getShift(data, staffId, year, month, day - offset))) {
        return false;
      }
    }
    return true;
  }

  function getPowerLabel(power) {
    return {
      1: "新人相当（P1）",
      2: "一人前相当（P2）",
      3: "中堅相当（P3）",
      4: "管理職相当（P4）",
    }[power] ?? `P${power}`;
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
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const canCheckNextDay = day < daysInMonth;

    if (totals.dayCount < rules.minDayStaff) {
      warnings.push(
        `日勤人数不足：日勤${totals.dayCount}人。最低${rules.minDayStaff}人必要。`,
      );
    }

    const hasMiddleOrVeteran = totals.dayStaff.some(
      ({ staff }) => staff.power === 2 || staff.power === 3,
    );
    if (!hasMiddleOrVeteran) {
      warnings.push(
        "日勤の中堅以上不足：一人前相当（P2）または中堅相当（P3）が日勤にいません。",
      );
    }

    if (totals.dayPower < rules.minDayPower) {
      warnings.push(
        `Power不足：日勤Powerが${totals.dayPower}です。目安は${rules.minDayPower}以上です。`,
      );
    }

    if (totals.nightStaff.length === 0) {
      warnings.push("準夜不足：入が0人です。");
    }
    if (totals.afterCount === 0) {
      warnings.push("深夜不足：明が0人です。");
    }

    assignments.forEach(({ staff, shift }) => {
      const nextShift = getShift(data, staff.id, year, month, day + 1);

      if (canCheckNextDay && shift === "入" && nextShift !== "明") {
        warnings.push(`${staff.name}さん：入の翌日が明ではありません。`);
      }
      if (canCheckNextDay && shift === "明" && nextShift !== "休") {
        warnings.push(`${staff.name}さん：明の翌日が休ではありません。`);
      }
      if (shift === "遅" && (nextShift === "日" || nextShift === "明")) {
        warnings.push(`${staff.name}さん：遅出の翌日が日または明になっています。`);
      }
      if (
        WORK_SHIFTS.has(shift) &&
        hasConsecutiveWorkDays(data, staff.id, year, month, day, 6)
      ) {
        warnings.push(`${staff.name}さん：6連勤以上になっています。`);
      }
    });

    const supportedNightExists = totals.nightStaff.some(({ staff }) => staff.power >= 2);
    const seniorNightCount = totals.nightStaff.filter(({ staff }) => staff.power >= 2).length;
    const juniorNightCount = totals.nightStaff.filter(({ staff }) => staff.power === 1).length;
    totals.nightStaff
      .filter(({ staff }) => staff.power === 1)
      .forEach(({ staff }) => {
        if (!supportedNightExists) {
          warnings.push(
            `${staff.name}さんが${getPowerLabel(1)}で入ですが、同日に一人前相当以上（P2以上）の入がいません。`,
          );
        }
      });

    if (seniorNightCount >= 2) {
      warnings.push("P2以上の入が複数います。夜勤の基本枠はP2以上1人を想定しています。");
    }
    if (juniorNightCount >= 2) {
      warnings.push("新人相当（P1）の入が複数います。新人夜勤は原則1人までを想定しています。");
    }
    if (totals.nightStaff.length >= 3) {
      warnings.push("入が3人以上います。夜勤人数が多すぎる可能性があります。");
    }
    if (totals.lateCount >= 2) {
      warnings.push("遅出が2人以上います。遅出は1日1人以下を想定しています。");
    }

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
