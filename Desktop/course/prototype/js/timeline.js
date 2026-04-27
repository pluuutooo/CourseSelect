/**
 * timeline.js - Course selection timeline with key-node reminders
 */

function useTimeline(turns) {
  const { ref, computed } = Vue;

  // ============================================================
  // >>> DEMO CONTROL: Change this date to simulate different
  // >>> positions on the timeline. The current value places you
  // >>> in the middle of Round 2 (第二轮意愿值选课).
  // >>>
  // >>> Examples:
  // >>>   '2026-04-06T10:00:00'  → Round 1 preview period
  // >>>   '2026-04-09T14:00:00'  → Round 1 active
  // >>>   '2026-04-11T10:00:00'  → Between Round 1 and 2
  // >>>   '2026-04-16T11:30:00'  → Round 2 active, before noon release
  // >>>   '2026-04-22T09:00:00'  → Round 3 active
  // >>>   '2026-04-29T10:00:00'  → Drop period active
  // ============================================================
  const mockNow = ref(new Date('2026-04-16T14:30:00'));

  function parseTime(str) {
    return new Date(str.replace(' ', 'T'));
  }

  function formatShort(str) {
    const d = parseTime(str);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const timelineNodes = computed(() => {
    const nodes = [];
    const now = mockNow.value;

    for (const turn of turns.value) {
      if (turn.previewBeginTime) {
        nodes.push({
          id: `${turn.id}-preview`,
          time: turn.previewBeginTime,
          endTime: turn.previewEndTime,
          label: turn.nameZh + ' - 预览',
          desc: `预览期 ${formatShort(turn.previewBeginTime)} ~ ${formatShort(turn.previewEndTime)}`,
          type: 'preview',
          icon: 'View',
          turn: turn,
        });
      }

      nodes.push({
        id: `${turn.id}-select`,
        time: turn.beginTime,
        endTime: turn.endTime,
        label: turn.nameZh + ' - 选课',
        desc: `选课 ${formatShort(turn.beginTime)} ~ ${formatShort(turn.endTime)}` +
              (turn.turnMode.enableVirtualWallet ? ' | 意愿值模式' : ' | 先到先得'),
        type: 'select',
        icon: 'EditPen',
        turn: turn,
        canEnter: true,
      });

      if (turn.quotaReleaseTimes) {
        turn.quotaReleaseTimes.forEach((qt, i) => {
          nodes.push({
            id: `${turn.id}-quota-${i}`,
            time: qt,
            endTime: null,
            label: '名额释放',
            desc: `退课名额统一释放 ${formatShort(qt)}`,
            type: 'quota',
            icon: 'AlarmClock',
            turn: turn,
            isQuotaRelease: true,
          });
        });
      }

      if (turn.dropEndTime !== turn.endTime) {
        nodes.push({
          id: `${turn.id}-dropend`,
          time: turn.dropEndTime,
          endTime: null,
          label: turn.nameZh + ' - 退课截止',
          desc: `退课截止 ${formatShort(turn.dropEndTime)}`,
          type: 'drop',
          icon: 'CircleClose',
          turn: turn,
        });
      }
    }

    nodes.sort((a, b) => parseTime(a.time) - parseTime(b.time));

    nodes.forEach(node => {
      const t = parseTime(node.time);
      const end = node.endTime ? parseTime(node.endTime) : null;

      if (end) {
        if (now >= end) node.status = 'past';
        else if (now >= t) node.status = 'active';
        else node.status = 'future';
      } else {
        if (now >= t) node.status = 'past';
        else node.status = 'future';
      }
    });

    return nodes;
  });

  const reminderState = ref(JSON.parse(localStorage.getItem('tl-reminders') || '{}'));

  function saveReminders() {
    localStorage.setItem('tl-reminders', JSON.stringify(reminderState.value));
  }

  function toggleReminder(nodeId) {
    if (reminderState.value[nodeId]) {
      delete reminderState.value[nodeId];
    } else {
      reminderState.value[nodeId] = true;
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      ElMessage.success('已订阅提醒，将在事件前15分钟通知您');
    }
    saveReminders();
  }

  function isReminded(nodeId) {
    return !!reminderState.value[nodeId];
  }

  const expandedRounds = ref({});

  function isRoundExpanded(roundNo) {
    if (expandedRounds.value[roundNo] !== undefined) return expandedRounds.value[roundNo];
    return true;
  }

  function toggleRound(roundNo) {
    expandedRounds.value[roundNo] = !isRoundExpanded(roundNo);
  }

  const groupedNodes = computed(() => {
    const groups = [];
    let currentGroup = null;

    for (const node of timelineNodes.value) {
      const roundNo = node.turn.roundNo;
      if (!currentGroup || currentGroup.roundNo !== roundNo) {
        currentGroup = {
          roundNo,
          turnId: node.turn.id,
          turnName: node.turn.nameZh,
          turn: node.turn,
          nodes: [],
          status: 'future',
        };
        groups.push(currentGroup);
      }
      currentGroup.nodes.push(node);
    }

    groups.forEach(g => {
      const now = mockNow.value;
      const turn = g.turn;
      const selectBegin = parseTime(turn.beginTime);
      const selectEnd = parseTime(turn.endTime);
      const dropEnd = parseTime(turn.dropEndTime);
      const hasPreview = turn.previewBeginTime && turn.previewEndTime;
      const previewBegin = hasPreview ? parseTime(turn.previewBeginTime) : null;

      if (now >= selectEnd && now >= dropEnd) {
        g.status = 'past';
      } else if (now >= selectBegin) {
        g.status = 'active';
      } else if (hasPreview && now >= previewBegin && now < selectBegin) {
        g.status = 'upcoming';
      } else {
        g.status = 'future';
      }
    });

    return groups;
  });

  return {
    mockNow,
    timelineNodes,
    groupedNodes,
    toggleReminder,
    isReminded,
    isRoundExpanded,
    toggleRound,
    formatShort,
  };
}
