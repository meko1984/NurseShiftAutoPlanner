"use strict";

(function exposeWarningLogic(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AutoShiftWarnings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createWarningLogic() {
  const DEFAULT_RULES = {
    minDayStaff: 3,
    minDayPower: 7,
    targetPublicHoliday: 9,
    consecutiveWorkDays: 6,
    maxLateStaff: 1,
    maxNightStaff: 2,
    minDeepNightStaff: 1,
    minEveningStaff: 1,
  };

  function readRule(saved, key) {
    const value = Number(saved[key]);
    return Number.isFinite(value) ? value : DEFAULT_RULES[key];
  }

  function getWarningRules(data) {
    const saved = data.settings?.warningRules ?? {};
    return {
      minDayStaff: readRule(saved, "minDayStaff"),
      minDayPower: readRule(saved, "minDayPower"),
      targetPublicHoliday: readRule(saved, "targetPublicHoliday"),
      consecutiveWorkDays: Math.max(1, readRule(saved, "consecutiveWorkDays")),
      maxLateStaff: readRule(saved, "maxLateStaff"),
      maxNightStaff: readRule(saved, "maxNightStaff"),
      minDeepNightStaff: readRule(saved, "minDeepNightStaff"),
      minEveningStaff: readRule(saved, "minEveningStaff"),
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

  function getShiftType(data, symbol) {
    return data.shiftTypes?.find((type) => type.symbol === symbol) ?? null;
  }

  function hasFlag(data, symbol, flag) {
    return Boolean(getShiftType(data, symbol)?.[flag]);
  }

  function getDailyTotals(assignments) {
    const data = assignments[0]?.data;
    const dayStaff = assignments.filter(({ shift, shiftType }) => shiftType?.countsAsDay);
    return {
      dayStaff,
      dayCount: dayStaff.length,
      dayPower: assignments.filter(({ shiftType }) => shiftType?.countsForPower).reduce((sum, { staff }) => sum + staff.power, 0),
      nightStaff: assignments.filter(({ shiftType }) => shiftType?.countsAsEvening),
      afterCount: assignments.filter(({ shiftType }) => shiftType?.countsAsDeepNight).length,
      lateCount: assignments.filter(({ shiftType }) => shiftType?.countsAsLate).length,
    };
  }

  function hasConsecutiveWorkDays(data, staffId, year, month, day, length) {
    for (let offset = 0; offset < length; offset += 1) {
      if (!hasFlag(data, getShift(data, staffId, year, month, day - offset), "countsForConsecutive")) {
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
      if (hasFlag(data, firstShift, "countsAsDay") && hasFlag(data, secondShift, "countsAsDay")) {
        warnings.push(
          `NGペア：${first.name}さんと${second.name}さんが同じ日勤です。`,
        );
      }
      if (hasFlag(data, firstShift, "countsAsEvening") && hasFlag(data, secondShift, "countsAsEvening")) {
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
    const assignments = getDailyAssignments(data, year, month, day).map((assignment) => ({
      ...assignment,
      shiftType: getShiftType(data, assignment.shift),
    }));
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

    if (totals.nightStaff.length < rules.minEveningStaff) {
      warnings.push(`準夜不足：入が${totals.nightStaff.length}人です。`);
    }
    if (totals.afterCount < rules.minDeepNightStaff) {
      warnings.push(`深夜不足：明が${totals.afterCount}人です。`);
    }

    assignments.forEach(({ staff, shift, shiftType }) => {
      const nextShift = getShift(data, staff.id, year, month, day + 1);

      if (canCheckNextDay && shiftType?.requiredNext && nextShift !== shiftType.requiredNext) {
        warnings.push(`${staff.name}さん：${shiftType.name}の翌日が${getShiftType(data, shiftType.requiredNext)?.name ?? shiftType.requiredNext}ではありません。`);
      }
      if (canCheckNextDay && shiftType?.forbiddenNext?.includes(nextShift)) {
        warnings.push(`${staff.name}さん：${shiftType.name}の翌日に禁止勤務（${getShiftType(data, nextShift)?.name ?? nextShift}）があります。`);
      }
      if (
        shiftType?.countsForConsecutive &&
        hasConsecutiveWorkDays(data, staff.id, year, month, day, rules.consecutiveWorkDays)
      ) {
        warnings.push(`${staff.name}さん：${rules.consecutiveWorkDays}連勤以上になっています。`);
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
    if (totals.nightStaff.length > rules.maxNightStaff) {
      warnings.push(
        `入が${rules.maxNightStaff + 1}人以上います。夜勤人数が多すぎる可能性があります。`,
      );
    }
    if (totals.lateCount > rules.maxLateStaff) {
      warnings.push(
        `遅出が${rules.maxLateStaff + 1}人以上います。遅出は1日${rules.maxLateStaff}人以下を想定しています。`,
      );
    }

    if (
      totals.nightStaff.length === 1 &&
      totals.nightStaff[0].staff.power >= 2 &&
      totals.lateCount === 0
    ) {
      warnings.push("通常夜勤ですが、遅出がいません。");
    }

    warnings.push(...getNgPairWarnings(data, year, month, day));

    if (day === daysInMonth) {
      data.staff.forEach((staff) => {
        const limits = staff.limits ?? {};
        const totals = { late: 0, evening: 0 };
        for (let targetDay = 1; targetDay <= daysInMonth; targetDay += 1) {
          const type = getShiftType(data, getShift(data, staff.id, year, month, targetDay));
          if (!type) continue;
          if (type.countsAsEvening) totals.evening += 1;
          if (type.countsAsLate) totals.late += 1;
        }
        [["遅出", "late"], ["入", "evening"]]
          .forEach(([label, key]) => {
            const limit = Number(limits[key]);
            if (Number.isFinite(limit) && totals[key] > limit) {
              warnings.push(`${staff.name}さんの${label}回数が上限を超えています。（${totals[key]}/${limit}）`);
            }
          });
        const consecutiveLimit = Number(limits.consecutive);
        if (Number.isFinite(consecutiveLimit)) {
          let current = 0;
          let longest = 0;
          for (let targetDay = 1; targetDay <= daysInMonth; targetDay += 1) {
            const shift = getShift(data, staff.id, year, month, targetDay);
            if (hasFlag(data, shift, "countsForConsecutive")) {
              current += 1;
              longest = Math.max(longest, current);
            } else current = 0;
          }
          if (longest > consecutiveLimit) {
            warnings.push(`${staff.name}さんの連勤が上限を超えています。（${longest}/${consecutiveLimit}）`);
          }
        }
      });
    }
    return warnings;
  }

  return {
    DEFAULT_RULES,
    getWarnings,
  };
});
