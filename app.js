"use strict";

const STORAGE_KEY = "autoShiftTool.data";
const DATA_VERSION = 7.3;
const APP_VERSION = "0.7.3";
const SHIFT_TYPE_CATEGORIES = ["日勤", "研修", "遅出", "準夜", "深夜", "休み", "有休", "その他勤務", "その他休み"];
const SHIFT_COMPOSITION_TYPES = {
  NORMAL: "normal",
  HALF_DAY: "half-day",
};
const SHIFT_TYPE_FLAGS = [
  "isWork", "isRest", "countsAsDay", "countsAsLate", "countsAsEvening",
  "countsAsDeepNight", "countsAsPublicHoliday", "countsAsPaid", "countsAsSummer",
  "countsAsWinter", "countsForPower", "countsForConsecutive", "useForAuto",
  "blockedBeforeRequestedOff",
];
const DEFAULT_STAFF_LIMITS = {
  late: 4,
  evening: 4,
  consecutive: 6,
};
const REQUEST_LABELS = {
  "": "希望を削除",
  休: "休*",
  有: "有*",
  日: "日*",
  研: "研*",
  遅: "遅*",
  入: "入*",
  明: "明*",
  "日/遅": "日*/遅*",
  夏: "夏*",
  冬: "冬*",
};
const SHIFT_CLASS = {
  日: "shift-day",
  研: "shift-day",
  遅: "shift-late",
  入: "shift-night",
  明: "shift-after",
  休: "shift-off",
  有: "shift-paid",
  夏: "shift-summer",
  冬: "shift-winter",
};
function createDefaultShiftTypes() {
  const base = {
    isWork: false, isRest: false, countsAsDay: false, countsAsLate: false,
    countsAsEvening: false, countsAsDeepNight: false, countsAsPublicHoliday: false,
    countsAsPaid: false, countsAsSummer: false, countsAsWinter: false,
    countsForPower: false, countsForConsecutive: false, useForAuto: true,
    blockedBeforeRequestedOff: false, requiredNext: "", forbiddenNext: [],
    compositionType: SHIFT_COMPOSITION_TYPES.NORMAL, morningShift: "", afternoonShift: "",
  };
  return [
    { ...base, symbol: "日", name: "日勤", category: "日勤", color: "#dcefe5", isWork: true, countsAsDay: true, countsForPower: true, countsForConsecutive: true },
    { ...base, symbol: "研", name: "研修", category: "研修", color: "#e4f1dd", isWork: true, countsAsDay: true, countsForPower: true, countsForConsecutive: true },
    { ...base, symbol: "遅", name: "遅出", category: "遅出", color: "#ffe6c7", isWork: true, countsAsLate: true, countsForConsecutive: true, forbiddenNext: ["日", "明"] },
    { ...base, symbol: "入", name: "準夜", category: "準夜", color: "#d8e8ff", isWork: true, countsAsEvening: true, countsForConsecutive: true, requiredNext: "明" },
    { ...base, symbol: "明", name: "深夜", category: "深夜", color: "#d9f1f5", isWork: true, countsAsDeepNight: true, countsForConsecutive: true, requiredNext: "休" },
    { ...base, symbol: "休", name: "公休", category: "休み", color: "#eeeeee", isRest: true, countsAsPublicHoliday: true },
    { ...base, symbol: "有", name: "有休", category: "有休", color: "#f7e4ef", isRest: true, countsAsPaid: true },
    { ...base, symbol: "夏", name: "夏休", category: "その他休み", color: "#fff0b8", isRest: true, countsAsSummer: true },
    { ...base, symbol: "冬", name: "冬休", category: "その他休み", color: "#e4e8ff", isRest: true, countsAsWinter: true },
  ];
}
const AUTO_PLACEMENT_DEFAULTS = {
  targetDayStaff: 3,
  maxNightStaff: 1,
  maxLateStaff: 1,
  warningWeight: 5,
  dayShortageWeight: 1,
  dayExcessWeight: 20,
  nightExcessWeight: 20,
  lateExcessWeight: 15,
  staffBalanceWeight: 2,
  shortPatternWeight: 2,
  patternReuseWeight: 3,
  staffLimitWeight: 1,
};
const DEFAULT_WARNING_RULES = {
  minDayStaff: 3,
  minDayPower: 7,
  targetPublicHoliday: 9,
  consecutiveWorkDays: 6,
  maxLateStaff: 1,
  maxNightStaff: 2,
  minDeepNightStaff: 1,
  minEveningStaff: 1,
};
const CUSTOM_RULE_TYPES = {
  ZERO_SUPPRESSION: "zero-suppression",
  POWER_FOLLOW: "power-follow",
  POWER_COUNT_EXCESS: "power-count-excess",
  NG_PAIR_SHIFT: "ng-pair-shift",
};
const CUSTOM_RULE_TARGETS = ["warning", "score", "both"];
const CUSTOM_RULE_COMPARISONS = ["gte", "lte", "eq"];
const CUSTOM_POWER_MODES = ["exact", "min"];
const CUSTOM_NG_PAIR_MODES = ["same", "cross"];
const CUSTOM_RULE_COMPARISON_LABELS = {
  gte: "以上",
  lte: "以下",
  eq: "ちょうど",
};
const CUSTOM_RULE_TARGET_LABELS = {
  warning: "警告",
  score: "減点",
  both: "警告と減点",
};
const CUSTOM_POWER_MODE_LABELS = {
  exact: "ちょうど",
  min: "以上",
};
const CUSTOM_NG_PAIR_MODE_LABELS = {
  same: "同じ勤務",
  cross: "勤務Aと勤務B",
};
const BUILT_IN_RULE_DEFINITIONS = [
  { id: "min-day-staff", label: "日勤最低人数", detail: "日勤人数がルール設定の最低人数を下回る場合に警告・減点します。" },
  { id: "min-day-power", label: "日勤Power不足", detail: "日勤Powerがルール設定の最低値を下回る場合に警告・減点します。" },
  { id: "middle-staff-day", label: "日勤P2/P3なし", detail: "日勤にP2またはP3がいない場合に警告・減点します。" },
  { id: "min-evening", label: "準夜不足", detail: "入の人数がルール設定の最低人数を下回る場合に警告・減点します。" },
  { id: "min-deep-night", label: "深夜不足", detail: "明の人数がルール設定の最低人数を下回る場合に警告・減点します。" },
  { id: "late-zero", label: "遅出0", detail: "遅出が0人の日を減点し、通常夜勤で遅出0の場合は警告します。" },
  { id: "required-next", label: "翌日に必要な勤務", detail: "勤務形態設定の翌日必要勤務に合わない場合に警告・減点します。" },
  { id: "forbidden-next", label: "翌日に禁止する勤務", detail: "勤務形態設定の翌日禁止勤務に該当する場合に警告・減点します。" },
  { id: "consecutive-work", label: "連勤警告", detail: "連勤日数がルール設定の警告日数以上の場合に警告・減点します。" },
  { id: "junior-night-support", label: "P1入フォロー不足", detail: "P1が入で同日にP2以上の入がいない場合に警告・減点します。" },
  { id: "senior-night-overlap", label: "P2以上の入被り", detail: "P2以上の入が複数いる場合に警告・減点します。" },
  { id: "junior-night-overlap", label: "P1入の複数配置", detail: "P1の入が複数いる場合に警告・減点します。" },
  { id: "night-staff-excess", label: "入最大人数超過", detail: "入の人数がルール設定の最大人数を超える場合に警告・減点します。" },
  { id: "late-staff-excess", label: "遅出最大人数超過", detail: "遅出の人数がルール設定の最大人数を超える場合に警告・減点します。" },
  { id: "ng-pair", label: "NGペア被り", detail: "NGペアが同じ日勤または同じ入になる場合に警告・減点します。" },
  { id: "public-holiday-target", label: "公休目標日数", detail: "公休数がルール設定の目標日数と異なる場合に減点します。" },
  { id: "staff-balance", label: "勤務回数バランス", detail: "スタッフ間の日勤回数差・入回数差が大きい場合に減点します。" },
  { id: "staff-limits", label: "スタッフ別上限", detail: "スタッフ別の遅出・入・連勤上限を超える場合に警告・減点します。" },
];

const RULE_MIN_VALUES = {
  minDayStaff: 0,
  minDayPower: 0,
  targetPublicHoliday: 0,
  consecutiveWorkDays: 1,
  maxLateStaff: 0,
  maxNightStaff: 0,
  minDeepNightStaff: 0,
  minEveningStaff: 0,
};
const SCORE_RULES = {
  warning: 1,
  powerShortage: 3,
  dayShortage: 3,
  publicHolidayMismatch: 5,
  deepNightZero: 5,
  eveningZero: 5,
  lateZero: 2,
  dayCountImbalance: 1,
  nightCountImbalance: 1,
  nightToAfterViolation: 5,
  afterToOffViolation: 5,
  lateNextDayViolation: 5,
  juniorNightSupportShortage: 5,
  ngPairNight: 3,
  ngPairDay: 2,
  sixConsecutiveWorkDays: 4,
  middleStaffShortage: 3,
  seniorNightOverlap: 3,
  juniorNightOverlap: 3,
  nightStaffExcess: 2,
  lateStaffExcess: 2,
  staffLimitExceeded: 3,
  customPowerFollow: 5,
  customPowerCountExcess: 3,
  customNgPairShift: 3,
};

function createDefaultCustomRules() {
  return [];
}

function createDefaultBuiltInRuleSettings() {
  return Object.fromEntries(BUILT_IN_RULE_DEFINITIONS.map((rule) => [rule.id, true]));
}

