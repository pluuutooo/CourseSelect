/**
 * confirm-remind.js - Graduate preselection confirmation reminder (P0-5)
 */

function useConfirmRemind(loadJSON, currentStudent) {
  const { ref, computed } = Vue;

  const confirmData = ref(null);
  const confirmDialogVisible = ref(false);
  const dismissed = ref(false);
  const rejectTarget = ref(null);
  const rejectDialogVisible = ref(false);

  const isGraduate = computed(() => {
    const stu = currentStudent.value;
    if (!stu) return false;
    const edu = (stu.education?.nameZh || '').toLowerCase();
    return edu.includes('硕士') || edu.includes('博士') || edu.includes('研究生');
  });

  const confirmWindow = computed(() => confirmData.value?.confirmWindow || null);

  const allCourses = computed(() => confirmData.value?.courses || []);

  const pendingCourses = computed(() =>
    allCourses.value.filter(c => c.confirmStatus === 'WAIT_CONFIRM')
  );

  const confirmedCourses = computed(() =>
    allCourses.value.filter(c => c.confirmStatus === 'CONFIRMED')
  );

  const rejectedCourses = computed(() =>
    allCourses.value.filter(c => c.confirmStatus === 'REJECTED')
  );

  const isInConfirmWindow = computed(() => {
    if (!confirmWindow.value) return false;
    const now = new Date();
    const begin = new Date(confirmWindow.value.beginTime.replace(' ', 'T'));
    const end = new Date(confirmWindow.value.endTime.replace(' ', 'T'));
    return now >= begin && now <= end;
  });

  const showReminder = computed(() => {
    return isGraduate.value && pendingCourses.value.length > 0 && !dismissed.value;
  });

  const deadlineCountdown = computed(() => {
    if (!confirmWindow.value) return '';
    const end = new Date(confirmWindow.value.endTime.replace(' ', 'T'));
    const now = new Date();
    const diff = end - now;
    if (diff <= 0) return '已截止';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}天${hours}时${mins}分`;
    if (hours > 0) return `${hours}时${mins}分`;
    return `${mins}分钟`;
  });

  async function loadConfirmData() {
    const data = await loadJSON('preselect-confirm.json');
    if (data) confirmData.value = data;
  }

  function dismissReminder() {
    dismissed.value = true;
    localStorage.setItem('confirm-dismiss-date', new Date().toDateString());
  }

  function checkDismissState() {
    const saved = localStorage.getItem('confirm-dismiss-date');
    if (saved && saved === new Date().toDateString()) {
      dismissed.value = true;
    }
  }

  function openConfirmDialog() {
    confirmDialogVisible.value = true;
  }

  function confirmCourse(course) {
    course.confirmStatus = 'CONFIRMED';
    ElMessage.success(`已确认选课：${course.course.nameZh}`);
  }

  function rejectCourse(course) {
    rejectTarget.value = course;
    rejectDialogVisible.value = true;
  }

  function confirmReject() {
    const course = rejectTarget.value;
    if (!course) return;
    course.confirmStatus = 'REJECTED';
    rejectDialogVisible.value = false;
    ElMessage.success(`已退选：${course.course.nameZh}`);
  }

  const confirmStatusMap = {
    'WAIT_CONFIRM': { text: '待确认', type: 'warning', desc: '请在截止前确认选课或退选，逾期视为放弃' },
    'CONFIRMED':    { text: '已确认', type: 'success', desc: '您已确认选课' },
    'REJECTED':     { text: '已退选', type: 'info',    desc: '您已退选此课程' },
  };

  function getConfirmStatus(status) {
    return confirmStatusMap[status] || { text: status, type: 'info', desc: '' };
  }

  checkDismissState();

  return {
    isGraduate,
    confirmData, confirmWindow,
    allCourses, pendingCourses, confirmedCourses, rejectedCourses,
    isInConfirmWindow, showReminder, deadlineCountdown,
    confirmDialogVisible,
    rejectTarget, rejectDialogVisible,
    loadConfirmData, dismissReminder, openConfirmDialog,
    confirmCourse, rejectCourse, confirmReject, getConfirmStatus,
  };
}
