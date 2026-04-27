/**
 * virtual-cost-guide.js - P1-6: Virtual cost rule explanation + strategy guide
 */

function useVirtualCostGuide(allLessons, virtualCost) {
  const { ref, computed, watch } = Vue;

  const guideDialogVisible = ref(false);
  const activeGuideTab = ref('rules');

  // Simulator state
  const simCourses = ref([]);
  const savedDraft = ref(null);
  const draftTimestamp = ref('');

  // Course search
  const courseSearchQuery = ref('');
  const courseSearchVisible = ref(false);

  const searchResults = computed(() => {
    const q = courseSearchQuery.value.trim().toLowerCase();
    if (!q) return [];
    const lessons = allLessons.value || [];
    const existing = new Set(simCourses.value.map(c => c.lessonId));
    return lessons
      .filter(l => !existing.has(l.id) && (
        l.course.nameZh.toLowerCase().includes(q) ||
        l.course.code.toLowerCase().includes(q) ||
        l.teachers.some(t => t.nameZh.includes(q))
      ))
      .slice(0, 8);
  });

  function openGuide() {
    guideDialogVisible.value = true;
    if (simCourses.value.length === 0) initSimCourses();
    loadDraft();
  }

  function initSimCourses() {
    const lessons = allLessons.value || [];
    const picked = lessons.slice(0, 4);
    simCourses.value = picked.map(lessonToSim);
  }

  function lessonToSim(l) {
    return {
      lessonId: l.id,
      code: l.course.code,
      name: l.course.nameZh,
      credits: l.course.credits,
      teacher: l.teachers.map(t => t.nameZh).join(', '),
      cost: 0,
      historyRate: Math.floor(Math.random() * 40 + 30),
      limitCount: l.limitCount || 80,
      stdCount: l.stdCount || 0,
    };
  }

  function addSimCourse(lesson) {
    if (simCourses.value.length >= 10) {
      ElMessage.warning('模拟列表最多添加 10 门课程');
      return;
    }
    if (simCourses.value.some(c => c.lessonId === lesson.id)) return;
    simCourses.value.push(lessonToSim(lesson));
    courseSearchQuery.value = '';
    courseSearchVisible.value = false;
  }

  function removeSimCourse(index) {
    simCourses.value.splice(index, 1);
  }

  const totalAllocated = computed(() =>
    simCourses.value.reduce((s, c) => s + (Number(c.cost) || 0), 0)
  );

  const remaining = computed(() =>
    Math.max(0, (virtualCost.total || 100) - totalAllocated.value)
  );

  function estimateProbability(course) {
    const cost = Number(course.cost) || 0;
    if (cost === 0) return 0;
    const ratio = course.stdCount / (course.limitCount || 1);
    const base = course.historyRate || 0;
    const costBonus = Math.min(cost / 50, 1) * 40;
    const capacityPenalty = ratio > 0.8 ? (ratio - 0.8) * 100 : 0;
    return Math.max(5, Math.min(99, Math.round(base + costBonus - capacityPenalty)));
  }

  function getProbLabel(prob) {
    if (prob >= 70) return '较大';
    if (prob >= 40) return '一般';
    return '较小';
  }

  function applyPreset(type) {
    const courses = simCourses.value;
    const total = virtualCost.total || 100;
    if (courses.length === 0) return;
    if (type === 'balanced') {
      const each = Math.floor(total / courses.length);
      const remainder = total - each * courses.length;
      courses.forEach((c, i) => { c.cost = i === 0 ? each + remainder : each; });
    } else if (type === 'aggressive') {
      courses.forEach(c => { c.cost = 0; });
      const sorted = courses.slice().sort((a, b) => a.historyRate - b.historyRate);
      if (sorted.length >= 2) {
        const c0 = courses.find(x => x.lessonId === sorted[0].lessonId);
        const c1 = courses.find(x => x.lessonId === sorted[1].lessonId);
        if (c0) c0.cost = Math.floor(total * 0.6);
        if (c1) c1.cost = total - (c0 ? c0.cost : 0);
      } else {
        courses[0].cost = total;
      }
    } else if (type === 'conservative') {
      courses.forEach(c => { c.cost = 0; });
      const top = courses.slice().sort((a, b) => b.historyRate - a.historyRate);
      const pick = top.slice(0, Math.min(3, top.length));
      const each = Math.floor(total / pick.length);
      const remainder = total - each * pick.length;
      pick.forEach((c, i) => {
        const orig = courses.find(x => x.lessonId === c.lessonId);
        if (orig) orig.cost = i === 0 ? each + remainder : each;
      });
    }
  }

  function saveDraft() {
    const now = new Date();
    const ts = now.getFullYear() + '-' +
      String(now.getMonth()+1).padStart(2,'0') + '-' +
      String(now.getDate()).padStart(2,'0') + ' ' +
      String(now.getHours()).padStart(2,'0') + ':' +
      String(now.getMinutes()).padStart(2,'0');
    const draft = {
      timestamp: ts,
      courses: simCourses.value.map(c => ({ lessonId: c.lessonId, cost: c.cost })),
    };
    localStorage.setItem('vc-draft', JSON.stringify(draft));
    savedDraft.value = draft;
    draftTimestamp.value = ts;
    ElMessage.success('方案已保存为草稿');
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem('vc-draft');
      if (raw) {
        const draft = JSON.parse(raw);
        savedDraft.value = draft;
        draftTimestamp.value = draft.timestamp || '';
        if (draft.courses) {
          draft.courses.forEach(d => {
            const c = simCourses.value.find(x => x.lessonId === d.lessonId);
            if (c) c.cost = d.cost;
          });
        }
      }
    } catch (e) { /* ignore */ }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem('vc-draft');
      if (!raw) { ElMessage.info('暂无已保存的草稿'); return; }
      const draft = JSON.parse(raw);
      if (draft.courses) {
        simCourses.value.forEach(c => { c.cost = 0; });
        draft.courses.forEach(d => {
          const c = simCourses.value.find(x => x.lessonId === d.lessonId);
          if (c) c.cost = d.cost;
        });
        ElMessage.success('草稿已恢复');
      }
    } catch (e) { ElMessage.error('草稿加载失败'); }
  }

  function clearDraft() {
    localStorage.removeItem('vc-draft');
    savedDraft.value = null;
    draftTimestamp.value = '';
    simCourses.value.forEach(c => { c.cost = 0; });
  }

  const rules = [
    { title: '每轮 100 意愿值', icon: 'Coin', desc: '每轮选课开始时，获得总计 100 意愿值。' },
    { title: '自由分配到课程', icon: 'EditPen', desc: '将意愿值分配到你想选的课程上。热门课程建议投入更多，冷门课程少量即可。' },
    { title: '意愿值筛选规则', icon: 'TrendCharts', desc: '当课程报名人数超过容量时，系统按投入意愿值从高到低排序，选取前 N 名同学。意愿值相同时随机抽取。' },
    { title: '轮末清零 + 重新分配', icon: 'Timer', desc: '每轮选课结束后，所有意愿值清零，下一轮重新获得 100 意愿值。' },
  ];

  const strategyTips = [
    { label: '均衡型', icon: 'Histogram', color: '#67C23A', desc: '将意愿值平均分配到所有想选的课程，适合课程竞争度相近的情况。' },
    { label: '冒险型', icon: 'TrendCharts', color: '#F56C6C', desc: '把 60% 以上的意愿值集中到 1-2 门最想要的热门课，其余课程少量或不投入。' },
    { label: '保守型', icon: 'Umbrella', color: '#409EFF', desc: '优先保证中签率较高的课程，将意愿值集中到 2-3 门容易选中的课上。' },
  ];

  return {
    guideDialogVisible, activeGuideTab, openGuide,
    simCourses, totalAllocated, remaining,
    estimateProbability, getProbLabel, applyPreset,
    saveDraft, loadDraft, restoreDraft, clearDraft, savedDraft, draftTimestamp,
    rules, strategyTips,
    courseSearchQuery, courseSearchVisible, searchResults,
    addSimCourse, removeSimCourse,
  };
}


