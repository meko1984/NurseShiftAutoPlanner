"use strict";

const STORAGE_KEY = "autoShiftTool.data";
const DATA_VERSION = 6;
const SHIFT_TYPE_CATEGORIES = ["日勤", "遅出", "準夜", "深夜", "休み", "有休", "その他勤務", "その他休み"];
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
  遅: "遅*",
  入: "入*",
  明: "明*",
  "日/遅": "日*/遅*",
  夏: "夏*",
  冬: "冬*",
};
const SHIFT_CLASS = {
  日: "shift-day",
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
  };
  return [
    { ...base, symbol: "日", name: "日勤", category: "日勤", color: "#dcefe5", isWork: true, countsAsDay: true, countsForPower: true, countsForConsecutive: true },
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
};

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
  return source
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
      };
      SHIFT_TYPE_FLAGS.forEach((flag) => {
        normalized[flag] = typeof item[flag] === "boolean" ? item[flag] : Boolean(defaultType[flag]);
      });
      return normalized;
    })
    .filter(Boolean);
}

function normalizeStaffLimits(savedLimits = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_STAFF_LIMITS).map(([key, fallback]) => {
      const value = Number(savedLimits[key]);
      return [key, Number.isFinite(value) ? Math.max(0, Math.min(31, value)) : fallback];
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
    dayNotes:
      saved.dayNotes && typeof saved.dayNotes === "object" ? saved.dayNotes : {},
    ngPairs: normalizeNgPairs(savedNgPairs, staff),
    patterns,
    settings: {
      ...savedSettings,
      selectedPatternId: patterns.some((pattern) => pattern.id === selectedPatternId)
        ? selectedPatternId
        : patterns[0]?.id ?? null,
      warningRules: normalizeWarningRules(saved.settings?.warningRules),
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
  patternDialog: document.querySelector("#pattern-dialog"),
  patternEditorForm: document.querySelector("#pattern-editor-form"),
  patternDialogTitle: document.querySelector("#pattern-dialog-title"),
  patternDialogClose: document.querySelector("#pattern-dialog-close"),
  patternDialogCancel: document.querySelector("#pattern-dialog-cancel"),
  patternNameInput: document.querySelector("#pattern-name-input"),
  patternSequence: document.querySelector("#pattern-sequence"),
  shiftAddButtons: document.querySelector("#shift-add-buttons"),
  patternEditorError: document.querySelector("#pattern-editor-error"),
  shiftTypeDialog: document.querySelector("#shift-type-dialog"),
  shiftTypeForm: document.querySelector("#shift-type-form"),
  shiftTypeDialogTitle: document.querySelector("#shift-type-dialog-title"),
  shiftTypeSymbol: document.querySelector("#shift-type-symbol"),
  shiftTypeName: document.querySelector("#shift-type-name"),
  shiftTypeCategory: document.querySelector("#shift-type-category"),
  shiftTypeColor: document.querySelector("#shift-type-color"),
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

function getWarningRules() {
  return {
    ...DEFAULT_WARNING_RULES,
    ...(appData.settings.warningRules ?? {}),
  };
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
  return Boolean(getShiftType(symbol)?.[flag]);
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

function getDayNote(day) {
  return appData.dayNotes?.[getMonthKey()]?.[day] ?? "";
}

function setDayNote(day, note) {
  const monthKey = getMonthKey();
  appData.dayNotes[monthKey] ??= {};
  const value = note.trim();
  if (value) {
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

function createPatternShiftMark(shift) {
  if (!shift) return '<span class="shift-mark shift-blank">空</span>';
  return createShiftMark(shift);
}

function createCellDisplay(shift, request) {
  const value = shift || request;
  if (!value) return "";

  if (value === "日/遅") {
    return `<span class="request-only-mark">日/遅<span class="request-star">*</span></span>`;
  }

  return `<span class="shift-mark ${SHIFT_CLASS[value] ?? "shift-custom"} ${
    !shift && request ? "request-only-mark" : ""
  }" ${getShiftStyle(getShiftType(value))}>${escapeHtml(value)}${request ? '<span class="request-star">*</span>' : ""}</span>`;
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
    const note = getDayNote(day);
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
        <td class="day-column shift-cell ${getDayType(day)} ${request ? "has-request" : ""}" data-day="${day}">
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
        const statusClass = getDailyTotalStatusClass(row.key, totals[row.key]);
        html += `<td class="${statusClass}" data-day="${day}">${totals[row.key]}</td>`;
      }
    }
    html += '<td class="power-column"></td></tr>';
  });

  elements.scheduleTable.innerHTML = `${html}</tbody>`;
}

function getDailyTotalStatusClass(key, value) {
  const rules = getWarningRules();
  if (key === "power") {
    if (value < rules.minDayPower - 2) return "status-danger";
    if (value < rules.minDayPower) return "status-warn";
    return "status-ok";
  }
  if (key === "day") {
    if (value < rules.minDayStaff) return "status-danger";
    return "status-ok";
  }
  if (key === "deepNight") {
    return value < rules.minDeepNightStaff ? "status-danger" : "status-ok";
  }
  if (key === "evening") {
    if (value < rules.minEveningStaff || value > rules.maxNightStaff) return "status-danger";
    return "status-ok";
  }
  if (key === "late") {
    if (value > rules.maxLateStaff) return "status-danger";
    return value === 0 ? "status-warn" : "status-ok";
  }
  return "";
}

function getDailyTotals(day) {
  const totals = { day: 0, deepNight: 0, evening: 0, late: 0, power: 0 };
  appData.staff.forEach((staff) => {
    const shift = getShift(staff.id, day);
    const type = getShiftType(shift);
    if (!type) return;
    if (type.countsAsDay) totals.day += 1;
    if (type.countsForPower) totals.power += staff.power;
    if (type.countsAsDeepNight) totals.deepNight += 1;
    if (type.countsAsEvening) totals.evening += 1;
    if (type.countsAsLate) totals.late += 1;
  });
  return totals;
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
    const type = getShiftType(shift);
    if (!type) continue;
    if (type.countsAsPublicHoliday) totals.publicHoliday += 1;
    if (type.countsAsDay) totals.day += 1;
    if (type.countsAsLate) totals.late += 1;
    if (type.countsAsEvening) totals.evening += 1;
    if (type.countsAsDeepNight) totals.deepNight += 1;
    if (type.countsAsPaid) totals.paid += 1;
    if (type.countsAsSummer) totals.summer += 1;
    if (type.countsAsWinter) totals.winter += 1;
    if (type.category === "その他勤務") totals.long += 1;
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

  if (!dayStaff.some((staff) => staff.power === 2 || staff.power === 3)) {
    violations.middleStaffShortage += 1;
  }

  const hasSeniorNightStaff = seniorNightCount > 0;
  nightStaff
    .filter((staff) => staff.power === 1)
    .forEach(() => {
      if (!hasSeniorNightStaff) violations.juniorNightSupport += 1;
    });

  if (seniorNightCount > 1) violations.seniorNightOverlap += 1;
  if (juniorNightCount >= 2) violations.juniorNightOverlap += 1;
  if (nightStaff.length > rules.maxNightStaff) violations.nightStaffExcess += 1;
  if (lateCount > rules.maxLateStaff) violations.lateStaffExcess += 1;

  appData.staff.forEach((staff) => {
    const shift = getShift(staff.id, day);
    const nextShift = getShift(staff.id, day + 1);
    const canCheckNextDay = day < getDaysInMonth();

    const type = getShiftType(shift);
    if (canCheckNextDay && type?.requiredNext && nextShift !== type.requiredNext) {
      if (type.countsAsEvening) violations.nightToAfter += 1;
      else if (type.countsAsDeepNight) violations.afterToOff += 1;
    }
    if (canCheckNextDay && type?.forbiddenNext?.includes(nextShift)) {
      violations.lateNextDay += 1;
    }
    if (hasConsecutiveWorkDays(staff.id, day, rules.consecutiveWorkDays)) {
      violations.sixConsecutiveWorkDays += 1;
    }
  });

  appData.ngPairs.forEach(([firstId, secondId]) => {
    const firstShift = getShift(firstId, day);
    const secondShift = getShift(secondId, day);
    if (isShiftTypeFlag(firstShift, "countsAsEvening") && isShiftTypeFlag(secondShift, "countsAsEvening")) violations.ngPairNight += 1;
    if (isShiftTypeFlag(firstShift, "countsAsDay") && isShiftTypeFlag(secondShift, "countsAsDay")) violations.ngPairDay += 1;
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
  };
  const staffLimitItems = [];

  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    const totals = getDailyTotals(day);
    const warnings = getWarnings(day);
    counts.warning += warnings.length;
    if (totals.power < rules.minDayPower) counts.powerShortage += 1;
    if (totals.day < rules.minDayStaff) counts.dayShortage += 1;
    if (totals.deepNight < rules.minDeepNightStaff) counts.deepNightZero += 1;
    if (totals.evening < rules.minEveningStaff) counts.eveningZero += 1;
    if (totals.late === 0) counts.lateZero += 1;

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
    if (totals.publicHoliday !== rules.targetPublicHoliday) counts.publicHolidayMismatch += 1;
    dayCounts.push(totals.日);
    nightCounts.push(totals.入);
    getStaffLimitViolations(staff).forEach((violation) => {
      staffLimitItems.push({
        label: `${staff.name}さん ${violation.label}上限超過：${violation.count}/${violation.limit}`,
        points: -SCORE_RULES.staffLimitExceeded,
        detailOnly: true,
      });
    });
  });

  if (getCountSpread(dayCounts) >= 4) counts.dayCountImbalance = 1;
  if (getCountSpread(nightCounts) >= 3) counts.nightCountImbalance = 1;

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
        <td class="${publicHolidayStatus}">${totals.publicHoliday}</td>
        <td>${totals.日}</td>
        <td class="${limitStatus(totals.遅, "late")}">${totals.遅}</td>
        <td class="${limitStatus(totals.入, "evening")}">${totals.入}</td>
        <td>${totals.有}</td>
        <td>${totals.夏}</td>
        <td>${totals.冬}</td>
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
      return `
        <button
          class="request-option ${selected ? "is-selected" : ""}"
          type="button"
          data-request="${request}"
          aria-label="${getRequestLabel(request)}"
        >
          <span>${getRequestLabel(request)}</span>
          ${request ? `<small>${request}*</small>` : ""}
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
  renderSchedule();
  renderSummary();
  renderStaffSettings();
  renderRuleSettings();
  renderShiftTypes();
  renderShiftTypeLegend();
  renderPatterns();
  renderNgPairs();
  renderInputMode();
  renderShiftScore();
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
      <span class="shift-type-item-name" title="${escapeHtml(type.name)}">${escapeHtml(type.name)} <small>(${escapeHtml(type.category)})</small></span>
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
  appData.shiftTypes.forEach((type) => {
    if (type.requiredNext === oldSymbol) type.requiredNext = newSymbol;
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
    requiredNext: elements.shiftTypeRequiredNext.value,
    forbiddenNext: Array.from(elements.shiftTypeForbiddenNext.querySelectorAll("[data-forbidden-next]:checked"))
      .map((input) => input.value),
  };
  document.querySelectorAll("[data-shift-type-flag]").forEach((input) => {
    nextType[input.dataset.shiftTypeFlag] = input.checked;
  });
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
  return scheduleUse || requestUse || appData.patterns.some((pattern) => pattern.shifts.includes(symbol));
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
elements.addNgPair.addEventListener("click", addNgPair);
elements.ngPairList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-ng-pair-key]");
  if (!deleteButton) return;
  deleteNgPair(deleteButton.dataset.ngPairKey);
});

elements.scheduleTable.addEventListener("click", (event) => {
  const noteButton = event.target.closest("[data-note-day]");
  if (noteButton) {
    const day = Number(noteButton.dataset.noteDay);
    const current = getDayNote(day);
    const next = window.prompt(`${appData.display.month + 1}月${day}日の祝祭日・行事予定`, current);
    if (next === null) return;
    setDayNote(day, next);
    saveData();
    renderSchedule();
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