function createCustomRuleId(type) {
  return `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createCustomRuleTemplate(type) {
  if (type === CUSTOM_RULE_TYPES.POWER_FOLLOW) {
    return {
      id: createCustomRuleId(type),
      type,
      enabled: true,
      conditionPower: 1,
      conditionShift: "入",
      requiredPowerMin: 2,
      requiredShift: "入",
      requiredCount: 1,
    };
  }
  if (type === CUSTOM_RULE_TYPES.POWER_COUNT_EXCESS) {
    return {
      id: createCustomRuleId(type),
      type,
      enabled: true,
      powerMode: "min",
      powerValue: 2,
      targetShift: "入",
      count: 2,
      target: "both",
    };
  }
  if (type === CUSTOM_RULE_TYPES.NG_PAIR_SHIFT) {
    return {
      id: createCustomRuleId(type),
      type,
      enabled: true,
      pairMode: "same",
      shiftA: "遅",
      shiftB: "入",
      target: "both",
    };
  }
  return {
    id: createCustomRuleId(CUSTOM_RULE_TYPES.ZERO_SUPPRESSION),
    type: CUSTOM_RULE_TYPES.ZERO_SUPPRESSION,
    enabled: true,
    conditionShift: "入",
    count: 2,
    comparison: "gte",
    targetShift: "遅",
    target: "both",
  };
}

function createInitialData() {
  const now = new Date();
  return {
    version: DATA_VERSION,
    display: {
      year: now.getFullYear(),
      month: now.getMonth(),
    },
    staff: [
      { id: "A", name: "A", power: 4 },
      { id: "B", name: "B", power: 4 },
      { id: "C", name: "C", power: 3 },
      { id: "D", name: "D", power: 3 },
      { id: "E", name: "E", power: 2 },
      { id: "F", name: "F", power: 2 },
      { id: "G", name: "G", power: 2 },
      { id: "H", name: "H", power: 2 },
      { id: "I", name: "I", power: 1 },
      { id: "J", name: "J", power: 1 },
      { id: "K", name: "K", power: 1 },
    ].map((staff) => ({
      ...staff,
      autoTarget: true,
      autoPlacementTarget: true,
      autoAdjustmentTarget: true,
      limits: { ...DEFAULT_STAFF_LIMITS },
    })),
    shiftTypes: createDefaultShiftTypes(),
    schedules: {},
    requests: {},
    dayNotes: {},
    ngPairs: [],
    patterns: [
      { id: "pattern-1", name: "基本1", shifts: ["日", "遅", "入", "明", "休"], useForAuto: true },
      { id: "pattern-2", name: "基本2", shifts: ["日", "遅", "休"], useForAuto: true },
      { id: "pattern-3", name: "夜勤", shifts: ["入", "明", "休"], useForAuto: true },
      { id: "pattern-4", name: "遅出", shifts: ["遅", "休"], useForAuto: true },
      { id: "pattern-5", name: "2日勤", shifts: ["日", "日"], useForAuto: true },
      { id: "pattern-6", name: "管理者", shifts: ["日", "日", "日", "日", "日", "休", "休"], useForAuto: false },
    ],
    settings: {
      selectedPatternId: "pattern-1",
      warningRules: { ...DEFAULT_WARNING_RULES },
      customRules: createDefaultCustomRules(),
      builtInRules: createDefaultBuiltInRuleSettings(),
      generation: {},
      highlightColor: "#2e7d5c",
    },
  };
}

function normalizeNgPairs(pairs, staff) {
  if (!Array.isArray(pairs)) return [];

  const staffIds = new Set(staff.map((item) => item.id));
  const seen = new Set();
  const normalized = [];

  pairs.forEach((pair) => {
    const firstId = Array.isArray(pair)
      ? pair[0]
      : pair?.staffId1 ?? pair?.firstStaffId ?? pair?.a ?? pair?.first;
    const secondId = Array.isArray(pair)
      ? pair[1]
      : pair?.staffId2 ?? pair?.secondStaffId ?? pair?.b ?? pair?.second;
    if (
      typeof firstId !== "string" ||
      typeof secondId !== "string" ||
      firstId === secondId ||
      !staffIds.has(firstId) ||
      !staffIds.has(secondId)
    ) {
      return;
    }

    const normalizedPair = [firstId, secondId].sort();
    const key = normalizedPair.join(":");
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(normalizedPair);
  });

  return normalized;
}

function normalizeShiftTypes(savedTypes) {
  const defaults = createDefaultShiftTypes();
  const source = Array.isArray(savedTypes) && savedTypes.length ? savedTypes : defaults;
  const seen = new Set();
  const normalizedTypes = source
    .filter((item) => item && typeof item.symbol === "string")
    .map((item) => {
      const symbol = item.symbol.trim().slice(0, 4);
      if (!symbol || seen.has(symbol)) return null;
      seen.add(symbol);
      const defaultType = defaults.find((type) => type.symbol === symbol) ?? {};
      const normalized = {
        ...defaultType,
        symbol,
        name: String(item.name ?? defaultType.name ?? symbol).trim() || symbol,
        category: SHIFT_TYPE_CATEGORIES.includes(item.category) ? item.category : (defaultType.category ?? "その他勤務"),
        color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : (defaultType.color ?? "#e6eee9"),
        requiredNext: typeof item.requiredNext === "string" ? item.requiredNext : (defaultType.requiredNext ?? ""),
        forbiddenNext: Array.isArray(item.forbiddenNext) ? item.forbiddenNext.filter((value) => typeof value === "string") : (defaultType.forbiddenNext ?? []),
        compositionType: Object.values(SHIFT_COMPOSITION_TYPES).includes(item.compositionType)
          ? item.compositionType
          : (defaultType.compositionType ?? SHIFT_COMPOSITION_TYPES.NORMAL),
        morningShift: typeof item.morningShift === "string" ? item.morningShift : (defaultType.morningShift ?? ""),
        afternoonShift: typeof item.afternoonShift === "string" ? item.afternoonShift : (defaultType.afternoonShift ?? ""),
      };
      SHIFT_TYPE_FLAGS.forEach((flag) => {
        normalized[flag] = typeof item[flag] === "boolean" ? item[flag] : Boolean(defaultType[flag]);
      });
      return normalized;
    })
    .filter(Boolean);
  defaults.forEach((defaultType) => {
    if (defaultType.symbol === "研" && !normalizedTypes.some((type) => type.symbol === defaultType.symbol)) {
      normalizedTypes.push(defaultType);
    }
  });
  const knownSymbols = new Set(normalizedTypes.map((type) => type.symbol));
  return normalizedTypes.map((type) => {
    if (type.compositionType !== SHIFT_COMPOSITION_TYPES.HALF_DAY) return type;
    const canUseMorning = knownSymbols.has(type.morningShift);
    const canUseAfternoon = knownSymbols.has(type.afternoonShift);
    const normalized = {
      ...type,
      morningShift: canUseMorning ? type.morningShift : "",
      afternoonShift: canUseAfternoon ? type.afternoonShift : "",
    };
    if (!isHalfDayComponentCandidate(normalizedTypes.find((item) => item.symbol === normalized.morningShift)) ||
        !isHalfDayComponentCandidate(normalizedTypes.find((item) => item.symbol === normalized.afternoonShift))) {
      return { ...normalized, compositionType: SHIFT_COMPOSITION_TYPES.NORMAL, morningShift: "", afternoonShift: "" };
    }
    return normalized;
  });
}

function normalizeStaffLimits(savedLimits = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_STAFF_LIMITS).map(([key, fallback]) => {
      const value = Number(savedLimits[key]);
      return [key, Number.isFinite(value) ? Math.max(0, Math.min(31, value)) : fallback];
    }),
  );
}

function normalizeCustomRules(savedRules, validShiftSymbols) {
  if (isLegacyDefaultCustomRules(savedRules)) return [];
  const source = Array.isArray(savedRules) ? savedRules : [];
  const normalized = source
    .filter((rule) => rule && typeof rule === "object")
    .map((saved, index) => {
      const type = Object.values(CUSTOM_RULE_TYPES).includes(saved.type) ? saved.type : CUSTOM_RULE_TYPES.ZERO_SUPPRESSION;
      const template = createCustomRuleTemplate(type);
      const base = {
        ...template,
        id: typeof saved.id === "string" && saved.id ? saved.id : `${template.type}-${index + 1}`,
        enabled: saved.enabled !== false,
      };

    if (type === CUSTOM_RULE_TYPES.ZERO_SUPPRESSION) {
      const conditionShift = validShiftSymbols.has(saved.conditionShift) ? saved.conditionShift : base.conditionShift;
      const targetShift = validShiftSymbols.has(saved.targetShift) ? saved.targetShift : base.targetShift;
      const comparison = CUSTOM_RULE_COMPARISONS.includes(saved.comparison) ? saved.comparison : base.comparison;
      const target = CUSTOM_RULE_TARGETS.includes(saved.target) ? saved.target : base.target;
      const count = Number(saved.count);
      return {
        ...base,
        conditionShift,
        targetShift,
        comparison,
        target,
        count: Number.isFinite(count) ? Math.max(0, Math.min(31, count)) : base.count,
      };
    }

    if (type === CUSTOM_RULE_TYPES.POWER_FOLLOW) {
      const conditionPower = Number(saved.conditionPower);
      const requiredPowerMin = Number(saved.requiredPowerMin);
      const requiredCount = Number(saved.requiredCount);
      return {
        ...base,
        conditionPower: [1, 2, 3, 4].includes(conditionPower) ? conditionPower : base.conditionPower,
        conditionShift: validShiftSymbols.has(saved.conditionShift) ? saved.conditionShift : base.conditionShift,
        requiredPowerMin: [1, 2, 3, 4].includes(requiredPowerMin) ? requiredPowerMin : base.requiredPowerMin,
        requiredShift: validShiftSymbols.has(saved.requiredShift) ? saved.requiredShift : base.requiredShift,
        requiredCount: Number.isFinite(requiredCount) ? Math.max(0, Math.min(31, requiredCount)) : base.requiredCount,
      };
    }

    if (type === CUSTOM_RULE_TYPES.POWER_COUNT_EXCESS) {
      const powerValue = Number(saved.powerValue);
      const count = Number(saved.count);
      const powerMode = CUSTOM_POWER_MODES.includes(saved.powerMode) ? saved.powerMode : base.powerMode;
      const target = CUSTOM_RULE_TARGETS.includes(saved.target) ? saved.target : base.target;
      return {
        ...base,
        powerMode,
        powerValue: [1, 2, 3, 4].includes(powerValue) ? powerValue : base.powerValue,
        targetShift: validShiftSymbols.has(saved.targetShift) ? saved.targetShift : base.targetShift,
        count: Number.isFinite(count) ? Math.max(0, Math.min(31, count)) : base.count,
        target,
      };
    }

    if (type === CUSTOM_RULE_TYPES.NG_PAIR_SHIFT) {
      const pairMode = CUSTOM_NG_PAIR_MODES.includes(saved.pairMode) ? saved.pairMode : base.pairMode;
      const target = CUSTOM_RULE_TARGETS.includes(saved.target) ? saved.target : base.target;
      return {
        ...base,
        pairMode,
        shiftA: validShiftSymbols.has(saved.shiftA) ? saved.shiftA : base.shiftA,
        shiftB: validShiftSymbols.has(saved.shiftB) ? saved.shiftB : base.shiftB,
        target,
      };
    }

    return base;
  })
  .filter(Boolean);
  return normalized;
}

function normalizeBuiltInRuleSettings(savedRules = {}) {
  const defaults = createDefaultBuiltInRuleSettings();
  return Object.fromEntries(
    Object.keys(defaults).map((id) => [id, savedRules?.[id] !== false]),
  );
}

function isLegacyDefaultCustomRules(rules) {
  if (!Array.isArray(rules) || rules.length !== 2) return false;
  const zero = rules.find((rule) => rule?.id === "zero-suppression-1");
  const follow = rules.find((rule) => rule?.id === "power-follow-1");
  return Boolean(
    zero &&
      follow &&
      zero.type === CUSTOM_RULE_TYPES.ZERO_SUPPRESSION &&
      zero.enabled !== false &&
      zero.conditionShift === "入" &&
      Number(zero.count) === 2 &&
      zero.comparison === "gte" &&
      zero.targetShift === "遅" &&
      zero.target === "both" &&
      follow.type === CUSTOM_RULE_TYPES.POWER_FOLLOW &&
      follow.enabled !== false &&
      Number(follow.conditionPower) === 1 &&
      follow.conditionShift === "入" &&
      Number(follow.requiredPowerMin) === 2 &&
      follow.requiredShift === "入" &&
      Number(follow.requiredCount) === 1,
  );
}

function normalizeDayNotes(savedNotes, staff) {
  if (!savedNotes || typeof savedNotes !== "object") return {};
  const staffIds = new Set(staff.map((item) => item.id));
  return Object.fromEntries(
    Object.entries(savedNotes).map(([monthKey, monthNotes]) => {
      if (!monthNotes || typeof monthNotes !== "object") return [monthKey, {}];
      return [
        monthKey,
        Object.fromEntries(
          Object.entries(monthNotes)
            .map(([day, note]) => {
              if (typeof note === "string") {
                const title = note.trim();
                return title ? [day, { title, memo: "", participantIds: [], requestShift: "" }] : null;
              }
              if (!note || typeof note !== "object") return null;
              const title = String(note.title ?? note.name ?? "").trim();
              const memo = String(note.memo ?? note.note ?? "").trim();
              const participantIds = Array.isArray(note.participantIds)
                ? note.participantIds.filter((id) => staffIds.has(id))
                : [];
              const requestShift = typeof note.requestShift === "string" ? note.requestShift : "";
              if (!title && !memo && !participantIds.length && !requestShift) return null;
              return [day, { title, memo, participantIds, requestShift }];
            })
            .filter(Boolean),
        ),
      ];
    }),
  );
}

function normalizeData(saved) {
  const initial = createInitialData();
  if (!saved || typeof saved !== "object") return initial;

  const shiftTypes = normalizeShiftTypes(saved.shiftTypes);
  const validShiftSymbols = new Set(shiftTypes.map((type) => type.symbol));

  const staff = Array.isArray(saved.staff)
    ? saved.staff
        .filter((item) => item && typeof item.id === "string")
        .map((item) => ({
          id: item.id,
          name: String(item.name ?? item.id),
          power: [1, 2, 3, 4].includes(Number(item.power)) ? Number(item.power) : 1,
          autoTarget: item.autoTarget !== false,
          autoPlacementTarget: item.autoPlacementTarget ?? item.autoTarget ?? true,
          autoAdjustmentTarget: item.autoAdjustmentTarget ?? item.autoTarget ?? true,
          limits: normalizeStaffLimits(item.limits),
        }))
    : initial.staff;

  const patterns = Array.isArray(saved.patterns)
    ? saved.patterns
        .filter((item) => item && typeof item.id === "string")
        .map((item) => ({
          id: item.id,
          name: String(item.name ?? "名称未設定"),
          shifts: Array.isArray(item.shifts)
            ? item.shifts.filter((shift) => shift === "" || validShiftSymbols.has(shift))
            : [],
          useForAuto: item.useForAuto !== false,
        }))
        .filter((item) => item.shifts.length > 0)
    : initial.patterns;

  const year = Number(saved.display?.year);
  const month = Number(saved.display?.month);
  const selectedPatternId = saved.settings?.selectedPatternId;
  const savedSettings =
    saved.settings && typeof saved.settings === "object" ? { ...saved.settings } : {};
  delete savedSettings.requests;
  delete savedSettings.ngPairs;
  const savedNgPairs = Array.isArray(saved.ngPairs)
    ? saved.ngPairs
    : saved.settings?.ngPairs;

  return {
    version: DATA_VERSION,
    display: {
      year: Number.isInteger(year) && year > 1900 ? year : initial.display.year,
      month: Number.isInteger(month) && month >= 0 && month <= 11 ? month : initial.display.month,
    },
    staff: staff.length ? staff : initial.staff,
    shiftTypes,
    schedules:
      saved.schedules && typeof saved.schedules === "object" ? saved.schedules : {},
    requests:
      saved.requests && typeof saved.requests === "object"
        ? saved.requests
        : saved.settings?.requests && typeof saved.settings.requests === "object"
          ? saved.settings.requests
          : {},
    dayNotes: normalizeDayNotes(saved.dayNotes, staff),
    ngPairs: normalizeNgPairs(savedNgPairs, staff),
    patterns,
    settings: {
      ...savedSettings,
      selectedPatternId: patterns.some((pattern) => pattern.id === selectedPatternId)
        ? selectedPatternId
        : patterns[0]?.id ?? null,
      warningRules: normalizeWarningRules(saved.settings?.warningRules),
      customRules: normalizeCustomRules(saved.settings?.customRules, validShiftSymbols),
      builtInRules: normalizeBuiltInRuleSettings(saved.settings?.builtInRules),
      generation:
        saved.settings?.generation && typeof saved.settings.generation === "object"
          ? saved.settings.generation
          : {},
      highlightColor:
        typeof saved.settings?.highlightColor === "string"
          ? saved.settings.highlightColor
          : initial.settings.highlightColor,
    },
  };
}

function normalizeWarningRules(savedRules = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_WARNING_RULES).map(([key, defaultValue]) => {
      const value = Number(savedRules[key]);
      const min = RULE_MIN_VALUES[key] ?? 0;
      return [key, Number.isFinite(value) ? Math.max(min, value) : defaultValue];
    }),
  );
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeData(JSON.parse(saved)) : createInitialData();
  } catch (error) {
    console.warn("保存データを読み込めませんでした。初期状態で開始します。", error);
    return createInitialData();
  }
}

let appData = loadData();
const uiState = {
  editingCell: null,
  editingStaffId: null,
  editingPatternId: null,
  editingShiftTypeSymbol: null,
  editingDayNote: null,
  patternDraft: [],
  inputMode: "shift",
  scorePanelPinned: false,
};

const elements = {
  monthPicker: document.querySelector("#month-picker"),
  previousMonth: document.querySelector("#previous-month"),
  nextMonth: document.querySelector("#next-month"),
  clearShifts: document.querySelector("#clear-shifts"),
  resetApp: document.querySelector("#reset-app"),
  saveStatus: document.querySelector("#save-status"),
  shiftScore: document.querySelector("#shift-score"),
  shiftScorePanel: document.querySelector("#shift-score-panel"),
  highlightColorPicker: document.querySelector("#highlight-color-picker"),
  scheduleTable: document.querySelector("#schedule-table"),
  inputModeButtons: document.querySelectorAll("[data-input-mode]"),
  tableHint: document.querySelector("#table-hint"),
  summaryTable: document.querySelector("#summary-table"),
  addStaff: document.querySelector("#add-staff"),
  staffSettingsList: document.querySelector("#staff-settings-list"),
  ruleSettings: document.querySelector("#rule-settings"),
  customSettings: document.querySelector("#custom-settings"),
  shiftTypeLegend: document.querySelector("#shift-type-legend"),
  shiftTypeList: document.querySelector("#shift-type-list"),
  addShiftType: document.querySelector("#add-shift-type"),
  patternList: document.querySelector("#pattern-list"),
  ngPairFirst: document.querySelector("#ng-pair-first"),
  ngPairSecond: document.querySelector("#ng-pair-second"),
  addNgPair: document.querySelector("#add-ng-pair"),
  ngPairError: document.querySelector("#ng-pair-error"),
  ngPairList: document.querySelector("#ng-pair-list"),
  addPattern: document.querySelector("#add-pattern"),
  editPattern: document.querySelector("#edit-pattern"),
  deletePattern: document.querySelector("#delete-pattern"),
  autoPlacePatterns: document.querySelector("#auto-place-patterns"),
  autoAdjustShifts: document.querySelector("#auto-adjust-shifts"),
  applyRequestsToShifts: document.querySelector("#apply-requests-to-shifts"),
  openExportDialog: document.querySelector("#open-export-dialog"),
  exportDialog: document.querySelector("#export-dialog"),
  exportDialogClose: document.querySelector("#export-dialog-close"),
  exportDialogCancel: document.querySelector("#export-dialog-cancel"),
  exportScheduleCsv: document.querySelector("#export-schedule-csv"),
  exportStaffSummaryCsv: document.querySelector("#export-staff-summary-csv"),
  exportDailySummaryCsv: document.querySelector("#export-daily-summary-csv"),
  exportWarningsCsv: document.querySelector("#export-warnings-csv"),
  printCheck: document.querySelector("#print-check"),
  printPeriod: document.querySelector("#print-period"),
  printCreatedDate: document.querySelector("#print-created-date"),
  printVersion: document.querySelector("#print-version"),
  autoPlacementResult: document.querySelector("#auto-placement-result"),
  cellEditor: document.querySelector("#cell-editor"),
  cellEditorTitle: document.querySelector("#cell-editor-title"),
  cellEditorOptions: document.querySelector("#cell-editor-options"),
  appNotice: document.querySelector("#app-notice"),
  appNoticeClose: document.querySelector("#app-notice-close"),
  appNoticeMessage: document.querySelector("#app-notice-message"),
  appNoticeDetails: document.querySelector("#app-notice-details"),
  staffNameDialog: document.querySelector("#staff-name-dialog"),
  staffNameForm: document.querySelector("#staff-name-form"),
  staffNameInput: document.querySelector("#staff-name-input"),
  staffNameClose: document.querySelector("#staff-name-close"),
  staffNameCancel: document.querySelector("#staff-name-cancel"),
  staffNameError: document.querySelector("#staff-name-error"),
  warningDialog: document.querySelector("#warning-dialog"),
  warningTitle: document.querySelector("#warning-title"),
  warningList: document.querySelector("#warning-list"),
  boundaryNoteSection: document.querySelector("#boundary-note-section"),
  boundaryNoteList: document.querySelector("#boundary-note-list"),
  dayNoteDialog: document.querySelector("#day-note-dialog"),
  dayNoteForm: document.querySelector("#day-note-form"),
  dayNoteDialogTitle: document.querySelector("#day-note-dialog-title"),
  dayNoteTitle: document.querySelector("#day-note-title"),
  dayNoteMemo: document.querySelector("#day-note-memo"),
  dayNoteStaffList: document.querySelector("#day-note-staff-list"),
  dayNoteRequestOptions: document.querySelector("#day-note-request-options"),
  dayNoteError: document.querySelector("#day-note-error"),
  dayNoteClose: document.querySelector("#day-note-close"),
  dayNoteCancel: document.querySelector("#day-note-cancel"),
  dayNoteDelete: document.querySelector("#day-note-delete"),
  patternDialog: document.querySelector("#pattern-dialog"),
  patternEditorForm: document.querySelector("#pattern-editor-form"),
  patternDialogTitle: document.querySelector("#pattern-dialog-title"),
  patternDialogClose: document.querySelector("#pattern-dialog-close"),
  patternDialogCancel: document.querySelector("#pattern-dialog-cancel"),
  patternNameInput: document.querySelector("#pattern-name-input"),
  patternSequence: document.querySelector("#pattern-sequence"),
  shiftAddButtons: document.querySelector("#shift-add-buttons"),
  patternEditorError: document.querySelector("#pattern-editor-error"),
  customRuleDialog: document.querySelector("#custom-rule-dialog"),
  customRuleDialogClose: document.querySelector("#custom-rule-dialog-close"),
  customRuleDialogCancel: document.querySelector("#custom-rule-dialog-cancel"),
  shiftTypeDialog: document.querySelector("#shift-type-dialog"),
  shiftTypeForm: document.querySelector("#shift-type-form"),
  shiftTypeDialogTitle: document.querySelector("#shift-type-dialog-title"),
  shiftTypeSymbol: document.querySelector("#shift-type-symbol"),
  shiftTypeName: document.querySelector("#shift-type-name"),
  shiftTypeCategory: document.querySelector("#shift-type-category"),
  shiftTypeColor: document.querySelector("#shift-type-color"),
  shiftTypeComposition: document.querySelector("#shift-type-composition"),
  shiftTypeMorning: document.querySelector("#shift-type-morning"),
  shiftTypeAfternoon: document.querySelector("#shift-type-afternoon"),
  shiftTypeRequiredNext: document.querySelector("#shift-type-required-next"),
  shiftTypeForbiddenNext: document.querySelector("#shift-type-forbidden-next"),
  shiftTypeError: document.querySelector("#shift-type-error"),
  shiftTypeClose: document.querySelector("#shift-type-close"),
  shiftTypeCancel: document.querySelector("#shift-type-cancel"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveData() {
  elements.saveStatus.textContent = "保存中...";
  elements.saveStatus.classList.add("is-saving");

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    elements.saveStatus.textContent = "✓ 保存済み";
    elements.saveStatus.classList.remove("is-saving", "is-error");
    renderShiftScore();
  } catch (error) {
    console.error("自動保存に失敗しました。", error);
    elements.saveStatus.textContent = "保存できません";
    elements.saveStatus.classList.remove("is-saving");
    elements.saveStatus.classList.add("is-error");
  }
}

function getMonthKey() {
  return `${appData.display.year}-${String(appData.display.month + 1).padStart(2, "0")}`;
}

function getDaysInMonth() {
  return new Date(appData.display.year, appData.display.month + 1, 0).getDate();
}

function formatJapaneseEraDate(year, month, day) {
  if (year >= 2019) return `令和${year - 2018}年${month}月${day}日`;
  if (year >= 1989) return `平成${year - 1988}年${month}月${day}日`;
  return `${year}年${month}月${day}日`;
}

function getWarningRules() {
  return {
    ...DEFAULT_WARNING_RULES,
    ...(appData.settings.warningRules ?? {}),
  };
}

function isBuiltInRuleEnabled(id) {
  return appData.settings.builtInRules?.[id] !== false;
}

function getShiftTypes() {
  return appData.shiftTypes ?? [];
}

function getShiftType(symbol) {
  return getShiftTypes().find((type) => type.symbol === symbol) ?? null;
}

function getShiftOptions({ includeBlank = true, autoOnly = false } = {}) {
  const symbols = getShiftTypes()
    .filter((type) => !autoOnly || type.useForAuto !== false)
    .map((type) => type.symbol);
  return includeBlank ? ["", ...symbols] : symbols;
}

function isShiftTypeFlag(symbol, flag) {
  return getShiftContribution(symbol, flag) > 0;
}

function isHalfDayShiftType(type) {
  return type?.compositionType === SHIFT_COMPOSITION_TYPES.HALF_DAY;
}

function isHalfDayComponentCandidate(type) {
  if (!type || isHalfDayShiftType(type)) return false;
  if (type.countsAsLate || type.countsAsEvening || type.countsAsDeepNight) return false;
  return type.countsAsDay || type.countsAsPublicHoliday || type.countsAsPaid ||
    type.countsAsSummer || type.countsAsWinter || type.isRest || type.category === "研修";
}

function getHalfDayComponentOptions(currentSymbol = "") {
  const symbols = getShiftTypes()
    .filter(isHalfDayComponentCandidate)
    .map((type) => type.symbol);
  if (currentSymbol && !symbols.includes(currentSymbol) && getShiftType(currentSymbol)) symbols.push(currentSymbol);
  return symbols;
}

function getShiftParts(symbol) {
  const type = getShiftType(symbol);
  if (!type) return [];
  if (!isHalfDayShiftType(type)) return [{ type, weight: 1 }];
  return [type.morningShift, type.afternoonShift]
    .map((partSymbol) => getShiftType(partSymbol))
    .filter(Boolean)
    .map((partType) => ({ type: partType, weight: 0.5 }));
}

function getShiftContribution(symbol, flag) {
  return getShiftParts(symbol).reduce(
    (sum, part) => sum + (part.type?.[flag] ? part.weight : 0),
    0,
  );
}

function formatCount(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function getShiftStyle(type) {
  return type ? `style="--shift-type-color:${escapeHtml(type.color)};background-color:${escapeHtml(type.color)}"` : "";
}

function getSelectedPattern() {
  return appData.patterns.find(
    (pattern) => pattern.id === appData.settings.selectedPatternId,
  );
}

function getShift(staffId, day) {
  return appData.schedules[getMonthKey()]?.[staffId]?.[day] ?? "";
}

function getRequest(staffId, day) {
  return appData.requests[getMonthKey()]?.[staffId]?.[day] ?? "";
}

function createEmptyDayNote() {
  return { title: "", memo: "", participantIds: [], requestShift: "" };
}

function normalizeDayNoteValue(note) {
  if (typeof note === "string") {
    return { ...createEmptyDayNote(), title: note.trim() };
  }
  if (!note || typeof note !== "object") return createEmptyDayNote();
  return {
    title: String(note.title ?? note.name ?? "").trim(),
    memo: String(note.memo ?? note.note ?? "").trim(),
    participantIds: Array.isArray(note.participantIds) ? note.participantIds : [],
    requestShift: typeof note.requestShift === "string" ? note.requestShift : "",
  };
}

function getDayNote(day) {
  return normalizeDayNoteValue(appData.dayNotes?.[getMonthKey()]?.[day]);
}

function getDayNoteDisplay(day) {
  const note = getDayNote(day);
  return note.title;
}

function hasDayNoteContent(note) {
  return Boolean(note.title || note.memo || note.participantIds.length || note.requestShift);
}

function setDayNote(day, note) {
  const monthKey = getMonthKey();
  appData.dayNotes[monthKey] ??= {};
  const value = normalizeDayNoteValue(note);
  if (hasDayNoteContent(value)) {
    appData.dayNotes[monthKey][day] = value;
  } else {
    delete appData.dayNotes[monthKey][day];
  }
}

function setShift(staffId, day, shift) {
  const monthKey = getMonthKey();
  appData.schedules[monthKey] ??= {};
  appData.schedules[monthKey][staffId] ??= {};

  if (shift) {
    appData.schedules[monthKey][staffId][day] = shift;
  } else {
    delete appData.schedules[monthKey][staffId][day];
  }
}

function setRequest(staffId, day, request) {
  const monthKey = getMonthKey();
  appData.requests[monthKey] ??= {};
  appData.requests[monthKey][staffId] ??= {};

  if (request) {
    appData.requests[monthKey][staffId][day] = request;
  } else {
    delete appData.requests[monthKey][staffId][day];
  }
}

function requestAllowsShift(request, shift) {
  if (!request || !shift) return true;
  if (request === "日/遅") return shift === "日" || shift === "遅";
  return request === shift;
}

function getRequestLabel(request) {
  return REQUEST_LABELS[request] ?? `${getShiftType(request)?.name ?? request}*`;
}

function createShiftMark(shift) {
  if (!shift) return "";
  const type = getShiftType(shift);
  return `<span class="shift-mark ${SHIFT_CLASS[shift] ?? "shift-custom"}" ${getShiftStyle(type)} title="${escapeHtml(type?.name ?? shift)}">${escapeHtml(shift)}</span>`;
}

function createShiftBadgeLabel(shift) {
  if (!shift) return '<span class="shift-badge-label"><span class="shift-mark shift-blank">空</span><span>空欄</span></span>';
  const type = getShiftType(shift);
  return `<span class="shift-badge-label">${createShiftMark(shift)}<span>${escapeHtml(type?.name ?? shift)}</span></span>`;
}

function createPatternShiftMark(shift) {
  if (!shift) return '<span class="shift-mark shift-blank">空</span>';
  return createShiftMark(shift);
}

function createCellDisplay(shift, request) {
  const value = shift || request;
  if (!value) return "";

  const printValue = request ? `*${value}` : value;
  if (value === "日/遅") {
    return `<span class="screen-cell-value"><span class="request-only-mark">日/遅<span class="request-star">*</span></span></span><span class="print-cell-value">${escapeHtml(printValue)}</span>`;
  }

  return `<span class="screen-cell-value"><span class="shift-mark ${SHIFT_CLASS[value] ?? "shift-custom"} ${
    !shift && request ? "request-only-mark" : ""
  }" ${getShiftStyle(getShiftType(value))}>${escapeHtml(value)}${request ? '<span class="request-star">*</span>' : ""}</span></span><span class="print-cell-value">${escapeHtml(printValue)}</span>`;
}

