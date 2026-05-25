const calendarColumns = ['Thu', 'Fri', 'Sat', 'Sun'];
const calendarRows = [
  { rail: '', days: ['3', '4', '5', '6'] },
  { rail: '', days: ['10', '11', '12', '13'] },
  { rail: '', days: ['17', '18', '19', '20'] },
];

const calendarBlocks = {
  '3': [
    { label: 'YouTube video edits', tone: 'pink' },
    { label: 'Read for 1 hour', tone: 'cream' },
    { label: 'Perform a second pass', tone: 'mint' },
    { label: 'Buy new resistance band', tone: 'sky' },
  ],
  '4': [
    { label: 'Check & reply tickets', tone: 'pink' },
    { label: 'Update images', tone: 'lavender' },
    { label: 'Attend remote sync', tone: 'pink' },
    { label: 'Read for 1 hour', tone: 'cream' },
  ],
  '5': [
    { label: 'Start sleep tracker', tone: 'cream' },
    { label: 'Have call with planner', tone: 'leaf' },
    { label: 'Do laundry', tone: 'mint' },
  ],
  '6': [
    { label: 'Have backyard clean', tone: 'mint' },
    { label: 'Clean kitchen', tone: 'sky' },
  ],
  '10': [
    { label: 'Do face mask', tone: 'cream' },
    { label: 'Prepare promotion notes', tone: 'pink' },
    { label: 'Call grandparents', tone: 'pink' },
    { label: 'Stretch before bed', tone: 'mint' },
  ],
  '11': [
    { label: 'Summarize social media content', tone: 'pink', taskId: 'task-social-summary' },
    { label: 'Organize this week’s user interviews', tone: 'pink', taskId: 'task-user-interviews' },
    { label: 'Change bedsheets', tone: 'mint' },
    { label: 'Take Mom to eye check-up', tone: 'cream' },
  ],
  '12': [
    { label: 'Restock home basics', tone: 'leaf' },
  ],
  '13': [
    { label: 'Try a pilates routine', tone: 'mint' },
  ],
};

const templateTasks = [
  {
    id: 'task-social-summary',
    title: 'Summarize social media content',
    section: 'today',
    priority: 'high',
    project: 'Content',
    note: '',
    status: 'today',
    schedule: { dayLabel: 'Fri 11', slotLabel: 'all-day' },
  },
  {
    id: 'task-user-interviews',
    title: 'Organize this week’s user interviews',
    section: 'today',
    priority: 'high',
    project: 'Meetings',
    note: '',
    status: 'today',
    schedule: { dayLabel: 'Fri 11', slotLabel: 'all-day' },
  },
  {
    id: 'task-youtube-video',
    title: 'Produce this week’s YouTube video',
    section: 'inbox',
    priority: 'medium',
    project: 'Content',
    note: '',
    status: 'inbox',
    schedule: null,
  },
];

function cloneTasks(tasks) {
  return tasks.map((task) => ({
    ...task,
    schedule: task.schedule ? { ...task.schedule } : null,
    done: Boolean(task.done),
  }));
}

export function createTickTickState(overrides = {}) {
  return {
    selectedTaskId: 'task-social-summary',
    captureValue: '',
    tasks: cloneTasks(templateTasks),
    ...overrides,
  };
}

export function countTasks(tasks) {
  return {
    today: tasks.filter((task) => !task.done && task.status === 'today').length,
    inbox: tasks.filter((task) => !task.done && task.status === 'inbox').length,
    done: tasks.filter((task) => task.done).length,
  };
}

export function captureTask(state, text) {
  const title = String(text || '').trim();
  if (!title) return null;
  const task = {
    id: `task-${Math.random().toString(16).slice(2, 10)}`,
    title,
    section: 'inbox',
    priority: 'medium',
    project: 'Inbox',
    note: '',
    status: 'inbox',
    schedule: null,
    done: false,
  };
  state.tasks.unshift(task);
  state.selectedTaskId = task.id;
  state.captureValue = '';
  return task;
}

export function scheduleTask(state, taskId, slotLabel = 'all-day', dayLabel = 'Fri 11') {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return state;
  task.status = 'today';
  task.section = 'today';
  task.schedule = { dayLabel, slotLabel };
  return state;
}

