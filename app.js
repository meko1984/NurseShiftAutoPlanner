"use strict";

const STORAGE_KEY = "autoShiftTool.data";
const DATA_VERSION = 3;
const SHIFT_OPTIONS = ["", "日", "遅", "入", "明", "休", "有"];
const EDITABLE_SHIFTS = SHIFT_OPTIONS.filter(Boolean);
const REQUEST_OPTIONS = ["", "休", "有", "日", "遅", "入", "明", "日/遅"];
const REQUEST_LABELS = {
  "": "希望を削除",
  休: "希望休",
  有: "希望有",
  日: "希望日",
  遅: "希望遅",
  入: "希望入",
  明: "希望明",
  "日/遅": "希望日/遅",
};
const SHIFT_CLASS = {
  日: "shift-day",
  遅: "shift-late",
  入: "shift-night",
  明: "shift-after",
  休: "shift-off",
  有: "shift-paid",
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
    ],
    schedules: {},
    requests: {},
    ngPairs: [],
    patterns: [
      { id: "pattern-1", name: "パターン1", shifts: ["日", "日", "遅", "入", "明", "休"] },
      { id: "pattern-2", name: "パターン2", shifts: ["日", "遅", "遅", "休"] },
      { id: "pattern-3", name: "パターン3", shifts: ["日", "遅", "入", "明", "休"] },
    ],
    settings: {
      selectedPatternId: "pattern-1",
      warningRules: {
        minDayStaff: 3,
        minDayPower: 7,
      },
      generation: {},
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

function normalizeData(saved) {
  const initial = createInitialData();
  if (!saved || typeof saved !== "object") return initial;

  const staff = Array.isArray(saved.staff)
    ? saved.staff
        .filter((item) => item && typeof item.id === "string")
        .map((item) => ({
          id: item.id,
          name: String(item.name ?? item.id),
          power: [1, 2, 3, 4].includes(Number(item.power)) ? Number(item.power) : 1,
        }))
    : initial.staff;

  const patterns = Array.isArray(saved.patterns)
    ? saved.patterns
        .filter((item) => item && typeof item.id === "string")
        .map((item) => ({
          id: item.id,
          name: String(item.name ?? "名称未設定"),
          shifts: Array.isArray(item.shifts)
            ? item.shifts.filter((shift) => EDITABLE_SHIFTS.includes(shift))
            : [],
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
    schedules:
      saved.schedules && typeof saved.schedules === "object" ? saved.schedules : {},
    requests:
      saved.requests && typeof saved.requests === "object"
        ? saved.requests
        : saved.settings?.requests && typeof saved.settings.requests === "object"
          ? saved.settings.requests
          : {},
    ngPairs: normalizeNgPairs(savedNgPairs, staff),
    patterns,
    settings: {
      ...savedSettings,
      selectedPatternId: patterns.some((pattern) => pattern.id === selectedPatternId)
        ? selectedPatternId
        : patterns[0]?.id ?? null,
      warningRules: {
        minDayStaff: Number(saved.settings?.warningRules?.minDayStaff) || 3,
        minDayPower: Number(saved.settings?.warningRules?.minDayPower) || 7,
      },
      generation:
        saved.settings?.generation && typeof saved.settings.generation === "object"
          ? saved.settings.generation
          : {},
    },
  };
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
  patternDraft: [],
  inputMode: "shift",
};

const elements = {
  monthPicker: document.querySelector("#month-picker"),
  previousMonth: document.querySelector("#previous-month"),
  nextMonth: document.querySelector("#next-month"),
  resetApp: document.querySelector("#reset-app"),
  saveStatus: document.querySelector("#save-status"),
  scheduleTable: document.querySelector("#schedule-table"),
  inputModeButtons: document.querySelectorAll("[data-input-mode]"),
  tableHint: document.querySelector("#table-hint"),
  summaryTable: document.querySelector("#summary-table"),
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
  patternDialog: document.querySelector("#pattern-dialog"),
  patternEditorForm: document.querySelector("#pattern-editor-form"),
  patternDialogTitle: document.querySelector("#pattern-dialog-title"),
  patternDialogClose: document.querySelector("#pattern-dialog-close"),
  patternDialogCancel: document.querySelector("#pattern-dialog-cancel"),
  patternNameInput: document.querySelector("#pattern-name-input"),
  patternSequence: document.querySelector("#pattern-sequence"),
  shiftAddButtons: document.querySelector("#shift-add-buttons"),
  patternEditorError: document.querySelector("#pattern-editor-error"),
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
  return REQUEST_LABELS[request] ?? `希望${request}`;
}

function createShiftMark(shift) {
  if (!shift) return "";
  return `<span class="shift-mark ${SHIFT_CLASS[shift]}">${shift}</span>`;
}

function createCellDisplay(shift, request) {
  const value = shift || request;
  if (!value) return "";

  if (value === "日/遅") {
    return `<span class="request-only-mark">日/遅<span class="request-star">*</span></span>`;
  }

  return `<span class="shift-mark ${SHIFT_CLASS[value] ?? ""} ${
    !shift && request ? "request-only-mark" : ""
  }">${value}${request ? '<span class="request-star">*</span>' : ""}</span>`;
}

function getDayType(day) {
  const weekDay = new Date(appData.display.year, appData.display.month, day).getDay();
  if (weekDay === 0) return "sunday";
  if (weekDay === 6) return "saturday";
  return "";
}

function renderSchedule() {
  const daysInMonth = getDaysInMonth();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  let html = "<thead><tr>";

  html += '<th class="name-column" rowspan="2">氏名</th>';
  for (let day = 1; day <= 31; day += 1) {
    const valid = day <= daysInMonth;
    html += `<th class="day-column ${valid ? getDayType(day) : "invalid-day"}">${valid ? day : ""}</th>`;
  }
  html += '<th class="power-column" rowspan="2">P</th></tr><tr>';

  for (let day = 1; day <= 31; day += 1) {
    const valid = day <= daysInMonth;
    const weekDay = valid
      ? weekdays[new Date(appData.display.year, appData.display.month, day).getDay()]
      : "";
    html += `<th class="day-column ${valid ? getDayType(day) : "invalid-day"}">${weekDay}</th>`;
  }
  html += "</tr></thead><tbody>";

  appData.staff.forEach((staff) => {
    html += `
      <tr>
        <th scope="row" class="name-column">
          <button
            class="staff-name-button"
            type="button"
            data-name-staff-id="${escapeHtml(staff.id)}"
            title="${escapeHtml(staff.name)}"
            aria-label="${escapeHtml(staff.name)}さんの氏名を編集"
          >
            <span>${escapeHtml(staff.name)}</span>
          </button>
        </th>`;
    for (let day = 1; day <= 31; day += 1) {
      if (day > daysInMonth) {
        html += '<td class="day-column invalid-day"></td>';
        continue;
      }

      const shift = getShift(staff.id, day);
      const request = getRequest(staff.id, day);
      const displayLabel = shift || request || "空欄";
      html += `
        <td class="day-column shift-cell ${getDayType(day)} ${request ? "has-request" : ""}">
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
        <select class="power-select" data-power-staff-id="${escapeHtml(staff.id)}" aria-label="${escapeHtml(staff.name)}さんのPower">
          ${[1, 2, 3, 4]
            .map(
              (power) =>
                `<option value="${power}" ${power === staff.power ? "selected" : ""}>${power}</option>`,
            )
            .join("")}
        </select>
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
    for (let day = 1; day <= 31; day += 1) {
      if (day > daysInMonth) {
        html += '<td class="invalid-day"></td>';
        continue;
      }

      if (row.key === "warning") {
        const warnings = getWarnings(day);
        const mark = "!".repeat(Math.min(warnings.length, 3));
        html += `<td class="warning-cell">${
          mark
            ? `<button class="warning-button" type="button" data-warning-day="${day}" aria-label="${day}日の警告詳細">${mark}</button>`
            : ""
        }</td>`;
      } else {
        const totals = getDailyTotals(day);
        html += `<td>${totals[row.key] || ""}</td>`;
      }
    }
    html += '<td class="power-column"></td></tr>';
  });

  elements.scheduleTable.innerHTML = `${html}</tbody>`;
}

function getDailyTotals(day) {
  const totals = { day: 0, deepNight: 0, evening: 0, late: 0, power: 0 };
  appData.staff.forEach((staff) => {
    const shift = getShift(staff.id, day);
    if (shift === "日") {
      totals.day += 1;
      totals.power += staff.power;
    }
    if (shift === "明") totals.deepNight += 1;
    if (shift === "入") totals.evening += 1;
    if (shift === "遅") totals.late += 1;
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

function getStaffTotals(staffId) {
  const totals = { publicHoliday: 0, 日: 0, 遅: 0, 入: 0, 有: 0, 夏: 0, 冬: 0 };
  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    const shift = getShift(staffId, day);
    if (shift === "休") totals.publicHoliday += 1;
    if (Object.hasOwn(totals, shift)) totals[shift] += 1;
  }
  return totals;
}

function renderSummary() {
  let html = `
    <thead><tr><th>氏名</th><th>公</th><th>日</th><th>遅</th><th>入</th><th>有</th><th>夏</th><th>冬</th></tr></thead>
    <tbody>`;

  appData.staff.forEach((staff) => {
    const totals = getStaffTotals(staff.id);
    html += `
      <tr>
        <th scope="row">${escapeHtml(staff.name)}</th>
        <td>${totals.publicHoliday || ""}</td>
        <td>${totals.日 || ""}</td>
        <td>${totals.遅 || ""}</td>
        <td>${totals.入 || ""}</td>
        <td>${totals.有 || ""}</td>
        <td>${totals.夏 || ""}</td>
        <td>${totals.冬 || ""}</td>
      </tr>`;
  });
  elements.summaryTable.innerHTML = `${html}</tbody>`;
}

function renderPatterns() {
  if (!getSelectedPattern() && appData.patterns.length) {
    appData.settings.selectedPatternId = appData.patterns[0].id;
  }

  elements.patternList.innerHTML = appData.patterns.length
    ? appData.patterns
        .map(
          (pattern) => `
            <label class="pattern-option">
              <input
                type="radio"
                name="pattern"
                value="${escapeHtml(pattern.id)}"
                ${pattern.id === appData.settings.selectedPatternId ? "checked" : ""}
              />
              <span class="pattern-name">${escapeHtml(pattern.name)}</span>
              <span class="pattern-shifts">${pattern.shifts.map(createShiftMark).join("")}</span>
            </label>`,
        )
        .join("")
    : '<p class="empty-patterns">パターンがありません。追加してください。</p>';

  const hasSelection = Boolean(getSelectedPattern());
  elements.editPattern.disabled = !hasSelection;
  elements.deletePattern.disabled = !hasSelection;
  elements.autoPlacePatterns.disabled = appData.patterns.length === 0;
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
    const requestOptions = REQUEST_OPTIONS.map((request) => {
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

  const shiftOptions = SHIFT_OPTIONS.map((shift) => {
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
                .map(createShiftMark)
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
            `<button class="sequence-item" type="button" data-sequence-index="${index}" aria-label="${shift}を削除">${createShiftMark(shift)}</button>`,
        )
        .join("")
    : '<span class="sequence-empty">勤務記号を追加してください</span>';
}

function renderAll() {
  elements.monthPicker.value = `${appData.display.year}-${String(appData.display.month + 1).padStart(2, "0")}`;
  renderSchedule();
  renderSummary();
  renderPatterns();
  renderNgPairs();
  renderInputMode();
}

function renderInputMode() {
  elements.inputModeButtons.forEach((button) => {
    const active = button.dataset.inputMode === uiState.inputMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.tableHint.textContent =
    uiState.inputMode === "request"
      ? "希望入力モード：セルで希望を登録できます。左端の氏名をクリックすると名前を編集できます。"
      : "勤務入力モード：セルで勤務を入力できます。左端の氏名をクリックすると名前を編集できます。";
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

  return pattern.shifts.every((shift, index) => {
    const day = startDay + index;
    return shift && !getShift(staffId, day) && !getRequest(staffId, day);
  });
}

function getMonthWarningCount() {
  let count = 0;
  for (let day = 1; day <= getDaysInMonth(); day += 1) {
    count += getWarnings(day).length;
  }
  return count;
}

function evaluateAutoPlacement(staffId, startDay, pattern) {
  // 候補を一時配置し、既存の警告エンジンで評価した後に空欄へ戻す。
  pattern.shifts.forEach((shift, index) => {
    setShift(staffId, startDay + index, shift);
  });
  const warningCount = getMonthWarningCount();
  pattern.shifts.forEach((shift, index) => {
    setShift(staffId, startDay + index, "");
  });
  return warningCount;
}

function selectBestAutoPlacement(staffId, startDay) {
  const candidates = appData.patterns
    .filter((pattern) => canAutoPlacePattern(staffId, startDay, pattern))
    .map((pattern) => ({
      pattern,
      warningCount: evaluateAutoPlacement(staffId, startDay, pattern),
    }));
  if (!candidates.length) return null;

  const minimumWarnings = Math.min(
    ...candidates.map((candidate) => candidate.warningCount),
  );
  const bestCandidates = candidates.filter(
    (candidate) => candidate.warningCount === minimumWarnings,
  );
  return bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
}

function runAutoPlacement() {
  if (!appData.patterns.length) {
    elements.autoPlacementResult.textContent =
      "登録済みパターンがないため、自動配置できません。";
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

  for (let day = 1; day <= daysInMonth; day += 1) {
    appData.staff.forEach((staff) => {
      if (getShift(staff.id, day) || getRequest(staff.id, day)) return;

      const candidate = selectBestAutoPlacement(staff.id, day);
      if (!candidate) return;

      candidate.pattern.shifts.forEach((shift, index) => {
        setShift(staff.id, day + index, shift);
      });
      patternCount += 1;
      cellCount += candidate.pattern.shifts.length;
    });
  }

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
  elements.autoPlacePatterns.disabled = appData.patterns.length === 0;
  showNotice(message);
  return { patternCount, cellCount };
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
  elements.warningList.innerHTML = getWarnings(day)
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
    const pattern = { id: createPatternId(), name, shifts: [...uiState.patternDraft] };
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

elements.shiftAddButtons.innerHTML = EDITABLE_SHIFTS.map(
  (shift) =>
    `<button class="shift-add-button" type="button" data-add-shift="${shift}">${createShiftMark(shift)}</button>`,
).join("");

elements.previousMonth.addEventListener("click", () => changeMonth(-1));
elements.nextMonth.addEventListener("click", () => changeMonth(1));
elements.resetApp.addEventListener("click", resetApplication);
elements.appNoticeClose.addEventListener("click", hideNotice);

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
  if (!event.target.matches('input[name="pattern"]')) return;
  appData.settings.selectedPatternId = event.target.value;
  saveData();
  renderPatterns();
});

elements.addPattern.addEventListener("click", () => openPatternDialog());
elements.editPattern.addEventListener("click", () => openPatternDialog(getSelectedPattern()));
elements.deletePattern.addEventListener("click", deleteSelectedPattern);
elements.autoPlacePatterns.addEventListener("click", runAutoPlacement);
elements.addNgPair.addEventListener("click", addNgPair);
elements.ngPairList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-ng-pair-key]");
  if (!deleteButton) return;
  deleteNgPair(deleteButton.dataset.ngPairKey);
});

elements.scheduleTable.addEventListener("click", (event) => {
  const staffNameButton = event.target.closest("[data-name-staff-id]");
  if (staffNameButton) {
    openStaffNameDialog(staffNameButton.dataset.nameStaffId);
    return;
  }

  const shiftButton = event.target.closest(".shift-button");
  if (shiftButton) {
    openCellEditor(shiftButton);
    return;
  }
  const warningButton = event.target.closest(".warning-button");
  if (warningButton) showWarning(Number(warningButton.dataset.warningDay));
});

elements.scheduleTable.addEventListener("change", (event) => {
  const powerSelect = event.target.closest(".power-select");
  if (!powerSelect) return;
  const staff = appData.staff.find((item) => item.id === powerSelect.dataset.powerStaffId);
  if (!staff) return;
  staff.power = Number(powerSelect.value);
  saveData();
  renderSchedule();
});

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

window.addEventListener("resize", closeCellEditor);
window.addEventListener("scroll", closeCellEditor, true);

renderAll();
saveData();