function getPrintShiftShadeClass(shift) {
  if (shift === "入" || shift === "明") return "print-shift-shade";
  return "";
}

function getDayType(day) {
  const weekDay = new Date(appData.display.year, appData.display.month, day).getDay();
  if (weekDay === 0) return "sunday";
  if (weekDay === 6) return "saturday";
  return "";
}

function renderSchedule() {
  const daysInMonth = getDaysInMonth();
  const scheduleTableWidth = 64 + daysInMonth * 26 + 34;
  document.documentElement.style.setProperty(
    "--schedule-table-width",
    `${scheduleTableWidth}px`,
  );
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  let html = "<thead><tr>";

  html += '<th class="name-column" rowspan="3">氏名</th>';
  for (let day = 1; day <= daysInMonth; day += 1) {
    const note = getDayNoteDisplay(day);
    html += `<th class="day-column event-column ${getDayType(day)}" data-day="${day}">
      <button class="day-note-button" type="button" data-note-day="${day}" title="${escapeHtml(note || "行事予定を入力")}">${escapeHtml(note)}</button>
    </th>`;
  }
  html += '<th class="power-column" rowspan="3">P</th></tr><tr>';

  for (let day = 1; day <= daysInMonth; day += 1) {
    html += `<th class="day-column ${getDayType(day)}" data-day="${day}">${day}</th>`;
  }
  html += '</tr><tr>';

  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekDay = weekdays[new Date(appData.display.year, appData.display.month, day).getDay()];
    html += `<th class="day-column ${getDayType(day)}" data-day="${day}">${weekDay}</th>`;
  }
  html += "</tr></thead><tbody>";

  appData.staff.forEach((staff) => {
    html += `
      <tr class="staff-row">
        <th scope="row" class="name-column">
          <span class="staff-name-label" title="${escapeHtml(staff.name)}">${escapeHtml(staff.name)}</span>
        </th>`;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const shift = getShift(staff.id, day);
      const request = getRequest(staff.id, day);
      const displayLabel = shift || request || "空欄";
      html += `
        <td class="day-column shift-cell ${getDayType(day)} ${getPrintShiftShadeClass(shift)} ${request ? "has-request" : ""}" data-day="${day}">
          <button
            class="shift-button"
            type="button"
            data-staff-id="${escapeHtml(staff.id)}"
            data-day="${day}"
            aria-label="${escapeHtml(staff.name)}さん ${day}日、${displayLabel}${request ? `、${getRequestLabel(request)}` : ""}"
          >${createCellDisplay(shift, request)}</button>
        </td>`;
    }
    html += `
      <td class="power-column">
        <span class="power-display" aria-label="${escapeHtml(staff.name)}さんのPower">${staff.power}</span>
      </td></tr>`;
  });

  const totalRows = [
    { key: "day", label: "日勤" },
    { key: "deepNight", label: "深夜" },
    { key: "evening", label: "準夜" },
    { key: "late", label: "遅出" },
    { key: "power", label: "Power" },
    { key: "warning", label: "警告" },
  ];

  totalRows.forEach((row, rowIndex) => {
    html += `<tr class="totals-row${rowIndex === 0 ? " totals-start" : ""}"><th scope="row">${row.label}</th>`;
    for (let day = 1; day <= daysInMonth; day += 1) {
      if (row.key === "warning") {
        const warnings = getWarnings(day);
        const boundaryNotes = getMonthBoundaryNotes(day);
        const mark = "!".repeat(Math.min(warnings.length, 3));
        html += `<td class="warning-cell" data-day="${day}">${
          mark
            ? `<button class="warning-button" type="button" data-warning-day="${day}" aria-label="${day}日の警告詳細">${mark}</button>`
            : boundaryNotes.length
              ? `<button class="boundary-note-button" type="button" data-warning-day="${day}" aria-label="${day}日の月またぎ確認">↔</button>`
            : ""
        }</td>`;
      } else {
        const totals = getDailyTotals(day);
        const statusClass = getDailyTotalStatusClass(row.key, totals[row.key], day);
        html += `<td class="${statusClass}" data-day="${day}">${formatCount(totals[row.key])}</td>`;
      }
    }
    html += '<td class="power-column"></td></tr>';
  });

  elements.scheduleTable.innerHTML = `${html}</tbody>`;
}

function getDailyTotalStatusClass(key, value, day = null) {
  const rules = getWarningRules();
  const suppressesZeroWarning = (symbol) =>
    day !== null && value === 0 && isCustomZeroSuppressed(day, symbol, "warning");
  const hasCustomDanger = (symbol) =>
    day !== null && getShiftTotalKey(symbol) === key && hasCustomShiftDanger(day, symbol);
  if (key === "power") {
    if (!isBuiltInRuleEnabled("min-day-power")) return "status-ok";
    if (value < rules.minDayPower - 2) return "status-danger";
    if (value < rules.minDayPower) return "status-warn";
    return "status-ok";
  }
  if (key === "day") {
    const symbol = getShiftTypes().find((type) => type.countsAsDay)?.symbol;
    if (symbol && hasCustomDanger(symbol)) return "status-danger";
    if (!isBuiltInRuleEnabled("min-day-staff")) return "status-ok";
    if (value < rules.minDayStaff) return "status-danger";
    return "status-ok";
  }
  if (key === "deepNight") {
    const symbol = getShiftTypes().find((type) => type.countsAsDeepNight)?.symbol;
    if (symbol && suppressesZeroWarning(symbol)) return "status-ok";
    if (symbol && hasCustomDanger(symbol)) return "status-danger";
    if (!isBuiltInRuleEnabled("min-deep-night")) return "status-ok";
    return value < rules.minDeepNightStaff ? "status-danger" : "status-ok";
  }
  if (key === "evening") {
    const symbol = getShiftTypes().find((type) => type.countsAsEvening)?.symbol;
    if (symbol && suppressesZeroWarning(symbol)) return "status-ok";
    if (symbol && hasCustomDanger(symbol)) return "status-danger";
    if (isBuiltInRuleEnabled("min-evening") && value < rules.minEveningStaff) return "status-danger";
    if (isBuiltInRuleEnabled("night-staff-excess") && value > rules.maxNightStaff) return "status-danger";
    return "status-ok";
  }
  if (key === "late") {
    const symbol = getShiftTypes().find((type) => type.countsAsLate)?.symbol;
    if (symbol && suppressesZeroWarning(symbol)) return "status-ok";
    if (symbol && hasCustomDanger(symbol)) return "status-danger";
    if (isBuiltInRuleEnabled("late-staff-excess") && value > rules.maxLateStaff) return "status-danger";
    return isBuiltInRuleEnabled("late-zero") && value === 0 ? "status-warn" : "status-ok";
  }
  return "";
}

function getDailyTotals(day) {
  const totals = { day: 0, deepNight: 0, evening: 0, late: 0, power: 0 };
  appData.staff.forEach((staff) => {
    const shift = getShift(staff.id, day);
    totals.day += getShiftContribution(shift, "countsAsDay");
    totals.power += getShiftContribution(shift, "countsForPower") * staff.power;
    totals.deepNight += getShiftContribution(shift, "countsAsDeepNight");
    totals.evening += getShiftContribution(shift, "countsAsEvening");
    totals.late += getShiftContribution(shift, "countsAsLate");
  });
  return totals;
}

function countShiftBySymbol(day, symbol) {
  return appData.staff.filter((staff) => getShift(staff.id, day) === symbol).length;
}

function compareCustomCount(actual, expected, comparison) {
  if (comparison === "lte") return actual <= expected;
  if (comparison === "eq") return actual === expected;
  return actual >= expected;
}

function getActiveCustomRules(type = null) {
  return (appData.settings.customRules ?? [])
    .filter((rule) => rule.enabled !== false && (!type || rule.type === type));
}

function customRuleTargetIncludes(rule, target) {
  return rule.target === "both" || rule.target === target;
}

function isCustomZeroSuppressed(day, targetShift, target) {
  return getActiveCustomRules(CUSTOM_RULE_TYPES.ZERO_SUPPRESSION).some((rule) => {
    if (rule.targetShift !== targetShift || !customRuleTargetIncludes(rule, target)) return false;
    return compareCustomCount(
      countShiftBySymbol(day, rule.conditionShift),
      Number(rule.count) || 0,
      rule.comparison,
    );
  });
}

function getCustomZeroScoreWarningSuppressionCount(day) {
  const totals = getDailyTotals(day);
  const rules = getWarningRules();
  return getActiveCustomRules(CUSTOM_RULE_TYPES.ZERO_SUPPRESSION).filter((rule) => {
    if (!customRuleTargetIncludes(rule, "score") || customRuleTargetIncludes(rule, "warning")) return false;
    if (countShiftBySymbol(day, rule.targetShift) !== 0) return false;
    const totalKey = getShiftTotalKey(rule.targetShift);
    const hasZeroWarning =
      (totalKey === "deepNight" && totals.deepNight < rules.minDeepNightStaff) ||
      (totalKey === "evening" && totals.evening < rules.minEveningStaff) ||
      (totalKey === "late" && totals.late === 0);
    if (!hasZeroWarning) return false;
    return compareCustomCount(
      countShiftBySymbol(day, rule.conditionShift),
      Number(rule.count) || 0,
      rule.comparison,
    );
  }).length;
}

function getShiftTotalKey(symbol) {
  const type = getShiftType(symbol);
  if (type?.countsAsDay) return "day";
  if (type?.countsAsDeepNight) return "deepNight";
  if (type?.countsAsEvening) return "evening";
  if (type?.countsAsLate) return "late";
  return "";
}

function hasCustomPowerFollowViolation(day) {
  return getCustomPowerFollowViolations(day).length > 0;
}

function getCustomPowerFollowViolations(day) {
  const violations = [];
  getActiveCustomRules(CUSTOM_RULE_TYPES.POWER_FOLLOW).forEach((rule) => {
    const triggerStaff = appData.staff.filter(
      (staff) => staff.power === rule.conditionPower && getShift(staff.id, day) === rule.conditionShift,
    );
    if (!triggerStaff.length) return;
    const supportCount = appData.staff.filter(
      (staff) => staff.power >= rule.requiredPowerMin && getShift(staff.id, day) === rule.requiredShift,
    ).length;
    if (supportCount >= rule.requiredCount) return;
    violations.push({
      rule,
      triggerStaff,
      supportCount,
    });
  });
  return violations;
}

function staffMatchesPowerRule(staff, powerValue, powerMode) {
  return powerMode === "exact" ? staff.power === powerValue : staff.power >= powerValue;
}

function getCustomPowerCountExcessViolations(day, target = "warning") {
  const violations = [];
  getActiveCustomRules(CUSTOM_RULE_TYPES.POWER_COUNT_EXCESS).forEach((rule) => {
    if (!customRuleTargetIncludes(rule, target)) return;
    const matchedStaff = appData.staff.filter(
      (staff) => staffMatchesPowerRule(staff, Number(rule.powerValue) || 1, rule.powerMode) &&
        getShift(staff.id, day) === rule.targetShift,
    );
    if (matchedStaff.length < (Number(rule.count) || 0)) return;
    violations.push({ rule, matchedStaff });
  });
  return violations;
}

function getCustomNgPairShiftViolations(day, target = "warning") {
  const violations = [];
  getActiveCustomRules(CUSTOM_RULE_TYPES.NG_PAIR_SHIFT).forEach((rule) => {
    if (!customRuleTargetIncludes(rule, target)) return;
    appData.ngPairs.forEach(([firstId, secondId]) => {
      const first = appData.staff.find((staff) => staff.id === firstId);
      const second = appData.staff.find((staff) => staff.id === secondId);
      if (!first || !second) return;
      const firstShift = getShift(firstId, day);
      const secondShift = getShift(secondId, day);
      const isViolation = rule.pairMode === "cross"
        ? (firstShift === rule.shiftA && secondShift === rule.shiftB) ||
          (firstShift === rule.shiftB && secondShift === rule.shiftA)
        : firstShift === rule.shiftA && secondShift === rule.shiftA;
      if (isViolation) violations.push({ rule, first, second });
    });
  });
  return violations;
}

function hasCustomShiftDanger(day, symbol) {
  const powerCountViolations = [
    ...getCustomPowerCountExcessViolations(day, "warning"),
    ...getCustomPowerCountExcessViolations(day, "score"),
  ];
  const ngPairViolations = [
    ...getCustomNgPairShiftViolations(day, "warning"),
    ...getCustomNgPairShiftViolations(day, "score"),
  ];
  return getCustomPowerFollowViolations(day).some((violation) => violation.rule.requiredShift === symbol) ||
    powerCountViolations.some((violation) => violation.rule.targetShift === symbol) ||
    ngPairViolations.some((violation) =>
      violation.rule.shiftA === symbol || (violation.rule.pairMode === "cross" && violation.rule.shiftB === symbol),
    );
}

function hasCustomRuleReplacingJuniorNightSupport() {
  return getActiveCustomRules(CUSTOM_RULE_TYPES.POWER_FOLLOW).some((rule) =>
    rule.conditionPower === 1 &&
    rule.conditionShift === "入" &&
    rule.requiredPowerMin === 2 &&
    rule.requiredShift === "入" &&
    rule.requiredCount >= 1
  );
}

function getWarnings(day) {
  return window.AutoShiftWarnings.getWarnings(
    appData,
    appData.display.year,
    appData.display.month,
    day,
  );
}

function getMonthBoundaryNotes(day) {
  const notes = [];
  const daysInMonth = getDaysInMonth();

  appData.staff.forEach((staff) => {
    const shift = getShift(staff.id, day);
    const type = getShiftType(shift);
    if (day === 1 && type?.countsAsDeepNight) {
      notes.push(
        `${staff.name}さん：1日が${type.name}です。前月末の勤務を確認してください。`,
      );
    }
    if (day === daysInMonth && type?.requiredNext) {
      notes.push(
        `${staff.name}さん：月末が${type.name}です。翌月1日の${getShiftType(type.requiredNext)?.name ?? type.requiredNext}を確認してください。`,
      );
    }
  });

  return notes;
}

function getStaffTotals(staffId) {
  const totals = {
    publicHoliday: 0, day: 0, late: 0, evening: 0, deepNight: 0,
    paid: 0, summer: 0, winter: 0, long: 0,
    日: 0, 遅: 0, 入: 0, 明: 0, 有: 0, 夏: 0, 冬: 0,
  };
  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    const shift = getShift(staffId, day);
    totals.publicHoliday += getShiftContribution(shift, "countsAsPublicHoliday");
    totals.day += getShiftContribution(shift, "countsAsDay");
    totals.late += getShiftContribution(shift, "countsAsLate");
    totals.evening += getShiftContribution(shift, "countsAsEvening");
    totals.deepNight += getShiftContribution(shift, "countsAsDeepNight");
    totals.paid += getShiftContribution(shift, "countsAsPaid");
    totals.summer += getShiftContribution(shift, "countsAsSummer");
    totals.winter += getShiftContribution(shift, "countsAsWinter");
    getShiftParts(shift).forEach(({ type, weight }) => {
      if (type.category === "その他勤務") totals.long += weight;
    });
  }
  totals.日 = totals.day;
  totals.遅 = totals.late;
  totals.入 = totals.evening;
  totals.明 = totals.deepNight;
  totals.有 = totals.paid;
  totals.夏 = totals.summer;
  totals.冬 = totals.winter;
  return totals;
}

function getCountSpread(values) {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function getStaffBalancePenalty() {
  const totals = appData.staff.map((staff) => getStaffTotals(staff.id));
  const daySpread = getCountSpread(totals.map((total) => total.日));
  const lateSpread = getCountSpread(totals.map((total) => total.遅));
  const nightSpread = getCountSpread(totals.map((total) => total.入));
  const offSpread = getCountSpread(totals.map((total) => total.publicHoliday));
  const weight =
    Number(appData.settings.generation?.staffBalanceWeight) ||
    AUTO_PLACEMENT_DEFAULTS.staffBalanceWeight;

  return (daySpread ** 2 + lateSpread ** 2 + nightSpread ** 2 + offSpread ** 2) * weight;
}

function getStaffLimitViolations(staff) {
  const totals = getStaffTotals(staff.id);
  const limits = staff.limits ?? DEFAULT_STAFF_LIMITS;
  const items = [
    ["遅出", totals.late, limits.late],
    ["入", totals.evening, limits.evening],
  ];
  const violations = items
    .filter(([, count, limit]) => Number.isFinite(limit) && count > limit)
    .map(([label, count, limit]) => ({ label, count, limit }));
  let longest = 0;
  let current = 0;
  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    if (isShiftTypeFlag(getShift(staff.id, day), "countsForConsecutive")) {
      current += 1;
      longest = Math.max(longest, current);
    } else current = 0;
  }
  if (longest > limits.consecutive) {
    violations.push({ label: "連勤", count: longest, limit: limits.consecutive });
  }
  return violations;
}

