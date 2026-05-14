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

  // Per-round history: tracks selections and drops for carry-over computation
  const roundHistory = reactive({});

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

  // v2: Course detail drawer (HTA 1.3)
  const detailDrawerVisible = ref(false);
  const detailDrawerLesson = ref(null);
  const detailDrawerCourseInfo = ref(null);
  const courseDetailsCache = ref({});

  // v2: Conflict dialog (HTA 2.3)
  const conflictDialogVisible = ref(false);
  const conflictTarget = ref(null);
  const conflictWith = ref(null);

  // v2: Watch/notify list (用例2)
  const watchedLessonIds = ref(new Set());
  const watcherTimer = ref(null);

  // v2: Submit status tracking (HTA 4.3-4.4)
  const submitStatusMap = reactive({}); // lessonId -> { status, countdown, timer }
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
    const turn = selectOptions.value?.turn;
    const isRushMode = turn && !turn.turnMode?.enableVirtualWallet;

    if (isRushMode) {
      if (lesson.stdCount >= lesson.limitCount) {
        ElMessage.warning('该教学班已满，无法选课');
        return;
      }
      _doRushSelect(lesson);
    } else {
      selectTarget.value = lesson;
      selectVcInput.value = 0;
      selectDialogVisible.value = true;
    }
  }

  function confirmSelect() {
    const lesson = selectTarget.value;
    if (!lesson) return;
    const vcInput = selectVcInput.value || 0;
    selectDialogVisible.value = false;

    // v2: Check conflict BEFORE showing result dialog (HTA 2.3)
    const conflict = checkTimeConflict(lesson);
    if (conflict) {
      conflictTarget.value = lesson;
      conflictWith.value = conflict;
      conflictDialogVisible.value = true;
      return;
    }

    _doSelect(lesson, vcInput);
  }

  function _doSelect(lesson, vcInput) {
    resultDialogVisible.value = true;
    resultLoading.value = true;
    resultSuccess.value = false;
    resultMessage.value = '';

    setTimeout(() => {
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

      resultLoading.value = false;
      resultSuccess.value = true;
      resultMessage.value = '选课成功';
      const newLesson = { ...lesson, pinned: false, _selected: true, _initialPreserved: false };
      selectedLessons.value.push(newLesson);
      lesson.stdCount++;
      lesson._selected = true;
      lesson.pinned = false;
      status.semesterCreditActual += lesson.course.credits;
      status.semesterAmountActual += 1;
      setVcAllocation(lesson.id, vcInput);
      syncPlanCourseStatus();
      setSubmitStatus(lesson.id, 'success');

      const currentRound = selectOptions.value?.turn?.roundNo;
      if (currentRound && roundHistory[currentRound]) {
        roundHistory[currentRound].selected.push(newLesson);
      }
    }, 1500);
  }

  function _doRushSelect(lesson) {
    const conflict = checkTimeConflict(lesson);
    if (conflict) {
      conflictTarget.value = lesson;
      conflictWith.value = conflict;
      conflictDialogVisible.value = true;
      selectTarget.value = lesson;
      selectVcInput.value = 0;
      return;
    }
    _doRushSelectCore(lesson);
  }

  function _doRushSelectCore(lesson) {
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

      resultLoading.value = false;
      resultSuccess.value = true;
      resultMessage.value = '选课成功（先到先得）';

      const newLesson = { ...lesson, pinned: true, _selected: true, _initialPreserved: false };
      selectedLessons.value.push(newLesson);
      lesson.stdCount++;
      lesson._selected = true;
      lesson.pinned = true;
      status.semesterCreditActual += lesson.course.credits;
      status.semesterAmountActual += 1;
      syncPlanCourseStatus();
      setSubmitStatus(lesson.id, 'success');

      const currentRound = selectOptions.value?.turn?.roundNo;
      if (currentRound && roundHistory[currentRound]) {
        roundHistory[currentRound].selected.push(newLesson);
      }
    }, 800);
  }

  function handleDrop(lesson) {
    dropTarget.value = lesson;
    dropDialogVisible.value = true;
  }

  function confirmDrop() {
    dropDialogVisible.value = false;
    const lesson = dropTarget.value;
    if (!lesson) return;
    confirmDrop_internal(lesson);
  }

  function confirmDrop_internal(lesson) {
    resultDialogVisible.value = true;
    resultLoading.value = true;

    setTimeout(() => {
      resultLoading.value = false;
      resultSuccess.value = true;
      resultMessage.value = '退课成功';
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

      const currentRound = selectOptions.value?.turn?.roundNo;
      if (currentRound && roundHistory[currentRound]) {
        roundHistory[currentRound].dropped.push(removed || lesson);
      }
    }, 1200);
  }

  function openDrawer(course) {
    drawerCourse.value = course;
    drawerLessons.value = allLessons.value.filter(l => l.course.id === course.id);
    drawerVisible.value = true;
  }

  // v2: Open course detail drawer (HTA 1.3)
  async function openDetailDrawer(lesson, courseDetailsRef) {
    detailDrawerLesson.value = lesson;
    detailDrawerVisible.value = true;
    const cid = String(lesson.course.id);
    if (courseDetailsCache.value[cid]) {
      detailDrawerCourseInfo.value = courseDetailsCache.value[cid];
    } else if (courseDetailsRef) {
      const info = courseDetailsRef[cid] || null;
      detailDrawerCourseInfo.value = info;
      if (info) courseDetailsCache.value[cid] = info;
    }
  }

  function closeDetailDrawer() {
    detailDrawerVisible.value = false;
    detailDrawerLesson.value = null;
    detailDrawerCourseInfo.value = null;
  }

  // v2: Compute heat level for a lesson (HTA 2.2)
  function getHeatLevel(lesson) {
    const rate = lesson.historyCompetitionRate;
    if (rate == null) return null;
    if (rate >= 0.9) return { label: '极热', type: 'danger', color: '#F56C6C' };
    if (rate >= 0.75) return { label: '热门', type: 'warning', color: '#E6A23C' };
    if (rate >= 0.5) return { label: '普通', type: '', color: '#909399' };
    return { label: '冷门', type: 'info', color: '#67C23A' };
  }

  // v2: Toggle watch for a lesson (用例2)
  function toggleWatch(lesson) {
    const id = lesson.id;
    const ids = watchedLessonIds.value;
    if (ids.has(id)) {
      ids.delete(id);
      ElMessage({ type: 'info', message: `已取消关注「${lesson.course.nameZh}」` });
    } else {
      ids.add(id);
      ElMessage({ type: 'success', message: `已关注「${lesson.course.nameZh}」，名额变动时将提醒您` });
      startWatcher();
    }
  }

  function isWatched(lesson) {
    return watchedLessonIds.value.has(lesson.id);
  }

  function startWatcher() {
    if (watcherTimer.value) return;
    watcherTimer.value = setInterval(() => {
      const ids = watchedLessonIds.value;
      if (ids.size === 0) return;
      allLessons.value.forEach(l => {
        if (!ids.has(l.id)) return;
        if (l.stdCount < l.limitCount && Math.random() < 0.05) {
          const remaining = l.limitCount - l.stdCount;
          ElNotification({
            title: '名额提醒',
            message: `「${l.course.nameZh}」当前有 ${remaining} 个空余名额，可前往选课`,
            type: 'success',
            duration: 8000,
          });
        }
      });
    }, 30000);
  }

  function stopWatcher() {
    if (watcherTimer.value) { clearInterval(watcherTimer.value); watcherTimer.value = null; }
  }

  // v2: Submit status helpers (HTA 4.3-4.4)
  function setSubmitStatus(lessonId, statusStr) {
    const key = String(lessonId);
    if (submitStatusMap[key]?.timer) clearInterval(submitStatusMap[key].timer);

    if (statusStr === 'success') {
      let countdown = 10;
      const timer = setInterval(() => {
        countdown--;
        if (submitStatusMap[key]) submitStatusMap[key].countdown = countdown;
        if (countdown <= 0) {
          clearInterval(timer);
          if (submitStatusMap[key]) submitStatusMap[key].status = 'confirmed';
        }
      }, 1000);
      submitStatusMap[key] = { status: 'success', countdown, timer };
    } else {
      submitStatusMap[key] = { status: statusStr, countdown: 0, timer: null };
    }
  }

  function getSubmitStatus(lessonId) {
    return submitStatusMap[String(lessonId)] || null;
  }

  function cancelSubmit(lesson) {
    const key = String(lesson.id);
    const ss = submitStatusMap[key];
    if (!ss || ss.status === 'confirmed') return;
    if (ss.timer) clearInterval(ss.timer);
    delete submitStatusMap[key];
    // Roll back selection
    confirmDrop_internal(lesson);
    ElMessage({ type: 'info', message: `已撤销选课「${lesson.course.nameZh}」` });
  }

  // v2: Conflict dialog actions (HTA 2.3)
  function showConflictAndProceed() {
    conflictDialogVisible.value = false;
    const lesson = conflictTarget.value;
    if (!lesson) return;

    const turn = selectOptions.value?.turn;
    const isRushMode = turn && !turn.turnMode?.enableVirtualWallet;
    if (isRushMode) {
      _doRushSelectCore(lesson);
    } else {
      _doSelect(lesson, selectVcInput.value || 0);
    }
  }

  function showConflictAlternatives() {
    conflictDialogVisible.value = false;
    ElMessage({ type: 'info', message: '请在课程列表中选择其他教学班' });
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

    const currentRound = selectOptions.value?.turn?.roundNo;
    selectedLessons.value = selectedLessons.value.map(s => {
      const code = s.course?.code;
      if (currentRound === 1) {
        s._initialPreserved = false;
      } else if (isCorePreserve(code) && !droppedPreserved.has(code)) {
        s._initialPreserved = true;
        s.pinned = true;
      } else {
        s._initialPreserved = false;
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
    const [opts, lessons, plan, comp, stat, vc, qc] = await Promise.all([
      loadJSON('select-options.json'),
      loadJSON('query-lesson.json'),
      loadJSON('major-plan.json'),
      loadJSON('program-completion.json'),
      loadJSON('status.json'),
      loadJSON('virtual-cost.json'),
      loadJSON('query-condition.json'),
    ]);

    selectOptions.value = opts;
    // Override turn info with the actual turn being entered
    if (selectOptions.value) {
      selectOptions.value.turn = { ...(selectOptions.value.turn || {}), ...turn };
    }

    if (lessons) allLessons.value = lessons.lessons || [];

    // Round-specific pre-loaded courses
    const roundNo = turn.roundNo;
    if (!roundHistory[roundNo]) {
      roundHistory[roundNo] = { selected: [], dropped: [], _carryOver: [] };
    }

    if (roundNo === 1) {
      // Round 1: start empty, but restore if re-entering with existing history
      const history = roundHistory[1];
      const restored = [...history.selected]
        .filter(l => !history.dropped.some(d => d.id === l.id));
      selectedLessons.value = restored.map(l => ({ ...l, pinned: false, _selected: true, _initialPreserved: false }));
    } else {
      const prevRound = roundNo - 1;
      const prevHistory = roundHistory[prevRound] || { selected: [], dropped: [], _carryOver: [] };
      const prevCarryOver = prevHistory._carryOver || [];
      const carryOver = [...prevCarryOver, ...prevHistory.selected]
        .filter(l => !prevHistory.dropped.some(d => d.id === l.id));
      // Deduplicate by id
      const seen = new Set();
      const uniqueCarryOver = carryOver.filter(l => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });

      // Carry-over courses are pinned (confirmed from previous round)
      const carryOverLessons = uniqueCarryOver.map(l => ({ ...l, pinned: true, _initialPreserved: true }));

      // Also restore any selections made in this round (if re-entering)
      const thisHistory = roundHistory[roundNo];
      const thisRoundSelected = thisHistory.selected
        .filter(l => !thisHistory.dropped.some(d => d.id === l.id))
        .filter(l => !uniqueCarryOver.some(c => c.id === l.id));
      const thisRoundLessons = thisRoundSelected.map(l => ({ ...l, pinned: false, _selected: true, _initialPreserved: false }));

      selectedLessons.value = [...carryOverLessons, ...thisRoundLessons];
      roundHistory[roundNo]._carryOver = uniqueCarryOver;
    }

    if (plan?.modules) {
      majorPlanModules.value = plan.modules.map(m => ({
        ...m, _expanded: true,
        children: (m.children || []).map(c => ({ ...c, _expanded: false }))
      }));
    }
    if (comp?.modules) programCompletion.value = comp.modules;
    if (stat) Object.assign(status, stat);
    // Recalculate credit/amount based on actual selectedLessons
    status.semesterCreditActual = selectedLessons.value.reduce((s, l) => s + (l.course?.credits || 0), 0);
    status.semesterAmountActual = selectedLessons.value.length;
    if (vc && turn.turnMode?.enableVirtualWallet) {
      virtualCost.total = vc.virtualCostTotal;
      virtualCost.spent = 0;
    } else {
      virtualCost.total = 100;
      virtualCost.spent = 0;
    }
    // Reset VC allocations for this round
    Object.keys(vcAllocation).forEach(k => delete vcAllocation[k]);
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
    roundHistory,
    // v2: new features
    detailDrawerVisible, detailDrawerLesson, detailDrawerCourseInfo, courseDetailsCache,
    openDetailDrawer, closeDetailDrawer, getHeatLevel,
    watchedLessonIds, toggleWatch, isWatched, stopWatcher,
    submitStatusMap, getSubmitStatus, cancelSubmit,
    conflictDialogVisible, conflictTarget, conflictWith,
    showConflictAndProceed, showConflictAlternatives,
  };
}
