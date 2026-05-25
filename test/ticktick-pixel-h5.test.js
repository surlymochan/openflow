import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assignBucket,
  captureTask,
  createTickTickState,
  countTasks,
  scheduleTask,
} from './fixtures/ticktick-pixel-h5/app/app.js';

const PROJECT_ROOT = process.cwd();
const FIXTURE_ROOT = resolve(PROJECT_ROOT, 'test', 'fixtures', 'ticktick-pixel-h5');
const APP_ROOT = resolve(FIXTURE_ROOT, 'app');

describe('ticktick-pixel-h5 implementation', () => {
  test('change artifacts lock the current TickTick reconstruction contract', () => {
    const corpsInput = JSON.parse(readFileSync(resolve(FIXTURE_ROOT, 'corps-input.json'), 'utf8'));
    const plan = readFileSync(resolve(FIXTURE_ROOT, 'plan.md'), 'utf8');

    assert.equal(corpsInput.competitor_product, 'TickTick desktop');
    assert.deepEqual(corpsInput.required_modules, ['calendar', 'list']);
    assert.match(corpsInput.capture_url, /http:\/\/127\.0\.0\.1:4176\/test\/fixtures\/ticktick-pixel-h5\/app\/index\.html/);
    assert.match(plan, /desktop_month_list_split/);
    assert.match(plan, /module scripts and real task content are loaded during benchmark capture/);
  });

  test('static app keeps inbox capture separate from scheduling', () => {
    const state = createTickTickState();
    const initialCounts = countTasks(state.tasks);
    const newTask = captureTask(state, 'Write launch brief');

    assert.ok(newTask);
    assert.equal(newTask.status, 'inbox');
    assert.equal(newTask.schedule, null);
    assert.equal(state.tasks[0].title, 'Write launch brief');
    assert.equal(state.tasks[0].schedule, null);
    assert.equal(initialCounts.inbox + 1, countTasks(state.tasks).inbox);
  });

  test('tasks only enter the calendar after an explicit schedule action', () => {
    const state = createTickTickState();
    const task = state.tasks.find((entry) => entry.id === 'task-study-notes');

    assert.equal(task, undefined);

    const inboxTask = state.tasks.find((entry) => entry.id === 'task-youtube-video');
    assert.ok(inboxTask);
    assert.equal(inboxTask.schedule, null);

    scheduleTask(state, inboxTask.id, 'all-day', 'Fri 11');
    assert.equal(inboxTask.status, 'today');
    assert.deepEqual(inboxTask.schedule, { dayLabel: 'Fri 11', slotLabel: 'all-day' });

    assignBucket(state, inboxTask.id, 'inbox');
    assert.equal(inboxTask.status, 'inbox');
    assert.equal(inboxTask.schedule, null);
  });

  test('implementation files exist and describe the expected calendar-plus-list workbench', () => {
    const html = readFileSync(resolve(APP_ROOT, 'index.html'), 'utf8');
    const css = readFileSync(resolve(APP_ROOT, 'styles.css'), 'utf8');
    const js = readFileSync(resolve(APP_ROOT, 'app.js'), 'utf8');

    assert.match(html, /data-panel="calendar"/);
    assert.match(html, /data-panel="list"/);
    assert.match(html, /calendar-grid/);
    assert.match(css, /grid-template-columns: minmax\(560px, 1fr\) 430px/);
    assert.match(js, /captureTask/);
    assert.match(js, /scheduleTask/);
    assert.match(js, /scheduleTask\(state, taskId, slotLabel = 'all-day', dayLabel = 'Fri 11'\)/);
  });
});