function getStaffLimitExcessTotal(staff) {
  return getStaffLimitViolations(staff)
    .reduce((sum, item) => sum + Math.max(0, item.count - item.limit), 0);
}

function getAllStaffLimitExcessTotal() {
  return appData.staff.reduce((sum, staff) => sum + getStaffLimitExcessTotal(staff), 0);
}

function hasConsecutiveWorkDays(staffId, day, length) {
  for (let offset = 0; offset < length; offset += 1) {
    if (!isShiftTypeFlag(getShift(staffId, day - offset), "countsForConsecutive")) return false;
  }
  return true;
}

function getScoreRuleViolations(day) {
  const rules = getWarningRules();
  const violations = {
    nightToAfter: 0,
    afterToOff: 0,
    lateNextDay: 0,
    juniorNightSupport: 0,
    ngPairNight: 0,
    ngPairDay: 0,
    sixConsecutiveWorkDays: 0,
    middleStaffShortage: 0,
    seniorNightOverlap: 0,
    juniorNightOverlap: 0,
    nightStaffExcess: 0,
    lateStaffExcess: 0,
  };
  const dayStaff = appData.staff.filter((staff) => isShiftTypeFlag(getShift(staff.id, day), "countsAsDay"));
  const nightStaff = appData.staff.filter((staff) => isShiftTypeFlag(getShift(staff.id, day), "countsAsEvening"));
  const seniorNightCount = nightStaff.filter((staff) => staff.power >= 2).length;
  const juniorNightCount = nightStaff.filter((staff) => staff.power === 1).length;
  const lateCount = appData.staff.filter((staff) => isShiftTypeFlag(getShift(staff.id, day), "countsAsLate")).length;

  if (isBuiltInRuleEnabled("middle-staff-day") && !dayStaff.some((staff) => staff.power === 2 || staff.power === 3)) {
    violations.middleStaffShortage += 1;
  }

  const hasSeniorNightStaff = seniorNightCount > 0;
  if (isBuiltInRuleEnabled("junior-night-support") && !hasCustomRuleReplacingJuniorNightSupport()) {
    nightStaff
      .filter((staff) => staff.power === 1)
      .forEach(() => {
        if (!hasSeniorNightStaff) violations.juniorNightSupport += 1;
      });
  }

  if (isBuiltInRuleEnabled("senior-night-overlap") && seniorNightCount > 1) violations.seniorNightOverlap += 1;
  if (isBuiltInRuleEnabled("junior-night-overlap") && juniorNightCount >= 2) violations.juniorNightOverlap += 1;
  if (isBuiltInRuleEnabled("night-staff-excess") && nightStaff.length > rules.maxNightStaff) violations.nightStaffExcess += 1;
  if (isBuiltInRuleEnabled("late-staff-excess") && lateCount > rules.maxLateStaff) violations.lateStaffExcess += 1;

  appData.staff.forEach((staff) => {
    const shift = getShift(staff.id, day);
    const nextShift = getShift(staff.id, day + 1);
    const canCheckNextDay = day < getDaysInMonth();

    const type = getShiftType(shift);
    if (isBuiltInRuleEnabled("required-next") && canCheckNextDay && type?.requiredNext && nextShift !== type.requiredNext) {
      if (type.countsAsEvening) violations.nightToAfter += 1;
      else if (type.countsAsDeepNight) violations.afterToOff += 1;
    }
    if (isBuiltInRuleEnabled("forbidden-next") && canCheckNextDay && type?.forbiddenNext?.includes(nextShift)) {
      violations.lateNextDay += 1;
    }
    if (isBuiltInRuleEnabled("consecutive-work") && hasConsecutiveWorkDays(staff.id, day, rules.consecutiveWorkDays)) {
      violations.sixConsecutiveWorkDays += 1;
    }
  });

  appData.ngPairs.forEach(([firstId, secondId]) => {
    const firstShift = getShift(firstId, day);
    const secondShift = getShift(secondId, day);
    if (isBuiltInRuleEnabled("ng-pair") && isShiftTypeFlag(firstShift, "countsAsEvening") && isShiftTypeFlag(secondShift, "countsAsEvening")) violations.ngPairNight += 1;
    if (isBuiltInRuleEnabled("ng-pair") && isShiftTypeFlag(firstShift, "countsAsDay") && isShiftTypeFlag(secondShift, "countsAsDay")) violations.ngPairDay += 1;
  });

  return violations;
}

function createScoreItem(label, count, rule, unit = "件") {
  if (!count) return null;
  return {
    label,
    count,
    unit,
    points: -(count * rule),
  };
}

function createScoreCategory(category, items) {
  const activeItems = items.filter(Boolean);
  if (!activeItems.length) return null;
  return {
    category,
    points: activeItems.reduce((sum, item) => sum + item.points, 0),
    items: activeItems,
  };
}

function calculateShiftScore() {
  let dayCounts = [];
  let nightCounts = [];
  const rules = getWarningRules();
  const counts = {
    warning: 0,
    powerShortage: 0,
    dayShortage: 0,
    deepNightZero: 0,
    eveningZero: 0,
    lateZero: 0,
    nightToAfter: 0,
    afterToOff: 0,
    lateNextDay: 0,
    juniorNightSupport: 0,
    ngPairNight: 0,
    ngPairDay: 0,
    sixConsecutiveWorkDays: 0,
    middleStaffShortage: 0,
    seniorNightOverlap: 0,
    juniorNightOverlap: 0,
    nightStaffExcess: 0,
    lateStaffExcess: 0,
    publicHolidayMismatch: 0,
    dayCountImbalance: 0,
    nightCountImbalance: 0,
    customPowerFollow: 0,
    customPowerCountExcess: 0,
    customNgPairShift: 0,
  };
  const staffLimitItems = [];

  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    const totals = getDailyTotals(day);
    const warnings = getWarnings(day);
    counts.warning += Math.max(0, warnings.length - getCustomZeroScoreWarningSuppressionCount(day));
    if (isBuiltInRuleEnabled("min-day-power") && totals.power < rules.minDayPower) counts.powerShortage += 1;
    if (isBuiltInRuleEnabled("min-day-staff") && totals.day < rules.minDayStaff) counts.dayShortage += 1;
    const deepNightSymbol = getShiftTypes().find((type) => type.countsAsDeepNight)?.symbol;
    const eveningSymbol = getShiftTypes().find((type) => type.countsAsEvening)?.symbol;
    const lateSymbol = getShiftTypes().find((type) => type.countsAsLate)?.symbol;
    if (isBuiltInRuleEnabled("min-deep-night") && totals.deepNight < rules.minDeepNightStaff && !(totals.deepNight === 0 && deepNightSymbol && isCustomZeroSuppressed(day, deepNightSymbol, "score"))) counts.deepNightZero += 1;
    if (isBuiltInRuleEnabled("min-evening") && totals.evening < rules.minEveningStaff && !(totals.evening === 0 && eveningSymbol && isCustomZeroSuppressed(day, eveningSymbol, "score"))) counts.eveningZero += 1;
    if (isBuiltInRuleEnabled("late-zero") && totals.late === 0 && !(lateSymbol && isCustomZeroSuppressed(day, lateSymbol, "score"))) counts.lateZero += 1;
    counts.customPowerFollow += getCustomPowerFollowViolations(day).length;
    counts.customPowerCountExcess += getCustomPowerCountExcessViolations(day, "score").length;
    counts.customNgPairShift += getCustomNgPairShiftViolations(day, "score").length;

    const violations = getScoreRuleViolations(day);
    counts.nightToAfter += violations.nightToAfter;
    counts.afterToOff += violations.afterToOff;
    counts.lateNextDay += violations.lateNextDay;
    counts.juniorNightSupport += violations.juniorNightSupport;
    counts.ngPairNight += violations.ngPairNight;
    counts.ngPairDay += violations.ngPairDay;
    counts.sixConsecutiveWorkDays += violations.sixConsecutiveWorkDays;
    counts.middleStaffShortage += violations.middleStaffShortage;
    counts.seniorNightOverlap += violations.seniorNightOverlap;
    counts.juniorNightOverlap += violations.juniorNightOverlap;
    counts.nightStaffExcess += violations.nightStaffExcess;
    counts.lateStaffExcess += violations.lateStaffExcess;
  }

  appData.staff.forEach((staff) => {
    const totals = getStaffTotals(staff.id);
    if (isBuiltInRuleEnabled("public-holiday-target") && totals.publicHoliday !== rules.targetPublicHoliday) counts.publicHolidayMismatch += 1;
    dayCounts.push(totals.日);
    nightCounts.push(totals.入);
    if (isBuiltInRuleEnabled("staff-limits")) getStaffLimitViolations(staff).forEach((violation) => {
      staffLimitItems.push({
        label: `${staff.name}さん ${violation.label}上限超過：${violation.count}/${violation.limit}`,
        points: -SCORE_RULES.staffLimitExceeded,
        detailOnly: true,
      });
    });
  });

  if (isBuiltInRuleEnabled("staff-balance") && getCountSpread(dayCounts) >= 4) counts.dayCountImbalance = 1;
  if (isBuiltInRuleEnabled("staff-balance") && getCountSpread(nightCounts) >= 3) counts.nightCountImbalance = 1;

  const breakdown = [
    createScoreCategory("警告件数", [
      createScoreItem("警告件数", counts.warning, SCORE_RULES.warning),
    ]),
    createScoreCategory("夜勤関連", [
      createScoreItem("入→明違反", counts.nightToAfter, SCORE_RULES.nightToAfterViolation),
      createScoreItem("明→休違反", counts.afterToOff, SCORE_RULES.afterToOffViolation),
      createScoreItem("遅→日/明違反", counts.lateNextDay, SCORE_RULES.lateNextDayViolation),
      createScoreItem("明0人", counts.deepNightZero, SCORE_RULES.deepNightZero, "日"),
      createScoreItem("入0人", counts.eveningZero, SCORE_RULES.eveningZero, "日"),
      createScoreItem("遅出0", counts.lateZero, SCORE_RULES.lateZero, "日"),
      createScoreItem("カスタムP値フォロー不足", counts.customPowerFollow, SCORE_RULES.customPowerFollow, "日"),
      createScoreItem("カスタムP値人数超過", counts.customPowerCountExcess, SCORE_RULES.customPowerCountExcess, "日"),
      createScoreItem("P2以上の入被り", counts.seniorNightOverlap, SCORE_RULES.seniorNightOverlap, "日"),
      createScoreItem("P1入の複数配置", counts.juniorNightOverlap, SCORE_RULES.juniorNightOverlap, "日"),
      createScoreItem("入3人以上", counts.nightStaffExcess, SCORE_RULES.nightStaffExcess, "日"),
      createScoreItem("遅出2人以上", counts.lateStaffExcess, SCORE_RULES.lateStaffExcess, "日"),
    ]),
    createScoreCategory("Power/フォロー体制", [
      createScoreItem("Power不足", counts.powerShortage, SCORE_RULES.powerShortage, "日"),
      createScoreItem("日勤人数不足", counts.dayShortage, SCORE_RULES.dayShortage, "日"),
      createScoreItem(
        "日勤P2/P3なし",
        counts.middleStaffShortage,
        SCORE_RULES.middleStaffShortage,
        "日",
      ),
      createScoreItem(
        "P1単独入",
        counts.juniorNightSupport,
        SCORE_RULES.juniorNightSupportShortage,
      ),
    ]),
    createScoreCategory("公休/公平性", [
      createScoreItem(
        `公休${rules.targetPublicHoliday}日以外`,
        counts.publicHolidayMismatch,
        SCORE_RULES.publicHolidayMismatch,
        "人",
      ),
      createScoreItem(
        "6連勤以上",
        counts.sixConsecutiveWorkDays,
        SCORE_RULES.sixConsecutiveWorkDays,
      ),
      createScoreItem(
        "日勤回数差あり",
        counts.dayCountImbalance,
        SCORE_RULES.dayCountImbalance,
        "あり",
      ),
      createScoreItem(
        "入回数差あり",
        counts.nightCountImbalance,
        SCORE_RULES.nightCountImbalance,
        "あり",
      ),
    ]),
    createScoreCategory("スタッフ別上限", staffLimitItems),
    createScoreCategory("NGペア", [
      createScoreItem("NGペア日勤被り", counts.ngPairDay, SCORE_RULES.ngPairDay),
      createScoreItem("NGペア夜勤被り", counts.ngPairNight, SCORE_RULES.ngPairNight),
      createScoreItem("カスタムNGペア勤務被り", counts.customNgPairShift, SCORE_RULES.customNgPairShift),
    ]),
  ].filter(Boolean);

  const totalPenalty = -breakdown.reduce((sum, category) => sum + category.points, 0);
  return {
    score: 100 - totalPenalty,
    totalPenalty,
    breakdown,
  };
}

function renderShiftScore() {
  const result = calculateShiftScore();
  elements.shiftScore.textContent = `評点：${result.score}点`;
  elements.shiftScorePanel.innerHTML = createScoreBreakdownHtml(result);
}

function openScorePanel({ pinned = false } = {}) {
  uiState.scorePanelPinned = pinned || uiState.scorePanelPinned;
  elements.shiftScorePanel.hidden = false;
  elements.shiftScore.setAttribute("aria-expanded", "true");
}

function closeScorePanel({ force = false } = {}) {
  if (uiState.scorePanelPinned && !force) return;
  uiState.scorePanelPinned = false;
  elements.shiftScorePanel.hidden = true;
  elements.shiftScore.setAttribute("aria-expanded", "false");
}

function toggleScorePanel() {
  if (!elements.shiftScorePanel.hidden && uiState.scorePanelPinned) {
    closeScorePanel({ force: true });
    return;
  }
  openScorePanel({ pinned: true });
}

function formatScoreItem(item) {
  if (item.detailOnly) return `${escapeHtml(item.label)}　${item.points}点`;
  const countText = item.unit === "あり" ? "あり" : `${item.count}${item.unit}`;
  return `${escapeHtml(item.label)}：${countText}　${item.points}点`;
}

function createScoreBreakdownHtml(result) {
  const categories = result.breakdown.length
    ? result.breakdown
        .map(
          (category) => `
            <section class="score-breakdown-category">
              <h3>
                <span>${escapeHtml(category.category)}</span>
                <strong>${category.points}点</strong>
              </h3>
              <ul>
                ${category.items
                  .map((item) => `<li>${formatScoreItem(item)}</li>`)
                  .join("")}
              </ul>
            </section>`,
        )
        .join("")
    : '<p class="score-breakdown-empty">減点項目はありません。</p>';

  return `
    <p class="score-breakdown-title">評点内訳</p>
    <div class="score-breakdown-summary">
      <span>現在評点：${result.score}点</span>
      <span>合計減点：${result.totalPenalty}点</span>
    </div>
    ${categories}`;
}

function renderSummary() {
  let html = `
    <thead><tr><th>氏名</th><th>公</th><th>日</th><th>遅</th><th>入</th><th>有</th><th>夏</th><th>冬</th></tr></thead>
    <tbody>`;

  appData.staff.forEach((staff) => {
    const totals = getStaffTotals(staff.id);
    const publicHolidayStatus = getPublicHolidayStatusClass(totals.publicHoliday);
    const limitStatus = (value, key) => value > staff.limits[key] ? "status-danger" : "";
    html += `
      <tr>
        <th scope="row">${escapeHtml(staff.name)}</th>
        <td class="${publicHolidayStatus}">${formatCount(totals.publicHoliday)}</td>
        <td>${formatCount(totals.日)}</td>
        <td class="${limitStatus(totals.遅, "late")}">${formatCount(totals.遅)}</td>
        <td class="${limitStatus(totals.入, "evening")}">${formatCount(totals.入)}</td>
        <td>${formatCount(totals.有)}</td>
        <td>${formatCount(totals.夏)}</td>
        <td>${formatCount(totals.冬)}</td>
      </tr>`;
  });
  elements.summaryTable.innerHTML = `${html}</tbody>`;
}

function getPublicHolidayStatusClass(publicHolidayCount) {
  const target = getWarningRules().targetPublicHoliday;
  if (publicHolidayCount < target) return "status-danger";
  if (publicHolidayCount > target) return "status-warn";
  return "status-ok";
}

function renderPatterns() {
  if (!getSelectedPattern() && appData.patterns.length) {
    appData.settings.selectedPatternId = appData.patterns[0].id;
  }

  elements.patternList.innerHTML = appData.patterns.length
    ? appData.patterns
        .map(
          (pattern) => `
            <div class="pattern-option">
              <label class="pattern-main">
                <input
                  type="radio"
                  name="pattern"
                  value="${escapeHtml(pattern.id)}"
                  ${pattern.id === appData.settings.selectedPatternId ? "checked" : ""}
                />
                <span class="pattern-name">${escapeHtml(pattern.name)}</span>
                <span class="pattern-shifts">${pattern.shifts.map(createPatternShiftMark).join("")}</span>
              </label>
              <label class="pattern-auto-toggle">
                <input
                  type="checkbox"
                  data-pattern-auto-id="${escapeHtml(pattern.id)}"
                  ${pattern.useForAuto !== false ? "checked" : ""}
                />
                <span>自動配置</span>
              </label>
            </div>`,
        )
        .join("")
    : '<p class="empty-patterns">パターンがありません。追加してください。</p>';

  const hasSelection = Boolean(getSelectedPattern());
  elements.editPattern.disabled = !hasSelection;
  elements.deletePattern.disabled = !hasSelection;
  elements.autoPlacePatterns.disabled = getAutoPatterns().length === 0;
}

function getNgPairKey(firstId, secondId) {
  return [firstId, secondId].sort().join(":");
}

function renderNgPairs() {
  const firstSelection = elements.ngPairFirst.value;
  const secondSelection = elements.ngPairSecond.value;
  const options = appData.staff
    .map(
      (staff) =>
        `<option value="${escapeHtml(staff.id)}">${escapeHtml(staff.name)}</option>`,
    )
    .join("");

  elements.ngPairFirst.innerHTML = options;
  elements.ngPairSecond.innerHTML = options;

  if (appData.staff.some((staff) => staff.id === firstSelection)) {
    elements.ngPairFirst.value = firstSelection;
  }
  if (appData.staff.some((staff) => staff.id === secondSelection)) {
    elements.ngPairSecond.value = secondSelection;
  } else if (appData.staff.length > 1) {
    elements.ngPairSecond.value = appData.staff[1].id;
  }

  const pairs = appData.ngPairs;
  elements.ngPairList.innerHTML = pairs.length
    ? pairs
        .map(([firstId, secondId]) => {
          const first = appData.staff.find((staff) => staff.id === firstId);
          const second = appData.staff.find((staff) => staff.id === secondId);
          if (!first || !second) return "";
          return `
            <div class="ng-pair-item">
              <span title="${escapeHtml(first.name)} × ${escapeHtml(second.name)}">
                ${escapeHtml(first.name)} <b>&times;</b> ${escapeHtml(second.name)}
              </span>
              <button
                class="ng-pair-delete"
                type="button"
                data-ng-pair-key="${escapeHtml(getNgPairKey(firstId, secondId))}"
                aria-label="${escapeHtml(first.name)}さんと${escapeHtml(second.name)}さんのNGペアを削除"
              >
                削除
              </button>
            </div>`;
        })
        .join("")
    : '<p class="empty-ng-pairs">登録されているNGペアはありません。</p>';

  elements.addNgPair.disabled = appData.staff.length < 2;
}

