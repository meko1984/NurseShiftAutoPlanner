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

  function isBuiltInRuleEnabled(data, id) {
    return data.settings?.builtInRules?.[id] !== false;
  }

  function countShiftBySymbol(data, year, month, day, symbol) {
    return data.staff.filter((staff) => getShift(data, staff.id, year, month, day) === symbol).length;
  }

  function compareCustomCount(actual, expected, comparison) {
    if (comparison === "lte") return actual <= expected;
    if (comparison === "eq") return actual === expected;
    return actual >= expected;
  }

  function customRuleTargetIncludes(rule, target) {
    return rule.target === "both" || rule.target === target;
  }

  function getActiveCustomRules(data, type) {
    return (data.settings?.customRules ?? [])
      .filter((rule) => rule?.enabled !== false && (!type || rule.type === type));
  }

  function isCustomZeroSuppressed(data, year, month, day, targetShift, target) {
    return getActiveCustomRules(data, "zero-suppression").some((rule) => {
      if (rule.targetShift !== targetShift || !customRuleTargetIncludes(rule, target)) return false;
      return compareCustomCount(
        countShiftBySymbol(data, year, month, day, rule.conditionShift),
        Number(rule.count) || 0,
        rule.comparison,
      );
    });
  }

  function getCustomPowerFollowViolations(data, year, month, day) {
    const violations = [];
    getActiveCustomRules(data, "power-follow").forEach((rule) => {
      const triggerStaff = data.staff.filter(
        (staff) => staff.power === rule.conditionPower && getShift(data, staff.id, year, month, day) === rule.conditionShift,
      );
      if (!triggerStaff.length) return;
      const supportCount = data.staff.filter(
        (staff) => staff.power >= rule.requiredPowerMin && getShift(data, staff.id, year, month, day) === rule.requiredShift,
      ).length;
      if (supportCount >= rule.requiredCount) return;
      violations.push({ rule, triggerStaff, supportCount });
    });
    return violations;
  }

  function hasCustomRuleReplacingJuniorNightSupport(data) {
    return getActiveCustomRules(data, "power-follow").some((rule) =>
      rule.conditionPower === 1 &&
      rule.conditionShift === "入" &&
      rule.requiredPowerMin === 2 &&
      rule.requiredShift === "入" &&
      rule.requiredCount >= 1
    );
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

    if (isBuiltInRuleEnabled(data, "min-day-staff") && totals.dayCount < rules.minDayStaff) {
      warnings.push(
        `日勤人数不足：日勤${totals.dayCount}人。最低${rules.minDayStaff}人必要。`,
      );
    }

    const hasMiddleOrVeteran = totals.dayStaff.some(
      ({ staff }) => staff.power === 2 || staff.power === 3,
    );
    if (isBuiltInRuleEnabled(data, "middle-staff-day") && !hasMiddleOrVeteran) {
      warnings.push(
        "日勤の中堅以上不足：一人前相当（P2）または中堅相当（P3）が日勤にいません。",
      );
    }

    if (isBuiltInRuleEnabled(data, "min-day-power") && totals.dayPower < rules.minDayPower) {
      warnings.push(
        `Power不足：日勤Powerが${totals.dayPower}です。目安は${rules.minDayPower}以上です。`,
      );
    }

    if (
      isBuiltInRuleEnabled(data, "min-evening") &&
      totals.nightStaff.length < rules.minEveningStaff &&
      !(totals.nightStaff.length === 0 && isCustomZeroSuppressed(data, year, month, day, "入", "warning"))
    ) {
      warnings.push(`準夜不足：入が${totals.nightStaff.length}人です。`);
    }
    if (
      isBuiltInRuleEnabled(data, "min-deep-night") &&
      totals.afterCount < rules.minDeepNightStaff &&
      !(totals.afterCount === 0 && isCustomZeroSuppressed(data, year, month, day, "明", "warning"))
    ) {
      warnings.push(`深夜不足：明が${totals.afterCount}人です。`);
    }

    assignments.forEach(({ staff, shift, shiftType }) => {
      const nextShift = getShift(data, staff.id, year, month, day + 1);

      if (isBuiltInRuleEnabled(data, "required-next") && canCheckNextDay && shiftType?.requiredNext && nextShift !== shiftType.requiredNext) {
        warnings.push(`${staff.name}さん：${shiftType.name}の翌日が${getShiftType(data, shiftType.requiredNext)?.name ?? shiftType.requiredNext}ではありません。`);
      }
      if (isBuiltInRuleEnabled(data, "forbidden-next") && canCheckNextDay && shiftType?.forbiddenNext?.includes(nextShift)) {
        warnings.push(`${staff.name}さん：${shiftType.name}の翌日に禁止勤務（${getShiftType(data, nextShift)?.name ?? nextShift}）があります。`);
      }
      if (
        isBuiltInRuleEnabled(data, "consecutive-work") &&
        shiftType?.countsForConsecutive &&
        hasConsecutiveWorkDays(data, staff.id, year, month, day, rules.consecutiveWorkDays)
      ) {
        warnings.push(`${staff.name}さん：${rules.consecutiveWorkDays}連勤以上になっています。`);
      }
    });

    const supportedNightExists = totals.nightStaff.some(({ staff }) => staff.power >= 2);
    const seniorNightCount = totals.nightStaff.filter(({ staff }) => staff.power >= 2).length;
    const juniorNightCount = totals.nightStaff.filter(({ staff }) => staff.power === 1).length;
    if (isBuiltInRuleEnabled(data, "junior-night-support") && !hasCustomRuleReplacingJuniorNightSupport(data)) {
      totals.nightStaff
        .filter(({ staff }) => staff.power === 1)
        .forEach(({ staff }) => {
          if (!supportedNightExists) {
            warnings.push(
              `${staff.name}さんが${getPowerLabel(1)}で入ですが、同日に一人前相当以上（P2以上）の入がいません。`,
            );
          }
        });
    }

    if (isBuiltInRuleEnabled(data, "senior-night-overlap") && seniorNightCount >= 2) {
      warnings.push("P2以上の入が複数います。夜勤の基本枠はP2以上1人を想定しています。");
    }
    if (isBuiltInRuleEnabled(data, "junior-night-overlap") && juniorNightCount >= 2) {
      warnings.push("新人相当（P1）の入が複数います。新人夜勤は原則1人までを想定しています。");
    }
    if (isBuiltInRuleEnabled(data, "night-staff-excess") && totals.nightStaff.length > rules.maxNightStaff) {
      warnings.push(
        `入が${rules.maxNightStaff + 1}人以上います。夜勤人数が多すぎる可能性があります。`,
      );
    }
    if (isBuiltInRuleEnabled(data, "late-staff-excess") && totals.lateCount > rules.maxLateStaff) {
      warnings.push(
        `遅出が${rules.maxLateStaff + 1}人以上います。遅出は1日${rules.maxLateStaff}人以下を想定しています。`,
      );
    }

    if (
      totals.nightStaff.length === 1 &&
      totals.nightStaff[0].staff.power >= 2 &&
      totals.lateCount === 0 &&
      isBuiltInRuleEnabled(data, "late-zero") &&
      !isCustomZeroSuppressed(data, year, month, day, "遅", "warning")
    ) {
      warnings.push("通常夜勤ですが、遅出がいません。");
    }

    getCustomPowerFollowViolations(data, year, month, day).forEach(({ rule, triggerStaff, supportCount }) => {
      warnings.push(
        `カスタム設定：P${rule.conditionPower}の${triggerStaff.map((item) => item.name).join("、")}さんが${getShiftType(data, rule.conditionShift)?.name ?? rule.conditionShift}です。P${rule.requiredPowerMin}以上のスタッフを${getShiftType(data, rule.requiredShift)?.name ?? rule.requiredShift}に${rule.requiredCount}人以上必要です。（現在${supportCount}人）`,
      );
    });

    if (isBuiltInRuleEnabled(data, "ng-pair")) {
      warnings.push(...getNgPairWarnings(data, year, month, day));
    }

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
            if (isBuiltInRuleEnabled(data, "staff-limits") && Number.isFinite(limit) && totals[key] > limit) {
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
          if (isBuiltInRuleEnabled(data, "staff-limits") && longest > consecutiveLimit) {
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
