/**
 * feedback.js - P1-8: Feedback ticket system
 */

function useFeedback(loadJSON) {
  const { ref, computed } = Vue;

  const feedbackDialogVisible = ref(false);
  const feedbackTab = ref('submit');
  const tickets = ref([]);
  const ticketDetailVisible = ref(false);
  const ticketDetail = ref(null);

  const newTicket = ref({
    type: '',
    description: '',
    screenshot: null,
    screenshotName: '',
  });

  // User reply in ticket detail
  const replyContent = ref('');

  const ticketTypes = [
    { value: 'login', label: '登录问题' },
    { value: 'select', label: '选课问题' },
    { value: 'drop', label: '退课问题' },
    { value: 'info', label: '信息错误' },
    { value: 'other', label: '其他' },
  ];

  async function loadTickets() {
    const data = await loadJSON('feedback-tickets.json');
    if (!data) return;
    if (Array.isArray(data)) tickets.value = data;
    else if (data && Array.isArray(data.tickets)) tickets.value = data.tickets;
    else tickets.value = [];
  }

  function openFeedback() {
    feedbackDialogVisible.value = true;
    loadTickets();
  }

  const canSubmitTicket = computed(() =>
    newTicket.value.type && newTicket.value.description.trim().length >= 5
  );

  // Count tickets with unread staff replies
  const unreadCount = computed(() => {
    return tickets.value.filter(t => {
      if (!t.replies || t.replies.length === 0) return false;
      const last = t.replies[t.replies.length - 1];
      return last.from === 'staff' && !t._read;
    }).length;
  });

  function submitTicket() {
    const now = new Date();
    const id = 'TK' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + String(tickets.value.length + 1).padStart(3,'0');
    const ticket = {
      id: id,
      type: newTicket.value.type,
      typeLabel: (ticketTypes.find(t => t.value === newTicket.value.type) || {}).label || newTicket.value.type,
      description: newTicket.value.description,
      hasScreenshot: !!newTicket.value.screenshotName,
      status: 'pending',
      createdAt: now.toISOString().slice(0,16).replace('T',' '),
      replies: [],
      _read: true,
    };
    tickets.value.unshift(ticket);
    newTicket.value = { type: '', description: '', screenshot: null, screenshotName: '' };
    feedbackTab.value = 'list';
    ElMessage.success('工单提交成功，我们会尽快处理');
  }

  function handleScreenshot(file) {
    try {
      const raw = file.raw || file;
      if (!raw || !raw.size) return false;
      if (raw.size > 5 * 1024 * 1024) {
        ElMessage.error('截图大小不能超过 5MB');
        return false;
      }
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      if (!validTypes.includes(raw.type)) {
        ElMessage.error('仅支持 JPG/PNG 格式');
        return false;
      }
      newTicket.value.screenshotName = raw.name || '';
      return false;
    } catch (e) {
      console.warn('handleScreenshot error', e);
      return false;
    }
  }

  function openTicketDetail(ticket) {
    ticket._read = true;
    ticketDetail.value = ticket;
    ticketDetailVisible.value = true;
    replyContent.value = '';
  }

  function submitReply() {
    if (!ticketDetail.value || !replyContent.value.trim()) return;
    const now = new Date();
    const ts = now.toISOString().slice(0,16).replace('T',' ');
    ticketDetail.value.replies.push({
      from: 'user',
      name: '我',
      content: replyContent.value.trim(),
      time: ts,
    });
    replyContent.value = '';
    ElMessage.success('回复已发送');
  }

  const canReply = computed(() => {
    if (!ticketDetail.value) return false;
    if (ticketDetail.value.status === 'closed') return false;
    return replyContent.value.trim().length > 0;
  });

  const statusMap = {
    pending: { text: '待处理', type: 'warning', icon: 'Clock', color: '#E6A23C' },
    processing: { text: '处理中', type: '', icon: 'Loading', color: '#409EFF' },
    resolved: { text: '已解决', type: 'success', icon: 'CircleCheck', color: '#67C23A' },
    closed: { text: '已关闭', type: 'info', icon: 'CircleClose', color: '#909399' },
  };

  function getTicketStatus(status) {
    return statusMap[status] || { text: status, type: 'info', icon: 'QuestionFilled', color: '#909399' };
  }

  // Build timeline steps for ticket detail
  const ticketTimeline = computed(() => {
    if (!ticketDetail.value) return [];
    const steps = [
      { label: '提交工单', time: ticketDetail.value.createdAt, done: true },
    ];
    const s = ticketDetail.value.status;
    steps.push({ label: '处理中', time: s === 'processing' || s === 'resolved' || s === 'closed' ? '已受理' : '等待受理', done: s !== 'pending' });
    steps.push({ label: '已解决', time: s === 'resolved' || s === 'closed' ? '已完成' : '', done: s === 'resolved' || s === 'closed' });
    return steps;
  });

  return {
    feedbackDialogVisible, feedbackTab, openFeedback,
    tickets, ticketTypes, newTicket, canSubmitTicket, unreadCount,
    submitTicket, handleScreenshot,
    ticketDetailVisible, ticketDetail, openTicketDetail,
    getTicketStatus, loadTickets,
    replyContent, submitReply, canReply,
    ticketTimeline,
  };
}