function renderCellEditorOptions() {
  if (uiState.inputMode === "request") {
    const requestOptions = ["", ...getShiftOptions({ includeBlank: false }), "日/遅"].map((request) => {
      const selected =
        uiState.editingCell &&
        getRequest(uiState.editingCell.staffId, uiState.editingCell.day) === request;
      const label = request === "日/遅"
        ? '<span class="shift-badge-label"><span class="request-only-mark">日/遅<span class="request-star">*</span></span><span>日勤または遅出</span></span>'
        : request
          ? createShiftBadgeLabel(request)
          : createShiftBadgeLabel("");
      return `
        <button
          class="request-option ${selected ? "is-selected" : ""}"
          type="button"
          data-request="${request}"
          aria-label="${getRequestLabel(request)}"
        >
          ${label}
          ${request ? `<small>${escapeHtml(request)}*</small>` : ""}
        </button>`;
    }).join("");

    elements.cellEditorOptions.innerHTML = `
      <section class="cell-editor-section" aria-labelledby="request-heading">
        <h3 id="request-heading">希望休・希望勤務</h3>
        <div class="request-options">${requestOptions}</div>
      </section>`;
    return;
  }

  const shiftOptions = getShiftOptions().map((shift) => {
    const selected =
      uiState.editingCell &&
      getShift(uiState.editingCell.staffId, uiState.editingCell.day) === shift;
    return `
      <button
        class="cell-option ${selected ? "is-selected" : ""}"
        type="button"
        data-shift="${shift}"
        aria-label="${shift || "空欄"}に変更"
      >
        ${shift ? createShiftMark(shift) : "空欄"}
      </button>`;
  }).join("");

  const patternOptions = appData.patterns.length
    ? appData.patterns
        .map(
          (pattern) => `
            <button
              class="cell-pattern-option"
              type="button"
              data-cell-pattern-id="${escapeHtml(pattern.id)}"
              aria-label="${escapeHtml(pattern.name)}をこの日から配置"
            >
              <span class="cell-pattern-name">${escapeHtml(pattern.name)}</span>
              <span class="cell-pattern-shifts">${pattern.shifts
                .map(createPatternShiftMark)
                .join("")}</span>
            </button>`,
        )
        .join("")
    : '<p class="cell-pattern-empty">登録済みパターンがありません。</p>';

  elements.cellEditorOptions.innerHTML = `
    <section class="cell-editor-section" aria-labelledby="single-shift-heading">
      <h3 id="single-shift-heading">単独勤務</h3>
      <div class="single-shift-options">${shiftOptions}</div>
    </section>
    <section class="cell-editor-section pattern-menu-section" aria-labelledby="cell-pattern-heading">
      <h3 id="cell-pattern-heading">シフトパターン</h3>
      <div class="cell-pattern-options">${patternOptions}</div>
    </section>`;
}

function renderPatternDraft() {
  elements.patternSequence.innerHTML = uiState.patternDraft.length
    ? uiState.patternDraft
        .map(
          (shift, index) =>
            `<button class="sequence-item" type="button" data-sequence-index="${index}" aria-label="${shift || "空欄"}を削除">${createPatternShiftMark(shift)}</button>`,
        )
        .join("")
    : '<span class="sequence-empty">勤務記号を追加してください</span>';
}

function renderPatternShiftButtons() {
  elements.shiftAddButtons.innerHTML = getShiftOptions().map(
    (shift) => `<button class="shift-add-button" type="button" data-add-shift="${escapeHtml(shift)}">${createPatternShiftMark(shift)}</button>`,
  ).join("");
}

function renderAll() {
  elements.monthPicker.value = `${appData.display.year}-${String(appData.display.month + 1).padStart(2, "0")}`;
  applyHighlightColor();
  renderPrintMeta();
  renderSchedule();
  renderSummary();
  renderStaffSettings();
  renderRuleSettings();
  renderCustomSettings();
  renderShiftTypes();
  renderShiftTypeLegend();
  renderPatterns();
  renderNgPairs();
  renderInputMode();
  renderShiftScore();
}

function renderPrintMeta() {
  const start = formatJapaneseEraDate(appData.display.year, appData.display.month + 1, 1);
  const end = formatJapaneseEraDate(appData.display.year, appData.display.month + 1, getDaysInMonth());
  const today = new Date();
  elements.printPeriod.textContent = `${start}〜${end}`;
  elements.printCreatedDate.textContent = formatJapaneseEraDate(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate(),
  );
  elements.printVersion.textContent = `Ver${APP_VERSION}`;
}

function renderShiftTypeLegend() {
  elements.shiftTypeLegend.innerHTML = [
    ...getShiftTypes().map((type) => `<span>${createShiftMark(type.symbol)}${escapeHtml(type.name)}</span>`),
    '<span><i class="legend-chip request-legend">*</i>希望</span>',
    '<span><i class="legend-chip warning-legend">!</i>警告</span>',
    '<span><i class="legend-chip boundary-legend">↔</i>月またぎ確認</span>',
  ].join("");
}

