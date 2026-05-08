/**
 * review.js - Course review / evaluation system
 */

function useReview(allLessons) {
  const { ref, reactive, computed } = Vue;

  const reviews = ref([]);
  const reviewFilters = reactive({ keyword: '', teacher: '', weekday: null, campus: null, courseProperty: null });
  const addReviewDialogVisible = ref(false);
  const newReview = reactive({
    lessonId: null, rating: 0, content: '',
    courseCode: '', courseName: '', teacherName: '', courseProperty: ''
  });
  let reviewIdCounter = 100;

  // Review detail dialog
  const reviewDetailVisible = ref(false);
  const reviewDetailTitle = ref('');
  const reviewDetailLessonId = ref(null);
  const reviewDetailSort = ref('newest');

  // ---- Initial mock reviews ----
  function initMockReviews() {
    reviews.value = [
      { id: 1,  lessonId: 3001, courseCode: 'CS301',   courseName: '操作系统',                                  teacherName: '王教授',           courseProperty: 'majorCompulsory',  rating: 5, content: '王教授讲课非常清晰，从进程管理到内存管理再到文件系统，每个知识点都讲得很透彻。实验课设计得也很好，能真正学到东西。强烈推荐！',       time: '2026-03-15 10:23', upCount: 24, downCount: 1, myVote: null, weekday: 1, campusId: 1 },
      { id: 2,  lessonId: 3001, courseCode: 'CS301',   courseName: '操作系统',                                  teacherName: '王教授',           courseProperty: 'majorCompulsory',  rating: 4, content: '课程内容很扎实，就是期末考试有点难。平时作业量适中，实验报告要认真写。',                                                               time: '2026-03-12 16:45', upCount: 15, downCount: 2, myVote: null, weekday: 1, campusId: 1 },
      { id: 3,  lessonId: 3002, courseCode: 'CS301',   courseName: '操作系统',                                  teacherName: '李教授',           courseProperty: 'majorCompulsory',  rating: 3, content: '李教授的课比较偏理论，PPT内容很多但讲解速度快。需要课后自己多花时间理解。考试比较公平。',                                           time: '2026-03-10 09:12', upCount: 8,  downCount: 5, myVote: null, weekday: 2, campusId: 1 },
      { id: 4,  lessonId: 3003, courseCode: 'CS302',   courseName: '计算机网络',                                teacherName: '赵教授, 孙副教授', courseProperty: 'majorCompulsory',  rating: 5, content: '两位老师配合默契，赵教授讲理论，孙老师带实验。Wireshark抓包实验特别有意思，能直观理解协议栈工作原理。',                                 time: '2026-03-08 14:30', upCount: 31, downCount: 0, myVote: null, weekday: 3, campusId: 1 },
      { id: 5,  lessonId: 3004, courseCode: 'CS401',   courseName: '人工智能导论',                              teacherName: '刘教授',           courseProperty: 'majorCompulsory',  rating: 4, content: '刘教授的AI课涵盖了搜索、机器学习、深度学习等热门话题。大作业可以自选题目，给分也比较友好。',                                             time: '2026-03-05 11:20', upCount: 19, downCount: 3, myVote: null, weekday: 5, campusId: 1 },
      { id: 6,  lessonId: 3007, courseCode: 'GE101',   courseName: '影视鉴赏',                                 teacherName: '吴老师',           courseProperty: 'generalEducation', rating: 5, content: '超级推荐的通选课！每节课看一部经典电影然后讨论，期末写影评就行。吴老师选的片子品味很好，给分也很高。',                                   time: '2026-02-28 17:40', upCount: 45, downCount: 2, myVote: null, weekday: 4, campusId: 1 },
      { id: 7,  lessonId: 3007, courseCode: 'GE101',   courseName: '影视鉴赏',                                 teacherName: '吴老师',           courseProperty: 'generalEducation', rating: 4, content: '轻松愉快的选修课，就是教室比较热门需要早点去占座。作业不多，适合当调剂。',                                                                 time: '2026-02-25 13:55', upCount: 12, downCount: 1, myVote: null, weekday: 4, campusId: 1 },
      { id: 8,  lessonId: 3008, courseCode: 'MARX002', courseName: '毛泽东思想和中国特色社会主义理论体系概论',   teacherName: '郑教授',           courseProperty: 'publicCompulsory', rating: 4, content: '郑教授讲课不照本宣科，会结合时事案例分析，还是挺有意思的。期末开卷考试，平时到课率影响比较大。',                                           time: '2026-02-20 09:30', upCount: 17, downCount: 4, myVote: null, weekday: 5, campusId: 1 },
      { id: 9,  lessonId: 3009, courseCode: 'ENG301',  courseName: '英语演讲',                                 teacherName: '张老师',           courseProperty: 'publicCompulsory', rating: 3, content: '每节课都要上台演讲，社恐慎选。但确实能锻炼口语和胆量，张老师的纠正很专业。给分中规中矩。',                                               time: '2026-02-18 15:10', upCount: 9,  downCount: 6, myVote: null, weekday: 2, campusId: 1 },
      { id: 10, lessonId: 3011, courseCode: 'GE201',   courseName: '《量子思维》导读',                          teacherName: '钱教授',           courseProperty: 'generalEducation', rating: 5, content: '钱教授太有人格魅力了！用通俗的语言讲量子物理的哲学思考，完全不需要物理基础。期末小论文，给分慷慨。',                                     time: '2026-02-15 11:00', upCount: 38, downCount: 1, myVote: null, weekday: 4, campusId: 1 },
      { id: 11, lessonId: 3010, courseCode: 'HIST101', courseName: '中国近代史纲要',                            teacherName: '林教授',           courseProperty: 'publicCompulsory', rating: 4, content: '林教授讲近代史非常生动，配合大量历史图片和纪录片片段。虽然是必修但不会觉得无聊。考试有一定主观题。',                                       time: '2026-02-10 08:45', upCount: 20, downCount: 2, myVote: null, weekday: 3, campusId: 1 },
      { id: 12, lessonId: 3012, courseCode: 'CS303',   courseName: '数据可视化',                                teacherName: '黄副教授',         courseProperty: 'majorElective',    rating: 4, content: '黄老师用D3.js和ECharts教可视化，很实用。大作业做一个完整的可视化项目，能学到不少前端技术。课堂氛围也很好。',                                 time: '2026-02-08 14:20', upCount: 16, downCount: 1, myVote: null, weekday: 1, campusId: 1 },
      { id: 13, lessonId: 3013, courseCode: 'MATH301', courseName: '数学建模',                                  teacherName: '吕教授',           courseProperty: 'majorElective',    rating: 5, content: '吕教授讲建模方法非常系统，从线性规划到随机模型都有涉及。对参加数学建模竞赛很有帮助，强烈建议选修！',                                     time: '2026-02-05 09:30', upCount: 28, downCount: 0, myVote: null, weekday: 2, campusId: 1 },
    ];
    reviewIdCounter = reviews.value.reduce((m, r) => Math.max(m, r.id), 100) + 1;
  }

  // ---- Review course list (table rows with avg rating) ----
  const reviewCourseList = computed(() => {
    let lessons = [...allLessons.value];
    if (reviewFilters.keyword) {
      const kw = reviewFilters.keyword.toLowerCase();
      lessons = lessons.filter(l => l.course.code.toLowerCase().includes(kw) || l.course.nameZh.toLowerCase().includes(kw));
    }
    if (reviewFilters.teacher) {
      const t = reviewFilters.teacher.toLowerCase();
      lessons = lessons.filter(l => l.teachers.some(tc => tc.nameZh.includes(t)));
    }
    if (reviewFilters.weekday) {
      lessons = lessons.filter(l => l.schedules.some(s => s.weekday === reviewFilters.weekday));
    }
    if (reviewFilters.campus) {
      lessons = lessons.filter(l => l.campus.id === reviewFilters.campus);
    }
    if (reviewFilters.courseProperty) {
      lessons = lessons.filter(l => l.courseProperty === reviewFilters.courseProperty);
    }
    return lessons.map(l => {
      const courseReviews = reviews.value.filter(r => r.lessonId === l.id);
      const avg = courseReviews.length > 0
        ? courseReviews.reduce((sum, r) => sum + r.rating, 0) / courseReviews.length
        : 0;
      return {
        lessonId: l.id,
        courseCode: l.course.code,
        courseName: l.course.nameZh,
        credits: l.course.credits,
        teacherName: l.teachers.map(t => t.nameZh).join(', '),
        courseProperty: l.courseProperty || 'major',
        avgRating: avg,
        reviewCount: courseReviews.length,
      };
    });
  });

  function filterReviews() { /* reactive via computed */ }
  function resetReviewFilters() {
    reviewFilters.keyword = ''; reviewFilters.teacher = '';
    reviewFilters.weekday = null; reviewFilters.campus = null;
    reviewFilters.courseProperty = null;
  }

  // ---- Review detail dialog ----
  function openReviewDetail(row) {
    reviewDetailLessonId.value = row.lessonId;
    reviewDetailTitle.value = row.courseCode + ' ' + row.courseName + ' - 课程评价';
    reviewDetailSort.value = 'newest';
    reviewDetailVisible.value = true;
  }

  const reviewDetailList = computed(() => {
    return reviews.value.filter(r => r.lessonId === reviewDetailLessonId.value);
  });

  const reviewDetailAvg = computed(() => {
    const list = reviewDetailList.value;
    if (list.length === 0) return 0;
    return list.reduce((sum, r) => sum + r.rating, 0) / list.length;
  });

  const sortedDetailReviews = computed(() => {
    const list = [...reviewDetailList.value];
    if (reviewDetailSort.value === 'newest') {
      list.sort((a, b) => b.time.localeCompare(a.time));
    } else if (reviewDetailSort.value === 'highest') {
      list.sort((a, b) => b.rating - a.rating || b.time.localeCompare(a.time));
    } else if (reviewDetailSort.value === 'mostLiked') {
      list.sort((a, b) => (b.upCount - b.downCount) - (a.upCount - a.downCount));
    }
    return list;
  });

  // ---- Add review ----
  function openAddReviewFor(row) {
    const lesson = allLessons.value.find(l => l.id === row.lessonId);
    if (lesson) {
      newReview.lessonId = lesson.id;
      newReview.courseCode = lesson.course.code;
      newReview.courseName = lesson.course.nameZh;
      newReview.teacherName = lesson.teachers.map(t => t.nameZh).join(', ');
      newReview.courseProperty = lesson.courseProperty || '';
    }
    newReview.rating = 0;
    newReview.content = '';
    addReviewDialogVisible.value = true;
  }

  const canSubmitReview = computed(() => {
    return newReview.lessonId && newReview.rating > 0 && newReview.content.trim().length > 0;
  });

  function onReviewCourseChange(lessonId) {
    const lesson = allLessons.value.find(l => l.id === lessonId);
    if (lesson) {
      newReview.courseCode = lesson.course.code;
      newReview.courseName = lesson.course.nameZh;
      newReview.teacherName = lesson.teachers.map(t => t.nameZh).join(', ');
      newReview.courseProperty = lesson.courseProperty || '';
    }
  }

  function submitReview() {
    if (!canSubmitReview.value) return;
    const lesson = allLessons.value.find(l => l.id === newReview.lessonId);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    reviews.value.unshift({
      id: reviewIdCounter++,
      lessonId: newReview.lessonId,
      courseCode: newReview.courseCode,
      courseName: newReview.courseName,
      teacherName: newReview.teacherName,
      courseProperty: newReview.courseProperty,
      rating: newReview.rating,
      content: newReview.content.trim(),
      time: timeStr,
      upCount: 0, downCount: 0, myVote: null,
      weekday: lesson ? (lesson.schedules[0]?.weekday || 1) : 1,
      campusId: lesson ? lesson.campus.id : 1,
    });
    newReview.lessonId = null;
    newReview.rating = 0;
    newReview.content = '';
    newReview.courseCode = '';
    newReview.courseName = '';
    newReview.teacherName = '';
    newReview.courseProperty = '';
    addReviewDialogVisible.value = false;
    ElMessage.success('评价发布成功！');
  }

  // ---- Vote ----
  function voteReview(review, type) {
    if (review.myVote === type) {
      if (type === 'up') review.upCount--;
      else review.downCount--;
      review.myVote = null;
    } else {
      if (review.myVote === 'up') review.upCount--;
      if (review.myVote === 'down') review.downCount--;
      if (type === 'up') review.upCount++;
      else review.downCount++;
      review.myVote = type;
    }
  }

  return {
    reviews, reviewFilters, reviewCourseList,
    reviewDetailVisible, reviewDetailTitle, reviewDetailList, reviewDetailAvg, reviewDetailSort, sortedDetailReviews,
    addReviewDialogVisible, newReview, canSubmitReview,
    initMockReviews,
    filterReviews, resetReviewFilters, voteReview, onReviewCourseChange, submitReview,
    openReviewDetail, openAddReviewFor,
  };
}