export function assignBucket(state, taskId, bucket) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return state;
  if (bucket === 'today') {
    scheduleTask(state, taskId);
    return state;
  }
  task.status = bucket;
  task.section = 'inbox';
  task.schedule = null;
  return state;
}

function selectTask(state, taskId) {
  state.selectedTaskId = taskId;
  return state;
}

function toggleDone(state, taskId) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return state;
  task.done = !task.done;
  return state;
}

function renderCalendar(state) {
  const root = document.querySelector('[data-calendar-grid]');
  if (!root) return;

  root.innerHTML = '';
  for (const row of calendarRows) {
    const rail = document.createElement('div');
    rail.className = 'time-rail';
    rail.textContent = row.rail;
    root.appendChild(rail);

    row.days.forEach((day, index) => {
      const cell = document.createElement('div');
      cell.className = `day-cell ${index >= 2 ? 'weekend' : ''}`;
      if (Object.values(calendarBlocks).flat().some((block) => block.taskId === state.selectedTaskId && day === '11')) {
        cell.classList.toggle('active-task', day === '11');
      }

      const number = document.createElement('div');
      number.className = `day-number ${day === '11' ? 'active' : ''}`;
      number.textContent = day;
      cell.appendChild(number);

      (calendarBlocks[day] || []).forEach((block) => {
        const item = document.createElement('div');
        item.className = `calendar-block ${block.tone}`;
        if (block.taskId && block.taskId === state.selectedTaskId) {
          item.classList.add('selected');
        }
        item.textContent = block.label;
        if (block.taskId) {
          item.addEventListener('click', () => {
            selectTask(state, block.taskId);
            renderApp(state);
          });
        }
        cell.appendChild(item);
      });

      root.appendChild(cell);
    });
  }
}

function renderTaskRow(task, state) {
  const row = document.createElement('article');
  row.className = `task-row ${task.id === state.selectedTaskId ? 'selected' : ''}`;
  row.addEventListener('click', () => {
    selectTask(state, task.id);
    renderApp(state);
  });

  const main = document.createElement('div');
  main.className = 'task-main';

  const check = document.createElement('button');
  check.className = 'check';
  check.type = 'button';
  check.setAttribute('aria-label', `Toggle ${task.title}`);
  check.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleDone(state, task.id);
    renderApp(state);
  });

  const title = document.createElement('div');
  title.className = `task-title ${task.done ? 'is-done' : ''}`;
  title.textContent = task.title;

  main.append(check, title);
  row.appendChild(main);

  const meta = document.createElement('div');
  meta.className = 'task-meta';
  meta.innerHTML = [
    `<span>• ${task.project}</span>`,
    task.note ? `<span>${task.note}</span>` : '',
    task.schedule ? '<span class="today-pill">Today</span>' : '',
  ].filter(Boolean).join('');
  row.appendChild(meta);

  return row;
}

function renderTasks(state) {
  const todayRoot = document.querySelector('[data-today-list]');
  const inboxRoot = document.querySelector('[data-inbox-list]');
  if (!todayRoot || !inboxRoot) return;

  todayRoot.innerHTML = '';
  inboxRoot.innerHTML = '';

  state.tasks.filter((task) => task.status === 'today' && !task.done).forEach((task) => {
    todayRoot.appendChild(renderTaskRow(task, state));
  });

  state.tasks.filter((task) => task.status === 'inbox' && !task.done).forEach((task) => {
    inboxRoot.appendChild(renderTaskRow(task, state));
  });

  const counts = countTasks(state.tasks);
  document.querySelector('[data-count="today"]').textContent = String(counts.today);
  document.querySelector('[data-count="inbox"]').textContent = String(counts.inbox);
}

function bindCapture(state) {
  const form = document.querySelector('#capture-form');
  const input = document.querySelector('#quick-capture');
  if (!form || !input) return;

  input.value = state.captureValue;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    captureTask(state, input.value);
    renderApp(state);
  }, { once: true });

  input.addEventListener('input', (event) => {
    state.captureValue = event.currentTarget.value;
  }, { once: true });
}

function renderApp(state) {
  renderCalendar(state);
  renderTasks(state);
  bindCapture(state);
}

if (typeof document !== 'undefined') {
  renderApp(createTickTickState());
}