function renderStaffSettings() {
  const rows = appData.staff.map((staff) => `
    <tr class="staff-setting-item">
      <th scope="row">
        <button class="staff-name-edit" type="button" data-name-staff-id="${escapeHtml(staff.id)}" title="氏名を編集">${escapeHtml(staff.name)}</button>
      </th>
      <td><select data-power-staff-id="${escapeHtml(staff.id)}" aria-label="${escapeHtml(staff.name)}さんのPower">
        ${[1, 2, 3, 4].map((power) => `<option value="${power}" ${power === staff.power ? "selected" : ""}>${power}</option>`).join("")}
      </select></td>
      <td><input type="checkbox" data-auto-placement-staff-id="${escapeHtml(staff.id)}" aria-label="${escapeHtml(staff.name)}さんを自動配置対象にする" ${staff.autoPlacementTarget !== false ? "checked" : ""} /></td>
      <td><input type="checkbox" data-auto-adjustment-staff-id="${escapeHtml(staff.id)}" aria-label="${escapeHtml(staff.name)}さんを自動調整対象にする" ${staff.autoAdjustmentTarget !== false ? "checked" : ""} /></td>
      ${[["late", "遅出"], ["evening", "入"], ["consecutive", "連勤"]].map(([key, label]) => `
        <td><input class="staff-limit-input" type="number" min="0" max="31" value="${staff.limits[key]}" data-staff-limit-id="${escapeHtml(staff.id)}" data-limit-key="${key}" aria-label="${escapeHtml(staff.name)}さんの${label}上限" /></td>`).join("")}
      <td><button class="staff-delete-button" type="button" data-delete-staff-id="${escapeHtml(staff.id)}" ${appData.staff.length <= 1 ? "disabled" : ""}>削除</button></td>
    </tr>`).join("");

  elements.staffSettingsList.innerHTML = `
    <table class="staff-settings-table">
      <thead><tr><th>名前</th><th>P</th><th>自動配置</th><th>自動調整</th><th>遅出</th><th>入</th><th>連勤</th><th>削除</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderShiftTypes() {
  elements.shiftTypeList.innerHTML = getShiftTypes().map((type) => `
    <div class="shift-type-item">
      ${createShiftMark(type.symbol)}
      <span class="shift-type-item-name" title="${escapeHtml(type.name)}">${escapeHtml(type.name)} <small>(${escapeHtml(type.category)}${isHalfDayShiftType(type) ? ` / ${escapeHtml(type.morningShift)}/${escapeHtml(type.afternoonShift)}` : ""})</small></span>
      <span class="shift-type-item-actions">
        <button class="staff-edit-button" type="button" data-edit-shift-type="${escapeHtml(type.symbol)}">編集</button>
        <button class="staff-delete-button" type="button" data-delete-shift-type="${escapeHtml(type.symbol)}">削除</button>
      </span>
    </div>`).join("");
  renderPatternShiftButtons();
}

function renderRuleSettings() {
  const rules = getWarningRules();
  const fields = [
    ["minDayStaff", "日勤最低人数"],
    ["minDayPower", "日勤Power最低値"],
    ["targetPublicHoliday", "公休目標日数"],
    ["consecutiveWorkDays", "連勤警告日数"],
    ["maxLateStaff", "遅出最大人数"],
    ["maxNightStaff", "入最大人数"],
    ["minDeepNightStaff", "深夜最低人数"],
    ["minEveningStaff", "準夜最低人数"],
  ];
  elements.ruleSettings.innerHTML = fields
    .map(
      ([key, label]) => `
        <label>
          <span>${label}</span>
          <input type="number" min="${RULE_MIN_VALUES[key] ?? 0}" max="31" value="${rules[key]}" data-rule-key="${key}" />
        </label>`,
    )
    .join("");
}

function createShiftSelectOptions(selectedSymbol) {
  return getShiftTypes().map((type) =>
    `<option value="${escapeHtml(type.symbol)}" ${type.symbol === selectedSymbol ? "selected" : ""}>${escapeHtml(type.symbol)}：${escapeHtml(type.name)}</option>`,
  ).join("");
}

function createTargetSelectOptions(selectedTarget) {
  return Object.entries(CUSTOM_RULE_TARGET_LABELS)
    .map(([value, label]) => `<option value="${value}" ${selectedTarget === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function createPowerValueOptions(selectedPower) {
  return [1, 2, 3, 4]
    .map((power) => `<option value="${power}" ${Number(selectedPower) === power ? "selected" : ""}>P${power}</option>`)
    .join("");
}

function createZeroSuppressionRuleHtml(rule, index) {
  return `
    <section class="custom-rule" data-custom-rule-id="${escapeHtml(rule.id)}">
      <div class="custom-rule-header">
        <label class="custom-rule-toggle">
          <input type="checkbox" data-custom-field="enabled" ${rule.enabled !== false ? "checked" : ""} />
          <span>設定${index + 1}：人数条件で警告・減点を無効化</span>
        </label>
        <button class="custom-rule-delete" type="button" data-delete-custom-rule="${escapeHtml(rule.id)}">削除</button>
      </div>
      <p class="custom-rule-line">
        もし
        <select data-custom-field="conditionShift">${createShiftSelectOptions(rule.conditionShift)}</select>
        が
        <input type="number" min="0" max="31" value="${Number(rule.count) || 0}" data-custom-field="count" />
        人
        <select data-custom-field="comparison">
          ${Object.entries(CUSTOM_RULE_COMPARISON_LABELS).map(([value, label]) => `<option value="${value}" ${rule.comparison === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        なら
      </p>
      <p class="custom-rule-line">
        <select data-custom-field="targetShift">${createShiftSelectOptions(rule.targetShift)}</select>
        が0人の
        <select data-custom-field="target">${createTargetSelectOptions(rule.target)}</select>
        を無効にする
      </p>
    </section>`;
}

function createPowerFollowRuleHtml(rule, index) {
  return `
    <section class="custom-rule" data-custom-rule-id="${escapeHtml(rule.id)}">
      <div class="custom-rule-header">
        <label class="custom-rule-toggle">
          <input type="checkbox" data-custom-field="enabled" ${rule.enabled !== false ? "checked" : ""} />
          <span>設定${index + 1}：P値フォロー条件</span>
        </label>
        <button class="custom-rule-delete" type="button" data-delete-custom-rule="${escapeHtml(rule.id)}">削除</button>
      </div>
      <p class="custom-rule-line">
        もし
        <select data-custom-field="conditionPower">
          ${createPowerValueOptions(rule.conditionPower)}
        </select>
        のスタッフが
        <select data-custom-field="conditionShift">${createShiftSelectOptions(rule.conditionShift)}</select>
        なら
      </p>
      <p class="custom-rule-line">
        <select data-custom-field="requiredPowerMin">
          ${[1, 2, 3, 4].map((power) => `<option value="${power}" ${rule.requiredPowerMin === power ? "selected" : ""}>P${power}以上</option>`).join("")}
        </select>
        のスタッフを
        <select data-custom-field="requiredShift">${createShiftSelectOptions(rule.requiredShift)}</select>
        に
        <input type="number" min="0" max="31" value="${Number(rule.requiredCount) || 0}" data-custom-field="requiredCount" />
        人以上必要
      </p>
    </section>`;
}

function createPowerCountExcessRuleHtml(rule, index) {
  return `
    <section class="custom-rule" data-custom-rule-id="${escapeHtml(rule.id)}">
      <div class="custom-rule-header">
        <label class="custom-rule-toggle">
          <input type="checkbox" data-custom-field="enabled" ${rule.enabled !== false ? "checked" : ""} />
          <span>設定${index + 1}：P値人数超過判定</span>
        </label>
        <button class="custom-rule-delete" type="button" data-delete-custom-rule="${escapeHtml(rule.id)}">削除</button>
      </div>
      <p class="custom-rule-line">
        <select data-custom-field="powerValue">${createPowerValueOptions(rule.powerValue)}</select>
        <select data-custom-field="powerMode">
          ${Object.entries(CUSTOM_POWER_MODE_LABELS).map(([value, label]) => `<option value="${value}" ${rule.powerMode === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        のスタッフが
        <select data-custom-field="targetShift">${createShiftSelectOptions(rule.targetShift)}</select>
        に
        <input type="number" min="1" max="31" value="${Number(rule.count) || 1}" data-custom-field="count" />
        人以上いる場合
      </p>
      <p class="custom-rule-line">
        <select data-custom-field="target">${createTargetSelectOptions(rule.target)}</select>
        にする
      </p>
    </section>`;
}

function createNgPairShiftRuleHtml(rule, index) {
  return `
    <section class="custom-rule" data-custom-rule-id="${escapeHtml(rule.id)}">
      <div class="custom-rule-header">
        <label class="custom-rule-toggle">
          <input type="checkbox" data-custom-field="enabled" ${rule.enabled !== false ? "checked" : ""} />
          <span>設定${index + 1}：NGペア勤務被り判定</span>
        </label>
        <button class="custom-rule-delete" type="button" data-delete-custom-rule="${escapeHtml(rule.id)}">削除</button>
      </div>
      <p class="custom-rule-line">
        NGペアが
        <select data-custom-field="pairMode">
          ${Object.entries(CUSTOM_NG_PAIR_MODE_LABELS).map(([value, label]) => `<option value="${value}" ${rule.pairMode === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        の条件で
        <select data-custom-field="shiftA">${createShiftSelectOptions(rule.shiftA)}</select>
        ${rule.pairMode === "cross" ? `<select data-custom-field="shiftB">${createShiftSelectOptions(rule.shiftB)}</select>` : ""}
        になる場合
      </p>
      <p class="custom-rule-line">
        <select data-custom-field="target">${createTargetSelectOptions(rule.target)}</select>
        にする
      </p>
    </section>`;
}

function renderCustomSettings() {
  const rules = appData.settings.customRules ?? createDefaultCustomRules();
  const builtInHtml = BUILT_IN_RULE_DEFINITIONS.map((rule) => `
    <label class="built-in-rule">
      <input type="checkbox" data-built-in-rule-id="${escapeHtml(rule.id)}" ${isBuiltInRuleEnabled(rule.id) ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(rule.label)}</strong>
        <small>${escapeHtml(rule.detail)}</small>
      </span>
    </label>`).join("");
  const ruleHtml = rules.length
    ? rules.map((rule, index) =>
        rule.type === CUSTOM_RULE_TYPES.POWER_FOLLOW
          ? createPowerFollowRuleHtml(rule, index)
          : rule.type === CUSTOM_RULE_TYPES.POWER_COUNT_EXCESS
            ? createPowerCountExcessRuleHtml(rule, index)
            : rule.type === CUSTOM_RULE_TYPES.NG_PAIR_SHIFT
              ? createNgPairShiftRuleHtml(rule, index)
              : createZeroSuppressionRuleHtml(rule, index),
      ).join("")
    : '<p class="empty-custom-rules">カスタム設定はありません。</p>';
  elements.customSettings.innerHTML = `
    <section class="custom-rule built-in-rule-list">
      <div class="custom-rule-group-heading">
        <strong>組み込み判定</strong>
        <span>現在の警告・評点ロジックです。削除はできません。</span>
      </div>
      ${builtInHtml}
    </section>
    <div class="custom-rule-add">
      <button class="compact-button custom-rule-add-button" type="button" data-add-custom-rule>＋ カスタム設定を追加</button>
    </div>
    ${ruleHtml}`;
}

function getHighlightColor() {
  const color = appData.settings.highlightColor;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#2e7d5c";
}

function hexToRgbValues(hex) {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ].join(", ");
}

function applyHighlightColor() {
  const color = getHighlightColor();
  elements.highlightColorPicker.value = color;
  document.documentElement.style.setProperty(
    "--cross-highlight-rgb",
    hexToRgbValues(color),
  );
}

function renderInputMode() {
  elements.inputModeButtons.forEach((button) => {
    const active = button.dataset.inputMode === uiState.inputMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.tableHint.textContent =
    uiState.inputMode === "request"
      ? "希望入力モード：セルで希望を登録できます。氏名とP値はスタッフ管理で編集できます。"
      : "勤務入力モード：セルで勤務を入力できます。氏名とP値はスタッフ管理で編集できます。";
}

function clearScheduleHover() {
  elements.scheduleTable
    .querySelectorAll(".is-row-hover, .is-column-hover, .is-hover-cell")
    .forEach((element) => {
      element.classList.remove("is-row-hover", "is-column-hover", "is-hover-cell");
    });
}

function clearScheduleSelection() {
  elements.scheduleTable
    .querySelectorAll(".is-row-selected, .is-column-selected, .is-selected-cell")
    .forEach((element) => {
      element.classList.remove("is-row-selected", "is-column-selected", "is-selected-cell");
    });
}

function updateScheduleSelection(button) {
  clearScheduleSelection();
  const cell = button.closest("td");
  const row = button.closest("tr");
  const day = button.dataset.day;
  if (!cell || !row || !day) return;

  row.classList.add("is-row-selected");
  elements.scheduleTable
    .querySelectorAll(`[data-day="${day}"]`)
    .forEach((element) => element.classList.add("is-column-selected"));
  cell.classList.add("is-selected-cell");
}

function updateScheduleHover(target) {
  if (!target.closest) return;
  const cell = target.closest("th, td");
  if (!cell || !elements.scheduleTable.contains(cell)) return;

  clearScheduleHover();
  const row = cell.closest("tr");
  const dayElement = target.closest("[data-day]");
  if (row) row.classList.add("is-row-hover");
  if (dayElement?.dataset.day) {
    elements.scheduleTable
      .querySelectorAll(`[data-day="${dayElement.dataset.day}"]`)
      .forEach((element) => element.classList.add("is-column-hover"));
  }
  cell.classList.add("is-hover-cell");
}

function changeMonth(offset) {
  const target = new Date(appData.display.year, appData.display.month + offset, 1);
  appData.display.year = target.getFullYear();
  appData.display.month = target.getMonth();
  closeCellEditor();
  elements.autoPlacementResult.textContent = "";
  renderPrintMeta();
  saveData();
  renderAll();
}

function openCellEditor(button) {
  const staffId = button.dataset.staffId;
  const day = Number(button.dataset.day);
  const staff = appData.staff.find((item) => item.id === staffId);
  if (!staff) return;

  uiState.editingCell = { staffId, day };
  updateScheduleSelection(button);
  elements.cellEditorTitle.textContent =
    uiState.inputMode === "request"
      ? `${staff.name}さん・${day}日の希望`
      : `${staff.name}さん・${day}日の勤務`;
  renderCellEditorOptions();
  elements.cellEditor.hidden = false;

  const rect = button.getBoundingClientRect();
  const editorRect = elements.cellEditor.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - editorRect.width - 10);
  const belowTop = rect.bottom + 7;
  const top =
    belowTop + editorRect.height <= window.innerHeight - 10
      ? belowTop
      : Math.max(10, rect.top - editorRect.height - 7);
  elements.cellEditor.style.left = `${Math.max(10, left)}px`;
  elements.cellEditor.style.top = `${top}px`;
}

function closeCellEditor() {
  elements.cellEditor.hidden = true;
  uiState.editingCell = null;
  clearScheduleSelection();
}

function openStaffNameDialog(staffId) {
  const staff = appData.staff.find((item) => item.id === staffId);
  if (!staff) return;

  closeCellEditor();
  uiState.editingStaffId = staff.id;
  elements.staffNameInput.value = staff.name;
  elements.staffNameError.textContent = "";
  elements.staffNameDialog.showModal();
  elements.staffNameInput.focus();
  elements.staffNameInput.select();
}

function closeStaffNameDialog() {
  elements.staffNameDialog.close();
  uiState.editingStaffId = null;
  elements.staffNameError.textContent = "";
}

function saveStaffName() {
  const staff = appData.staff.find((item) => item.id === uiState.editingStaffId);
  if (!staff) {
    closeStaffNameDialog();
    return;
  }

  const name = elements.staffNameInput.value.trim();
  if (!name) {
    elements.staffNameError.textContent = "氏名を入力してください。";
    elements.staffNameInput.focus();
    return;
  }

  staff.name = name;
  closeStaffNameDialog();
  saveData();
  renderAll();
}

function createStaffId() {
  let index = appData.staff.length + 1;
  let id = `staff-${index}`;
  const existingIds = new Set(appData.staff.map((staff) => staff.id));
  while (existingIds.has(id)) {
    index += 1;
    id = `staff-${index}`;
  }
  return id;
}

function addStaff() {
  appData.staff.push({
    id: createStaffId(),
    name: "新規スタッフ",
    power: 1,
    autoTarget: true,
    autoPlacementTarget: true,
    autoAdjustmentTarget: true,
    limits: { ...DEFAULT_STAFF_LIMITS },
  });
  saveData();
  renderAll();
  showNotice("スタッフを追加しました。氏名とP値はスタッフ管理で編集できます。");
}

function deleteStaff(staffId) {
  const staff = appData.staff.find((item) => item.id === staffId);
  if (!staff || appData.staff.length <= 1) return;
  if (
    !window.confirm(
      `${staff.name}さんを削除します。勤務データも削除されます。よろしいですか？`,
    )
  ) {
    return;
  }

  appData.staff = appData.staff.filter((item) => item.id !== staffId);
  Object.values(appData.schedules).forEach((monthSchedule) => {
    delete monthSchedule[staffId];
  });
  Object.values(appData.requests).forEach((monthRequests) => {
    delete monthRequests[staffId];
  });
  Object.values(appData.dayNotes).forEach((monthNotes) => {
    Object.values(monthNotes).forEach((note) => {
      if (note && typeof note === "object" && Array.isArray(note.participantIds)) {
        note.participantIds = note.participantIds.filter((id) => id !== staffId);
      }
    });
  });
  appData.ngPairs = appData.ngPairs.filter((pair) => !pair.includes(staffId));

  closeCellEditor();
  saveData();
  renderAll();
  showNotice(`${staff.name}さんを削除しました。`);
}

function updateStaffPower(staffId, power) {
  const staff = appData.staff.find((item) => item.id === staffId);
  if (!staff) return;
  staff.power = power;
  saveData();
  renderSchedule();
  renderSummary();
  renderStaffSettings();
}

function addNgPair() {
  const firstId = elements.ngPairFirst.value;
  const secondId = elements.ngPairSecond.value;
  elements.ngPairError.textContent = "";

  if (!firstId || !secondId) {
    elements.ngPairError.textContent = "スタッフを2人選択してください。";
    return;
  }
  if (firstId === secondId) {
    elements.ngPairError.textContent = "同じスタッフ同士は登録できません。";
    return;
  }

  const pairKey = getNgPairKey(firstId, secondId);
  const duplicate = appData.ngPairs.some(
    ([registeredFirst, registeredSecond]) =>
      getNgPairKey(registeredFirst, registeredSecond) === pairKey,
  );
  if (duplicate) {
    elements.ngPairError.textContent = "この組み合わせは既に登録されています。";
    return;
  }

  appData.ngPairs.push([firstId, secondId].sort());
  saveData();
  renderNgPairs();
  renderSchedule();
}

function deleteNgPair(pairKey) {
  appData.ngPairs = appData.ngPairs.filter(
    ([firstId, secondId]) => getNgPairKey(firstId, secondId) !== pairKey,
  );
  elements.ngPairError.textContent = "";
  saveData();
  renderNgPairs();
  renderSchedule();
}

function clearCurrentSchedule() {
  if (
    !window.confirm(
      "勤務表の勤務データだけを空欄にします。希望、パターン、スタッフ設定は残ります。よろしいですか？",
    )
  ) {
    return;
  }

  delete appData.schedules[getMonthKey()];
  closeCellEditor();
  elements.autoPlacementResult.textContent = "";
  saveData();
  renderSchedule();
  renderSummary();
  showNotice("勤務表の勤務データだけをクリアしました。希望やパターンは残っています。");
}

function applyPattern(staffId, startDay, pattern) {
  let placedCount = 0;
  const skipped = [];
  const staff = appData.staff.find((item) => item.id === staffId);
  pattern.shifts.forEach((shift, index) => {
    const day = startDay + index;
    if (day <= getDaysInMonth()) {
      const request = getRequest(staffId, day);
      if (!requestAllowsShift(request, shift)) {
        skipped.push({
          staffName: staff?.name ?? staffId,
          day,
          request,
          shift,
        });
        return;
      }
      setShift(staffId, day, shift);
      placedCount += 1;
    }
  });
  return { placedCount, skipped };
}

function canAutoPlacePattern(staffId, startDay, pattern) {
  if (!pattern.shifts.length || startDay + pattern.shifts.length - 1 > getDaysInMonth()) {
    return false;
  }

  const cellsAvailable = pattern.shifts.every((shift, index) => {
    const day = startDay + index;
    const type = getShiftType(shift);
    const nextRequest = getRequest(staffId, day + 1);
    return shift && type?.useForAuto !== false && !getShift(staffId, day) && !getRequest(staffId, day) &&
      !(type?.blockedBeforeRequestedOff && isShiftTypeFlag(nextRequest, "isRest"));
  });
  return cellsAvailable;
}

function getMonthWarningCount({ excludeStaffLimits = false } = {}) {
  let count = 0;
  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    const warnings = getWarnings(day);
    count += excludeStaffLimits
      ? warnings.filter((warning) => !warning.includes("上限を超えています")).length
      : warnings.length;
  }
  return count;
}

function getAutoPlacementRules() {
  const saved = appData.settings.generation ?? {};
  return {
    targetDayStaff:
      Number(saved.targetDayStaff) || AUTO_PLACEMENT_DEFAULTS.targetDayStaff,
    maxNightStaff:
      Number(saved.maxNightStaff) || AUTO_PLACEMENT_DEFAULTS.maxNightStaff,
    maxLateStaff:
      Number(saved.maxLateStaff) || AUTO_PLACEMENT_DEFAULTS.maxLateStaff,
    warningWeight:
      Number(saved.warningWeight) || AUTO_PLACEMENT_DEFAULTS.warningWeight,
    dayShortageWeight:
      Number(saved.dayShortageWeight) ||
      AUTO_PLACEMENT_DEFAULTS.dayShortageWeight,
    dayExcessWeight:
      Number(saved.dayExcessWeight) || AUTO_PLACEMENT_DEFAULTS.dayExcessWeight,
    nightExcessWeight:
      Number(saved.nightExcessWeight) || AUTO_PLACEMENT_DEFAULTS.nightExcessWeight,
    lateExcessWeight:
      Number(saved.lateExcessWeight) || AUTO_PLACEMENT_DEFAULTS.lateExcessWeight,
    staffBalanceWeight:
      Number(saved.staffBalanceWeight) || AUTO_PLACEMENT_DEFAULTS.staffBalanceWeight,
    shortPatternWeight:
      Number(saved.shortPatternWeight) || AUTO_PLACEMENT_DEFAULTS.shortPatternWeight,
    patternReuseWeight:
      Number(saved.patternReuseWeight) || AUTO_PLACEMENT_DEFAULTS.patternReuseWeight,
    staffLimitWeight:
      Number(saved.staffLimitWeight) || AUTO_PLACEMENT_DEFAULTS.staffLimitWeight,
  };
}

function getMonthBalancePenalty() {
  const rules = getAutoPlacementRules();
  let penalty = 0;

  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    const totals = getDailyTotals(day);
    const dayShortage = Math.max(0, rules.targetDayStaff - totals.day);
    const dayExcess = Math.max(0, totals.day - rules.targetDayStaff);
    const nightExcess = Math.max(0, totals.evening - rules.maxNightStaff);
    const lateExcess = Math.max(0, totals.late - rules.maxLateStaff);

    penalty += dayShortage ** 2 * rules.dayShortageWeight;
    penalty += dayExcess ** 2 * rules.dayExcessWeight;
    penalty += nightExcess ** 2 * rules.nightExcessWeight;
    penalty += lateExcess ** 2 * rules.lateExcessWeight;
  }

  return penalty;
}

function evaluateAutoPlacement(staffId, startDay, pattern) {
  // 候補を一時配置し、既存の警告エンジンで評価した後に空欄へ戻す。
  pattern.shifts.forEach((shift, index) => {
    setShift(staffId, startDay + index, shift);
  });
  const warningCount = getMonthWarningCount({ excludeStaffLimits: true });
  const balancePenalty = getMonthBalancePenalty();
  const staffPenalty = getStaffBalancePenalty();
  const staffLimitPenalty =
    getAllStaffLimitExcessTotal() * getAutoPlacementRules().staffLimitWeight;
  const shortPatternPenalty =
    pattern.shifts.length <= 2 ? getAutoPlacementRules().shortPatternWeight : 0;
  const score =
    warningCount * getAutoPlacementRules().warningWeight +
    balancePenalty +
    staffPenalty +
    staffLimitPenalty +
    shortPatternPenalty;
  pattern.shifts.forEach((shift, index) => {
    setShift(staffId, startDay + index, "");
  });
  return { warningCount, balancePenalty, staffPenalty, staffLimitPenalty, score };
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function getAutoPatterns() {
  return appData.patterns.filter(
    (pattern) => pattern.useForAuto !== false && pattern.shifts.every((shift) => shift && getShiftType(shift)?.useForAuto !== false),
  );
}

function selectBestAutoPlacement(
  staffId,
  startDay,
  patterns = getAutoPatterns(),
  patternUsageCounts = new Map(),
) {
  const rules = getAutoPlacementRules();
  const candidates = shuffleArray(patterns)
    .filter((pattern) => canAutoPlacePattern(staffId, startDay, pattern))
    .map((pattern) => {
      const evaluation = evaluateAutoPlacement(staffId, startDay, pattern);
      const reusePenalty = (patternUsageCounts.get(pattern.id) || 0) * rules.patternReuseWeight;
      return {
        pattern,
        ...evaluation,
        reusePenalty,
        score: evaluation.score + reusePenalty,
      };
    });
  if (!candidates.length) return null;

  const minimumScore = Math.min(...candidates.map((candidate) => candidate.score));
  const bestCandidates = candidates.filter(
    (candidate) => candidate.score === minimumScore,
  );
  return bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
}

function getStaffDayOrder(staffIndex, daysInMonth) {
  return Array.from(
    { length: daysInMonth },
    (_, index) => index + 1,
  );
}

function runAutoPlacement() {
  const autoPatterns = getAutoPatterns();
  if (!autoPatterns.length) {
    elements.autoPlacementResult.textContent =
      "自動配置に使うパターンがありません。";
    return { patternCount: 0, cellCount: 0 };
  }
  if (!appData.staff.some((staff) => staff.autoPlacementTarget !== false)) {
    elements.autoPlacementResult.textContent = "自動配置対象のスタッフがいません。";
    return { patternCount: 0, cellCount: 0 };
  }

  closeCellEditor();
  hideNotice();
  elements.autoPlacePatterns.disabled = true;
  elements.autoPlacePatterns.textContent = "配置中...";
  elements.autoPlacementResult.textContent = "候補を評価しています...";

  let patternCount = 0;
  let cellCount = 0;
  const daysInMonth = getDaysInMonth();
  const patternUsageCounts = new Map();

  const staffOrder = shuffleArray(
    appData.staff.filter((staff) => staff.autoPlacementTarget !== false).map((staff) => ({ staff })),
  );
  staffOrder.forEach(({ staff }, staffIndex) => {
    const dayOrder = getStaffDayOrder(staffIndex, daysInMonth);
    dayOrder.forEach((day) => {
      if (getShift(staff.id, day) || getRequest(staff.id, day)) return;

      const candidate = selectBestAutoPlacement(
        staff.id,
        day,
        autoPatterns,
        patternUsageCounts,
      );
      if (!candidate) return;

      candidate.pattern.shifts.forEach((shift, index) => {
        setShift(staff.id, day + index, shift);
      });
      patternUsageCounts.set(
        candidate.pattern.id,
        (patternUsageCounts.get(candidate.pattern.id) || 0) + 1,
      );
      patternCount += 1;
      cellCount += candidate.pattern.shifts.length;
    });
  });

  saveData();
  renderSchedule();
  renderSummary();
  renderPatterns();

  const message =
    patternCount > 0
      ? `${patternCount}件のパターンを配置し、${cellCount}セルを自動入力しました。`
      : "配置可能な空欄がありませんでした。";
  elements.autoPlacementResult.textContent = message;
  elements.autoPlacePatterns.textContent = "自動配置";
  elements.autoPlacePatterns.disabled = getAutoPatterns().length === 0;
  showNotice(message);
  return { patternCount, cellCount };
}

function getAdjustableCells() {
  const adjustableShifts = new Set(["日", "遅", "休"]);
  const cells = [];
  appData.staff.filter((staff) => staff.autoAdjustmentTarget !== false).forEach((staff) => {
    for (let day = 1; day <= getDaysInMonth(); day += 1) {
      const shift = getShift(staff.id, day);
      if (getRequest(staff.id, day)) continue;
      if (!adjustableShifts.has(shift)) continue;
      cells.push({ staffId: staff.id, day, shift });
    }
  });
  return cells;
}

function createNightAdjustmentCandidate() {
  const candidates = [];
  for (let day = 1; day <= getDaysInMonth() - 1; day += 1) {
    const violations = getScoreRuleViolations(day);
    const shouldReduceNight =
      violations.juniorNightSupport ||
      violations.seniorNightOverlap ||
      violations.juniorNightOverlap ||
      violations.nightStaffExcess;
    if (!shouldReduceNight) continue;

    const nightStaff = appData.staff.filter(
      (staff) => staff.autoAdjustmentTarget !== false && getShift(staff.id, day) === "入",
    );
    const seniorNightCount = nightStaff.filter((staff) => staff.power >= 2).length;
    const juniorNightCount = nightStaff.filter((staff) => staff.power === 1).length;
    const removableStaff = nightStaff
      .filter((staff) => {
        if (getRequest(staff.id, day) || getRequest(staff.id, day + 1)) return false;
        return getShift(staff.id, day + 1) === "明";
      })
      .filter((staff) => {
        if (violations.juniorNightSupport && staff.power === 1) return true;
        if (violations.juniorNightOverlap && staff.power === 1) return true;
        if (violations.seniorNightOverlap && staff.power >= 2) return true;
        if (violations.nightStaffExcess) {
          if (juniorNightCount >= 2) return staff.power === 1;
          if (seniorNightCount >= 2) return staff.power >= 2;
          return true;
        }
        return false;
      });

    removableStaff.forEach((staff) => {
      candidates.push({
        type: "night-remove",
        cells: [
          { staffId: staff.id, day, before: "入", after: "休" },
          { staffId: staff.id, day: day + 1, before: "明", after: "休" },
        ],
      });
    });
  }

  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function createLateExcessAdjustmentCandidate() {
  const candidates = [];
  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    const lateStaff = appData.staff.filter(
      (staff) => staff.autoAdjustmentTarget !== false && getShift(staff.id, day) === "遅",
    );
    if (lateStaff.length < 2) continue;

    lateStaff
      .filter((staff) => !getRequest(staff.id, day))
      .forEach((staff) => {
        const publicHolidayCount = getStaffTotals(staff.id).publicHoliday;
        const preferredShift = publicHolidayCount <= 8 ? "休" : "日";
        const fallbackShift = preferredShift === "休" ? "日" : "休";
        candidates.push({
          type: "late-excess",
          cells: [{ staffId: staff.id, day, before: "遅", after: preferredShift }],
        });
        candidates.push({
          type: "late-excess",
          cells: [{ staffId: staff.id, day, before: "遅", after: fallbackShift }],
        });
      });
  }

  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function createStaffLimitAdjustmentCandidate() {
  const candidates = [];
  const daySymbol = getShiftTypes().find((type) => type.countsAsDay)?.symbol ?? "日";
  const offSymbol = getShiftTypes().find((type) => type.countsAsPublicHoliday)?.symbol ?? "休";
  const targetOffDays = getWarningRules().targetPublicHoliday;

  appData.staff
    .filter((staff) => staff.autoAdjustmentTarget !== false)
    .forEach((staff) => {
      const violations = getStaffLimitViolations(staff);
      const labels = new Set(violations.map((violation) => violation.label));

      if (labels.has("遅出")) {
        for (let day = 1; day <= getDaysInMonth(); day += 1) {
          const shift = getShift(staff.id, day);
          if (!isShiftTypeFlag(shift, "countsAsLate") || getRequest(staff.id, day)) continue;
          const preferred = getStaffTotals(staff.id).publicHoliday < targetOffDays ? offSymbol : daySymbol;
          [preferred, preferred === offSymbol ? daySymbol : offSymbol].forEach((after) => {
            candidates.push({
              type: "staff-late-limit",
              cells: [{ staffId: staff.id, day, before: shift, after }],
            });
          });
        }
      }

      if (labels.has("入")) {
        for (let day = 1; day < getDaysInMonth(); day += 1) {
          if (getShift(staff.id, day) !== "入" || getShift(staff.id, day + 1) !== "明") continue;
          if (getRequest(staff.id, day) || getRequest(staff.id, day + 1)) continue;
          [offSymbol, daySymbol].forEach((after) => {
            candidates.push({
              type: "staff-night-limit",
              cells: [
                { staffId: staff.id, day, before: "入", after },
                { staffId: staff.id, day: day + 1, before: "明", after },
              ],
            });
          });
        }
      }

      if (labels.has("連勤")) {
        for (let day = 1; day <= getDaysInMonth(); day += 1) {
          const shift = getShift(staff.id, day);
          if (getRequest(staff.id, day)) continue;
          if (!isShiftTypeFlag(shift, "countsAsDay") && !isShiftTypeFlag(shift, "countsAsLate")) continue;
          candidates.push({
            type: "staff-consecutive-limit",
            cells: [{ staffId: staff.id, day, before: shift, after: offSymbol }],
          });
        }
      }
    });

  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function createAdjustmentCandidate() {
  const staffLimitCandidate = createStaffLimitAdjustmentCandidate();
  if (staffLimitCandidate && Math.random() < 0.8) return staffLimitCandidate;

  const lateExcessCandidate = createLateExcessAdjustmentCandidate();
  if (lateExcessCandidate && Math.random() < 0.7) return lateExcessCandidate;

  const nightCandidate = createNightAdjustmentCandidate();
  if (nightCandidate && Math.random() < 0.35) return nightCandidate;

  const cells = getAdjustableCells();
  if (!cells.length) return staffLimitCandidate || lateExcessCandidate || nightCandidate;

  if (cells.length >= 2 && Math.random() < 0.45) {
    const first = cells[Math.floor(Math.random() * cells.length)];
    const candidates = cells.filter(
      (cell) =>
        (cell.staffId !== first.staffId || cell.day !== first.day) &&
        cell.shift !== first.shift,
    );
    if (candidates.length) {
      const second = candidates[Math.floor(Math.random() * candidates.length)];
      return {
        type: "swap",
        cells: [
          { staffId: first.staffId, day: first.day, before: first.shift, after: second.shift },
          { staffId: second.staffId, day: second.day, before: second.shift, after: first.shift },
        ],
      };
    }
  }

  const target = cells[Math.floor(Math.random() * cells.length)];
  const nextShiftCandidates = ["日", "遅", "休"].filter((shift) => shift !== target.shift);
  const nextShift = nextShiftCandidates[Math.floor(Math.random() * nextShiftCandidates.length)];
  return {
    type: "set",
    cells: [{ staffId: target.staffId, day: target.day, before: target.shift, after: nextShift }],
  };
}

function applyAdjustmentChange(change) {
  change.cells.forEach((cell) => {
    setShift(cell.staffId, cell.day, cell.after);
  });
}

function undoAdjustmentChange(change) {
  change.cells.forEach((cell) => {
    setShift(cell.staffId, cell.day, cell.before);
  });
}

function runAutoAdjustment() {
  closeCellEditor();
  hideNotice();
  if (!appData.staff.some((staff) => staff.autoAdjustmentTarget !== false)) {
    const message = "自動調整対象のスタッフがいません。";
    elements.autoPlacementResult.textContent = message;
    showNotice(message);
    return { initialScore: calculateShiftScore().score, currentScore: calculateShiftScore().score, acceptedCount: 0 };
  }

  const initialScore = calculateShiftScore().score;
  let currentScore = initialScore;
  let acceptedCount = 0;
  const maxAttempts = 250;

  elements.autoAdjustShifts.disabled = true;
  elements.autoAdjustShifts.textContent = "調整中...";
  elements.autoPlacementResult.textContent = "スコアが上がる小さな変更を試しています...";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const change = createAdjustmentCandidate();
    if (!change) break;

    applyAdjustmentChange(change);
    const nextScore = calculateShiftScore().score;
    if (nextScore > currentScore) {
      currentScore = nextScore;
      acceptedCount += 1;
    } else {
      undoAdjustmentChange(change);
    }
  }

  saveData();
  renderSchedule();
  renderSummary();
  renderPatterns();

  const message =
    acceptedCount > 0
      ? `自動調整しました。スコア：${initialScore}点 → ${currentScore}点、採用した変更：${acceptedCount}件`
      : "自動調整を試しましたが、スコアが改善する変更は見つかりませんでした。";
  elements.autoPlacementResult.textContent = message;
  elements.autoAdjustShifts.textContent = "自動調整";
  elements.autoAdjustShifts.disabled = false;
  showNotice(message);
  return { initialScore, currentScore, acceptedCount };
}

function getCellExportValue(staffId, day) {
  const shift = getShift(staffId, day);
  const request = getRequest(staffId, day);
  const value = shift || request;
  if (!value) return "";
  return request ? `${value}*` : value;
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getExportBaseName(kind) {
  return `${appData.display.year}-${String(appData.display.month + 1).padStart(2, "0")}_${kind}`;
}

function openExportDialog() {
  elements.exportDialog.showModal();
}

function closeExportDialog() {
  if (elements.exportDialog.open) elements.exportDialog.close();
}

function exportScheduleCsv() {
  const days = Array.from({ length: getDaysInMonth() }, (_, index) => index + 1);
  const rows = [
    ["氏名", "P", ...days],
    ...appData.staff.map((staff) => [
      staff.name,
      staff.power,
      ...days.map((day) => getCellExportValue(staff.id, day)),
    ]),
  ];
  downloadCsv(`${getExportBaseName("勤務表")}.csv`, rows);
  closeExportDialog();
  showNotice("勤務表CSVを出力しました。");
}

function exportStaffSummaryCsv() {
  const rows = [["氏名", "P", "公", "日", "遅", "入", "明", "有", "夏", "冬"]];
  appData.staff.forEach((staff) => {
    const totals = getStaffTotals(staff.id);
    rows.push([
      staff.name,
      staff.power,
      formatCount(totals.publicHoliday),
      formatCount(totals.day),
      formatCount(totals.late),
      formatCount(totals.evening),
      formatCount(totals.deepNight),
      formatCount(totals.paid),
      formatCount(totals.summer),
      formatCount(totals.winter),
    ]);
  });
  downloadCsv(`${getExportBaseName("個人集計")}.csv`, rows);
  closeExportDialog();
  showNotice("個人集計CSVを出力しました。");
}

function exportDailySummaryCsv() {
  const rows = [["日", "曜日", "日勤", "深夜", "準夜", "遅出", "Power", "警告件数"]];
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    const totals = getDailyTotals(day);
    rows.push([
      day,
      weekdays[new Date(appData.display.year, appData.display.month, day).getDay()],
      formatCount(totals.day),
      formatCount(totals.deepNight),
      formatCount(totals.evening),
      formatCount(totals.late),
      formatCount(totals.power),
      getWarnings(day).length,
    ]);
  }
  downloadCsv(`${getExportBaseName("日別集計")}.csv`, rows);
  closeExportDialog();
  showNotice("日別集計CSVを出力しました。");
}

function exportWarningsCsv() {
  const rows = [["日", "曜日", "種類", "内容"]];
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    const weekday = weekdays[new Date(appData.display.year, appData.display.month, day).getDay()];
    getWarnings(day).forEach((warning) => rows.push([day, weekday, "警告", warning]));
    getMonthBoundaryNotes(day).forEach((note) => rows.push([day, weekday, "月またぎ確認", note]));
  }
  downloadCsv(`${getExportBaseName("警告一覧")}.csv`, rows);
  closeExportDialog();
  showNotice("警告一覧CSVを出力しました。");
}

function requestToShift(request) {
  if (request === "日/遅") {
    if (getShiftType("日")) return "日";
    if (getShiftType("遅")) return "遅";
    return "";
  }
  return getShiftType(request) ? request : "";
}

function applyRequestsToShifts() {
  const targets = [];
  const conflicts = [];
  appData.staff.forEach((staff) => {
    for (let day = 1; day <= getDaysInMonth(); day += 1) {
      const request = getRequest(staff.id, day);
      const shift = requestToShift(request);
      if (!request || !shift) continue;
      if (getShift(staff.id, day)) conflicts.push({ staff, day, shift });
      else targets.push({ staff, day, shift });
    }
  });

  let overwrite = false;
  if (conflicts.length) {
    overwrite = window.confirm(
      `既に勤務が入っている希望セルが${conflicts.length}件あります。\n上書きして希望勤務を反映しますか？\n\nキャンセルすると空欄セルだけ反映します。`,
    );
  }

  [...targets, ...(overwrite ? conflicts : [])].forEach(({ staff, day, shift }) => {
    setShift(staff.id, day, shift);
  });

  const reflectedCount = targets.length + (overwrite ? conflicts.length : 0);
  saveData();
  renderSchedule();
  renderSummary();
  showNotice(
    reflectedCount
      ? `希望勤務を${reflectedCount}セル、勤務表へ反映しました。希望データは残っています。`
      : "反映できる希望勤務はありませんでした。",
    !overwrite && conflicts.length
      ? [`既存勤務がある${conflicts.length}セルは上書きしませんでした。`]
      : [],
  );
}

function showNotice(message, details = []) {
  elements.appNoticeMessage.textContent = message;
  elements.appNoticeDetails.innerHTML = details
    .map((detail) => `<li>${escapeHtml(detail)}</li>`)
    .join("");
  elements.appNotice.hidden = false;
}

function hideNotice() {
  elements.appNotice.hidden = true;
  elements.appNoticeMessage.textContent = "";
  elements.appNoticeDetails.innerHTML = "";
}

function formatSkippedRequests(skipped) {
  return skipped.map(
    ({ staffName, day, request }) =>
      `${staffName}さん ${day}日：${getRequestLabel(request)}`,
  );
}

function showWarning(day) {
  elements.warningTitle.textContent = `${appData.display.month + 1}月${day}日の警告`;
  const warnings = getWarnings(day);
  const boundaryNotes = getMonthBoundaryNotes(day);
  elements.warningList.innerHTML = warnings.length
    ? warnings
        .map((warning) => `<li>${escapeHtml(warning)}</li>`)
        .join("")
    : '<li class="warning-empty">通常の警告はありません。</li>';
  elements.boundaryNoteSection.hidden = boundaryNotes.length === 0;
  elements.boundaryNoteList.innerHTML = boundaryNotes
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");
  elements.warningDialog.showModal();
}

function renderDayNoteStaffOptions(selectedIds = []) {
  const selected = new Set(selectedIds);
  elements.dayNoteStaffList.innerHTML = appData.staff.map((staff) => `
    <label class="badge-checkbox">
      <input type="checkbox" value="${escapeHtml(staff.id)}" data-day-note-staff ${selected.has(staff.id) ? "checked" : ""} />
      <span>${escapeHtml(staff.name)}</span>
      <small>P${staff.power}</small>
    </label>`).join("");
}

function renderDayNoteRequestOptions(selectedShift = "") {
  const options = ["", ...getShiftOptions({ includeBlank: false })];
  elements.dayNoteRequestOptions.innerHTML = options.map((shift) => `
    <label class="badge-radio">
      <input type="radio" name="day-note-request-shift" value="${escapeHtml(shift)}" ${shift === selectedShift ? "checked" : ""} />
      ${createShiftBadgeLabel(shift)}
    </label>`).join("");
}

function openDayNoteDialog(day) {
  closeCellEditor();
  uiState.editingDayNote = day;
  const note = getDayNote(day);
  elements.dayNoteDialogTitle.textContent = `${appData.display.month + 1}月${day}日の行事予定`;
  elements.dayNoteTitle.value = note.title;
  elements.dayNoteMemo.value = note.memo;
  elements.dayNoteError.textContent = "";
  renderDayNoteStaffOptions(note.participantIds);
  renderDayNoteRequestOptions(note.requestShift);
  elements.dayNoteDialog.showModal();
  elements.dayNoteTitle.focus();
}

function closeDayNoteDialog() {
  elements.dayNoteDialog.close();
  uiState.editingDayNote = null;
  elements.dayNoteError.textContent = "";
}

function getSelectedDayNoteStaffIds() {
  return Array.from(elements.dayNoteStaffList.querySelectorAll("[data-day-note-staff]:checked"))
    .map((input) => input.value);
}

function getSelectedDayNoteRequestShift() {
  return elements.dayNoteRequestOptions.querySelector('input[name="day-note-request-shift"]:checked')?.value ?? "";
}

function applyDayNoteRequests(day, participantIds, requestShift) {
  if (!requestShift || !participantIds.length) return { applied: 0, skipped: 0 };
  const conflicts = participantIds
    .map((staffId) => ({ staffId, current: getRequest(staffId, day) }))
    .filter(({ current }) => current && current !== requestShift);
  const overwrite = conflicts.length
    ? window.confirm(
        `既に希望勤務が入っている参加スタッフが${conflicts.length}名います。\n行事予定の希望勤務で上書きしますか？\n\nキャンセルすると既存希望は残します。`,
      )
    : false;

  let applied = 0;
  let skipped = 0;
  participantIds.forEach((staffId) => {
    const current = getRequest(staffId, day);
    if (current && current !== requestShift && !overwrite) {
      skipped += 1;
      return;
    }
    setRequest(staffId, day, requestShift);
    applied += 1;
  });
  return { applied, skipped };
}

function saveDayNoteFromDialog() {
  const day = uiState.editingDayNote;
  if (!day) return;
  const note = {
    title: elements.dayNoteTitle.value.trim(),
    memo: elements.dayNoteMemo.value.trim(),
    participantIds: getSelectedDayNoteStaffIds(),
    requestShift: getSelectedDayNoteRequestShift(),
  };
  setDayNote(day, note);
  const requestResult = applyDayNoteRequests(day, note.participantIds, note.requestShift);
  closeDayNoteDialog();
  saveData();
  renderSchedule();
  showNotice(
    note.title ? `行事予定「${note.title}」を保存しました。` : "行事予定を保存しました。",
    [
      requestResult.applied ? `参加スタッフ${requestResult.applied}名の希望勤務へ反映しました。` : "",
      requestResult.skipped ? `既存希望がある${requestResult.skipped}名は上書きしませんでした。` : "",
    ].filter(Boolean),
  );
}

function deleteDayNoteFromDialog() {
  const day = uiState.editingDayNote;
  if (!day) return;
  setDayNote(day, createEmptyDayNote());
  closeDayNoteDialog();
  saveData();
  renderSchedule();
  showNotice("行事予定を削除しました。反映済みの希望勤務は残っています。");
}

function openPatternDialog(pattern = null) {
  uiState.editingPatternId = pattern?.id ?? null;
  uiState.patternDraft = pattern ? [...pattern.shifts] : [];
  elements.patternDialogTitle.textContent = pattern ? "パターン編集" : "パターン追加";
  elements.patternNameInput.value = pattern?.name ?? "";
  elements.patternEditorError.textContent = "";
  renderPatternDraft();
  elements.patternDialog.showModal();
  elements.patternNameInput.focus();
}

function closePatternDialog() {
  elements.patternDialog.close();
  uiState.editingPatternId = null;
  uiState.patternDraft = [];
}

function populateShiftTypeRuleOptions(current = null) {
  const options = getShiftTypes().map((type) =>
    `<option value="${escapeHtml(type.symbol)}">${escapeHtml(type.symbol)}：${escapeHtml(type.name)}</option>`,
  ).join("");
  elements.shiftTypeRequiredNext.innerHTML = `<option value="">指定なし</option>${options}`;
  elements.shiftTypeRequiredNext.value = current?.requiredNext ?? "";
  const forbidden = new Set(current?.forbiddenNext ?? []);
  elements.shiftTypeForbiddenNext.innerHTML = getShiftTypes().map((type) => `
    <label>
      <input type="checkbox" value="${escapeHtml(type.symbol)}" data-forbidden-next ${forbidden.has(type.symbol) ? "checked" : ""} />
      ${createShiftMark(type.symbol)}
      <span>${escapeHtml(type.name)}</span>
    </label>`).join("");
}

function populateShiftTypeCompositionOptions(current = null) {
  elements.shiftTypeComposition.innerHTML = `
    <option value="${SHIFT_COMPOSITION_TYPES.NORMAL}">通常勤務</option>
    <option value="${SHIFT_COMPOSITION_TYPES.HALF_DAY}">午前/午後構成勤務</option>
  `;
  elements.shiftTypeComposition.value = current?.compositionType ?? SHIFT_COMPOSITION_TYPES.NORMAL;
  const createHalfDayOptions = (selected) => getHalfDayComponentOptions(selected)
    .map((symbol) => {
      const type = getShiftType(symbol);
      return `<option value="${escapeHtml(symbol)}" ${symbol === selected ? "selected" : ""}>${escapeHtml(symbol)}：${escapeHtml(type?.name ?? symbol)}</option>`;
    })
    .join("");
  elements.shiftTypeMorning.innerHTML = createHalfDayOptions(current?.morningShift ?? "日");
  elements.shiftTypeAfternoon.innerHTML = createHalfDayOptions(current?.afternoonShift ?? "休");
  updateShiftTypeCompositionUi();
}

function updateShiftTypeCompositionUi() {
  const isHalfDay = elements.shiftTypeComposition.value === SHIFT_COMPOSITION_TYPES.HALF_DAY;
  elements.shiftTypeComposition.closest(".shift-type-composition-fields")?.classList.toggle("is-half-day", isHalfDay);
  document.querySelectorAll("[data-shift-type-flag]").forEach((input) => {
    input.disabled = isHalfDay;
  });
}

function openShiftTypeDialog(type = null) {
  uiState.editingShiftTypeSymbol = type?.symbol ?? null;
  elements.shiftTypeDialogTitle.textContent = type ? "勤務形態編集" : "勤務形態追加";
  elements.shiftTypeSymbol.value = type?.symbol ?? "";
  elements.shiftTypeName.value = type?.name ?? "";
  elements.shiftTypeCategory.innerHTML = SHIFT_TYPE_CATEGORIES.map((category) =>
    `<option value="${category}">${category}</option>`,
  ).join("");
  elements.shiftTypeCategory.value = type?.category ?? "その他勤務";
  elements.shiftTypeColor.value = type?.color ?? "#e6eee9";
  document.querySelectorAll("[data-shift-type-flag]").forEach((input) => {
    input.checked = Boolean(type?.[input.dataset.shiftTypeFlag]);
  });
  populateShiftTypeCompositionOptions(type);
  populateShiftTypeRuleOptions(type);
  elements.shiftTypeError.textContent = "";
  elements.shiftTypeDialog.showModal();
  elements.shiftTypeSymbol.focus();
}

function closeShiftTypeDialog() {
  elements.shiftTypeDialog.close();
  uiState.editingShiftTypeSymbol = null;
}

function replaceShiftSymbol(oldSymbol, newSymbol) {
  if (!oldSymbol || oldSymbol === newSymbol) return;
  Object.values(appData.schedules).forEach((month) => Object.values(month).forEach((days) => {
    Object.keys(days).forEach((day) => { if (days[day] === oldSymbol) days[day] = newSymbol; });
  }));
  Object.values(appData.requests).forEach((month) => Object.values(month).forEach((days) => {
    Object.keys(days).forEach((day) => { if (days[day] === oldSymbol) days[day] = newSymbol; });
  }));
  appData.patterns.forEach((pattern) => {
    pattern.shifts = pattern.shifts.map((shift) => shift === oldSymbol ? newSymbol : shift);
  });
  Object.values(appData.dayNotes).forEach((monthNotes) => {
    Object.values(monthNotes).forEach((note) => {
      if (note && typeof note === "object" && note.requestShift === oldSymbol) {
        note.requestShift = newSymbol;
      }
    });
  });
  (appData.settings.customRules ?? []).forEach((rule) => {
    ["conditionShift", "targetShift", "requiredShift", "shiftA", "shiftB"].forEach((key) => {
      if (rule[key] === oldSymbol) rule[key] = newSymbol;
    });
  });
  appData.shiftTypes.forEach((type) => {
    if (type.requiredNext === oldSymbol) type.requiredNext = newSymbol;
    if (type.morningShift === oldSymbol) type.morningShift = newSymbol;
    if (type.afternoonShift === oldSymbol) type.afternoonShift = newSymbol;
    type.forbiddenNext = type.forbiddenNext.map((symbol) => symbol === oldSymbol ? newSymbol : symbol);
  });
}

function saveShiftType() {
  const oldSymbol = uiState.editingShiftTypeSymbol;
  const symbol = elements.shiftTypeSymbol.value.trim();
  const name = elements.shiftTypeName.value.trim();
  if (!symbol || !name) {
    elements.shiftTypeError.textContent = "記号と名称を入力してください。";
    return;
  }
  if (getShiftTypes().some((type) => type.symbol === symbol && type.symbol !== oldSymbol)) {
    elements.shiftTypeError.textContent = "同じ記号が既に登録されています。";
    return;
  }
  if (symbol === "日/遅") {
    elements.shiftTypeError.textContent = "「日/遅」は希望入力で使用する予約記号です。別の記号を指定してください。";
    return;
  }
  const nextType = {
    symbol,
    name,
    category: elements.shiftTypeCategory.value,
    color: elements.shiftTypeColor.value,
    compositionType: elements.shiftTypeComposition.value,
    morningShift: elements.shiftTypeMorning.value,
    afternoonShift: elements.shiftTypeAfternoon.value,
    requiredNext: elements.shiftTypeRequiredNext.value,
    forbiddenNext: Array.from(elements.shiftTypeForbiddenNext.querySelectorAll("[data-forbidden-next]:checked"))
      .map((input) => input.value),
  };
  document.querySelectorAll("[data-shift-type-flag]").forEach((input) => {
    nextType[input.dataset.shiftTypeFlag] = input.checked;
  });
  if (nextType.compositionType === SHIFT_COMPOSITION_TYPES.HALF_DAY) {
    if (!nextType.morningShift || !nextType.afternoonShift) {
      elements.shiftTypeError.textContent = "午前と午後の勤務を選択してください。";
      return;
    }
    const invalidPart = [nextType.morningShift, nextType.afternoonShift]
      .map((part) => getShiftType(part))
      .some((partType) => !isHalfDayComponentCandidate(partType));
    if (invalidPart) {
      elements.shiftTypeError.textContent = "午前/午後に選べる勤務は、日勤系・研修系・休み系のみです。";
      return;
    }
    SHIFT_TYPE_FLAGS.forEach((flag) => {
      nextType[flag] = getShiftContribution(nextType.morningShift, flag) > 0 ||
        getShiftContribution(nextType.afternoonShift, flag) > 0;
    });
    nextType.countsAsLate = false;
    nextType.countsAsEvening = false;
    nextType.countsAsDeepNight = false;
    nextType.requiredNext = "";
    nextType.forbiddenNext = [];
  } else {
    nextType.morningShift = "";
    nextType.afternoonShift = "";
  }
  if (oldSymbol && oldSymbol !== symbol) {
    if (nextType.requiredNext === oldSymbol) nextType.requiredNext = symbol;
    nextType.forbiddenNext = nextType.forbiddenNext.map((value) => value === oldSymbol ? symbol : value);
  }
  if (oldSymbol) {
    replaceShiftSymbol(oldSymbol, symbol);
    const index = appData.shiftTypes.findIndex((type) => type.symbol === oldSymbol);
    appData.shiftTypes[index] = nextType;
  } else {
    appData.shiftTypes.push(nextType);
  }
  closeShiftTypeDialog();
  saveData();
  renderAll();
  showNotice(`勤務形態「${name}」を保存しました。`);
}

function isShiftTypeInUse(symbol) {
  const scheduleUse = Object.values(appData.schedules).some((month) =>
    Object.values(month).some((days) => Object.values(days).includes(symbol)),
  );
  const requestUse = Object.values(appData.requests).some((month) =>
    Object.values(month).some((days) => Object.values(days).includes(symbol)),
  );
  const dayNoteUse = Object.values(appData.dayNotes).some((month) =>
    Object.values(month).some((note) => note && typeof note === "object" && note.requestShift === symbol),
  );
  const customRuleUse = (appData.settings.customRules ?? []).some((rule) =>
    [rule.conditionShift, rule.targetShift, rule.requiredShift, rule.shiftA, rule.shiftB].includes(symbol),
  );
  const halfDayUse = appData.shiftTypes.some((type) =>
    type.morningShift === symbol || type.afternoonShift === symbol,
  );
  return scheduleUse || requestUse || dayNoteUse || customRuleUse || halfDayUse || appData.patterns.some((pattern) => pattern.shifts.includes(symbol));
}

function deleteShiftType(symbol) {
  const type = getShiftType(symbol);
  if (!type) return;
  if (isShiftTypeInUse(symbol)) {
    showNotice(`「${type.name}」は勤務表・希望・パターンで使用中のため削除できません。`);
    return;
  }
  if (!window.confirm(`勤務形態「${type.name}」を削除しますか？`)) return;
  appData.shiftTypes = appData.shiftTypes.filter((item) => item.symbol !== symbol);
  appData.shiftTypes.forEach((item) => {
    if (item.requiredNext === symbol) item.requiredNext = "";
    item.forbiddenNext = item.forbiddenNext.filter((value) => value !== symbol);
  });
  saveData();
  renderAll();
}

function refreshCustomRuleEffects() {
  saveData();
  renderSchedule();
  renderSummary();
  renderCustomSettings();
  renderShiftScore();
}

function openCustomRuleDialog() {
  elements.customRuleDialog.showModal();
}

function closeCustomRuleDialog() {
  elements.customRuleDialog.close();
}

function createPatternId() {
  return `pattern-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function savePatternFromDialog() {
  const name = elements.patternNameInput.value.trim();
  if (!name) {
    elements.patternEditorError.textContent = "パターン名を入力してください。";
    return;
  }
  if (!uiState.patternDraft.length) {
    elements.patternEditorError.textContent = "勤務記号を1つ以上追加してください。";
    return;
  }

  if (uiState.editingPatternId) {
    const pattern = appData.patterns.find(
      (item) => item.id === uiState.editingPatternId,
    );
    if (!pattern) return;
    pattern.name = name;
    pattern.shifts = [...uiState.patternDraft];
  } else {
    const pattern = {
      id: createPatternId(),
      name,
      shifts: [...uiState.patternDraft],
      useForAuto: true,
    };
    appData.patterns.push(pattern);
    appData.settings.selectedPatternId = pattern.id;
  }

  closePatternDialog();
  saveData();
  renderPatterns();
}

function deleteSelectedPattern() {
  const pattern = getSelectedPattern();
  if (!pattern) return;
  if (!window.confirm(`「${pattern.name}」を削除しますか？`)) return;

  appData.patterns = appData.patterns.filter((item) => item.id !== pattern.id);
  appData.settings.selectedPatternId = appData.patterns[0]?.id ?? null;
  saveData();
  renderPatterns();
  showNotice(`${pattern.name}を削除しました。`);
}

function resetApplication() {
  if (!window.confirm("保存データを削除し、初期状態へ戻しますか？")) return;
  localStorage.removeItem(STORAGE_KEY);
  appData = createInitialData();
  closeCellEditor();
  if (elements.staffNameDialog.open) closeStaffNameDialog();
  if (elements.patternDialog.open) closePatternDialog();
  if (elements.dayNoteDialog.open) closeDayNoteDialog();
  elements.autoPlacementResult.textContent = "";
  saveData();
  renderAll();
}

renderPatternShiftButtons();

elements.previousMonth.addEventListener("click", () => changeMonth(-1));
elements.nextMonth.addEventListener("click", () => changeMonth(1));
elements.clearShifts.addEventListener("click", clearCurrentSchedule);
elements.resetApp.addEventListener("click", resetApplication);
elements.appNoticeClose.addEventListener("click", hideNotice);
elements.highlightColorPicker.addEventListener("input", (event) => {
  appData.settings.highlightColor = event.target.value;
  applyHighlightColor();
  saveData();
});
elements.addStaff.addEventListener("click", addStaff);

elements.staffSettingsList.addEventListener("change", (event) => {
  const powerSelect = event.target.closest("[data-power-staff-id]");
  if (powerSelect) {
    updateStaffPower(powerSelect.dataset.powerStaffId, Number(powerSelect.value));
    return;
  }

  const limitInput = event.target.closest("[data-staff-limit-id]");
  if (limitInput) {
    const staff = appData.staff.find((item) => item.id === limitInput.dataset.staffLimitId);
    if (!staff) return;
    staff.limits[limitInput.dataset.limitKey] = Math.max(0, Math.min(31, Number(limitInput.value) || 0));
    saveData();
    renderSchedule();
    renderStaffSettings();
    return;
  }

  const placementInput = event.target.closest("[data-auto-placement-staff-id]");
  const adjustmentInput = event.target.closest("[data-auto-adjustment-staff-id]");
  if (!placementInput && !adjustmentInput) return;
  const staffId = placementInput?.dataset.autoPlacementStaffId ?? adjustmentInput?.dataset.autoAdjustmentStaffId;
  const staff = appData.staff.find((item) => item.id === staffId);
  if (!staff) return;
  if (placementInput) staff.autoPlacementTarget = placementInput.checked;
  if (adjustmentInput) staff.autoAdjustmentTarget = adjustmentInput.checked;
  saveData();
  renderStaffSettings();
});

elements.addShiftType.addEventListener("click", () => openShiftTypeDialog());
elements.shiftTypeList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-shift-type]");
  if (editButton) {
    openShiftTypeDialog(getShiftType(editButton.dataset.editShiftType));
    return;
  }
  const deleteButton = event.target.closest("[data-delete-shift-type]");
  if (deleteButton) deleteShiftType(deleteButton.dataset.deleteShiftType);
});
elements.shiftTypeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveShiftType();
});
elements.shiftTypeComposition.addEventListener("change", updateShiftTypeCompositionUi);
elements.shiftTypeClose.addEventListener("click", closeShiftTypeDialog);
elements.shiftTypeCancel.addEventListener("click", closeShiftTypeDialog);

elements.staffSettingsList.addEventListener("click", (event) => {
  const nameButton = event.target.closest("[data-name-staff-id]");
  if (nameButton) {
    openStaffNameDialog(nameButton.dataset.nameStaffId);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-staff-id]");
  if (!deleteButton) return;
  deleteStaff(deleteButton.dataset.deleteStaffId);
});

elements.ruleSettings.addEventListener("change", (event) => {
  const input = event.target.closest("[data-rule-key]");
  if (!input) return;
  const key = input.dataset.ruleKey;
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_WARNING_RULES, key)) return;
  appData.settings.warningRules[key] = Math.max(
    RULE_MIN_VALUES[key] ?? 0,
    Number(input.value) || 0,
  );
  saveData();
  renderSchedule();
  renderSummary();
  renderRuleSettings();
});

