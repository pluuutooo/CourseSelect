/**
 * auth.js - Login and navigation logic
 */

function useAuth(loadJSON) {
  const { ref, reactive } = Vue;

  const currentPage = ref('login');
  const students = ref([]);
  const currentStudent = ref(null);
  const turns = ref([]);
  const currentTurn = ref(null);
  const currentSemester = ref('');

  // Login form
  const loginForm = reactive({ username: '', password: '', captcha: '', role: 'undergraduate' });
  const loginRules = {
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
    captcha:  [{ required: true, message: '请输入验证码', trigger: 'blur' }],
  };
  const loginFormRef = ref(null);

  function handleLogin() {
    const form = loginFormRef.value;
    if (!form) return doLogin();
    return new Promise((resolve) => {
      form.validate((valid) => {
        if (valid) doLogin().then(resolve);
        else resolve();
      });
    });
  }

  async function doLogin() {
    try {
      await loadJSON('login.json');
      const data = await loadJSON('students.json');
      const studentsList = Array.isArray(data) ? data : (data && Array.isArray(data.students) ? data.students : []);
      if (studentsList && studentsList.length > 0) {
        students.value = studentsList;
        const isGrad = loginForm.role === 'graduate';
        const stu = studentsList.find(s => {
          const edu = (s.education && s.education.nameZh) || '';
          const grad = edu.indexOf('硕士') >= 0 || edu.indexOf('博士') >= 0 || edu.indexOf('研究生') >= 0;
          return isGrad ? grad : !grad;
        }) || studentsList[0];
        currentStudent.value = stu;
        const turnsData = await loadJSON('open-turns.json');
        if (turnsData) {
          turns.value = turnsData;
          if (turnsData.length > 0) currentSemester.value = turnsData[0].semester.nameZh;
        }
        currentPage.value = 'turns';
      }
    } catch (e) {
      console.warn('doLogin failed', e);
    }
  }

  async function enterTurns(stu) {
    currentStudent.value = stu;
    const data = await loadJSON('open-turns.json');
    if (data) {
      turns.value = data;
      if (data.length > 0) currentSemester.value = data[0].semester.nameZh;
    }
    currentPage.value = 'turns';
  }

  // Turn helpers
  function turnStatusText(turn) {
    const map = {
      'SELECT_AND_DROP': '可选可退', 'SELECT_ONLY': '可选不可退',
      'DROP_ONLY': '可退不可选', 'PREVIEW': '预览期',
      'NOT_START': '未开始', 'ENDED': '已结束'
    };
    return map[turn.status] || turn.status;
  }

  function turnStatusType(turn) {
    const map = {
      'SELECT_AND_DROP': 'success', 'SELECT_ONLY': '',
      'DROP_ONLY': 'warning', 'PREVIEW': 'info',
      'NOT_START': 'info', 'ENDED': 'danger'
    };
    return map[turn.status] || 'info';
  }

  return {
    currentPage, students, currentStudent, turns, currentTurn, currentSemester,
    loginForm, loginRules, loginFormRef,
    handleLogin, enterTurns,
    turnStatusText, turnStatusType,
  };
}
