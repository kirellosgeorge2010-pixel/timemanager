/**
 * StudyFlow: Grade 11 Adaptive Study Planner
 * Vanilla JavaScript (ES6+) - Clean, Modular, Zero Dependencies
 *
 * Architecture:
 * - StorageEngine: Safe versioned localStorage persistence, corruption handling, export/import
 * - State: Single reactive source of truth for tasks, commitments, plans, settings
 * - SchedulerEngine: Dynamic gap calculation, break insertion, buffer management, priority sorting
 * - UI: DOM rendering, event handling, toasts, modals, responsive navigation
 */

(function () {
  'use strict';

  // =========================================================================
  // CONSTANTS & INITIAL DATA
  // =========================================================================

  const STORAGE_KEY = 'studyflow_v1_store';
  const STORAGE_VERSION = 1;

  // Grade 11 Starter Commitments Template
  const STARTER_COMMITMENTS = [
    {
      id: 'comm_school_sun_thu',
      title: 'School Hours',
      category: 'school',
      recurrence: 'recurring',
      daysOfWeek: [0, 1, 2, 3, 4], // Sun - Thu
      startTime: '07:30',
      endTime: '14:30',
      notes: 'Grade 11 regular school day'
    },
    {
      id: 'comm_arabic_lesson',
      title: 'Arabic Lesson',
      category: 'lesson',
      recurrence: 'recurring',
      daysOfWeek: [1, 3], // Mon, Wed
      startTime: '16:00',
      endTime: '17:30',
      notes: 'Weekly curriculum review & grammar'
    },
    {
      id: 'comm_math_lesson',
      title: 'Math Advanced Lesson',
      category: 'lesson',
      recurrence: 'recurring',
      daysOfWeek: [2, 4], // Tue, Thu
      startTime: '17:00',
      endTime: '18:30',
      notes: 'Calculus & Trigonometry tutor session'
    },
    {
      id: 'comm_sat_lesson',
      title: 'SAT Weekend Prep Session',
      category: 'sat',
      recurrence: 'recurring',
      daysOfWeek: [6], // Sat
      startTime: '10:00',
      endTime: '12:30',
      notes: 'Timed practice tests & Math/English review'
    },
    {
      id: 'comm_dinner_break',
      title: 'Family Dinner & Rest',
      category: 'meal',
      recurrence: 'recurring',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '19:30',
      endTime: '20:15',
      notes: 'Evening meal break'
    }
  ];

  // Grade 11 Starter Tasks Template
  const STARTER_TASKS = [
    {
      id: 'task_sample_math_hw',
      title: 'Calculus Exercise 4.2 (Problems 1-15)',
      subject: 'Math',
      type: 'Homework',
      durationMinutes: 45,
      dueDate: getRelativeDateString(1),
      dueTime: '23:59',
      priority: 'High',
      status: 'Pending',
      notes: 'Chain rule and implicit differentiation problems.',
      preferredStudyDate: getRelativeDateString(0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    },
    {
      id: 'task_sample_sat_prep',
      title: 'SAT Math Practice Module: Heart of Algebra',
      subject: 'SAT',
      type: 'SAT Math',
      durationMinutes: 50,
      dueDate: getRelativeDateString(3),
      dueTime: '18:00',
      priority: 'Urgent',
      status: 'Pending',
      notes: 'Complete test section and analyze incorrect answers.',
      preferredStudyDate: getRelativeDateString(0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    },
    {
      id: 'task_sample_arabic_gp',
      title: 'Arabic GP Weekly Exam Preparation',
      subject: 'Arabic',
      type: 'GP Weekly Exam Preparation',
      durationMinutes: 60,
      dueDate: getRelativeDateString(2),
      dueTime: '08:00',
      priority: 'Urgent',
      status: 'Pending',
      notes: 'Review rhetoric questions and memorization passages.',
      preferredStudyDate: getRelativeDateString(1),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    },
    {
      id: 'task_sample_english_essay',
      title: 'English Literary Analysis Rough Draft',
      subject: 'English',
      type: 'Homework',
      durationMinutes: 40,
      dueDate: getRelativeDateString(4),
      dueTime: '23:59',
      priority: 'Medium',
      status: 'Pending',
      notes: 'Write 3 body paragraphs on thematic motifs.',
      preferredStudyDate: getRelativeDateString(2),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    }
  ];

  const DEFAULT_SETTINGS = {
    sleepStart: '23:00',
    sleepEnd: '06:30',
    bufferMinutes: 30,
    breakDurationMinutes: 10,
    maxBlockDurationMinutes: 50,
    studyStartTime: '15:30'
  };

  // =========================================================================
  // STORAGE & PERSISTENCE ENGINE
  // =========================================================================

  const Storage = {
    isAvailable() {
      try {
        const testKey = '__sf_test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
      } catch (e) {
        return false;
      }
    },

    load() {
      if (!this.isAvailable()) {
        UI.toast('Local storage is not supported or disabled in this browser. Changes will not persist after refresh.', 'danger', 8000);
        return this.createInitialData();
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          // Fresh install
          const initial = this.createInitialData();
          this.save(initial, false);
          return initial;
        }

        const parsed = JSON.parse(raw);

        // Validation & Schema Migration
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid data root object');
        }

        return {
          version: STORAGE_VERSION,
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
          commitments: Array.isArray(parsed.commitments) ? parsed.commitments : STARTER_COMMITMENTS,
          plans: parsed.plans && typeof parsed.plans === 'object' ? parsed.plans : {},
          settings: Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {}),
          lastSavedAt: parsed.lastSavedAt || new Date().toISOString()
        };
      } catch (err) {
        console.error('StudyFlow storage parse error:', err);
        // CRITICAL REQUIREMENT: Never silently erase corrupted data!
        try {
          const rawCorrupted = localStorage.getItem(STORAGE_KEY);
          if (rawCorrupted) {
            const backupKey = `studyflow_corrupt_backup_${Date.now()}`;
            localStorage.setItem(backupKey, rawCorrupted);
            UI.toast(`Storage error encountered! Raw backup saved to key: "${backupKey}". Safe mode initialized.`, 'danger', 10000);
          }
        } catch (backupErr) {
          console.error('Failed to backup corrupted string:', backupErr);
        }

        return this.createInitialData();
      }
    },

    save(data, showNotification = true) {
      if (!this.isAvailable()) {
        UI.toast('Storage unavailable: Cannot save changes to browser.', 'danger');
        return false;
      }

      try {
        data.lastSavedAt = new Date().toISOString();
        const serialized = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, serialized);
        UI.updateStorageMeta(data);
        if (showNotification) {
          UI.toast('Changes saved to browser storage.', 'success', 2000);
        }
        return true;
      } catch (err) {
        console.error('StudyFlow save error:', err);
        UI.toast('Failed to save data! Storage quota may be full or blocked.', 'danger', 7000);
        return false;
      }
    },

    createInitialData() {
      return {
        version: STORAGE_VERSION,
        tasks: [...STARTER_TASKS],
        commitments: [...STARTER_COMMITMENTS],
        plans: {},
        settings: { ...DEFAULT_SETTINGS },
        lastSavedAt: new Date().toISOString()
      };
    },

    exportJSON(data) {
      try {
        const payload = JSON.stringify(data, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = getTodayDateString();
        a.href = url;
        a.download = `studyflow-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        UI.toast('Backup successfully downloaded.', 'success');
      } catch (e) {
        console.error('Export error:', e);
        UI.toast('Failed to generate export file.', 'danger');
      }
    },

    validateImport(jsonData) {
      if (!jsonData || typeof jsonData !== 'object') {
        return { valid: false, message: 'File is not a valid JSON object.' };
      }
      if (!Array.isArray(jsonData.tasks)) {
        return { valid: false, message: 'Invalid backup: "tasks" array missing.' };
      }
      if (!Array.isArray(jsonData.commitments)) {
        return { valid: false, message: 'Invalid backup: "commitments" array missing.' };
      }
      return { valid: true };
    }
  };

  // =========================================================================
  // STATE MANAGEMENT
  // =========================================================================

  const State = {
    data: Storage.load(),
    currentTab: 'dashboard',
    selectedPlannerDate: getTodayDateString(),
    commitmentFilterDay: 'all',
    taskFilters: {
      search: '',
      status: 'pending',
      subject: 'all',
      type: 'all',
      priority: 'all',
      sort: 'dueDate-asc'
    },
    tempProposedPlan: null,

    save(notify = true) {
      Storage.save(this.data, notify);
    },

    // Task Actions
    addTask(task) {
      this.data.tasks.unshift(task);
      this.save(true);
      UI.renderAll();
    },

    updateTask(id, updatedFields) {
      const idx = this.data.tasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        this.data.tasks[idx] = {
          ...this.data.tasks[idx],
          ...updatedFields,
          updatedAt: new Date().toISOString()
        };
        this.save(true);
        UI.renderAll();
      }
    },

    toggleTaskStatus(id) {
      const task = this.data.tasks.find(t => t.id === id);
      if (task) {
        const isCompleted = task.status === 'Completed';
        task.status = isCompleted ? 'Pending' : 'Completed';
        task.completedAt = isCompleted ? null : new Date().toISOString();
        task.updatedAt = new Date().toISOString();

        // Update block if present in current plan
        const todayPlan = this.data.plans[getTodayDateString()];
        if (todayPlan && todayPlan.blocks) {
          todayPlan.blocks.forEach(b => {
            if (b.taskId === id) {
              b.completed = (task.status === 'Completed');
            }
          });
        }

        this.save(true);
        UI.renderAll();
      }
    },

    deleteTask(id) {
      const idx = this.data.tasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        const title = this.data.tasks[idx].title;
        UI.confirm(`Are you sure you want to delete task "${title}"?`, () => {
          this.data.tasks.splice(idx, 1);
          // Remove from plans
          Object.values(this.data.plans).forEach(plan => {
            if (plan.blocks) {
              plan.blocks = plan.blocks.filter(b => b.taskId !== id);
            }
          });
          this.save(true);
          UI.renderAll();
          UI.toast(`Task "${title}" deleted.`, 'info');
        });
      }
    },

    // Commitment Actions
    addCommitment(commitment) {
      this.data.commitments.push(commitment);
      this.save(true);
      UI.renderAll();
    },

    updateCommitment(id, updatedFields) {
      const idx = this.data.commitments.findIndex(c => c.id === id);
      if (idx !== -1) {
        this.data.commitments[idx] = { ...this.data.commitments[idx], ...updatedFields };
        this.save(true);
        UI.renderAll();
      }
    },

    deleteCommitment(id) {
      const idx = this.data.commitments.findIndex(c => c.id === id);
      if (idx !== -1) {
        const title = this.data.commitments[idx].title;
        UI.confirm(`Remove commitment "${title}"?`, () => {
          this.data.commitments.splice(idx, 1);
          this.save(true);
          UI.renderAll();
          UI.toast(`Commitment "${title}" removed.`, 'info');
        });
      }
    },

    // Daily Plan Actions
    saveDailyPlan(dateStr, planObj) {
      this.data.plans[dateStr] = planObj;
      this.save(true);
      UI.renderAll();
    },

    clearDailyPlan(dateStr) {
      if (this.data.plans[dateStr]) {
        UI.confirm(`Clear the daily plan for ${dateStr}? Your tasks will remain intact.`, () => {
          delete this.data.plans[dateStr];
          this.save(true);
          UI.renderAll();
          UI.toast(`Plan for ${dateStr} cleared.`, 'info');
        });
      }
    },

    toggleBlockCompleted(dateStr, blockId) {
      const plan = this.data.plans[dateStr];
      if (!plan || !plan.blocks) return;
      const block = plan.blocks.find(b => b.id === blockId);
      if (block) {
        block.completed = !block.completed;
        if (block.taskId) {
          const task = this.data.tasks.find(t => t.id === block.taskId);
          if (task) {
            task.status = block.completed ? 'Completed' : 'Pending';
            task.completedAt = block.completed ? new Date().toISOString() : null;
          }
        }
        this.save(true);
        UI.renderAll();
      }
    },

    moveBlock(dateStr, blockId, direction) {
      const plan = this.data.plans[dateStr];
      if (!plan || !plan.blocks) return;
      const idx = plan.blocks.findIndex(b => b.id === blockId);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= plan.blocks.length) return;

      const temp = plan.blocks[idx];
      plan.blocks[idx] = plan.blocks[targetIdx];
      plan.blocks[targetIdx] = temp;

      this.save(false);
      UI.renderPlanner();
      UI.renderDashboard();
    },

    removeBlock(dateStr, blockId) {
      const plan = this.data.plans[dateStr];
      if (!plan || !plan.blocks) return;
      plan.blocks = plan.blocks.filter(b => b.id !== blockId);
      this.save(true);
      UI.renderPlanner();
      UI.renderDashboard();
    },

    updateBlock(dateStr, blockId, title, startTime, endTime, type) {
      const plan = this.data.plans[dateStr];
      if (!plan || !plan.blocks) return;
      const block = plan.blocks.find(b => b.id === blockId);
      if (block) {
        block.title = title;
        block.startTime = startTime;
        block.endTime = endTime;
        block.type = type;
        const dur = timeStringToMinutes(endTime) - timeStringToMinutes(startTime);
        block.durationMinutes = dur > 0 ? dur : block.durationMinutes;
        this.save(true);
        UI.renderPlanner();
        UI.renderDashboard();
      }
    }
  };

  // =========================================================================
  // SCHEDULING ENGINE (REALISTIC ALGORITHM)
  // =========================================================================

  const SchedulerEngine = {
    /**
     * Compute fixed commitments that fall on target date
     */
    getCommitmentsForDate(dateStr, commitmentsList) {
      const targetDate = parseDateString(dateStr);
      const dayOfWeek = targetDate.getDay(); // 0 = Sun, 1 = Mon...

      return commitmentsList.filter(c => {
        if (c.recurrence === 'recurring') {
          return Array.isArray(c.daysOfWeek) && c.daysOfWeek.includes(dayOfWeek);
        } else if (c.recurrence === 'one-time') {
          return c.date === dateStr;
        }
        return false;
      });
    },

    /**
     * Convert time strings (HH:MM) to interval ranges in minutes
     */
    buildBusyIntervals(dateStr, commitmentsList, sleepStart, sleepEnd) {
      const dayCommitments = this.getCommitmentsForDate(dateStr, commitmentsList);
      const busy = [];

      // Sleep interval: e.g., 23:00 to 06:30
      // If sleep crosses midnight:
      const sleepStartMins = timeStringToMinutes(sleepStart);
      const sleepEndMins = timeStringToMinutes(sleepEnd);

      if (sleepStartMins > sleepEndMins) {
        // Night interval: e.g. 23:00 (1380) to 24:00 (1440)
        busy.push({
          start: sleepStartMins,
          end: 1440,
          title: 'Sleep Hours',
          type: 'sleep',
          isFixed: true
        });
        // Morning interval: 00:00 (0) to sleepEndMins (390)
        busy.push({
          start: 0,
          end: sleepEndMins,
          title: 'Sleep Hours',
          type: 'sleep',
          isFixed: true
        });
      } else {
        busy.push({
          start: sleepStartMins,
          end: sleepEndMins,
          title: 'Sleep Hours',
          type: 'sleep',
          isFixed: true
        });
      }

      // Add user fixed commitments
      dayCommitments.forEach(c => {
        const start = timeStringToMinutes(c.startTime);
        const end = timeStringToMinutes(c.endTime);
        if (end > start) {
          busy.push({
            start,
            end,
            title: c.title,
            type: c.category || 'fixed',
            commitmentId: c.id,
            isFixed: true
          });
        }
      });

      // Sort busy intervals by start time
      busy.sort((a, b) => a.start - b.start);
      return busy;
    },

    /**
     * Compute free time gaps between a planning start window and end window (sleep start)
     */
    calculateFreeSlots(startWindowMins, endWindowMins, busyIntervals) {
      const freeSlots = [];
      let cursor = Math.max(0, startWindowMins);

      // Merge overlapping busy intervals
      const mergedBusy = [];
      busyIntervals.forEach(curr => {
        if (!mergedBusy.length) {
          mergedBusy.push({ ...curr });
        } else {
          const prev = mergedBusy[mergedBusy.length - 1];
          if (curr.start <= prev.end) {
            prev.end = Math.max(prev.end, curr.end);
          } else {
            mergedBusy.push({ ...curr });
          }
        }
      });

      mergedBusy.forEach(busy => {
        if (busy.end <= cursor) return;
        if (busy.start > cursor && busy.start < endWindowMins) {
          const gapEnd = Math.min(busy.start, endWindowMins);
          if (gapEnd - cursor >= 15) { // Minimum usable chunk is 15 minutes
            freeSlots.push({ start: cursor, end: gapEnd, duration: gapEnd - cursor });
          }
        }
        cursor = Math.max(cursor, busy.end);
      });

      if (cursor < endWindowMins && (endWindowMins - cursor) >= 15) {
        freeSlots.push({ start: cursor, end: endWindowMins, duration: endWindowMins - cursor });
      }

      return freeSlots;
    },

    /**
     * Sort tasks by Grade 11 realistic urgency:
     * 1. Overdue or Due Today
     * 2. Urgent Priority / Exam Prep (Quarter Exam, GP Weekly Exam)
     * 3. Preferred study date matches target
     * 4. High -> Medium -> Low
     */
    prioritizeTasks(tasksList, targetDateStr) {
      return [...tasksList].sort((a, b) => {
        const aIsDueToday = a.dueDate <= targetDateStr;
        const bIsDueToday = b.dueDate <= targetDateStr;
        if (aIsDueToday !== bIsDueToday) return aIsDueToday ? -1 : 1;

        const priorityScore = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
        const aP = priorityScore[a.priority] || 2;
        const bP = priorityScore[b.priority] || 2;

        const aExam = (a.type.includes('Exam') || a.type.includes('SAT')) ? 1 : 0;
        const bExam = (b.type.includes('Exam') || b.type.includes('SAT')) ? 1 : 0;

        if (aP + aExam !== bP + bExam) {
          return (bP + bExam) - (aP + aExam);
        }

        // Preferred study date
        const aPref = a.preferredStudyDate === targetDateStr ? 1 : 0;
        const bPref = b.preferredStudyDate === targetDateStr ? 1 : 0;
        if (aPref !== bPref) return bPref - aPref;

        // Due date ascending
        if (a.dueDate !== b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }

        return (a.durationMinutes || 45) - (b.durationMinutes || 45);
      });
    },

    /**
     * Core Algorithm: Generates schedule proposal
     */
    generatePlan({
      dateStr,
      startTimeStr,
      tasksToSchedule,
      commitments,
      settings,
      resumeFromMins = null
    }) {
      const sleepStartMins = timeStringToMinutes(settings.sleepStart || '23:00');
      const sleepEndMins = timeStringToMinutes(settings.sleepEnd || '06:30');
      const bufferMinutes = Number(settings.bufferMinutes) || 30;
      const breakMinutes = Number(settings.breakDurationMinutes) || 10;
      const maxBlockDuration = Number(settings.maxBlockDurationMinutes) || 50;

      let planStartMins = resumeFromMins !== null
        ? resumeFromMins
        : timeStringToMinutes(startTimeStr || settings.studyStartTime || '15:30');

      // Adjust if start is before wake up
      if (planStartMins < sleepEndMins) {
        planStartMins = sleepEndMins;
      }

      // 1. Gather busy intervals
      const busyIntervals = this.buildBusyIntervals(dateStr, commitments, settings.sleepStart, settings.sleepEnd);

      // 2. Calculate free slots between start and bedtime
      const freeSlots = this.calculateFreeSlots(planStartMins, sleepStartMins, busyIntervals);

      // 3. Sort tasks
      const sortedTasks = this.prioritizeTasks(tasksToSchedule, dateStr);

      const scheduleBlocks = [];
      const scheduledTaskIds = new Set();
      const unscheduledTasks = [];

      // Add fixed commitments occurring within the active study window to the timeline
      const dayCommitments = this.getCommitmentsForDate(dateStr, commitments);
      dayCommitments.forEach(c => {
        const cStart = timeStringToMinutes(c.startTime);
        const cEnd = timeStringToMinutes(c.endTime);
        if (cEnd > planStartMins && cStart < sleepStartMins) {
          scheduleBlocks.push({
            id: 'block_fixed_' + c.id,
            title: c.title,
            type: 'fixed',
            category: c.category,
            startTime: c.startTime,
            endTime: c.endTime,
            startMins: cStart,
            endMins: cEnd,
            durationMinutes: cEnd - cStart,
            isFixed: true,
            completed: false
          });
        }
      });

      // 4. Reserve buffer: Deduct bufferMinutes from the available time
      let totalFreeMins = freeSlots.reduce((acc, slot) => acc + slot.duration, 0);
      let effectiveBuffer = Math.min(bufferMinutes, Math.floor(totalFreeMins * 0.25)); // Buffer doesn't exceed 25% of day

      // Study task allocation
      let slotIndex = 0;
      let currentSlotOffset = 0;

      for (const task of sortedTasks) {
        let taskRemainingDuration = Number(task.durationMinutes) || 45;
        let taskScheduled = false;

        while (slotIndex < freeSlots.length && taskRemainingDuration > 0) {
          const slot = freeSlots[slotIndex];
          const slotAvailableMins = (slot.end - slot.start) - currentSlotOffset;

          // If less than 15 minutes left in this slot, advance to next
          if (slotAvailableMins < 15) {
            slotIndex++;
            currentSlotOffset = 0;
            continue;
          }

          // Allocate either full task or max block duration
          const chunkDuration = Math.min(taskRemainingDuration, maxBlockDuration, slotAvailableMins);

          const blockStartMins = slot.start + currentSlotOffset;
          const blockEndMins = blockStartMins + chunkDuration;

          scheduleBlocks.push({
            id: 'block_task_' + task.id + '_' + blockStartMins,
            taskId: task.id,
            title: task.title,
            subject: task.subject,
            taskType: task.type,
            type: 'study',
            startTime: minutesToTimeString(blockStartMins),
            endTime: minutesToTimeString(blockEndMins),
            startMins: blockStartMins,
            endMins: blockEndMins,
            durationMinutes: chunkDuration,
            isFixed: false,
            completed: task.status === 'Completed'
          });

          taskRemainingDuration -= chunkDuration;
          currentSlotOffset += chunkDuration;
          taskScheduled = true;
          scheduledTaskIds.add(task.id);

          // Add break if there's still room in the slot
          const remainingInSlot = (slot.end - slot.start) - currentSlotOffset;
          if (remainingInSlot >= breakMinutes && (taskRemainingDuration > 0 || slotIndex < freeSlots.length)) {
            const breakStartMins = slot.start + currentSlotOffset;
            const breakEndMins = breakStartMins + breakMinutes;

            scheduleBlocks.push({
              id: 'block_break_' + breakStartMins,
              title: 'Short Break / Reset',
              type: 'break',
              startTime: minutesToTimeString(breakStartMins),
              endTime: minutesToTimeString(breakEndMins),
              startMins: breakStartMins,
              endMins: breakEndMins,
              durationMinutes: breakMinutes,
              isBreak: true,
              completed: false
            });

            currentSlotOffset += breakMinutes;
          } else if (remainingInSlot < 15) {
            slotIndex++;
            currentSlotOffset = 0;
          }
        }

        if (!taskScheduled || taskRemainingDuration > 0) {
          unscheduledTasks.push({
            ...task,
            reason: 'Insufficient study time before sleep hours or between commitments.'
          });
        }
      }

      // Add emergency buffer block at the end of planned sessions if space permits
      if (effectiveBuffer > 0 && slotIndex < freeSlots.length) {
        const slot = freeSlots[slotIndex];
        const slotAvailableMins = (slot.end - slot.start) - currentSlotOffset;
        const bufDuration = Math.min(effectiveBuffer, slotAvailableMins);

        if (bufDuration >= 15) {
          const bufStart = slot.start + currentSlotOffset;
          const bufEnd = bufStart + bufDuration;

          scheduleBlocks.push({
            id: 'block_buffer_' + bufStart,
            title: 'Unexpected HW Buffer & Flex Time',
            type: 'buffer',
            startTime: minutesToTimeString(bufStart),
            endTime: minutesToTimeString(bufEnd),
            startMins: bufStart,
            endMins: bufEnd,
            durationMinutes: bufDuration,
            isBuffer: true,
            completed: false
          });
        }
      }

      // Sort all final blocks chronologically
      scheduleBlocks.sort((a, b) => a.startMins - b.startMins);

      return {
        date: dateStr,
        generatedAt: new Date().toISOString(),
        blocks: scheduleBlocks,
        unscheduledTasks: unscheduledTasks,
        totalStudyMins: scheduleBlocks.filter(b => b.type === 'study').reduce((a, b) => a + b.durationMinutes, 0),
        totalFixedMins: scheduleBlocks.filter(b => b.type === 'fixed').reduce((a, b) => a + b.durationMinutes, 0),
        totalBreakMins: scheduleBlocks.filter(b => b.type === 'break' || b.type === 'buffer').reduce((a, b) => a + b.durationMinutes, 0)
      };
    },

    /**
     * Reschedule remaining tasks from current time
     * Preserves completed blocks and past fixed commitments
     */
    rescheduleRemaining({ dateStr, currentPlan, allTasks, commitments, settings }) {
      const now = new Date();
      // Round current time up to nearest 5 minutes
      const currentMins = now.getHours() * 60 + Math.ceil(now.getMinutes() / 5) * 5;

      const preservedBlocks = [];
      const completedTaskIds = new Set();

      if (currentPlan && Array.isArray(currentPlan.blocks)) {
        currentPlan.blocks.forEach(b => {
          // Preserve blocks that completed OR started before current time
          if (b.completed || b.startMins < currentMins) {
            preservedBlocks.push(b);
            if (b.taskId) completedTaskIds.add(b.taskId);
          }
        });
      }

      // Candidate tasks are all active incomplete tasks that haven't been completed yet
      const candidateTasks = allTasks.filter(t => t.status !== 'Completed' && !completedTaskIds.has(t.id));

      // Calculate proposal starting from currentMins
      const proposal = this.generatePlan({
        dateStr,
        startTimeStr: minutesToTimeString(currentMins),
        tasksToSchedule: candidateTasks,
        commitments,
        settings,
        resumeFromMins: currentMins
      });

      // Combine preserved blocks with new future blocks
      const futureBlocks = proposal.blocks.filter(b => b.startMins >= currentMins);
      const combinedBlocks = [...preservedBlocks, ...futureBlocks].sort((a, b) => a.startMins - b.startMins);

      return {
        date: dateStr,
        generatedAt: new Date().toISOString(),
        blocks: combinedBlocks,
        unscheduledTasks: proposal.unscheduledTasks,
        totalStudyMins: combinedBlocks.filter(b => b.type === 'study').reduce((a, b) => a + b.durationMinutes, 0),
        totalFixedMins: combinedBlocks.filter(b => b.type === 'fixed').reduce((a, b) => a + b.durationMinutes, 0),
        totalBreakMins: combinedBlocks.filter(b => b.type === 'break' || b.type === 'buffer').reduce((a, b) => a + b.durationMinutes, 0)
      };
    }
  };

  // =========================================================================
  // USER INTERFACE & RENDERING CONTROLLER
  // =========================================================================

  const UI = {
    init() {
      this.bindEvents();
      this.renderHeaderDate();
      this.renderAll();
      this.setupKeyboardShortcuts();
    },

    bindEvents() {
      // Navigation Tabs
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tab = e.currentTarget.getAttribute('data-tab');
          this.switchTab(tab);
        });
      });

      // Header Quick Actions
      document.getElementById('btn-quick-add-task').addEventListener('click', () => this.openTaskModal());
      document.getElementById('btn-quick-plan').addEventListener('click', () => this.openPlanGenerator(getTodayDateString()));

      // Banner CTA
      document.getElementById('btn-banner-plan').addEventListener('click', () => this.openPlanGenerator(getTodayDateString()));

      // Dashboard Shortcuts
      document.getElementById('dash-create-plan-btn').addEventListener('click', () => this.openPlanGenerator(getTodayDateString()));
      document.getElementById('dash-view-all-tasks-btn').addEventListener('click', () => this.switchTab('tasks'));
      document.getElementById('dash-manage-commitments-btn').addEventListener('click', () => this.switchTab('commitments'));
      document.getElementById('dash-reschedule-btn').addEventListener('click', () => this.triggerReschedule(getTodayDateString()));

      // Planner Date Controls
      const planDateInput = document.getElementById('plan-date-input');
      planDateInput.value = State.selectedPlannerDate;
      planDateInput.addEventListener('change', (e) => {
        State.selectedPlannerDate = e.target.value;
        this.renderPlanner();
      });

      document.getElementById('plan-today-btn').addEventListener('click', () => {
        State.selectedPlannerDate = getTodayDateString();
        planDateInput.value = State.selectedPlannerDate;
        this.renderPlanner();
      });

      document.getElementById('plan-prev-day').addEventListener('click', () => {
        State.selectedPlannerDate = offsetDateString(State.selectedPlannerDate, -1);
        planDateInput.value = State.selectedPlannerDate;
        this.renderPlanner();
      });

      document.getElementById('plan-next-day').addEventListener('click', () => {
        State.selectedPlannerDate = offsetDateString(State.selectedPlannerDate, 1);
        planDateInput.value = State.selectedPlannerDate;
        this.renderPlanner();
      });

      // Planner Actions
      document.getElementById('btn-generate-plan').addEventListener('click', () => {
        this.openPlanGenerator(State.selectedPlannerDate);
      });

      document.getElementById('btn-reschedule-remaining').addEventListener('click', () => {
        this.triggerReschedule(State.selectedPlannerDate);
      });

      document.getElementById('btn-clear-plan').addEventListener('click', () => {
        State.clearDailyPlan(State.selectedPlannerDate);
      });

      // Tasks View Actions
      document.getElementById('btn-add-task-main').addEventListener('click', () => this.openTaskModal());
      document.getElementById('btn-reset-filters').addEventListener('click', () => this.resetTaskFilters());

      // Task Filter Listeners
      const searchInput = document.getElementById('task-search-input');
      searchInput.addEventListener('input', (e) => {
        State.taskFilters.search = e.target.value.toLowerCase().trim();
        this.renderTasks();
      });

      document.getElementById('filter-status').addEventListener('change', (e) => {
        State.taskFilters.status = e.target.value;
        this.renderTasks();
      });

      document.getElementById('filter-subject').addEventListener('change', (e) => {
        State.taskFilters.subject = e.target.value;
        this.renderTasks();
      });

      document.getElementById('filter-type').addEventListener('change', (e) => {
        State.taskFilters.type = e.target.value;
        this.renderTasks();
      });

      document.getElementById('filter-priority').addEventListener('change', (e) => {
        State.taskFilters.priority = e.target.value;
        this.renderTasks();
      });

      document.getElementById('filter-sort').addEventListener('change', (e) => {
        State.taskFilters.sort = e.target.value;
        this.renderTasks();
      });

      // Commitments View Actions
      document.getElementById('btn-add-commitment-main').addEventListener('click', () => this.openCommitmentModal());

      document.getElementById('commitment-day-tabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('day-tab-btn')) {
          document.querySelectorAll('.day-tab-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          State.commitmentFilterDay = e.target.getAttribute('data-day');
          this.renderCommitments();
        }
      });

      // Settings & Backup Listeners
      document.getElementById('btn-export-backup').addEventListener('click', () => {
        Storage.exportJSON(State.data);
      });

      document.getElementById('file-import-backup').addEventListener('change', (e) => {
        this.handleBackupImport(e);
      });

      document.getElementById('settings-preferences-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.savePreferences();
      });

      document.getElementById('btn-load-sample-data').addEventListener('click', () => {
        this.confirm('Load Grade 11 starter tasks and lesson schedule? This will append starter items.', () => {
          State.data.commitments = [...STARTER_COMMITMENTS];
          State.data.tasks = [...State.data.tasks, ...STARTER_TASKS];
          State.save(true);
          this.renderAll();
          this.toast('Starter template loaded.', 'success');
        });
      });

      document.getElementById('btn-reset-all-data').addEventListener('click', () => {
        this.confirm('WARNING: Are you sure you want to reset ALL StudyFlow data? This cannot be undone unless you have an exported backup.', () => {
          State.data = Storage.createInitialData();
          State.save(true);
          this.renderAll();
          this.toast('All data reset to defaults.', 'warning');
        });
      });

      // Task Form Submit
      document.getElementById('form-task').addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveTaskFromModal();
      });

      // Commitment Form Submit
      document.getElementById('form-commitment').addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCommitmentFromModal();
      });

      document.getElementById('commitment-recurrence').addEventListener('change', (e) => {
        const isRecurring = e.target.value === 'recurring';
        document.getElementById('group-commitment-days').style.display = isRecurring ? 'block' : 'none';
        document.getElementById('group-commitment-date').style.display = isRecurring ? 'none' : 'block';
      });

      // Generator Modal Buttons
      document.getElementById('btn-select-all-tasks').addEventListener('click', () => {
        document.querySelectorAll('#generator-task-checklist input[type="checkbox"]').forEach(c => c.checked = true);
      });

      document.getElementById('btn-select-due-only').addEventListener('click', () => {
        const targetDate = document.getElementById('gen-plan-date').value;
        document.querySelectorAll('#generator-task-checklist input[type="checkbox"]').forEach(c => {
          const due = c.getAttribute('data-due');
          c.checked = (due <= targetDate);
        });
      });

      document.getElementById('btn-calculate-preview').addEventListener('click', () => {
        this.calculateAndPreviewProposal();
      });

      document.getElementById('btn-apply-plan').addEventListener('click', () => {
        this.applyProposedPlan();
      });

      // Edit Block Form
      document.getElementById('form-edit-block').addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEditedBlock();
      });

      // Modal Close Handlers
      document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const modal = e.target.closest('.modal-backdrop');
          if (modal) this.closeModal(modal.id);
        });
      });

      // Close modal on backdrop click
      document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) {
            this.closeModal(backdrop.id);
          }
        });
      });
    },

    setupKeyboardShortcuts() {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          document.querySelectorAll('.modal-backdrop.active').forEach(m => {
            this.closeModal(m.id);
          });
        }
      });
    },

    switchTab(tabName) {
      State.currentTab = tabName;
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
      });
      document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `view-${tabName}`);
      });

      if (tabName === 'dashboard') this.renderDashboard();
      if (tabName === 'planner') this.renderPlanner();
      if (tabName === 'tasks') this.renderTasks();
      if (tabName === 'commitments') this.renderCommitments();
      if (tabName === 'settings') this.renderSettings();
    },

    renderHeaderDate() {
      const today = new Date();
      const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      const dateText = today.toLocaleDateString('en-US', options);
      const headerDateEl = document.getElementById('header-date-text');
      if (headerDateEl) headerDateEl.textContent = dateText;
    },

    renderAll() {
      this.updateStorageMeta(State.data);
      this.renderDashboard();
      this.renderPlanner();
      this.renderTasks();
      this.renderCommitments();
      this.renderSettings();
      this.updateCounters();
    },

    updateCounters() {
      const activeTasksCount = State.data.tasks.filter(t => t.status !== 'Completed').length;
      const counterEl = document.getElementById('nav-tasks-count');
      if (counterEl) counterEl.textContent = activeTasksCount;

      const todayPlan = State.data.plans[getTodayDateString()];
      const planStatusEl = document.getElementById('nav-plan-status');
      if (planStatusEl) {
        planStatusEl.style.display = todayPlan && todayPlan.blocks && todayPlan.blocks.length ? 'inline-block' : 'none';
      }
    },

    // =======================================================================
    // DASHBOARD RENDERING
    // =======================================================================

    renderDashboard() {
      const todayStr = getTodayDateString();
      const tasks = State.data.tasks;

      // Pending tasks
      const pendingTasks = tasks.filter(t => t.status !== 'Completed');
      const totalPendingMins = pendingTasks.reduce((sum, t) => sum + (Number(t.durationMinutes) || 0), 0);
      document.getElementById('stat-pending-tasks').textContent = pendingTasks.length;
      document.getElementById('stat-pending-duration').textContent = `${(totalPendingMins / 60).toFixed(1)} hrs estimated`;

      // Due today
      const dueToday = tasks.filter(t => t.dueDate === todayStr);
      const dueTodayPending = dueToday.filter(t => t.status !== 'Completed');
      const dueTodayCompleted = dueToday.filter(t => t.status === 'Completed');
      document.getElementById('stat-due-today').textContent = dueTodayPending.length;
      document.getElementById('stat-due-today-sub').textContent = `${dueTodayCompleted.length} completed`;

      // Overdue
      const overdue = tasks.filter(t => t.dueDate < todayStr && t.status !== 'Completed');
      const overdueEl = document.getElementById('stat-overdue-tasks');
      overdueEl.textContent = overdue.length;
      const overdueCard = document.getElementById('metric-card-overdue');
      if (overdue.length > 0) {
        overdueCard.style.borderColor = 'rgba(244, 63, 94, 0.4)';
      } else {
        overdueCard.style.borderColor = '';
      }

      // Completion Percentage
      const totalTasksCount = tasks.length;
      const completedTasksCount = tasks.filter(t => t.status === 'Completed').length;
      const completionPct = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
      document.getElementById('stat-completion-pct').textContent = `${completionPct}%`;
      document.getElementById('stat-progress-fill').style.width = `${completionPct}%`;

      // Today's Active Plan Widget
      const todayPlan = State.data.plans[todayStr];
      const planTimelineEl = document.getElementById('dash-plan-timeline');
      const planStatusBadge = document.getElementById('dash-plan-status-badge');
      const rescheduleBtn = document.getElementById('dash-reschedule-btn');

      if (todayPlan && Array.isArray(todayPlan.blocks) && todayPlan.blocks.length > 0) {
        planStatusBadge.className = 'badge badge-success';
        planStatusBadge.textContent = 'Active Plan';
        rescheduleBtn.style.display = 'inline-flex';

        planTimelineEl.innerHTML = todayPlan.blocks.slice(0, 5).map(b => `
          <div class="compact-item ${b.completed ? 'task-completed' : ''}">
            <div class="compact-item-left">
              <span class="badge ${b.type === 'study' ? 'badge-primary' : (b.type === 'break' ? 'badge-success' : 'badge-info')}">
                ${escapeHTML(b.startTime)}
              </span>
              <div>
                <div class="compact-item-title">${escapeHTML(b.title)}</div>
                <div class="compact-item-sub">${b.durationMinutes} mins · ${escapeHTML(b.type.toUpperCase())}</div>
              </div>
            </div>
            ${b.type === 'study' ? `
              <input type="checkbox" class="task-checkbox-custom"
                     ${b.completed ? 'checked' : ''}
                     title="Toggle completion"
                     data-toggle-block="${escapeHTML(b.id)}">
            ` : ''}
          </div>
        `).join('');

        if (todayPlan.blocks.length > 5) {
          planTimelineEl.innerHTML += `
            <div style="text-align:center; padding: 0.5rem;">
              <button type="button" class="btn btn-ghost btn-xs" id="dash-view-full-plan-btn">
                + ${todayPlan.blocks.length - 5} more blocks. View Full Timeline &rarr;
              </button>
            </div>
          `;
          document.getElementById('dash-view-full-plan-btn')?.addEventListener('click', () => {
            State.selectedPlannerDate = todayStr;
            this.switchTab('planner');
          });
        }
      } else {
        planStatusBadge.className = 'badge';
        planStatusBadge.textContent = 'No Plan Generated';
        rescheduleBtn.style.display = 'none';

        planTimelineEl.innerHTML = `
          <div class="empty-state" style="padding: 1.5rem 1rem;">
            <div class="empty-state-icon">⚡</div>
            <div class="empty-state-title">No plan created for today</div>
            <p class="empty-state-text">Generate a realistic study plan around your fixed lessons and sleep routine.</p>
            <button type="button" class="btn btn-primary btn-sm" id="dash-empty-plan-cta">Plan Today</button>
          </div>
        `;
        document.getElementById('dash-empty-plan-cta')?.addEventListener('click', () => {
          this.openPlanGenerator(todayStr);
        });
      }

      // Urgent & Due Today List
      const urgentDueListEl = document.getElementById('dash-due-tasks-list');
      const urgentAndDue = tasks.filter(t =>
        t.status !== 'Completed' && (t.dueDate <= todayStr || t.priority === 'Urgent')
      );
      document.getElementById('dash-urgent-count-badge').textContent = urgentAndDue.length;

      if (urgentAndDue.length === 0) {
        urgentDueListEl.innerHTML = `
          <div class="empty-state" style="padding: 1.5rem 1rem;">
            <div class="empty-state-icon">🎉</div>
            <div class="empty-state-title">No urgent tasks due today</div>
            <p class="empty-state-text">You are caught up on immediate deadlines.</p>
          </div>
        `;
      } else {
        urgentDueListEl.innerHTML = urgentAndDue.slice(0, 5).map(t => `
          <div class="compact-item">
            <div class="compact-item-left">
              <input type="checkbox" class="task-checkbox-custom" data-toggle-task="${escapeHTML(t.id)}">
              <div>
                <div class="compact-item-title">${escapeHTML(t.title)}</div>
                <div class="compact-item-sub">
                  ${escapeHTML(t.subject)} · Due: ${formatDateDisplay(t.dueDate)}
                  ${t.dueDate < todayStr ? '<span class="text-danger font-bold"> (OVERDUE)</span>' : ''}
                </div>
              </div>
            </div>
            <span class="badge priority-${t.priority.toLowerCase()}">${escapeHTML(t.priority)}</span>
          </div>
        `).join('');
      }

      // Upcoming Exams (Next 14 days)
      const examsListEl = document.getElementById('dash-exams-list');
      const examTasks = tasks.filter(t => {
        const isExamType = t.type.includes('Exam') || t.type.includes('SAT');
        const diffDays = daysDifference(todayStr, t.dueDate);
        return isExamType && diffDays >= 0 && diffDays <= 14;
      }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      if (examTasks.length === 0) {
        examsListEl.innerHTML = `
          <div class="empty-state" style="padding: 1.5rem 1rem;">
            <div class="empty-state-icon">📖</div>
            <div class="empty-state-title">No exams scheduled in next 14 days</div>
            <p class="empty-state-text">Add SAT or Quarter Exam prep tasks to track them here.</p>
          </div>
        `;
      } else {
        examsListEl.innerHTML = examTasks.map(e => `
          <div class="compact-item">
            <div class="compact-item-left">
              <span class="badge badge-accent">${escapeHTML(e.type)}</span>
              <div>
                <div class="compact-item-title">${escapeHTML(e.title)}</div>
                <div class="compact-item-sub">${escapeHTML(e.subject)} · In ${daysDifference(todayStr, e.dueDate)} days (${formatDateDisplay(e.dueDate)})</div>
              </div>
            </div>
            <span class="badge ${e.status === 'Completed' ? 'badge-success' : 'badge-warning'}">
              ${escapeHTML(e.status)}
            </span>
          </div>
        `).join('');
      }

      // Fixed Commitments Today
      const commitmentsListEl = document.getElementById('dash-commitments-list');
      const todayCommitments = SchedulerEngine.getCommitmentsForDate(todayStr, State.data.commitments);
      document.getElementById('dash-commitments-count-badge').textContent = `${todayCommitments.length} blocks`;

      if (todayCommitments.length === 0) {
        commitmentsListEl.innerHTML = `
          <div class="empty-state" style="padding: 1rem;">
            <div class="empty-state-text">No fixed commitments for today. Free schedule!</div>
          </div>
        `;
      } else {
        commitmentsListEl.innerHTML = todayCommitments.map(c => `
          <div class="compact-item">
            <div class="compact-item-left">
              <span class="badge badge-info">${escapeHTML(c.startTime)} - ${escapeHTML(c.endTime)}</span>
              <div>
                <div class="compact-item-title">${escapeHTML(c.title)}</div>
                <div class="compact-item-sub">${escapeHTML(c.category.toUpperCase())} ${c.notes ? '· ' + escapeHTML(c.notes) : ''}</div>
              </div>
            </div>
          </div>
        `).join('');
      }

      // Bind delegate checkboxes in dashboard
      planTimelineEl.querySelectorAll('[data-toggle-block]').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const blockId = e.target.getAttribute('data-toggle-block');
          State.toggleBlockCompleted(todayStr, blockId);
        });
      });

      urgentDueListEl.querySelectorAll('[data-toggle-task]').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const taskId = e.target.getAttribute('data-toggle-task');
          State.toggleTaskStatus(taskId);
        });
      });
    },

    // =======================================================================
    // DAILY PLANNER RENDERING
    // =======================================================================

    renderPlanner() {
      const dateStr = State.selectedPlannerDate;
      const dateInput = document.getElementById('plan-date-input');
      if (dateInput) dateInput.value = dateStr;

      const dateDisplay = document.getElementById('timeline-date-display');
      if (dateDisplay) {
        dateDisplay.textContent = formatDateDisplay(dateStr);
      }

      const plan = State.data.plans[dateStr];
      const timelineListEl = document.getElementById('planner-timeline-list');
      const warningBox = document.getElementById('unscheduled-warning-box');
      const unscheduledListEl = document.getElementById('unscheduled-tasks-list');

      // Update Planner Stat Bar
      const totalTimeEl = document.getElementById('plan-stat-total-time');
      const studyTimeEl = document.getElementById('plan-stat-study-time');
      const fixedTimeEl = document.getElementById('plan-stat-fixed-time');
      const breaksTimeEl = document.getElementById('plan-stat-breaks-time');
      const statusEl = document.getElementById('plan-stat-status');

      if (!plan || !Array.isArray(plan.blocks) || plan.blocks.length === 0) {
        totalTimeEl.textContent = '0h 0m';
        studyTimeEl.textContent = '0h 0m';
        fixedTimeEl.textContent = '0h 0m';
        breaksTimeEl.textContent = '0h 0m';
        statusEl.textContent = 'No Plan';
        warningBox.style.display = 'none';

        timelineListEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📅</div>
            <div class="empty-state-title">No daily schedule generated for ${formatDateDisplay(dateStr)}</div>
            <p class="empty-state-text">Click "Generate / Regenerate Plan" to build a realistic timeline based on your available study time, lessons, and sleep hours.</p>
            <button type="button" class="btn btn-primary btn-sm" id="planner-generate-cta">Generate Plan for ${formatDateDisplay(dateStr)}</button>
          </div>
        `;

        document.getElementById('planner-generate-cta')?.addEventListener('click', () => {
          this.openPlanGenerator(dateStr);
        });
        return;
      }

      // Calculate totals
      const studyMins = plan.blocks.filter(b => b.type === 'study').reduce((a, b) => a + b.durationMinutes, 0);
      const fixedMins = plan.blocks.filter(b => b.type === 'fixed').reduce((a, b) => a + b.durationMinutes, 0);
      const breakMins = plan.blocks.filter(b => b.type === 'break' || b.type === 'buffer').reduce((a, b) => a + b.durationMinutes, 0);
      const totalMins = studyMins + fixedMins + breakMins;

      totalTimeEl.textContent = minutesToHourString(totalMins);
      studyTimeEl.textContent = minutesToHourString(studyMins);
      fixedTimeEl.textContent = minutesToHourString(fixedMins);
      breaksTimeEl.textContent = minutesToHourString(breakMins);
      statusEl.textContent = 'Active & Saved';

      // Unscheduled warning
      if (plan.unscheduledTasks && plan.unscheduledTasks.length > 0) {
        warningBox.style.display = 'block';
        unscheduledListEl.innerHTML = plan.unscheduledTasks.map(u => `
          <li>
            <strong>${escapeHTML(u.title)}</strong> (${escapeHTML(u.subject)} · ${u.durationMinutes} mins · ${escapeHTML(u.priority)} priority)
            <br><small class="text-muted">${escapeHTML(u.reason || 'Could not fit before sleep.')}</small>
          </li>
        `).join('');
      } else {
        warningBox.style.display = 'none';
      }

      // Render timeline blocks
      timelineListEl.innerHTML = plan.blocks.map((b, idx) => `
        <div class="timeline-block block-${b.type} ${b.completed ? 'block-done' : ''}" data-block-id="${escapeHTML(b.id)}">
          <div class="block-left">
            <div class="block-time">
              <span>${escapeHTML(b.startTime)}</span>
              <span class="block-duration">${escapeHTML(b.endTime)} (${b.durationMinutes}m)</span>
            </div>

            <div class="block-details">
              <div class="block-title-row">
                <span class="block-title">${escapeHTML(b.title)}</span>
                <span class="block-type-badge">${escapeHTML(b.type.toUpperCase())}</span>
                ${b.subject ? `<span class="badge badge-primary">${escapeHTML(b.subject)}</span>` : ''}
              </div>
            </div>
          </div>

          <div class="block-right">
            ${b.type === 'study' ? `
              <label class="btn btn-ghost btn-xs" title="Toggle completed">
                <input type="checkbox" class="task-checkbox-custom"
                       ${b.completed ? 'checked' : ''}
                       data-action="toggle-complete"
                       data-block-id="${escapeHTML(b.id)}">
              </label>
            ` : ''}

            <button type="button" class="btn btn-ghost btn-xs" title="Move Up" data-action="move-up" data-block-id="${escapeHTML(b.id)}" ${idx === 0 ? 'disabled' : ''}>
              ▲
            </button>
            <button type="button" class="btn btn-ghost btn-xs" title="Move Down" data-action="move-down" data-block-id="${escapeHTML(b.id)}" ${idx === plan.blocks.length - 1 ? 'disabled' : ''}>
              ▼
            </button>
            <button type="button" class="btn btn-ghost btn-xs" title="Edit block details" data-action="edit-block" data-block-id="${escapeHTML(b.id)}">
              ✏️
            </button>
            <button type="button" class="btn btn-ghost btn-xs text-danger" title="Remove block" data-action="remove-block" data-block-id="${escapeHTML(b.id)}">
              ✕
            </button>
          </div>
        </div>
      `).join('');

      // Bind block interactive buttons
      timelineListEl.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const action = e.currentTarget.getAttribute('data-action');
          const blockId = e.currentTarget.getAttribute('data-block-id');

          if (action === 'move-up') State.moveBlock(dateStr, blockId, 'up');
          if (action === 'move-down') State.moveBlock(dateStr, blockId, 'down');
          if (action === 'remove-block') State.removeBlock(dateStr, blockId);
          if (action === 'edit-block') this.openEditBlockModal(dateStr, blockId);
        });
      });

      timelineListEl.querySelectorAll('[data-action="toggle-complete"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const blockId = e.currentTarget.getAttribute('data-block-id');
          State.toggleBlockCompleted(dateStr, blockId);
        });
      });
    },

    // =======================================================================
    // TASK MANAGEMENT RENDERING
    // =======================================================================

    renderTasks() {
      const container = document.getElementById('tasks-list-container');
      const counterEl = document.getElementById('filtered-task-counter');
      const todayStr = getTodayDateString();

      let filtered = [...State.data.tasks];

      // Search
      if (State.taskFilters.search) {
        const q = State.taskFilters.search;
        filtered = filtered.filter(t =>
          t.title.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          (t.notes && t.notes.toLowerCase().includes(q))
        );
      }

      // Status
      if (State.taskFilters.status === 'pending') {
        filtered = filtered.filter(t => t.status !== 'Completed');
      } else if (State.taskFilters.status === 'completed') {
        filtered = filtered.filter(t => t.status === 'Completed');
      } else if (State.taskFilters.status === 'due-today') {
        filtered = filtered.filter(t => t.dueDate === todayStr && t.status !== 'Completed');
      } else if (State.taskFilters.status === 'overdue') {
        filtered = filtered.filter(t => t.dueDate < todayStr && t.status !== 'Completed');
      }

      // Subject
      if (State.taskFilters.subject !== 'all') {
        filtered = filtered.filter(t => t.subject === State.taskFilters.subject);
      }

      // Type
      if (State.taskFilters.type !== 'all') {
        filtered = filtered.filter(t => t.type === State.taskFilters.type);
      }

      // Priority
      if (State.taskFilters.priority !== 'all') {
        filtered = filtered.filter(t => t.priority === State.taskFilters.priority);
      }

      // Sort
      const pMap = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
      filtered.sort((a, b) => {
        if (State.taskFilters.sort === 'dueDate-asc') {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (State.taskFilters.sort === 'priority-desc') {
          return (pMap[b.priority] || 2) - (pMap[a.priority] || 2);
        }
        if (State.taskFilters.sort === 'duration-desc') {
          return (b.durationMinutes || 0) - (a.durationMinutes || 0);
        }
        if (State.taskFilters.sort === 'duration-asc') {
          return (a.durationMinutes || 0) - (b.durationMinutes || 0);
        }
        if (State.taskFilters.sort === 'createdAt-desc') {
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        }
        return 0;
      });

      counterEl.textContent = `Showing ${filtered.length} of ${State.data.tasks.length} tasks`;

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-title">No tasks found</div>
            <p class="empty-state-text">No tasks match your current filter criteria or search query.</p>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-empty-reset-filters">Reset Filters</button>
          </div>
        `;
        document.getElementById('btn-empty-reset-filters')?.addEventListener('click', () => {
          this.resetTaskFilters();
        });
        return;
      }

      container.innerHTML = filtered.map(t => {
        const isOverdue = t.dueDate < todayStr && t.status !== 'Completed';
        const isDueToday = t.dueDate === todayStr;

        return `
          <div class="task-card ${t.status === 'Completed' ? 'task-completed' : ''}" data-task-id="${escapeHTML(t.id)}">
            <div class="task-card-header">
              <div class="task-card-meta">
                <span class="badge badge-primary">${escapeHTML(t.subject)}</span>
                <span class="badge">${escapeHTML(t.type)}</span>
                <span class="badge priority-${t.priority.toLowerCase()}">${escapeHTML(t.priority)}</span>
              </div>
              <span class="badge">⏱️ ${t.durationMinutes}m</span>
            </div>

            <div class="task-card-title-row">
              <input type="checkbox" class="task-checkbox-custom"
                     ${t.status === 'Completed' ? 'checked' : ''}
                     data-action="toggle-task"
                     data-task-id="${escapeHTML(t.id)}"
                     title="Toggle completed">
              <span class="task-card-title">${escapeHTML(t.title)}</span>
            </div>

            ${t.notes ? `<div class="task-card-notes">${escapeHTML(t.notes)}</div>` : ''}

            <div class="task-card-footer">
              <div class="task-due-info">
                <span>📅 Due: <strong>${formatDateDisplay(t.dueDate)}</strong> ${t.dueTime ? escapeHTML(t.dueTime) : ''}</span>
                ${isOverdue ? '<span class="badge badge-danger">OVERDUE</span>' : ''}
                ${isDueToday ? '<span class="badge badge-warning">TODAY</span>' : ''}
              </div>

              <div class="task-actions-btn-group">
                <button type="button" class="btn btn-ghost btn-xs" data-action="edit-task" data-task-id="${escapeHTML(t.id)}" title="Edit task">
                  ✏️ Edit
                </button>
                <button type="button" class="btn btn-ghost btn-xs text-danger" data-action="delete-task" data-task-id="${escapeHTML(t.id)}" title="Delete task">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Bind task interactive events
      container.querySelectorAll('[data-action="toggle-task"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const taskId = e.currentTarget.getAttribute('data-task-id');
          State.toggleTaskStatus(taskId);
        });
      });

      container.querySelectorAll('[data-action="edit-task"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const taskId = e.currentTarget.getAttribute('data-task-id');
          this.openTaskModal(taskId);
        });
      });

      container.querySelectorAll('[data-action="delete-task"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const taskId = e.currentTarget.getAttribute('data-task-id');
          State.deleteTask(taskId);
        });
      });
    },

    resetTaskFilters() {
      State.taskFilters = {
        search: '',
        status: 'pending',
        subject: 'all',
        type: 'all',
        priority: 'all',
        sort: 'dueDate-asc'
      };
      document.getElementById('task-search-input').value = '';
      document.getElementById('filter-status').value = 'pending';
      document.getElementById('filter-subject').value = 'all';
      document.getElementById('filter-type').value = 'all';
      document.getElementById('filter-priority').value = 'all';
      document.getElementById('filter-sort').value = 'dueDate-asc';
      this.renderTasks();
    },

    // =======================================================================
    // COMMITMENTS RENDERING
    // =======================================================================

    renderCommitments() {
      const container = document.getElementById('commitments-list-container');
      const counterEl = document.getElementById('commitments-count-badge');
      const dayFilter = State.commitmentFilterDay;

      let list = [...State.data.commitments];

      if (dayFilter !== 'all') {
        const dayNum = Number(dayFilter);
        list = list.filter(c => {
          if (c.recurrence === 'recurring') {
            return Array.isArray(c.daysOfWeek) && c.daysOfWeek.includes(dayNum);
          }
          if (c.recurrence === 'one-time' && c.date) {
            const d = parseDateString(c.date);
            return d.getDay() === dayNum;
          }
          return false;
        });
      }

      counterEl.textContent = `${list.length} configured`;

      if (list.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🕒</div>
            <div class="empty-state-title">No commitments found</div>
            <p class="empty-state-text">Add your school hours, Arabic/History lessons, SAT classes, and sleep schedule.</p>
          </div>
        `;
        return;
      }

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      container.innerHTML = list.map(c => {
        const recurrenceText = c.recurrence === 'recurring'
          ? (Array.isArray(c.daysOfWeek) ? c.daysOfWeek.map(d => dayNames[d]).join(', ') : 'Weekly')
          : `Date: ${formatDateDisplay(c.date)}`;

        return `
          <div class="commitment-item" data-commitment-id="${escapeHTML(c.id)}">
            <div class="compact-item-left">
              <span class="badge badge-info">${escapeHTML(c.startTime)} - ${escapeHTML(c.endTime)}</span>
              <div>
                <div class="compact-item-title">${escapeHTML(c.title)}</div>
                <div class="compact-item-sub">
                  ${escapeHTML(c.category.toUpperCase())} · ${escapeHTML(recurrenceText)}
                  ${c.notes ? '· ' + escapeHTML(c.notes) : ''}
                </div>
              </div>
            </div>

            <div class="task-actions-btn-group">
              <button type="button" class="btn btn-ghost btn-xs" data-action="edit-comm" data-comm-id="${escapeHTML(c.id)}">
                ✏️ Edit
              </button>
              <button type="button" class="btn btn-ghost btn-xs text-danger" data-action="delete-comm" data-comm-id="${escapeHTML(c.id)}">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('[data-action="edit-comm"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-comm-id');
          this.openCommitmentModal(id);
        });
      });

      container.querySelectorAll('[data-action="delete-comm"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-comm-id');
          State.deleteCommitment(id);
        });
      });
    },

    // =======================================================================
    // SETTINGS RENDERING
    // =======================================================================

    renderSettings() {
      const s = State.data.settings || DEFAULT_SETTINGS;
      document.getElementById('pref-sleep-start').value = s.sleepStart || '23:00';
      document.getElementById('pref-sleep-end').value = s.sleepEnd || '06:30';
      document.getElementById('pref-buffer-mins').value = s.bufferMinutes || 30;
      document.getElementById('pref-break-mins').value = s.breakDurationMinutes || 10;
      document.getElementById('pref-max-block').value = s.maxBlockDurationMinutes || 50;

      this.updateStorageMeta(State.data);
    },

    updateStorageMeta(data) {
      const tasksEl = document.getElementById('storage-tasks-count');
      const commsEl = document.getElementById('storage-commitments-count');
      const plansEl = document.getElementById('storage-plans-count');
      const savedEl = document.getElementById('storage-last-saved');

      if (tasksEl) tasksEl.textContent = data.tasks.length;
      if (commsEl) commsEl.textContent = data.commitments.length;
      if (plansEl) plansEl.textContent = Object.keys(data.plans || {}).length;
      if (savedEl) savedEl.textContent = data.lastSavedAt ? new Date(data.lastSavedAt).toLocaleTimeString() : 'Never';
    },

    savePreferences() {
      const s = {
        sleepStart: document.getElementById('pref-sleep-start').value,
        sleepEnd: document.getElementById('pref-sleep-end').value,
        bufferMinutes: Number(document.getElementById('pref-buffer-mins').value),
        breakDurationMinutes: Number(document.getElementById('pref-break-mins').value),
        maxBlockDurationMinutes: Number(document.getElementById('pref-max-block').value),
        studyStartTime: State.data.settings.studyStartTime || '15:30'
      };

      State.data.settings = s;
      State.save(true);
      this.toast('Scheduling preferences updated.', 'success');
    },

    // =======================================================================
    // MODAL DIALOGS & HANDLERS
    // =======================================================================

    openModal(modalId) {
      const el = document.getElementById(modalId);
      if (el) {
        el.classList.add('active');
        el.setAttribute('aria-hidden', 'false');
      }
    },

    closeModal(modalId) {
      const el = document.getElementById(modalId);
      if (el) {
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
      }
    },

    // Task Modal
    openTaskModal(taskId = null) {
      const titleEl = document.getElementById('modal-task-title');
      const idInput = document.getElementById('task-id');
      const titleInput = document.getElementById('task-title');
      const subjectSelect = document.getElementById('task-subject');
      const typeSelect = document.getElementById('task-type');
      const durationInput = document.getElementById('task-duration');
      const prioritySelect = document.getElementById('task-priority');
      const dueDateInput = document.getElementById('task-due-date');
      const dueTimeInput = document.getElementById('task-due-time');
      const prefDateInput = document.getElementById('task-preferred-date');
      const statusSelect = document.getElementById('task-status');
      const notesInput = document.getElementById('task-notes');

      if (taskId) {
        const task = State.data.tasks.find(t => t.id === taskId);
        if (!task) return;
        titleEl.textContent = 'Edit Task';
        idInput.value = task.id;
        titleInput.value = task.title;
        subjectSelect.value = task.subject;
        typeSelect.value = task.type;
        durationInput.value = task.durationMinutes;
        prioritySelect.value = task.priority;
        dueDateInput.value = task.dueDate;
        dueTimeInput.value = task.dueTime || '';
        prefDateInput.value = task.preferredStudyDate || '';
        statusSelect.value = task.status;
        notesInput.value = task.notes || '';
      } else {
        titleEl.textContent = 'Add New Task';
        idInput.value = '';
        titleInput.value = '';
        subjectSelect.value = 'Math';
        typeSelect.value = 'Homework';
        durationInput.value = 45;
        prioritySelect.value = 'Medium';
        dueDateInput.value = getTodayDateString();
        dueTimeInput.value = '';
        prefDateInput.value = getTodayDateString();
        statusSelect.value = 'Pending';
        notesInput.value = '';
      }

      this.openModal('modal-task');
      titleInput.focus();
    },

    saveTaskFromModal() {
      const id = document.getElementById('task-id').value;
      const title = document.getElementById('task-title').value.trim();
      const subject = document.getElementById('task-subject').value;
      const type = document.getElementById('task-type').value;
      const duration = Number(document.getElementById('task-duration').value) || 45;
      const priority = document.getElementById('task-priority').value;
      const dueDate = document.getElementById('task-due-date').value;
      const dueTime = document.getElementById('task-due-time').value || null;
      const prefDate = document.getElementById('task-preferred-date').value || null;
      const status = document.getElementById('task-status').value;
      const notes = document.getElementById('task-notes').value.trim();

      if (!title || !dueDate) {
        this.toast('Please provide a task title and due date.', 'warning');
        return;
      }

      if (id) {
        State.updateTask(id, {
          title, subject, type, durationMinutes: duration, priority, dueDate,
          dueTime, preferredStudyDate: prefDate, status, notes
        });
        this.toast('Task updated.', 'success');
      } else {
        const newTask = {
          id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          title, subject, type, durationMinutes: duration, priority, dueDate,
          dueTime, preferredStudyDate: prefDate, status, notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: status === 'Completed' ? new Date().toISOString() : null
        };
        State.addTask(newTask);
        this.toast('Task added.', 'success');
      }

      this.closeModal('modal-task');
    },

    // Commitment Modal
    openCommitmentModal(commId = null) {
      const titleEl = document.getElementById('modal-commitment-title');
      const idInput = document.getElementById('commitment-id');
      const titleInput = document.getElementById('commitment-title');
      const catSelect = document.getElementById('commitment-category');
      const recSelect = document.getElementById('commitment-recurrence');
      const dateInput = document.getElementById('commitment-date');
      const startInput = document.getElementById('commitment-start');
      const endInput = document.getElementById('commitment-end');
      const notesInput = document.getElementById('commitment-notes');

      // Uncheck all days
      document.querySelectorAll('input[name="comm-day"]').forEach(c => c.checked = false);

      if (commId) {
        const comm = State.data.commitments.find(c => c.id === commId);
        if (!comm) return;
        titleEl.textContent = 'Edit Fixed Commitment';
        idInput.value = comm.id;
        titleInput.value = comm.title;
        catSelect.value = comm.category || 'lesson';
        recSelect.value = comm.recurrence || 'recurring';
        dateInput.value = comm.date || '';
        startInput.value = comm.startTime;
        endInput.value = comm.endTime;
        notesInput.value = comm.notes || '';

        if (comm.recurrence === 'recurring' && Array.isArray(comm.daysOfWeek)) {
          comm.daysOfWeek.forEach(day => {
            const cb = document.querySelector(`input[name="comm-day"][value="${day}"]`);
            if (cb) cb.checked = true;
          });
        }
      } else {
        titleEl.textContent = 'Add Fixed Commitment';
        idInput.value = '';
        titleInput.value = '';
        catSelect.value = 'lesson';
        recSelect.value = 'recurring';
        dateInput.value = getTodayDateString();
        startInput.value = '16:00';
        endInput.value = '17:30';
        notesInput.value = '';
        // Check weekdays by default
        [0, 1, 2, 3, 4].forEach(day => {
          const cb = document.querySelector(`input[name="comm-day"][value="${day}"]`);
          if (cb) cb.checked = true;
        });
      }

      const isRecurring = recSelect.value === 'recurring';
      document.getElementById('group-commitment-days').style.display = isRecurring ? 'block' : 'none';
      document.getElementById('group-commitment-date').style.display = isRecurring ? 'none' : 'block';

      this.openModal('modal-commitment');
      titleInput.focus();
    },

    saveCommitmentFromModal() {
      const id = document.getElementById('commitment-id').value;
      const title = document.getElementById('commitment-title').value.trim();
      const category = document.getElementById('commitment-category').value;
      const recurrence = document.getElementById('commitment-recurrence').value;
      const date = document.getElementById('commitment-date').value;
      const startTime = document.getElementById('commitment-start').value;
      const endTime = document.getElementById('commitment-end').value;
      const notes = document.getElementById('commitment-notes').value.trim();

      if (!title || !startTime || !endTime) {
        this.toast('Please fill out the title, start time, and end time.', 'warning');
        return;
      }

      if (timeStringToMinutes(endTime) <= timeStringToMinutes(startTime)) {
        this.toast('End time must be later than start time.', 'warning');
        return;
      }

      let daysOfWeek = [];
      if (recurrence === 'recurring') {
        document.querySelectorAll('input[name="comm-day"]:checked').forEach(cb => {
          daysOfWeek.push(Number(cb.value));
        });
        if (daysOfWeek.length === 0) {
          this.toast('Please select at least one day of the week.', 'warning');
          return;
        }
      } else if (!date) {
        this.toast('Please specify a date for this one-time commitment.', 'warning');
        return;
      }

      if (id) {
        State.updateCommitment(id, {
          title, category, recurrence, daysOfWeek, date, startTime, endTime, notes
        });
        this.toast('Commitment updated.', 'success');
      } else {
        const newComm = {
          id: 'comm_' + Date.now(),
          title, category, recurrence, daysOfWeek, date, startTime, endTime, notes
        };
        State.addCommitment(newComm);
        this.toast('Commitment added.', 'success');
      }

      this.closeModal('modal-commitment');
    },

    // Plan Generator Modal
    openPlanGenerator(targetDateStr) {
      document.getElementById('gen-plan-date').value = targetDateStr || getTodayDateString();
      document.getElementById('gen-start-time').value = State.data.settings.studyStartTime || '15:30';
      document.getElementById('gen-buffer-mins').value = State.data.settings.bufferMinutes || 30;
      document.getElementById('gen-break-mins').value = State.data.settings.breakDurationMinutes || 10;
      document.getElementById('gen-max-session').value = State.data.settings.maxBlockDurationMinutes || 50;

      // Populate Checklist with active tasks
      const checklistEl = document.getElementById('generator-task-checklist');
      const activeTasks = State.data.tasks.filter(t => t.status !== 'Completed');

      if (activeTasks.length === 0) {
        checklistEl.innerHTML = `
          <div style="padding: 0.5rem; color: var(--text-muted); font-size: 0.85rem;">
            No pending tasks. You can add tasks before planning or schedule breaks/commitments.
          </div>
        `;
      } else {
        checklistEl.innerHTML = activeTasks.map(t => {
          const isDueOrOverdue = t.dueDate <= targetDateStr;
          return `
            <label class="generator-task-item">
              <input type="checkbox" value="${escapeHTML(t.id)}"
                     data-due="${escapeHTML(t.dueDate)}"
                     ${isDueOrOverdue ? 'checked' : 'checked'}>
              <span style="font-weight: 500;">${escapeHTML(t.title)}</span>
              <span class="badge badge-primary">${escapeHTML(t.subject)}</span>
              <span class="badge priority-${t.priority.toLowerCase()}">${escapeHTML(t.priority)}</span>
              <span style="margin-left:auto; font-size:0.75rem; color:var(--text-muted);">${t.durationMinutes}m</span>
            </label>
          `;
        }).join('');
      }

      // Hide preview section initially
      document.getElementById('generator-preview-section').style.display = 'none';
      document.getElementById('btn-apply-plan').disabled = true;
      State.tempProposedPlan = null;

      this.openModal('modal-plan-generator');
    },

    calculateAndPreviewProposal() {
      const dateStr = document.getElementById('gen-plan-date').value;
      const startTimeStr = document.getElementById('gen-start-time').value;
      const bufferMins = Number(document.getElementById('gen-buffer-mins').value);
      const breakMins = Number(document.getElementById('gen-break-mins').value);
      const maxBlockMins = Number(document.getElementById('gen-max-session').value);

      // Selected tasks
      const checkedTaskIds = Array.from(document.querySelectorAll('#generator-task-checklist input:checked')).map(c => c.value);
      const tasksToSchedule = State.data.tasks.filter(t => checkedTaskIds.includes(t.id) && t.status !== 'Completed');

      const customSettings = {
        ...State.data.settings,
        bufferMinutes: bufferMins,
        breakDurationMinutes: breakMins,
        maxBlockDurationMinutes: maxBlockMins,
        studyStartTime: startTimeStr
      };

      const proposal = SchedulerEngine.generatePlan({
        dateStr,
        startTimeStr,
        tasksToSchedule,
        commitments: State.data.commitments,
        settings: customSettings
      });

      State.tempProposedPlan = proposal;

      // Show preview
      const previewSection = document.getElementById('generator-preview-section');
      const previewList = document.getElementById('generator-preview-list');
      const statBadge = document.getElementById('preview-stat-badge');

      previewSection.style.display = 'block';
      statBadge.textContent = `${proposal.totalStudyMins}m Study · ${proposal.blocks.length} Blocks`;

      if (proposal.blocks.length === 0) {
        previewList.innerHTML = `<p class="text-muted" style="padding:0.5rem;">No blocks could be scheduled. Check start time and sleep schedule.</p>`;
      } else {
        previewList.innerHTML = proposal.blocks.map(b => `
          <div class="compact-item">
            <div class="compact-item-left">
              <span class="badge ${b.type === 'study' ? 'badge-primary' : (b.type === 'break' ? 'badge-success' : 'badge-info')}">
                ${escapeHTML(b.startTime)} - ${escapeHTML(b.endTime)}
              </span>
              <div>
                <div class="compact-item-title">${escapeHTML(b.title)}</div>
                <div class="compact-item-sub">${b.durationMinutes} mins · ${escapeHTML(b.type.toUpperCase())}</div>
              </div>
            </div>
          </div>
        `).join('');

        if (proposal.unscheduledTasks.length > 0) {
          previewList.innerHTML += `
            <div class="callout callout-warning" style="margin-top:0.6rem; padding:0.6rem 0.8rem;">
              <strong>${proposal.unscheduledTasks.length} task(s) could not fit:</strong>
              <div style="font-size:0.8rem; margin-top:0.25rem;">
                ${proposal.unscheduledTasks.map(u => escapeHTML(u.title)).join(', ')}
              </div>
            </div>
          `;
        }
      }

      document.getElementById('btn-apply-plan').disabled = false;
      this.toast('Proposed schedule calculated. Review below and click "Apply Plan".', 'info');
    },

    applyProposedPlan() {
      if (!State.tempProposedPlan) {
        this.toast('Please calculate a proposed plan first.', 'warning');
        return;
      }

      const dateStr = State.tempProposedPlan.date;
      State.saveDailyPlan(dateStr, State.tempProposedPlan);

      this.closeModal('modal-plan-generator');
      State.selectedPlannerDate = dateStr;
      this.switchTab('planner');
      this.toast(`Plan for ${formatDateDisplay(dateStr)} saved and applied.`, 'success');
    },

    // Trigger Reschedule Action
    triggerReschedule(dateStr) {
      const currentPlan = State.data.plans[dateStr];
      if (!currentPlan) {
        this.toast('No existing plan for this date to reschedule. Use "Generate Plan" instead.', 'warning');
        return;
      }

      this.confirm(`Reschedule remaining tasks for today starting from now? Completed sessions will be preserved.`, () => {
        const revisedPlan = SchedulerEngine.rescheduleRemaining({
          dateStr,
          currentPlan,
          allTasks: State.data.tasks,
          commitments: State.data.commitments,
          settings: State.data.settings
        });

        State.saveDailyPlan(dateStr, revisedPlan);
        this.renderAll();

        if (revisedPlan.unscheduledTasks.length > 0) {
          this.toast(`Rescheduled. Note: ${revisedPlan.unscheduledTasks.length} tasks could not fit in the remaining time.`, 'warning', 6000);
        } else {
          this.toast('Schedule successfully adjusted around remaining hours!', 'success');
        }
      });
    },

    // Edit Block Modal
    openEditBlockModal(dateStr, blockId) {
      const plan = State.data.plans[dateStr];
      if (!plan || !plan.blocks) return;
      const block = plan.blocks.find(b => b.id === blockId);
      if (!block) return;

      document.getElementById('edit-block-id').value = block.id;
      document.getElementById('edit-block-title').value = block.title;
      document.getElementById('edit-block-start').value = block.startTime;
      document.getElementById('edit-block-end').value = block.endTime;
      document.getElementById('edit-block-type').value = block.type;

      this.openModal('modal-edit-block');
    },

    saveEditedBlock() {
      const dateStr = State.selectedPlannerDate;
      const blockId = document.getElementById('edit-block-id').value;
      const title = document.getElementById('edit-block-title').value.trim();
      const start = document.getElementById('edit-block-start').value;
      const end = document.getElementById('edit-block-end').value;
      const type = document.getElementById('edit-block-type').value;

      if (!title || !start || !end) {
        this.toast('Please provide valid title and times.', 'warning');
        return;
      }

      State.updateBlock(dateStr, blockId, title, start, end, type);
      this.closeModal('modal-edit-block');
      this.toast('Block updated.', 'success');
    },

    // Import Backup Handler
    handleBackupImport(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const validation = Storage.validateImport(parsed);
          if (!validation.valid) {
            this.toast(`Import Failed: ${validation.message}`, 'danger', 6000);
            return;
          }

          this.confirm(`Importing this backup will replace current tasks and schedule. Do you wish to proceed?`, () => {
            State.data = {
              version: STORAGE_VERSION,
              tasks: parsed.tasks,
              commitments: parsed.commitments,
              plans: parsed.plans || {},
              settings: Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {}),
              lastSavedAt: new Date().toISOString()
            };
            State.save(true);
            this.renderAll();
            this.toast('Backup successfully imported!', 'success');
          });
        } catch (err) {
          console.error('Backup JSON parse error:', err);
          this.toast('Invalid JSON file format. Could not parse backup.', 'danger', 6000);
        } finally {
          event.target.value = '';
        }
      };
      reader.readAsText(file);
    },

    // Confirmation Modal System
    confirm(message, onConfirm, onCancel = null) {
      const msgEl = document.getElementById('modal-confirm-message');
      const okBtn = document.getElementById('modal-confirm-ok');
      const cancelBtn = document.getElementById('modal-confirm-cancel');

      msgEl.textContent = message;

      const cleanup = () => {
        this.closeModal('modal-confirm');
        okBtn.replaceWith(okBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      };

      this.openModal('modal-confirm');

      document.getElementById('modal-confirm-ok').addEventListener('click', () => {
        cleanup();
        if (typeof onConfirm === 'function') onConfirm();
      }, { once: true });

      document.getElementById('modal-confirm-cancel').addEventListener('click', () => {
        cleanup();
        if (typeof onCancel === 'function') onCancel();
      }, { once: true });
    },

    // In-App Toast System
    toast(message, type = 'info', duration = 3500) {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      const iconMap = {
        success: '✓',
        danger: '⚠',
        warning: '!',
        info: 'ℹ'
      };

      toast.innerHTML = `
        <span class="toast-icon">${iconMap[type] || 'ℹ'}</span>
        <span class="toast-message">${escapeHTML(message)}</span>
        <button type="button" class="toast-close" title="Dismiss">&times;</button>
      `;

      toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 200);
      });

      container.appendChild(toast);

      setTimeout(() => {
        if (toast.parentElement) {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 200);
        }
      }, duration);
    }
  };

  // =========================================================================
  // HELPER FUNCTIONS (PURE UTILITIES)
  // =========================================================================

  function getTodayDateString() {
    const d = new Date();
    return formatDateKey(d);
  }

  function getRelativeDateString(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return formatDateKey(d);
  }

  function offsetDateString(dateStr, offsetDays) {
    const d = parseDateString(dateStr);
    d.setDate(d.getDate() + offsetDays);
    return formatDateKey(d);
  }

  function formatDateKey(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateString(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const date = parseDateString(dateStr);
    const todayStr = getTodayDateString();

    if (dateStr === todayStr) return 'Today';
    if (dateStr === offsetDateString(todayStr, 1)) return 'Tomorrow';
    if (dateStr === offsetDateString(todayStr, -1)) return 'Yesterday';

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  }

  function daysDifference(dateStr1, dateStr2) {
    const d1 = parseDateString(dateStr1);
    const d2 = parseDateString(dateStr2);
    const diffTime = d2.getTime() - d1.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  function timeStringToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function minutesToTimeString(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function minutesToHourString(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =========================================================================
  // BOOTSTRAP APPLICATION
  // =========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    UI.init();
  });

})();