elements.customSettings.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-custom-rule]");
  if (addButton) {
    openCustomRuleDialog();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-custom-rule]");
  if (deleteButton) {
    appData.settings.customRules = (appData.settings.customRules ?? []).filter(
      (rule) => rule.id !== deleteButton.dataset.deleteCustomRule,
    );
    refreshCustomRuleEffects();
  }
});

elements.customSettings.addEventListener("change", (event) => {
  const builtInToggle = event.target.closest("[data-built-in-rule-id]");
  if (builtInToggle) {
    appData.settings.builtInRules ??= createDefaultBuiltInRuleSettings();
    appData.settings.builtInRules[builtInToggle.dataset.builtInRuleId] = builtInToggle.checked;
    refreshCustomRuleEffects();
    return;
  }

  const field = event.target.closest("[data-custom-field]");
  const container = event.target.closest("[data-custom-rule-id]");
  if (!field || !container) return;
  const rule = appData.settings.customRules?.find((item) => item.id === container.dataset.customRuleId);
  if (!rule) return;
  const key = field.dataset.customField;
  if (key === "enabled") {
    rule.enabled = field.checked;
  } else if (["count", "conditionPower", "requiredPowerMin", "requiredCount", "powerValue"].includes(key)) {
    rule[key] = Math.max(0, Math.min(31, Number(field.value) || 0));
  } else {
    rule[key] = field.value;
  }
  refreshCustomRuleEffects();
});

