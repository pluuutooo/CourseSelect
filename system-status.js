/**
 * system-status.js - System status page: announcements, service health, error guide
 */

function useSystemStatus(loadJSON) {
  const { ref, computed } = Vue;

  const announcements = ref([]);
  const services = ref([]);
  const errorGuide = ref([]);
  const contact = ref({});
  const statusLoaded = ref(false);

  async function loadSystemStatus() {
    const data = await loadJSON('system-status.json');
    if (data) {
      announcements.value = data.announcements || [];
      services.value = data.services || [];
      errorGuide.value = data.errorGuide || [];
      contact.value = data.contact || {};
      statusLoaded.value = true;
    }
  }

  const announcementStatusMap = {
    completed: { text: '已完成', type: 'info' },
    upcoming: { text: '即将维护', type: 'warning' },
    ongoing: { text: '维护中', type: 'danger' },
    info: { text: '通知', type: '' },
  };

  function getAnnouncementTag(status) {
    return announcementStatusMap[status] || { text: status, type: 'info' };
  }

  const serviceStatusMap = {
    online: { text: '正常运行', type: 'success', icon: 'SuccessFilled' },
    offline: { text: '不可用', type: 'danger', icon: 'CircleCloseFilled' },
    maintenance: { text: '维护中', type: 'warning', icon: 'WarningFilled' },
    degraded: { text: '响应缓慢', type: 'warning', icon: 'WarningFilled' },
  };

  function getServiceTag(status) {
    return serviceStatusMap[status] || { text: status, type: 'info', icon: 'InfoFilled' };
  }

  const expandedErrors = ref({});

  function toggleError(code) {
    expandedErrors.value[code] = !expandedErrors.value[code];
  }

  function isErrorExpanded(code) {
    return !!expandedErrors.value[code];
  }

  // Demo: toggle a service status for presentation
  function toggleServiceStatus(svc) {
    const cycle = ['online', 'maintenance', 'offline'];
    const idx = cycle.indexOf(svc.status);
    const next = (idx >= 0) ? (idx + 1) % cycle.length : 0;
    svc.status = cycle[next];
  }

  return {
    announcements, services, errorGuide, contact, statusLoaded,
    loadSystemStatus,
    getAnnouncementTag, getServiceTag,
    expandedErrors, toggleError, isErrorExpanded,
    toggleServiceStatus,
  };
}
