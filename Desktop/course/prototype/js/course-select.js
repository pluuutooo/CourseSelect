/**
 * course-select.js - Course selection, dropping, filtering, and timetable logic
 */

function useCourseSelect(loadJSON, allLessons, selectedLessons, status) {
  const { ref, reactive, computed } = Vue;

  // ---- Shared data ----
  const selectOptions = ref(null);
  const majorPlanModules = ref([]);
  const programCompletion = ref([]);
  const queryCondition = reactive({ campuses: [], departments: [], grades: [], courseTypes: [] });
  const virtualCost = reactive({ total: 100, spent: 35 });
  const vcAllocation = reactive({});
  const activeTab = ref('majorPlan');
  const countdownStr = ref('');

  // Preserve rules for core courses: keep them selected initially
  const preserveCodes = new Set(['MATH201','MARX002','CS301']);
  // Tracks preserved codes that were dropped by user; if dropped, future selects should not be auto-preserved
  const droppedPreserved = new Set();

  function isCorePreserve(code) { return preserveCodes.has(code); }
  function markDroppedPreserve(code) { droppedPreserved.add(code); }

  // Tab config
  const tabConfig = computed(() => {
    if (selectOptions.value?.turn?.turnTab) return selectOptions.value.turn.turnTab;
    return {
      showPlanTab: true, showPublicCompulsoryTab: true, showPublicCourseTab: true,
      showAllCourseTab: true, showCourseTableTab: true, showRetakeTab: true, showSelfDeptTab: true,
      planTabName: '培养方案', publicCompulsoryTabName: '公共必修课', publicCourseTabName: '公共选修课',
      allCourseTabName: '全部课程', courseTableTabName: '课表选课', retakeTabName: '重修选课', selfDeptTabName: '本院系课程',
    };
  });

  // Timetable time pairs
  const timePairs = [
    { label: '1-2节',  start: 1,  end: 2 },
    { label: '3-4节',  start: 3,  end: 4 },
    { label: '5-6节',  start: 5,  end: 6 },
    { label: '7-8节',  start: 7,  end: 8 },
    { label: '9-10节', start: 9,  end: 10 },
    { label: '11-12节',start: 11, end: 12 },
  ];

  // ---- Dialogs ----
  const drawerVisible = ref(false);
  const drawerCourse = ref(null);
  const drawerLessons = ref([]);
  const resultDialogVisible = ref(false);
  const resultLoading = ref(false);
  const resultSuccess = ref(false);
  const resultMessage = ref('');
  const dropDialogVisible = ref(false);
  const dropTarget = ref(null);
  const bulletinDialogVisible = ref(false);
  const bulletinContent = ref('');
  const rulesDialogVisible = ref(false);
  const rulesContent = ref('');
  const selectDialogVisible = ref(false);
  const selectTarget = ref(null);
  const selectVcInput = ref(0);

  // ---- Filters ----
  const filters = reactive({
    keyword: '', lessonName: '', teacher: '',
    weekday: null, campus: null, courseProperty: null, hasCapacity: false
  });

  const filteredLessons = computed(() => {
    let list = [...allLessons.value];
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      list = list.filter(l =>
        l.course.code.toLowerCase().includes(kw) ||
        l.course.nameZh.toLowerCase().includes(kw) ||
        (l.course.nameEn && l.course.nameEn.toLowerCase().includes(kw))
      );
    }
    if (filters.lessonName) {
      const ln = filters.lessonName.toLowerCase();
      list = list.filter(l => l.name.nameZh.toLowerCase().includes(ln) || l.code.toLowerCase().includes(ln));
    }
    if (filters.teacher) {
      const t = filters.teacher.toLowerCase();
      list = list.filter(l => l.teachers.some(tc => tc.nameZh.includes(t)));
    }
    if (filters.weekday) {
      list = list.filter(l => l.schedules.some(s => s.weekday === filters.weekday));
    }
    if (filters.campus) {
      list = list.filter(l => l.campus.id === filters.campus);
    }
    if (filters.hasCapacity) {
      list = list.filter(l => l.stdCount < l.limitCount);
    }
    if (filters.courseProperty) {
      list = list.filter(l => l.courseProperty === filters.courseProperty);
    }
    return list;
  });

  function queryLessons() { /* filtering is reactive via computed */ }
  function resetFilters() {
    filters.keyword = ''; filters.lessonName = ''; filters.teacher = '';
    filters.weekday = null; filters.campus = null;
    filters.courseProperty = null; filters.hasCapacity = false;
  }
  function onTabChange(tab) { /* no special logic needed */ }

  // ---- Virtual Cost allocation helpers ----
  // Normalize key usage: store keys as strings to avoid type mismatch between numeric IDs and property keys.
  function _vcKey(lessonId) { return String(lessonId); }

  function getVcAllocation(lessonId) {
    return vcAllocation[_vcKey(lessonId)] || 0;
  }

  function setVcAllocation(lessonId, val) {
    const v = Math.max(0, Math.min(Number(val) || 0, virtualCost.total));
    vcAllocation[_vcKey(lessonId)] = v;
    syncVcSpent();
  }

  function syncVcSpent() {
    let total = 0;
    for (const key of Object.keys(vcAllocation)) {
      if (selectedLessons.value.some(l => _vcKey(l.id) === key)) {
        total += vcAllocation[key] || 0;
      }
    }
    virtualCost.spent = total;
  }

  const vcRemaining = computed(() => Math.max(0, virtualCost.total - virtualCost.spent));

  // ---- Selection state helpers ----
  function isSelected(lesson) {
    return selectedLessons.value.some(l => l.id === lesson.id);
  }
  function isPinned(lesson) {
    const sel = selectedLessons.value.find(l => l.id === lesson.id);
    return sel ? sel.pinned : false;
  }

  // ---- Select / Drop ----
  function checkTimeConflict(lesson) {
    for (const sel of selectedLessons.value) {
      for (const sch of lesson.schedules) {
        for (const selSch of (sel.schedules || [])) {
          if (sch.weekday === selSch.weekday) {
            if (sch.startTime <= selSch.entTime && sch.entTime >= selSch.startTime) {
              return sel;
            }
          }
        }
      }
    }
    return null;
  }

  function handleSelect(lesson) {
    selectTarget.value = lesson;
    selectVcInput.value = 0;
    selectDialogVisible.value = true;
  }

  function confirmSelect() {
    const lesson = selectTarget.value;
    if (!lesson) return;
    const vcInput = selectVcInput.value || 0;

    selectDialogVisible.value = false;
    resultDialogVisible.value = true;
    resultLoading.value = true;
    resultSuccess.value = false;
    resultMessage.value = '';

    setTimeout(() => {
      if (lesson.stdCount >= lesson.limitCount) {
        resultLoading.value = false; resultSuccess.value = false;
        resultMessage.value = '该教学班已满，无法选课'; return;
      }
      if (status.semesterCreditActual + lesson.course.credits > status.semesterCreditUpperLimit) {
        resultLoading.value = false; resultSuccess.value = false;
        resultMessage.value = '选课学分已达上限'; return;
      }
      if (status.semesterAmountActual + 1 > status.semesterAmountUpperLimit) {
        resultLoading.value = false; resultSuccess.value = false;
        resultMessage.value = '选课门数已达上限'; return;
      }
      if (vcInput > vcRemaining.value) {
        resultLoading.value = false; resultSuccess.value = false;
        resultMessage.value = `意愿值不足，当前剩余 ${vcRemaining.value}`; return;
      }
      const conflict = checkTimeConflict(lesson);
      if (conflict) {
        resultLoading.value = false; resultSuccess.value = false;
        resultMessage.value = `与已选课程「${conflict.course.nameZh}」存在时间冲突`; return;
      }

      resultLoading.value = false;
      resultSuccess.value = true;
      resultMessage.value = '选课成功';
      const code = lesson.course?.code;
      const preserve = isCorePreserve(code) && !droppedPreserved.has(code);
      const newLesson = { ...lesson, pinned: !!preserve, _selected: true, _initialPreserved: !!preserve };
      selectedLessons.value.push(newLesson);
      lesson.stdCount++;
      lesson._selected = true;
      lesson.pinned = !!preserve;
      status.semesterCreditActual += lesson.course.credits;
      status.semesterAmountActual += 1;
      setVcAllocation(lesson.id, vcInput);
      syncPlanCourseStatus();
    }, 1500);
  }

  function handleDrop(lesson) {
    dropTarget.value = lesson;
    dropDialogVisible.value = true;
  }

  function confirmDrop() {
    dropDialogVisible.value = false;
    const lesson = dropTarget.value;
    if (!lesson) return;

    resultDialogVisible.value = true;
    resultLoading.value = true;

    setTimeout(() => {
      resultLoading.value = false;
      resultSuccess.value = true;
      resultMessage.value = '退课成功';
      // If this was an initially preserved core course, mark it as dropped so future selections won't auto-preserve
      const removed = selectedLessons.value.find(l => l.id === lesson.id);
      const code = removed?.course?.code || lesson.course?.code;
      if (removed && removed._initialPreserved && isCorePreserve(code)) {
        droppedPreserved.add(code);
      }
      selectedLessons.value = selectedLessons.value.filter(l => l.id !== lesson.id);
      setVcAllocation(lesson.id, 0);
      syncVcSpent();
      status.semesterCreditActual -= lesson.course.credits;
      status.semesterAmountActual -= 1;
      const inAll = allLessons.value.find(l => l.id === lesson.id);
      if (inAll) {
        inAll._selected = false;
        inAll.pinned = false;
        if (inAll.stdCount > 0) inAll.stdCount--;
      }
      syncPlanCourseStatus();
    }, 1200);
  }

  function openDrawer(course) {
    drawerCourse.value = course;
    drawerLessons.value = allLessons.value.filter(l => l.course.id === course.id);
    drawerVisible.value = true;
  }

  // ---- Timetable helpers ----
  function getTimetableCell(weekday, start, end) {
    return selectedLessons.value.find(l =>
      (l.schedules || []).some(s => s.weekday === weekday && s.startTime >= start && s.startTime <= end)
    );
  }

  function getTimetableCellRoom(weekday, start, end) {
    const lesson = getTimetableCell(weekday, start, end);
    if (!lesson) return '';
    const lines = lesson.dateTimePlace.textZh.split('\n');
    const weekNames = ['一', '二', '三', '四', '五', '六', '日'];
    const dayStr = '星期' + weekNames[weekday - 1];
    const matchLine = lines.find(l => l.includes(dayStr));
    if (matchLine) {
      const parts = matchLine.split(' ');
      return parts[parts.length - 1] || '';
    }
    return '';
  }

  function onTimetableCellClick(weekday, start, end) {
    const cell = getTimetableCell(weekday, start, end);
    if (cell) {
      ElMessageBox.confirm(
        `${cell.course.nameZh}\n${cell.teachers.map(t => t.nameZh).join(', ')}\n${cell.dateTimePlace.textZh}`,
        '课程详情',
        { confirmButtonText: '退课', cancelButtonText: '关闭', type: 'info' }
      ).then(() => handleDrop(cell)).catch(() => {});
    }
  }

  // ---- Timetable slot selection (multi-select) ----
  const ttSelectedSlots = ref([]);

  function isTtSlotSelected(weekday, start) {
    return ttSelectedSlots.value.some(s => s.weekday === weekday && s.start === start);
  }

  function onTimetableSlotClick(weekday, start, end) {
    const idx = ttSelectedSlots.value.findIndex(s => s.weekday === weekday && s.start === start);
    if (idx >= 0) {
      ttSelectedSlots.value.splice(idx, 1);
    } else {
      ttSelectedSlots.value.push({ weekday, start, end });
    }
  }

  function removeTtSlot(index) {
    ttSelectedSlots.value.splice(index, 1);
  }

  function clearTtSlots() {
    ttSelectedSlots.value = [];
  }

  const ttSlotLessons = computed(() => {
    if (ttSelectedSlots.value.length === 0) return [];
    return allLessons.value.filter(l =>
      ttSelectedSlots.value.some(slot =>
        (l.schedules || []).some(s =>
          s.weekday === slot.weekday && s.startTime >= slot.start && s.startTime <= slot.end
        )
      )
    );
  });

  // ---- Enter select page (loads all data) ----
  function syncSelectedState() {
    allLessons.value.forEach(l => {
      const sel = selectedLessons.value.find(s => s.id === l.id);
      if (sel) { l.pinned = sel.pinned; l._selected = true; }
      else { l._selected = false; }
    });

    // Mark initial-preserved core courses when entering selection page
    selectedLessons.value = selectedLessons.value.map(s => {
      const code = s.course?.code;
      if (isCorePreserve(code) && !droppedPreserved.has(code)) {
        s._initialPreserved = true;
        s.pinned = true; // show as selected initially
      } else {
        s._initialPreserved = false;
        // keep pinned as-is for other selections
      }
      return s;
    });

    selectedLessons.value.forEach(l => {
      if (!(String(l.id) in vcAllocation)) setVcAllocation(l.id, 0);
    });
    syncVcSpent();
    syncPlanCourseStatus();
  }

  // Sync plan course selectedLesson with actual selectedLessons
  function syncPlanCourseStatus() {
    function syncModule(mod) {
      (mod.planCourses || []).forEach(pc => {
        // Find a selected lesson whose course matches this plan course
        const sel = selectedLessons.value.find(l => l.course.id === pc.course.id || l.course.code === pc.course.code);
        pc.selectedLesson = sel || null;
      });
      (mod.children || []).forEach(child => syncModule(child));
    }
    majorPlanModules.value.forEach(mod => syncModule(mod));
  }

  async function enterSelect(turn, currentTurnRef) {
    currentTurnRef.value = turn;
    const [opts, lessons, selected, plan, comp, stat, vc, qc] = await Promise.all([
      loadJSON('select-options.json'),
      loadJSON('query-lesson.json'),
      loadJSON('selected-lessons.json'),
      loadJSON('major-plan.json'),
      loadJSON('program-completion.json'),
      loadJSON('status.json'),
      loadJSON('virtual-cost.json'),
      loadJSON('query-condition.json'),
    ]);

    selectOptions.value = opts;
    if (lessons) allLessons.value = lessons.lessons || [];
    if (selected) selectedLessons.value = selected;
    if (plan?.modules) {
      majorPlanModules.value = plan.modules.map(m => ({
        ...m, _expanded: true,
        children: (m.children || []).map(c => ({ ...c, _expanded: false }))
      }));
    }
    if (comp?.modules) programCompletion.value = comp.modules;
    if (stat) Object.assign(status, stat);
    if (vc) { virtualCost.total = vc.virtualCostTotal; virtualCost.spent = vc.virtualCostSpent; }
    if (qc) {
      queryCondition.campuses = qc.campuses || [];
      queryCondition.departments = qc.departments || [];
      queryCondition.grades = qc.grades || [];
      queryCondition.courseTypes = qc.courseTypes || [];
    }

    const tc = opts?.turn?.turnTab;
    if (tc) {
      if (tc.showPlanTab) activeTab.value = 'majorPlan';
      else if (tc.showPublicCompulsoryTab) activeTab.value = 'publicCompulsory';
      else if (tc.showAllCourseTab) activeTab.value = 'allLesson';
      else activeTab.value = 'selectedLesson';
    }

    syncSelectedState();
  }

  // Bulletin / Rules
  function showBulletin(turn) { bulletinContent.value = turn.bulletin || ''; bulletinDialogVisible.value = true; }
  function showRules(turn)    { rulesContent.value = turn.rules || '';       rulesDialogVisible.value = true; }

  return {
    selectOptions, majorPlanModules, programCompletion, queryCondition, virtualCost,
    activeTab, timePairs, countdownStr, tabConfig,
    filters, filteredLessons,
    drawerVisible, drawerCourse, drawerLessons,
    resultDialogVisible, resultLoading, resultSuccess, resultMessage,
    dropDialogVisible, dropTarget,
    selectDialogVisible, selectTarget, selectVcInput, confirmSelect,
    bulletinDialogVisible, bulletinContent, rulesDialogVisible, rulesContent,
    queryLessons, resetFilters, onTabChange,
    isSelected, isPinned, handleSelect, handleDrop, confirmDrop, openDrawer,
    getTimetableCell, getTimetableCellRoom, onTimetableCellClick,
    ttSelectedSlots, ttSlotLessons, isTtSlotSelected, onTimetableSlotClick, removeTtSlot, clearTtSlots,
    showBulletin, showRules,
    enterSelect,
    // Expose preserve-related helpers for other modules (app.js uses these)
    preserveCodes, droppedPreserved, isCorePreserve, markDroppedPreserve,
    vcAllocation, getVcAllocation, setVcAllocation, vcRemaining,
  };
}