elements.customRuleDialog.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-custom-rule-choice]");
  if (!choice) return;
  const type = Object.values(CUSTOM_RULE_TYPES).includes(choice.dataset.customRuleChoice)
    ? choice.dataset.customRuleChoice
    : CUSTOM_RULE_TYPES.ZERO_SUPPRESSION;
  appData.settings.customRules ??= [];
  appData.settings.customRules.push(createCustomRuleTemplate(type));
  closeCustomRuleDialog();
  refreshCustomRuleEffects();
});

elements.customRuleDialogClose.addEventListener("click", closeCustomRuleDialog);
elements.customRuleDialogCancel.addEventListener("click", closeCustomRuleDialog);
elements.shiftScore.addEventListener("mouseenter", () => openScorePanel());
elements.shiftScore.addEventListener("focus", () => openScorePanel());
elements.shiftScore.addEventListener("mouseleave", () => closeScorePanel());
elements.shiftScore.addEventListener("blur", () => closeScorePanel());
elements.shiftScore.addEventListener("click", toggleScorePanel);
elements.shiftScorePanel.addEventListener("mouseenter", () => openScorePanel());
elements.shiftScorePanel.addEventListener("mouseleave", () => closeScorePanel());

elements.inputModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    uiState.inputMode = button.dataset.inputMode;
    closeCellEditor();
    hideNotice();
    renderInputMode();
  });
});

elements.monthPicker.addEventListener("change", (event) => {
  const [year, month] = event.target.value.split("-").map(Number);
  if (!year || !month) return;
  appData.display.year = year;
  appData.display.month = month - 1;
  closeCellEditor();
  elements.autoPlacementResult.textContent = "";
  renderPrintMeta();
  saveData();
  renderAll();
});

elements.patternList.addEventListener("change", (event) => {
  const autoToggle = event.target.closest("[data-pattern-auto-id]");
  if (autoToggle) {
    const pattern = appData.patterns.find(
      (item) => item.id === autoToggle.dataset.patternAutoId,
    );
    if (!pattern) return;
    pattern.useForAuto = autoToggle.checked;
    elements.autoPlacePatterns.disabled = getAutoPatterns().length === 0;
    saveData();
    return;
  }

  if (!event.target.matches('input[name="pattern"]')) return;
  appData.settings.selectedPatternId = event.target.value;
  saveData();
  renderPatterns();
});

elements.addPattern.addEventListener("click", () => openPatternDialog());
elements.editPattern.addEventListener("click", () => openPatternDialog(getSelectedPattern()));
elements.deletePattern.addEventListener("click", deleteSelectedPattern);
elements.autoPlacePatterns.addEventListener("click", runAutoPlacement);
elements.autoAdjustShifts.addEventListener("click", runAutoAdjustment);
elements.applyRequestsToShifts.addEventListener("click", applyRequestsToShifts);
elements.openExportDialog.addEventListener("click", openExportDialog);
elements.exportDialogClose.addEventListener("click", closeExportDialog);
elements.exportDialogCancel.addEventListener("click", closeExportDialog);
elements.exportScheduleCsv.addEventListener("click", exportScheduleCsv);
elements.exportStaffSummaryCsv.addEventListener("click", exportStaffSummaryCsv);
elements.exportDailySummaryCsv.addEventListener("click", exportDailySummaryCsv);
elements.exportWarningsCsv.addEventListener("click", exportWarningsCsv);
elements.printCheck.addEventListener("click", () => {
  renderPrintMeta();
  window.print();
});
elements.addNgPair.addEventListener("click", addNgPair);
elements.ngPairList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-ng-pair-key]");
  if (!deleteButton) return;
  deleteNgPair(deleteButton.dataset.ngPairKey);
});

elements.scheduleTable.addEventListener("click", (event) => {
  const noteButton = event.target.closest("[data-note-day]");
  if (noteButton) {
    openDayNoteDialog(Number(noteButton.dataset.noteDay));
    return;
  }

  const shiftButton = event.target.closest(".shift-button");
  if (shiftButton) {
    openCellEditor(shiftButton);
    return;
  }
  const warningButton = event.target.closest(".warning-button, .boundary-note-button");
  if (warningButton) showWarning(Number(warningButton.dataset.warningDay));
});

elements.scheduleTable.addEventListener("mouseover", (event) => {
  updateScheduleHover(event.target);
});

elements.scheduleTable.addEventListener("mouseleave", clearScheduleHover);

elements.cellEditorOptions.addEventListener("click", (event) => {
  const patternOption = event.target.closest("[data-cell-pattern-id]");
  if (patternOption && uiState.editingCell) {
    const pattern = appData.patterns.find(
      (item) => item.id === patternOption.dataset.cellPatternId,
    );
    const staff = appData.staff.find(
      (item) => item.id === uiState.editingCell.staffId,
    );
    if (!pattern || !staff) return;

    const startDay = uiState.editingCell.day;
    const result = applyPattern(staff.id, startDay, pattern);
    closeCellEditor();
    saveData();
    renderSchedule();
    renderSummary();
    if (result.skipped.length) {
      showNotice(
        "希望と重なっていたため、一部の勤務は配置されませんでした。",
        formatSkippedRequests(result.skipped),
      );
    }
    return;
  }

  const requestOption = event.target.closest("[data-request]");
  if (requestOption && uiState.editingCell) {
    setRequest(
      uiState.editingCell.staffId,
      uiState.editingCell.day,
      requestOption.dataset.request,
    );
    closeCellEditor();
    saveData();
    renderSchedule();
    return;
  }

  const option = event.target.closest(".cell-option");
  if (!option || !uiState.editingCell) return;
  const request = getRequest(uiState.editingCell.staffId, uiState.editingCell.day);
  const nextShift = option.dataset.shift;
  if (!requestAllowsShift(request, nextShift)) {
    closeCellEditor();
    showNotice(
      "希望と重なっているため変更できません。\n希望を変更する場合は、先に希望入力を削除してください。",
      [`${getRequestLabel(request)}に対して「${nextShift}」は入力できません。`],
    );
    return;
  }

  setShift(uiState.editingCell.staffId, uiState.editingCell.day, nextShift);
  closeCellEditor();
  saveData();
  renderSchedule();
  renderSummary();
});

elements.shiftAddButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-shift]");
  if (!button) return;
  uiState.patternDraft.push(button.dataset.addShift);
  renderPatternDraft();
});

elements.patternSequence.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sequence-index]");
  if (!button) return;
  uiState.patternDraft.splice(Number(button.dataset.sequenceIndex), 1);
  renderPatternDraft();
});

elements.patternEditorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  savePatternFromDialog();
});
elements.patternDialogClose.addEventListener("click", closePatternDialog);
elements.patternDialogCancel.addEventListener("click", closePatternDialog);

elements.dayNoteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveDayNoteFromDialog();
});
elements.dayNoteClose.addEventListener("click", closeDayNoteDialog);
elements.dayNoteCancel.addEventListener("click", closeDayNoteDialog);
elements.dayNoteDelete.addEventListener("click", deleteDayNoteFromDialog);

elements.staffNameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveStaffName();
});
elements.staffNameClose.addEventListener("click", closeStaffNameDialog);
elements.staffNameCancel.addEventListener("click", closeStaffNameDialog);

document.addEventListener("pointerdown", (event) => {
  if (elements.cellEditor.hidden) return;
  if (elements.cellEditor.contains(event.target) || event.target.closest(".shift-button")) return;
  closeCellEditor();
});

document.addEventListener("pointerdown", (event) => {
  if (elements.shiftScorePanel.hidden) return;
  if (event.target.closest(".shift-score-wrap")) return;
  closeScorePanel({ force: true });
});

window.addEventListener("resize", closeCellEditor);
renderAll();
saveData();
