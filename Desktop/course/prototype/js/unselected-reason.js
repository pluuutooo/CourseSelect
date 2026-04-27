/**
 * unselected-reason.js - P1-7: Structured unselected reason analysis
 */

function useUnselectedReason(loadJSON) {
  const { ref, computed } = Vue;

  const reasonData = ref({});
  const reasonDialogVisible = ref(false);
  const reasonTarget = ref(null);

  async function loadReasons() {
    const data = await loadJSON('unselected-reasons.json');
    if (data) reasonData.value = data;
  }

  function openReasonDialog(lesson) {
    reasonTarget.value = lesson;
    reasonDialogVisible.value = true;
  }

  const isRealData = computed(() => {
    if (!reasonTarget.value) return false;
    return !!reasonData.value[reasonTarget.value.id];
  });

  const currentReasons = computed(() => {
    if (!reasonTarget.value) return [];
    const id = reasonTarget.value.id;
    const specific = reasonData.value[id];
    if (specific) return specific;
    return getGenericReasons(reasonTarget.value);
  });

  function getGenericReasons(lesson) {
    const reasons = [];
    const std = Number(lesson.stdCount) || 0;
    const limit = Number(lesson.limitCount) || 1;
    const ratio = std / limit;
    if (ratio >= 1) {
      reasons.push({
        type: 'capacity',
        icon: 'UserFilled',
        color: '#F56C6C',
        title: '课程容量已满',
        desc: `该课程报名人数（${std}）已达到或超过课程容量（${limit}），系统按规则筛选后未能选中。`,
        suggestion: '建议关注退课名额释放时段（每日中午12:00），或选择同课程其他教学班。',
        action: 'alternative',
      });
    }
    if (ratio > 0.7) {
      reasons.push({
        type: 'virtualCost',
        icon: 'Coin',
        color: '#E6A23C',
        title: '意愿值可能低于筛选线',
        desc: `该课程竞争较为激烈（报名率 ${Math.round(ratio * 100)}%），您投入的意愿值可能低于最终筛选线。`,
        suggestion: '下一轮选课时可考虑提高该课程的意愿值分配，或使用意愿值策略向导进行模拟。',
        action: 'vcGuide',
      });
    }
    reasons.push({
      type: 'prerequisite',
      icon: 'Warning',
      color: '#909399',
      title: '可能存在前置条件限制',
      desc: '部分课程要求完成先修课程、评教或其他前置条件。如未满足，系统会自动过滤。',
      suggestion: '请在教务系统确认是否已完成评教，以及是否满足先修课程要求。',
    });
    return reasons;
  }

  // Find alternative lessons for the same course
  const alternativeLessons = computed(() => {
    if (!reasonTarget.value) return [];
    const targetCourseCode = reasonTarget.value.course?.code;
    if (!targetCourseCode) return [];
    // This will be populated by app.js which has access to allLessons
    return [];
  });

  const reasonTypeMap = {
    capacity: { label: '容量限制', type: 'danger' },
    virtualCost: { label: '意愿值不足', type: 'warning' },
    prerequisite: { label: '前置条件', type: 'info' },
    crossMajor: { label: '跨专业限制', type: '' },
    evaluation: { label: '未评教', type: 'warning' },
  };

  function getReasonTag(type) {
    return reasonTypeMap[type] || { label: type, type: 'info' };
  }

  return {
    reasonData, reasonDialogVisible, reasonTarget,
    currentReasons, isRealData, loadReasons, openReasonDialog, getReasonTag,
  };
}
