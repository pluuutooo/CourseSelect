# ECNU 选课系统 Mock 数据索引

> 所有数据从前端 JS 代码反推而来，字段名和结构与真实 API 一致。
> 后端基地址：`/api/v1/student/course-select`

## 文件 → 接口对照表

### 认证 & 学生信息
| 文件 | 对应接口 | 说明 |
|------|---------|------|
| `login.json` | `POST /login` 或 `POST /evaluation/token-check` | 登录/SSO返回 |
| `students.json` | `GET /students` | 当前登录学生信息 |
| `getCurrentDateTime.json` | `GET /getCurrentDateTime` | 服务器时间（倒计时用） |

### 选课轮次
| 文件 | 对应接口 | 说明 |
|------|---------|------|
| `open-turns.json` | `GET /open-turns/{studentId}` | 当前开放的选课轮次列表 |

### 选课页面初始化
| 文件 | 对应接口 | 说明 |
|------|---------|------|
| `select-options.json` | `GET /{studentId}/turn/{turnId}/select` | 进入选课页面的全局配置（轮次信息、Tab开关等） |
| `query-condition.json` | `GET /query-condition/{turnId}` | 筛选条件（校区、院系、年级等下拉框选项） |
| `timetable-layout.json` | `GET /timetable-layout/{turnId}` | 课表布局（星期几 × 第几节） |

### 培养方案
| 文件 | 对应接口 | 说明 |
|------|---------|------|
| `major-plan.json` | `GET /major-plan/{turnId}/{studentId}` | 培养方案课程树 |
| `program-completion.json` | `GET /{studentId}/program-completion` | 培养方案完成情况统计 |

### 课程查询
| 文件 | 对应接口 | 说明 |
|------|---------|------|
| `query-lesson.json` | `POST /query-lesson/{studentId}/{turnId}` | **核心：课程/教学班列表**（含分页） |
| `selected-lessons.json` | `GET /selected-lessons/{turnId}/{studentId}` | 已选课程列表 |
| `std-count.json` | `POST /std-count` | 各教学班已选人数 |
| `count-info.json` | `GET /count-info?lessonId=X` | 单个教学班人数详情弹窗 |
| `status.json` | `GET /status/{turnId}/{studentId}` | 学分/门数限制状态 |
| `virtual-cost.json` | `GET /virtual-cost/{turnId}/{studentId}` | 意愿值余额 |

### 选课/退课流程
| 文件 | 对应接口 | 说明 |
|------|---------|------|
| `add-predicate-success.json` | `POST /add-predicate` → `GET /predicate-response` | 选课校验通过 |
| `add-predicate-conflict.json` | 同上 | 校验发现时间冲突（ATTEND=需免听） |
| `add-predicate-full.json` | 同上 | 校验失败——人数已满 |
| `add-drop-response-select-success.json` | `POST /add-request` → `GET /add-drop-response` | 选课成功 |
| `add-drop-response-select-fail.json` | 同上 | 选课失败（如学分超限） |
| `add-drop-response-drop-success.json` | `POST /drop-request` → `GET /add-drop-response` | 退课成功 |

## 选课完整流程

```
用户点击"选课"
    │
    ▼
POST /add-predicate          ← 提交校验请求，返回 requestId
    │
    ▼
GET /predicate-response/{studentId}/{requestId}   ← 轮询（最多10次，间隔2秒）
    │
    ├── messages[lessonId] = null     → 校验通过
    ├── messages[lessonId] = "ATTEND" → 时间冲突，询问免听
    └── messages[lessonId] = 错误信息  → 直接展示错误，流程终止
    │
    ▼ (校验通过后)
POST /add-request             ← 正式提交选课，返回 requestId
    │
    ▼
GET /add-drop-response/{studentId}/{requestId}    ← 轮询（最多10次，间隔2秒）
    │
    ├── success = true  → 选课成功，刷新页面
    └── success = false → 展示 errorMessage
```

## 注意事项

1. 所有接口响应的 `result` 字段：`false` 表示成功，`true` 表示系统错误
2. `pinned: true` 表示课程已正式选中；`pinned: false` 在 `WAIT_SCREEN` 模式下表示"待筛选"
3. `notPinnedName` 取值：`WAIT_SCREEN`（预选轮，待筛选）或 `WAIT_CONFIRM`（需确认轮）
4. `stdCount` 是当前已选人数，`limitCount` 是人数上限
5. `schedules` 数组中的 `weekday` 取 1-7（周一到周日），`startTime`/`entTime` 是节次编号
