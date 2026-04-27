/**
 * app.js - Main entry point
 * Composes feature modules: utils, auth, course-select, review
 */

const { createApp, ref, reactive, computed, onMounted, nextTick, watch } = Vue;

const app = createApp({
  setup() {
    // Shared state
    const allLessons = ref([]);
    const selectedLessons = ref([]);
    const status = reactive({

      semesterCreditActual: 0, semesterCreditUpperLimit: 30,
      semesterAmountActual: 0, semesterAmountUpperLimit: 10
    });

    // ---- Compose modules ----
    const utils   = useUtils();
    const auth    = useAuth(utils.loadJSON);
    const course  = useCourseSelect(utils.loadJSON, allLessons, selectedLessons, status);
    const review  = useReview(allLessons);
    const timeline = useTimeline(auth.turns);
    const sysStatus = useSystemStatus(utils.loadJSON);
    const confirm = useConfirmRemind(utils.loadJSON, auth.currentStudent);
    const vcGuide = useVirtualCostGuide(allLessons, course.virtualCost);
    const ureason = useUnselectedReason(utils.loadJSON);
    const feedback = useFeedback(utils.loadJSON);
    const ElMessage = ElementPlus.ElMessage;
    const ElMessageBox = ElementPlus.ElMessageBox;
    // Expose to window for legacy scripts (kept for backward compatibility)
    window.ElMessage = ElMessage;
    window.ElMessageBox = ElMessageBox;
    // expose globally for legacy scripts
    window.ElMessage = ElMessage;
    window.ElMessageBox = ElMessageBox;

    // Demo time control for timeline
    const mockNowStr = ref('2026-04-16 14:30');
    function updateMockNow() {
      const d = new Date(mockNowStr.value.replace(' ', 'T'));
      if (!isNaN(d.getTime())) timeline.mockNow.value = d;
    }
    function setMockPreset(iso) {
      timeline.mockNow.value = new Date(iso);
      mockNowStr.value = iso.replace('T', ' ');
    }

    // Wrap handleLogin to also load confirm data for graduate students
    const originalHandleLogin = auth.handleLogin;
    async function handleLoginWrapped() {
      await originalHandleLogin();
      await confirm.loadConfirmData();
    }

    // Wrap enterSelect to pass currentTurn ref from auth
    async function enterSelect(turn) {
      await course.enterSelect(turn, auth.currentTurn);
      await ureason.loadReasons();
      auth.currentPage.value = 'select';
    }

    // P1-7: Find alternative lessons for same course
    const alternativeLessons = computed(() => {
      if (!ureason.reasonTarget.value) return [];
      const target = ureason.reasonTarget.value;
      const targetCode = target.course?.code;
      if (!targetCode) return [];
      return (allLessons.value || []).filter(l =>
        l.course.code === targetCode && l.id !== target.id && l.stdCount < l.limitCount
      ).slice(0, 5);
    });

    // P1-7: Quick action from reason dialog to open VC guide
    function openVcGuideFromReason() {
      ureason.reasonDialogVisible.value = false;
      vcGuide.openGuide();
      vcGuide.activeGuideTab.value = 'simulator';
    }

    // Apply simulator allocation as actual course selections
    function applySimToSelect() {
      const simList = vcGuide.simCourses.value;
      const allocated = simList.filter(c => c.cost >= 0);

      if (allocated.length === 0) {
        ElMessage.warning('请先在模拟器中分配意愿值');
        return;
      }

      // Helpers (kept local to this function to avoid polluting outer scope)
      function preserveCurrentSelections() {
        const preserved = [];
        const droppedSet = (course.droppedPreserved) ? course.droppedPreserved : new Set();
        selectedLessons.value.forEach(sel => {
          const inAll = allLessons.value.find(l => l.id === sel.id);
          const code = sel.course?.code || inAll?.course?.code;
          if (course.isCorePreserve && course.isCorePreserve(code) && !droppedSet.has(code)) {
            preserved.push(sel);
          } else {
            if (inAll) {
              inAll._selected = false;
              inAll.pinned = false;
              if (inAll.stdCount > 0) inAll.stdCount--;
            }
            try { course.setVcAllocation(sel.id, 0); } catch (e) { /* ignore */ }
          }
        });
        selectedLessons.value = preserved;
        status.semesterCreditActual = preserved.reduce((s, l) => s + (l.course?.credits || 0), 0);
        status.semesterAmountActual = preserved.length;
        return preserved;
      }

      function exceedsTotalVc(totalAlloc) {
        const totalVc = (course.virtualCost && course.virtualCost.total) || 100;
        return totalAlloc > totalVc;
      }

      function validateAllocations(allocList) {
        for (const sim of allocList) {
          const lesson = allLessons.value.find(l => l.id === sim.lessonId);
          if (!lesson) return false;
          if (lesson.stdCount >= (lesson.limitCount || 0)) return false;
        }
        return true;
      }

      function applyAllocations(allocList, preserved) {
        let applied = 0;
        allocList.forEach(sim => {
          const lesson = allLessons.value.find(l => l.id === sim.lessonId);
          if (!lesson) return;
          if (course.isSelected(lesson)) {
            course.setVcAllocation(lesson.id, sim.cost);
            applied++;
            return;
          }

          if (lesson.stdCount < (lesson.limitCount || Infinity)) {
            const wasPreserved = preserved.some(p => p.id === lesson.id);
            const newLesson = { ...lesson, pinned: !!wasPreserved, _selected: true, _initialPreserved: !!wasPreserved };
            selectedLessons.value.push(newLesson);
            lesson.stdCount++;
            lesson._selected = true;
            lesson.pinned = !!wasPreserved;
            status.semesterCreditActual += lesson.course.credits || 0;
            status.semesterAmountActual += 1;
            course.setVcAllocation(lesson.id, sim.cost);
            applied++;
          }
        });
        return applied;
      }

      // 1) Preserve current core selections (if any)
      const preserved = preserveCurrentSelections();

      // 2) Check total VC limit
      const totalAlloc = allocated.reduce((s, c) => s + (c.cost || 0), 0);
      if (exceedsTotalVc(totalAlloc)) {
        const totalVc = (course.virtualCost && course.virtualCost.total) || 100;
        ElMessage.warning(`意愿值总和不能超过 ${totalVc}`);
        return;
      }

      // 3) Validate that all target lessons can be applied (exists and not full)
      if (!validateAllocations(allocated)) {
        ElMessage.warning('未能应用当前方案（可能存在课程预选人数已满或超过限额）');
        return;
      }

      // 4) Apply allocations
      const applied = applyAllocations(allocated, preserved);

      if (applied > 0) {
        vcGuide.guideDialogVisible.value = false;
        ElMessageBox.alert(
          `已成功应用 ${applied} 门课程的意愿值分配方案。\n可在「已选课程」中查看详情。`,
          '方案应用成功',
          { confirmButtonText: '确定', type: 'success' }
        );
      } else {
        ElMessage.warning('未能应用当前方案（可能存在课程预选人数已满或超过限额）');
      }
    }

    // ---- Lifecycle ----
    onMounted(() => {
      utils.refreshCaptcha();
      review.initMockReviews();
      setInterval(() => { course.countdownStr.value = Date.now().toString(); }, 60000);
    });

    // ---- Return all to template ----
    return {
      // Auth / navigation
      currentPage: auth.currentPage,
      students: auth.students,
      currentStudent: auth.currentStudent,
      turns: auth.turns,
      currentTurn: auth.currentTurn,
      currentSemester: auth.currentSemester,
      loginForm: auth.loginForm,
      loginRules: auth.loginRules,
      loginFormRef: auth.loginFormRef,
      handleLogin: handleLoginWrapped,
      enterTurns: auth.enterTurns,
      turnStatusText: auth.turnStatusText,
      turnStatusType: auth.turnStatusType,

      // Utils
      captchaCanvas: utils.captchaCanvas,
      refreshCaptcha: utils.refreshCaptcha,
      getCountdown: utils.getCountdown,

      // Course data
      allLessons,
      selectedLessons,
      status,
      selectOptions: course.selectOptions,
      majorPlanModules: course.majorPlanModules,
      programCompletion: course.programCompletion,
      queryCondition: course.queryCondition,
      virtualCost: course.virtualCost,
      vcAllocation: course.vcAllocation,
      getVcAllocation: course.getVcAllocation,
      setVcAllocation: course.setVcAllocation,
      vcRemaining: course.vcRemaining,
      activeTab: course.activeTab,
      timePairs: course.timePairs,
      countdownStr: course.countdownStr,

      // Filters
      filters: course.filters,
      filteredLessons: course.filteredLessons,
      queryLessons: course.queryLessons,
      resetFilters: course.resetFilters,
      onTabChange: course.onTabChange,

      // Selection
      isSelected: course.isSelected,
      isPinned: course.isPinned,
      handleSelect: course.handleSelect,
      handleDrop: course.handleDrop,
      confirmDrop: course.confirmDrop,
      openDrawer: course.openDrawer,
      enterSelect,
      selectDialogVisible: course.selectDialogVisible,
      selectTarget: course.selectTarget,
      selectVcInput: course.selectVcInput,
      confirmSelect: course.confirmSelect,

      // Dialogs
      drawerVisible: course.drawerVisible,
      drawerCourse: course.drawerCourse,
      drawerLessons: course.drawerLessons,
      resultDialogVisible: course.resultDialogVisible,
      resultLoading: course.resultLoading,
      resultSuccess: course.resultSuccess,
      resultMessage: course.resultMessage,
      dropDialogVisible: course.dropDialogVisible,
      dropTarget: course.dropTarget,
      bulletinDialogVisible: course.bulletinDialogVisible,
      bulletinContent: course.bulletinContent,
      rulesDialogVisible: course.rulesDialogVisible,
      rulesContent: course.rulesContent,
      showBulletin: course.showBulletin,
      showRules: course.showRules,

      // Timetable
      getTimetableCell: course.getTimetableCell,
      getTimetableCellRoom: course.getTimetableCellRoom,
      onTimetableCellClick: course.onTimetableCellClick,
      ttSelectedSlots: course.ttSelectedSlots,
      ttSlotLessons: course.ttSlotLessons,
      isTtSlotSelected: course.isTtSlotSelected,
      onTimetableSlotClick: course.onTimetableSlotClick,
      removeTtSlot: course.removeTtSlot,
      clearTtSlots: course.clearTtSlots,

      // Review
      reviews: review.reviews,
      reviewFilters: review.reviewFilters,
      reviewCourseList: review.reviewCourseList,
      reviewDetailVisible: review.reviewDetailVisible,
      reviewDetailTitle: review.reviewDetailTitle,
      reviewDetailList: review.reviewDetailList,
      reviewDetailAvg: review.reviewDetailAvg,
      reviewDetailSort: review.reviewDetailSort,
      sortedDetailReviews: review.sortedDetailReviews,
      addReviewDialogVisible: review.addReviewDialogVisible,
      newReview: review.newReview,
      canSubmitReview: review.canSubmitReview,
      filterReviews: review.filterReviews,
      resetReviewFilters: review.resetReviewFilters,
      voteReview: review.voteReview,
      onReviewCourseChange: review.onReviewCourseChange,
      submitReview: review.submitReview,
      openReviewDetail: review.openReviewDetail,
      openAddReviewFor: review.openAddReviewFor,

      // Timeline
      groupedNodes: timeline.groupedNodes,
      toggleRound: timeline.toggleRound,
      isRoundExpanded: timeline.isRoundExpanded,
      toggleReminder: timeline.toggleReminder,
      isReminded: timeline.isReminded,
      formatShort: timeline.formatShort,
      mockNowStr,
      updateMockNow,
      setMockPreset,

      // System Status
      announcements: sysStatus.announcements,
      services: sysStatus.services,
      errorGuide: sysStatus.errorGuide,
      contact: sysStatus.contact,
      getAnnouncementTag: sysStatus.getAnnouncementTag,
      getServiceTag: sysStatus.getServiceTag,
      toggleError: sysStatus.toggleError,
      isErrorExpanded: sysStatus.isErrorExpanded,
      openSystemStatus() {
        sysStatus.loadSystemStatus();
        auth.currentPage.value = 'systemStatus';
      },

      // Confirm Remind (P0-5)
      isGraduate: confirm.isGraduate,
      showConfirmReminder: confirm.showReminder,
      pendingConfirmCourses: confirm.pendingCourses,
      allConfirmCourses: confirm.allCourses,
      confirmedCourses: confirm.confirmedCourses,
      rejectedCourses: confirm.rejectedCourses,
      confirmWindow: confirm.confirmWindow,
      deadlineCountdown: confirm.deadlineCountdown,
      confirmDialogVisible: confirm.confirmDialogVisible,
      rejectTarget: confirm.rejectTarget,
      rejectDialogVisible: confirm.rejectDialogVisible,
      openConfirmDialog: confirm.openConfirmDialog,
      dismissConfirmReminder: confirm.dismissReminder,
      confirmCourse: confirm.confirmCourse,
      rejectCourse: confirm.rejectCourse,
      confirmReject: confirm.confirmReject,
      getConfirmStatus: confirm.getConfirmStatus,

      // P1-6: Virtual Cost Guide
      guideDialogVisible: vcGuide.guideDialogVisible,
      activeGuideTab: vcGuide.activeGuideTab,
      openGuide: vcGuide.openGuide,
      vcSimCourses: vcGuide.simCourses,
      vcTotalAllocated: vcGuide.totalAllocated,
      vcSimRemaining: vcGuide.remaining,
      vcEstimate: vcGuide.estimateProbability,
      vcGetProbLabel: vcGuide.getProbLabel,
      vcApplyPreset: vcGuide.applyPreset,
      vcSaveDraft: vcGuide.saveDraft,
      vcRestoreDraft: vcGuide.restoreDraft,
      vcClearDraft: vcGuide.clearDraft,
      vcSavedDraft: vcGuide.savedDraft,
      vcDraftTimestamp: vcGuide.draftTimestamp,
      vcRules: vcGuide.rules,
      vcStrategyTips: vcGuide.strategyTips,
      vcCourseSearchQuery: vcGuide.courseSearchQuery,
      vcCourseSearchVisible: vcGuide.courseSearchVisible,
      vcSearchResults: vcGuide.searchResults,
      vcAddSimCourse: vcGuide.addSimCourse,
      vcRemoveSimCourse: vcGuide.removeSimCourse,
      applySimToSelect,

      // P1-7: Unselected Reason
      reasonDialogVisible: ureason.reasonDialogVisible,
      reasonTarget: ureason.reasonTarget,
      currentReasons: ureason.currentReasons,
      isRealData: ureason.isRealData,
      openReasonDialog: ureason.openReasonDialog,
      getReasonTag: ureason.getReasonTag,
      alternativeLessons,
      openVcGuideFromReason,

      // P1-8: Feedback
      feedbackDialogVisible: feedback.feedbackDialogVisible,
      feedbackTab: feedback.feedbackTab,
      openFeedback: feedback.openFeedback,
      fbTickets: feedback.tickets,
      fbTicketTypes: feedback.ticketTypes,
      fbNewTicket: feedback.newTicket,
      fbCanSubmit: feedback.canSubmitTicket,
      fbUnreadCount: feedback.unreadCount,
      fbSubmitTicket: feedback.submitTicket,
      fbHandleScreenshot: feedback.handleScreenshot,
      fbTicketDetailVisible: feedback.ticketDetailVisible,
      fbTicketDetail: feedback.ticketDetail,
      fbOpenDetail: feedback.openTicketDetail,
      fbGetStatus: feedback.getTicketStatus,
      fbReplyContent: feedback.replyContent,
      fbSubmitReply: feedback.submitReply,
      fbCanReply: feedback.canReply,
      fbTicketTimeline: feedback.ticketTimeline,
    };
  },
});

// Register all Element Plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}
app.use(ElementPlus);
app.mount('#app');
