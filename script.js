/**
 * StudyFlow 2.0: Simple, Notion-Inspired, Cross-Device Study Planner
 * Vanilla JavaScript (ES6+) with Firebase Authentication & Cloud Firestore
 *
 * Architecture:
 * - Storage: Local-first persistence engine with corruption protection
 * - CloudSync: Firebase Auth (Google Sign-In) & Firestore real-time synchronization
 * - State: Authoritative state manager for tasks, commitments, plans, preferences
 * - SchedulerEngine: Gap-based dynamic study planner with overload protection
 * - UI: Clean Notion-style views (Today, Tasks, Calendar, Settings), mobile bottom nav
 */

(function () {
  'use strict';

  // =========================================================================
  // CONSTANTS & STARTER TEMPLATES
  // =========================================================================

  const STORAGE_KEY = 'studyflow_v1_store';
  const STORAGE_VERSION = 1;
  const FIREBASE_CONFIG_KEY = 'studyflow_firebase_config';

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
      notes: 'Grade 11 school day'
    },
    {
      id: 'comm_arabic_lesson',
      title: 'Arabic Lesson',
      category: 'lesson',
      recurrence: 'recurring',
      daysOfWeek: [1, 3], // Mon, Wed
      startTime: '16:00',
      endTime: '17:30',
      notes: 'Weekly lesson & grammar review'
    },
    {
      id: 'comm_math_lesson',
      title: 'Math Advanced Lesson',
      category: 'lesson',
      recurrence: 'recurring',
      daysOfWeek: [2, 4], // Tue, Thu
      startTime: '17:00',
      endTime: '18:30',
      notes: 'Calculus tutor session'
    },
    {
      id: 'comm_sat_lesson',
      title: 'SAT Weekend Prep Session',
      category: 'sat',
      recurrence: 'recurring',
      daysOfWeek: [6], // Sat
      startTime: '10:00',
      endTime: '12:30',
      notes: 'Practice modules & review'
    }
  ];

  // Grade 11 Starter Tasks Template
  const STARTER_TASKS = [
    {
      id: 'task_sample_calculus',
      title: 'Calculus Exercise 4.2 (Problems 1-15)',
      subject: 'Math',
      type: 'Homework',
      durationMinutes: 45,
      dueDate: getRelativeDateString(0),
      dueTime: '23:59',
      priority: 'High',
      status: 'Pending',
      notes: 'Implicit differentiation exercises.',
      preferredStudyDate: getRelativeDateString(0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    },
    {
      id: 'task_sample_sat_math',
      title: 'SAT Math Practice Module: Heart of Algebra',
      subject: 'SAT',
      type: 'SAT Math',
      durationMinutes: 50,
      dueDate: getRelativeDateString(2),
      dueTime: '18:00',
      priority: 'Urgent',
      status: 'Pending',
      notes: 'Complete module questions and review errors.',
      preferredStudyDate: getRelativeDateString(0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    },
    {
      id: 'task_sample_arabic_prep',
      title: 'Arabic GP Weekly Exam Preparation',
      subject: 'Arabic',
      type: 'GP Weekly Exam Preparation',
      durationMinutes: 60,
      dueDate: getRelativeDateString(1),
      dueTime: '08:00',
      priority: 'Urgent',
      status: 'Pending',
      notes: 'Rhetoric & text analysis review.',
      preferredStudyDate: getRelativeDateString(0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    }
  ];

  const DEFAULT_SETTINGS = {
    theme: 'light', // Notion-inspired clean white default
    sleepStart: '23:00',
    sleepEnd: '06:30',
    bufferMinutes: 30,
    breakDurationMinutes: 10,
    maxBlockDurationMinutes: 50,
    studyStartTime: '15:30'
  };

  // Default Firebase configuration (Can be customized by user in Settings)
  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyStudyFlowStaticAppKeyDemoOnly",
    authDomain: "studyflow-planner.firebaseapp.com",
    projectId: "studyflow-planner",
    storageBucket: "studyflow-planner.appspot.com",
    messagingSenderId: "100000000000",
    appId: "1:100000000000:web:studyflowdemokey"
  };

  // =========================================================================
  // LOCAL STORAGE & PERSISTENCE ENGINE (LOCAL-FIRST)
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
        return this.createInitialData();
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          const initial = this.createInitialData();
          this.save(initial, false);
          return initial;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Corrupted storage root object');
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
        console.error('StudyFlow storage error:', err);
        try {
          const rawCorrupted = localStorage.getItem(STORAGE_KEY);
          if (rawCorrupted) {
            localStorage.setItem(`studyflow_corrupt_backup_${Date.now()}`, rawCorrupted);
          }
        } catch (backupErr) {
          console.error('Failed to create backup:', backupErr);
        }
        return this.createInitialData();
      }
    },

    save(data, notifyCloud = true) {
      if (!this.isAvailable()) return false;
      try {
        data.lastSavedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

        // Trigger background sync to Cloud Firestore if connected
        if (notifyCloud && typeof CloudSync !== 'undefined' && CloudSync.isAuthenticated()) {
          CloudSync.queueSync();
        }
        return true;
      } catch (err) {
        console.error('LocalStorage write failure:', err);
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
        a.href = url;
        a.download = `studyflow-backup-${getTodayDateString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Export error:', e);
      }
    },

    validateImport(jsonData) {
      if (!jsonData || typeof jsonData !== 'object') {
        return { valid: false, message: 'Invalid JSON object' };
      }
      if (!Array.isArray(jsonData.tasks)) {
        return { valid: false, message: 'Backup missing "tasks" array' };
      }
      if (!Array.isArray(jsonData.commitments)) {
        return { valid: false, message: 'Backup missing "commitments" array' };
      }
      return { valid: true };
    }
  };

  // =========================================================================
  // FIREBASE CLOUD SYNCHRONIZATION ENGINE (CROSS-DEVICE)
  // =========================================================================

  const CloudSync = {
    auth: null,
    db: null,
    currentUser: null,
    syncStatus: 'local', // 'local' | 'synced' | 'syncing' | 'offline'
    unsubscribeSnapshot: null,
    syncDebounceTimer: null,

    init() {
      this.updateStatusBadge();

      // Check for custom config saved by user
      let config = DEFAULT_FIREBASE_CONFIG;
      try {
        const savedCustom = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (savedCustom) {
          config = JSON.parse(savedCustom);
        }
      } catch (e) {
        console.warn('Failed to parse custom Firebase config:', e);
      }

      // Initialize Firebase if SDK is available
      if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        try {
          if (!firebase.apps.length) {
            firebase.initializeApp(config);
          }
          this.auth = firebase.auth();
          this.db = firebase.firestore();

          // Listen to Auth State
          this.auth.onAuthStateChanged(user => {
            this.handleAuthStateChange(user);
          });
        } catch (err) {
          console.warn('Firebase initialization notice:', err.message);
          this.syncStatus = 'local';
          this.updateStatusBadge();
        }
      }

      // Monitor network online / offline
      window.addEventListener('online', () => {
        if (this.currentUser) {
          this.syncStatus = 'synced';
          this.updateStatusBadge();
          this.queueSync();
        }
      });

      window.addEventListener('offline', () => {
        if (this.currentUser) {
          this.syncStatus = 'offline';
          this.updateStatusBadge();
        }
      });
    },

    isAuthenticated() {
      return !!this.currentUser;
    },

    handleAuthStateChange(user) {
      this.currentUser = user;

      const signedOutBox = document.getElementById('sync-signed-out-box');
      const signedInBox = document.getElementById('sync-signed-in-box');
      const avatarEl = document.getElementById('user-avatar');
      const nameEl = document.getElementById('user-name');
      const emailEl = document.getElementById('user-email');
      const migrationAlert = document.getElementById('migration-alert');
      const migrationCount = document.getElementById('migration-count');

      if (user) {
        // User is signed in
        if (signedOutBox) signedOutBox.style.display = 'none';
        if (signedInBox) signedInBox.style.display = 'block';

        if (avatarEl) avatarEl.src = user.photoURL || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%232563eb"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
        if (nameEl) nameEl.textContent = user.displayName || 'StudyFlow Student';
        if (emailEl) emailEl.textContent = user.email || '';

        this.syncStatus = navigator.onLine ? 'synced' : 'offline';
        this.updateStatusBadge();

        // Check if user has pre-existing local data to offer migration
        const localTasksCount = State.data.tasks.length;
        if (localTasksCount > 0 && migrationAlert && migrationCount) {
          migrationAlert.style.display = 'block';
          migrationCount.textContent = `${localTasksCount} local tasks and schedules ready to save to your cloud account.`;
        }

        // Setup Real-time Firestore Listener on user's private document: users/{userId}/appState/main
        this.setupCloudListener(user.uid);
      } else {
        // User is signed out
        if (signedOutBox) signedOutBox.style.display = 'block';
        if (signedInBox) signedInBox.style.display = 'none';
        if (migrationAlert) migrationAlert.style.display = 'none';

        if (this.unsubscribeSnapshot) {
          this.unsubscribeSnapshot();
          this.unsubscribeSnapshot = null;
        }

        this.syncStatus = 'local';
        this.updateStatusBadge();
      }
    },

    async signInWithGoogle() {
      if (!this.auth) {
        UI.toast('Firebase is in demo mode. Configure your Firebase project in Settings to enable live Google Sign-In.', 'warning', 5000);
        return;
      }
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await this.auth.signInWithPopup(provider);
        UI.toast('Signed in successfully!', 'success');
      } catch (err) {
        console.error('Google Sign-in error:', err);
        UI.toast('Sign-in cancelled or blocked by popup blocker.', 'danger', 4000);
      }
    },

    async signOut() {
      if (!this.auth) return;
      try {
        await this.auth.signOut();
        UI.toast('Signed out. Switched to local mode.', 'info');
      } catch (err) {
        console.error('Sign-out error:', err);
      }
    },

    setupCloudListener(userId) {
      if (!this.db) return;
      try {
        const docRef = this.db.collection('users').doc(userId).collection('appState').doc('main');

        this.unsubscribeSnapshot = docRef.onSnapshot(doc => {
          if (doc.exists) {
            const cloudData = doc.data();
            // If cloud has newer data than local
            if (cloudData && cloudData.lastSavedAt && (!State.data.lastSavedAt || cloudData.lastSavedAt > State.data.lastSavedAt)) {
              State.data = {
                version: STORAGE_VERSION,
                tasks: Array.isArray(cloudData.tasks) ? cloudData.tasks : State.data.tasks,
                commitments: Array.isArray(cloudData.commitments) ? cloudData.commitments : State.data.commitments,
                plans: cloudData.plans || State.data.plans,
                settings: Object.assign({}, DEFAULT_SETTINGS, cloudData.settings || {}),
                lastSavedAt: cloudData.lastSavedAt
              };
              Storage.save(State.data, false);
              UI.renderAll();
              UI.toast('Data synchronized from cloud.', 'info', 2000);
            }
          }
          this.syncStatus = 'synced';
          this.updateStatusBadge();
        }, err => {
          console.warn('Firestore snapshot error:', err.message);
          this.syncStatus = 'offline';
          this.updateStatusBadge();
        });
      } catch (err) {
        console.error('Error setting up cloud listener:', err);
      }
    },

    queueSync() {
      if (!this.currentUser || !this.db || !navigator.onLine) return;

      this.syncStatus = 'syncing';
      this.updateStatusBadge();

      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = setTimeout(async () => {
        try {
          const docRef = this.db.collection('users').doc(this.currentUser.uid).collection('appState').doc('main');
          await docRef.set({
            tasks: State.data.tasks,
            commitments: State.data.commitments,
            plans: State.data.plans,
            settings: State.data.settings,
            lastSavedAt: new Date().toISOString()
          }, { merge: true });

          this.syncStatus = 'synced';
          this.updateStatusBadge();
        } catch (err) {
          console.error('Firestore push error:', err);
          this.syncStatus = 'offline';
          this.updateStatusBadge();
        }
      }, 800); // 800ms debounce
    },

    async migrateLocalDataToCloud() {
      if (!this.currentUser || !this.db) {
        UI.toast('Sign in first before uploading local data.', 'warning');
        return;
      }
      try {
        this.syncStatus = 'syncing';
        this.updateStatusBadge();

        const docRef = this.db.collection('users').doc(this.currentUser.uid).collection('appState').doc('main');
        await docRef.set({
          tasks: State.data.tasks,
          commitments: State.data.commitments,
          plans: State.data.plans,
          settings: State.data.settings,
          lastSavedAt: new Date().toISOString()
        }, { merge: true });

        const alertEl = document.getElementById('migration-alert');
        if (alertEl) alertEl.style.display = 'none';

        this.syncStatus = 'synced';
        this.updateStatusBadge();
        UI.toast('Local tasks successfully uploaded to your cloud account!', 'success');
      } catch (err) {
        console.error('Migration failed:', err);
        UI.toast('Failed to upload data. Check your network connection.', 'danger');
      }
    },

    updateStatusBadge() {
      const pills = [
        document.getElementById('sidebar-sync-pill'),
        document.getElementById('mobile-sync-pill'),
        document.getElementById('settings-sync-badge')
      ];

      const labelMap = {
        synced: 'Synced',
        syncing: 'Syncing...',
        offline: 'Offline',
        local: 'Local Mode'
      };

      pills.forEach(pill => {
        if (!pill) return;
        pill.className = `sync-pill ${this.syncStatus}`;
        const textSpan = pill.querySelector('.sync-text');
        if (textSpan) textSpan.textContent = labelMap[this.syncStatus] || 'Local';
      });
    }
  };

  // =========================================================================
  // STATE MANAGEMENT
  // =========================================================================

  const State = {
    data: null,
    currentTab: 'today',
    selectedCalendarDate: getTodayDateString(),
    taskFilters: {
      status: 'active',
      subject: 'all',
      priority: 'all',
      search: '',
      sort: 'dueDate-asc'
    },
    tempProposedPlan: null,

    init() {
      this.data = Storage.load();
    },

    save(notify = true) {
      Storage.save(this.data, true);
      if (notify) UI.renderAll();
    },

    // Task Actions
    addTask(task) {
      this.data.tasks.unshift(task);
      this.save(true);
      UI.toast('Task added.', 'success', 2000);
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
        UI.toast('Task updated.', 'success', 2000);
      }
    },

    toggleTaskStatus(id) {
      const task = this.data.tasks.find(t => t.id === id);
      if (!task) return;
      const isCompleted = task.status === 'Completed';
      task.status = isCompleted ? 'Pending' : 'Completed';
      task.completedAt = isCompleted ? null : new Date().toISOString();
      task.updatedAt = new Date().toISOString();

      // Sync block in today's plan if present
      const todayPlan = this.data.plans[getTodayDateString()];
      if (todayPlan && Array.isArray(todayPlan.blocks)) {
        todayPlan.blocks.forEach(b => {
          if (b.taskId === id) b.completed = task.status === 'Completed';
        });
      }

      this.save(true);
    },

    deleteTask(id) {
      const idx = this.data.tasks.findIndex(t => t.id === id);
      if (idx === -1) return;
      const title = this.data.tasks[idx].title;

      UI.confirm(`Delete task "${title}"?`, () => {
        this.data.tasks.splice(idx, 1);
        Object.values(this.data.plans).forEach(p => {
          if (p.blocks) p.blocks = p.blocks.filter(b => b.taskId !== id);
        });
        this.save(true);
        UI.toast('Task deleted.', 'info', 2000);
      });
    },

    // Fixed Commitment Actions
    addCommitment(commitment) {
      this.data.commitments.push(commitment);
      this.save(true);
      UI.toast('Commitment saved.', 'success', 2000);
    },

    updateCommitment(id, updatedFields) {
      const idx = this.data.commitments.findIndex(c => c.id === id);
      if (idx !== -1) {
        this.data.commitments[idx] = { ...this.data.commitments[idx], ...updatedFields };
        this.save(true);
        UI.toast('Commitment updated.', 'success', 2000);
      }
    },

    deleteCommitment(id) {
      const idx = this.data.commitments.findIndex(c => c.id === id);
      if (idx === -1) return;
      const title = this.data.commitments[idx].title;

      UI.confirm(`Remove commitment "${title}"?`, () => {
        this.data.commitments.splice(idx, 1);
        this.save(true);
        UI.toast('Commitment removed.', 'info', 2000);
      });
    },

    // Daily Plan Actions
    saveDailyPlan(dateStr, planObj) {
      this.data.plans[dateStr] = planObj;
      this.save(true);
      UI.toast(`Schedule saved for ${formatDateDisplay(dateStr)}.`, 'success');
    },

    clearDailyPlan(dateStr) {
      if (!this.data.plans[dateStr]) return;
      UI.confirm(`Clear schedule for ${formatDateDisplay(dateStr)}? Tasks will remain.`, () => {
        delete this.data.plans[dateStr];
        this.save(true);
        UI.toast('Schedule cleared.', 'info');
      });
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
      }
    },

    removeBlock(dateStr, blockId) {
      const plan = this.data.plans[dateStr];
      if (!plan || !plan.blocks) return;
      plan.blocks = plan.blocks.filter(b => b.id !== blockId);
      this.save(true);
    }
  };

  // =========================================================================
  // SCHEDULING ENGINE (GAP-BASED DYNAMIC SCHEDULER)
  // =========================================================================

  const SchedulerEngine = {
    getCommitmentsForDate(dateStr, commitments) {
      const d = parseDateString(dateStr);
      const dayOfWeek = d.getDay();
      return commitments.filter(c => {
        if (c.recurrence === 'recurring') {
          return Array.isArray(c.daysOfWeek) && c.daysOfWeek.includes(dayOfWeek);
        }
        return c.date === dateStr;
      });
    },

    buildBusyIntervals(dateStr, commitments, sleepStart, sleepEnd) {
      const busy = [];
      const sleepStartMins = timeStringToMinutes(sleepStart);
      const sleepEndMins = timeStringToMinutes(sleepEnd);

      // Sleep Interval
      if (sleepStartMins > sleepEndMins) {
        busy.push({ start: sleepStartMins, end: 1440, title: 'Sleep', isFixed: true });
        busy.push({ start: 0, end: sleepEndMins, title: 'Sleep', isFixed: true });
      } else {
        busy.push({ start: sleepStartMins, end: sleepEndMins, title: 'Sleep', isFixed: true });
      }

      // Add day commitments
      const dayComms = this.getCommitmentsForDate(dateStr, commitments);
      dayComms.forEach(c => {
        const start = timeStringToMinutes(c.startTime);
        const end = timeStringToMinutes(c.endTime);
        if (end > start) {
          busy.push({ start, end, title: c.title, category: c.category, isFixed: true });
        }
      });

      busy.sort((a, b) => a.start - b.start);
      return busy;
    },

    calculateFreeSlots(startMins, endMins, busyIntervals) {
      const slots = [];
      let cursor = Math.max(0, startMins);

      // Merge overlapping busy blocks
      const merged = [];
      busyIntervals.forEach(b => {
        if (!merged.length) merged.push({ ...b });
        else {
          const prev = merged[merged.length - 1];
          if (b.start <= prev.end) prev.end = Math.max(prev.end, b.end);
          else merged.push({ ...b });
        }
      });

      merged.forEach(b => {
        if (b.end <= cursor) return;
        if (b.start > cursor && b.start < endMins) {
          const gapEnd = Math.min(b.start, endMins);
          if (gapEnd - cursor >= 15) {
            slots.push({ start: cursor, end: gapEnd, duration: gapEnd - cursor });
          }
        }
        cursor = Math.max(cursor, b.end);
      });

      if (cursor < endMins && (endMins - cursor) >= 15) {
        slots.push({ start: cursor, end: endMins, duration: endMins - cursor });
      }

      return slots;
    },

    prioritizeTasks(tasks, targetDateStr) {
      const pScore = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
      return [...tasks].sort((a, b) => {
        const aDue = a.dueDate <= targetDateStr;
        const bDue = b.dueDate <= targetDateStr;
        if (aDue !== bDue) return aDue ? -1 : 1;

        const aExam = (a.type && (a.type.includes('Exam') || a.type.includes('SAT'))) ? 1 : 0;
        const bExam = (b.type && (b.type.includes('Exam') || b.type.includes('SAT'))) ? 1 : 0;
        if (aExam !== bExam) return bExam - aExam;

        const aP = pScore[a.priority] || 2;
        const bP = pScore[b.priority] || 2;
        if (aP !== bP) return bP - aP;

        return (a.dueDate || '').localeCompare(b.dueDate || '');
      });
    },

    generatePlan({ dateStr, startTimeStr, tasksToSchedule, commitments, settings, resumeFromMins = null }) {
      const sleepStartMins = timeStringToMinutes(settings.sleepStart || '23:00');
      const sleepEndMins = timeStringToMinutes(settings.sleepEnd || '06:30');
      const bufferMins = Number(settings.bufferMinutes) || 30;
      const breakMins = Number(settings.breakDurationMinutes) || 10;
      const maxBlockDuration = Number(settings.maxBlockDurationMinutes) || 50;

      let planStartMins = resumeFromMins !== null
        ? resumeFromMins
        : timeStringToMinutes(startTimeStr || settings.studyStartTime || '15:30');

      if (planStartMins < sleepEndMins) planStartMins = sleepEndMins;

      const busy = this.buildBusyIntervals(dateStr, commitments, settings.sleepStart, settings.sleepEnd);
      const freeSlots = this.calculateFreeSlots(planStartMins, sleepStartMins, busy);
      const sortedTasks = this.prioritizeTasks(tasksToSchedule, dateStr);

      const scheduleBlocks = [];
      const unscheduledTasks = [];

      // Add fixed commitments occurring inside study window to timeline
      const dayComms = this.getCommitmentsForDate(dateStr, commitments);
      dayComms.forEach(c => {
        const start = timeStringToMinutes(c.startTime);
        const end = timeStringToMinutes(c.endTime);
        if (end > planStartMins && start < sleepStartMins) {
          scheduleBlocks.push({
            id: 'block_fixed_' + c.id,
            title: c.title,
            type: 'fixed',
            startTime: c.startTime,
            endTime: c.endTime,
            startMins: start,
            endMins: end,
            durationMinutes: end - start,
            completed: false
          });
        }
      });

      let slotIdx = 0;
      let slotOffset = 0;

      for (const task of sortedTasks) {
        let taskRemain = Number(task.durationMinutes) || 45;
        let scheduledAny = false;

        while (slotIdx < freeSlots.length && taskRemain > 0) {
          const slot = freeSlots[slotIdx];
          const availableInSlot = (slot.end - slot.start) - slotOffset;

          if (availableInSlot < 15) {
            slotIdx++;
            slotOffset = 0;
            continue;
          }

          const chunk = Math.min(taskRemain, maxBlockDuration, availableInSlot);
          const bStart = slot.start + slotOffset;
          const bEnd = bStart + chunk;

          scheduleBlocks.push({
            id: 'block_task_' + task.id + '_' + bStart,
            taskId: task.id,
            title: task.title,
            subject: task.subject,
            type: 'study',
            startTime: minutesToTimeString(bStart),
            endTime: minutesToTimeString(bEnd),
            startMins: bStart,
            endMins: bEnd,
            durationMinutes: chunk,
            completed: task.status === 'Completed'
          });

          taskRemain -= chunk;
          slotOffset += chunk;
          scheduledAny = true;

          // Short break
          const remainingInSlot = (slot.end - slot.start) - slotOffset;
          if (remainingInSlot >= breakMins && (taskRemain > 0 || slotIdx < freeSlots.length)) {
            scheduleBlocks.push({
              id: 'block_break_' + (slot.start + slotOffset),
              title: 'Short Break',
              type: 'break',
              startTime: minutesToTimeString(slot.start + slotOffset),
              endTime: minutesToTimeString(slot.start + slotOffset + breakMins),
              startMins: slot.start + slotOffset,
              endMins: slot.start + slotOffset + breakMins,
              durationMinutes: breakMins,
              completed: false
            });
            slotOffset += breakMins;
          } else if (remainingInSlot < 15) {
            slotIdx++;
            slotOffset = 0;
          }
        }

        if (!scheduledAny || taskRemain > 0) {
          unscheduledTasks.push({
            ...task,
            reason: 'Insufficient study time before bedtime.'
          });
        }
      }

      // Buffer reservation
      if (bufferMins > 0 && slotIdx < freeSlots.length) {
        const slot = freeSlots[slotIdx];
        const avail = (slot.end - slot.start) - slotOffset;
        const buf = Math.min(bufferMins, avail);
        if (buf >= 15) {
          const bStart = slot.start + slotOffset;
          scheduleBlocks.push({
            id: 'block_buffer_' + bStart,
            title: 'Buffer / Flex Time',
            type: 'buffer',
            startTime: minutesToTimeString(bStart),
            endTime: minutesToTimeString(bStart + buf),
            startMins: bStart,
            endMins: bStart + buf,
            durationMinutes: buf,
            completed: false
          });
        }
      }

      scheduleBlocks.sort((a, b) => a.startMins - b.startMins);

      return {
        date: dateStr,
        generatedAt: new Date().toISOString(),
        blocks: scheduleBlocks,
        unscheduledTasks
      };
    },

    rescheduleRemaining({ dateStr, currentPlan, allTasks, commitments, settings }) {
      const now = new Date();
      const currentMins = now.getHours() * 60 + Math.ceil(now.getMinutes() / 5) * 5;

      const preserved = [];
      const completedTaskIds = new Set();

      if (currentPlan && Array.isArray(currentPlan.blocks)) {
        currentPlan.blocks.forEach(b => {
          if (b.completed || b.startMins < currentMins) {
            preserved.push(b);
            if (b.taskId) completedTaskIds.add(b.taskId);
          }
        });
      }

      const candidates = allTasks.filter(t => t.status !== 'Completed' && !completedTaskIds.has(t.id));
      const proposal = this.generatePlan({
        dateStr,
        startTimeStr: minutesToTimeString(currentMins),
        tasksToSchedule: candidates,
        commitments,
        settings,
        resumeFromMins: currentMins
      });

      const futureBlocks = proposal.blocks.filter(b => b.startMins >= currentMins);
      const combined = [...preserved, ...futureBlocks].sort((a, b) => a.startMins - b.startMins);

      return {
        date: dateStr,
        generatedAt: new Date().toISOString(),
        blocks: combined,
        unscheduledTasks: proposal.unscheduledTasks
      };
    }
  };

  // =========================================================================
  // USER INTERFACE (NOTION-INSPIRED MINIMALIST DESIGN)
  // =========================================================================

  const UI = {
    init() {
      State.init();
      CloudSync.init();

      // Apply saved theme (Default is light)
      const theme = State.data.settings.theme || 'light';
      this.applyTheme(theme);

      // Guard: only bind DOM if elements exist
      if (!document.getElementById('btn-today-add-task')) return;

      this.bindEvents();
      this.renderAll();
    },

    bindEvents() {
      // Navigation Tabs (Desktop Sidebar + Mobile Bottom Bar)
      document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tab = e.currentTarget.getAttribute('data-tab');
          this.switchTab(tab);
        });
      });

      // Quick Add Task Buttons
      ['btn-sidebar-add-task', 'btn-mobile-add-task', 'btn-today-add-task', 'btn-tasks-new'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => this.openTaskModal());
      });

      // Plan My Day Actions
      const btnTodayPlan = document.getElementById('btn-today-plan');
      if (btnTodayPlan) btnTodayPlan.addEventListener('click', () => this.openPlanGenerator(getTodayDateString()));

      const btnTodayReschedule = document.getElementById('btn-today-reschedule');
      if (btnTodayReschedule) btnTodayReschedule.addEventListener('click', () => this.triggerReschedule(getTodayDateString()));

      const btnTodayAdjust = document.getElementById('btn-today-adjust-plan');
      if (btnTodayAdjust) btnTodayAdjust.addEventListener('click', () => this.openPlanGenerator(getTodayDateString()));

      const btnGotoCal = document.getElementById('btn-today-goto-calendar');
      if (btnGotoCal) btnGotoCal.addEventListener('click', () => this.switchTab('calendar'));

      // Task Filter Listeners
      const searchInput = document.getElementById('tasks-search');
      if (searchInput) {
        searchInput.addEventListener('input', e => {
          State.taskFilters.search = e.target.value.toLowerCase().trim();
          this.renderTasksTable();
        });
      }

      document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', e => {
          document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
          e.currentTarget.classList.add('active');
          State.taskFilters.status = e.currentTarget.getAttribute('data-filter-status');
          this.renderTasksTable();
        });
      });

      const selSubject = document.getElementById('tasks-filter-subject');
      if (selSubject) {
        selSubject.addEventListener('change', e => {
          State.taskFilters.subject = e.target.value;
          this.renderTasksTable();
        });
      }

      const selPriority = document.getElementById('tasks-filter-priority');
      if (selPriority) {
        selPriority.addEventListener('change', e => {
          State.taskFilters.priority = e.target.value;
          this.renderTasksTable();
        });
      }

      const selSort = document.getElementById('tasks-sort-by');
      if (selSort) {
        selSort.addEventListener('change', e => {
          State.taskFilters.sort = e.target.value;
          this.renderTasksTable();
        });
      }

      // Calendar Controls
      const calDatePicker = document.getElementById('calendar-date-picker');
      if (calDatePicker) {
        calDatePicker.value = State.selectedCalendarDate;
        calDatePicker.addEventListener('change', e => {
          State.selectedCalendarDate = e.target.value;
          this.renderCalendar();
        });
      }

      document.getElementById('cal-prev-day')?.addEventListener('click', () => {
        State.selectedCalendarDate = offsetDateString(State.selectedCalendarDate, -1);
        if (calDatePicker) calDatePicker.value = State.selectedCalendarDate;
        this.renderCalendar();
      });

      document.getElementById('cal-next-day')?.addEventListener('click', () => {
        State.selectedCalendarDate = offsetDateString(State.selectedCalendarDate, 1);
        if (calDatePicker) calDatePicker.value = State.selectedCalendarDate;
        this.renderCalendar();
      });

      document.getElementById('cal-today-btn')?.addEventListener('click', () => {
        State.selectedCalendarDate = getTodayDateString();
        if (calDatePicker) calDatePicker.value = State.selectedCalendarDate;
        this.renderCalendar();
      });

      document.getElementById('btn-cal-plan-day')?.addEventListener('click', () => {
        this.openPlanGenerator(State.selectedCalendarDate);
      });

      document.getElementById('btn-calendar-add-commitment')?.addEventListener('click', () => {
        this.openCommitmentModal();
      });

      // Settings Theme Toggle
      document.getElementById('sidebar-theme-toggle')?.addEventListener('click', () => {
        const currentTheme = State.data.settings.theme || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        State.data.settings.theme = newTheme;
        State.save(false);
        this.applyTheme(newTheme);
      });

      // Settings Google Auth & Sync
      document.getElementById('btn-google-signin')?.addEventListener('click', () => CloudSync.signInWithGoogle());
      document.getElementById('btn-google-signout')?.addEventListener('click', () => CloudSync.signOut());
      document.getElementById('btn-migrate-local-data')?.addEventListener('click', () => CloudSync.migrateLocalDataToCloud());

      // Settings Firebase Accordion
      document.getElementById('btn-toggle-firebase-config')?.addEventListener('click', () => {
        const content = document.getElementById('content-firebase-config');
        const chevron = document.getElementById('chevron-firebase');
        if (content) {
          const isOpen = content.style.display !== 'none';
          content.style.display = isOpen ? 'none' : 'block';
          if (chevron) chevron.textContent = isOpen ? '▾' : '▴';
        }
      });

      document.getElementById('btn-save-custom-firebase')?.addEventListener('click', () => {
        const val = document.getElementById('custom-firebase-config-input')?.value.trim();
        if (val) {
          try {
            const parsed = JSON.parse(val);
            localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(parsed));
            this.toast('Custom Firebase configuration saved. Please reload page.', 'success');
          } catch (e) {
            this.toast('Invalid JSON format for Firebase config.', 'danger');
          }
        }
      });

      document.getElementById('btn-reset-firebase')?.addEventListener('click', () => {
        localStorage.removeItem(FIREBASE_CONFIG_KEY);
        this.toast('Reset to default configuration. Please reload page.', 'info');
      });

      // Settings Routine Preferences Form
      document.getElementById('form-settings-routine')?.addEventListener('submit', e => {
        e.preventDefault();
        State.data.settings.sleepStart = document.getElementById('set-sleep-start').value;
        State.data.settings.sleepEnd = document.getElementById('set-sleep-end').value;
        State.data.settings.bufferMinutes = Number(document.getElementById('set-buffer-mins').value);
        State.data.settings.breakDurationMinutes = Number(document.getElementById('set-break-mins').value);
        State.save(false);
        this.toast('Routine preferences saved.', 'success');
      });

      // Settings Backup & Reset
      document.getElementById('btn-export-backup')?.addEventListener('click', () => Storage.exportJSON(State.data));
      document.getElementById('file-import-input')?.addEventListener('change', e => this.handleImportBackup(e));
      document.getElementById('btn-reset-data')?.addEventListener('click', () => {
        this.confirm('Reset local tasks and restore starter template?', () => {
          State.data = Storage.createInitialData();
          State.save(true);
          this.toast('Reset to default template.', 'info');
        });
      });

      // Task Form: Expandable "More Options" toggle
      document.getElementById('btn-toggle-task-more')?.addEventListener('click', () => {
        const content = document.getElementById('content-task-more');
        const label = document.getElementById('label-task-more');
        if (content) {
          const isClosed = content.style.display === 'none';
          content.style.display = isClosed ? 'block' : 'none';
          if (label) label.textContent = isClosed ? '▾ Less options' : '▸ More options (type, study date, notes)';
        }
      });

      document.getElementById('form-task')?.addEventListener('submit', e => {
        e.preventDefault();
        this.saveTaskFromModal();
      });

      // Commitment Form
      document.getElementById('form-commitment')?.addEventListener('submit', e => {
        e.preventDefault();
        this.saveCommitmentFromModal();
      });

      document.getElementById('commitment-recurrence')?.addEventListener('change', e => {
        const isRec = e.target.value === 'recurring';
        document.getElementById('group-commitment-days').style.display = isRec ? 'block' : 'none';
        document.getElementById('group-commitment-date').style.display = isRec ? 'none' : 'block';
      });

      // Plan Generator Modal
      document.getElementById('btn-gen-select-all')?.addEventListener('click', () => {
        document.querySelectorAll('#gen-tasks-checklist input').forEach(c => c.checked = true);
      });

      document.getElementById('btn-calc-preview')?.addEventListener('click', () => this.calculatePlanPreview());
      document.getElementById('btn-apply-plan')?.addEventListener('click', () => this.applyPlan());

      // Modal Close Handlers
      document.querySelectorAll('[data-close-modal]').forEach(b => {
        b.addEventListener('click', e => {
          const m = e.target.closest('.modal-backdrop');
          if (m) this.closeModal(m.id);
        });
      });

      document.querySelectorAll('.modal-backdrop').forEach(bd => {
        bd.addEventListener('click', e => {
          if (e.target === bd) this.closeModal(bd.id);
        });
      });

      window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          document.querySelectorAll('.modal-backdrop.active').forEach(m => this.closeModal(m.id));
        }
      });
    },

    applyTheme(theme) {
      const isDark = theme === 'dark';
      document.body.classList.toggle('theme-dark', isDark);
      document.body.classList.toggle('theme-light', !isDark);

      const icon = document.getElementById('theme-toggle-icon');
      const label = document.getElementById('theme-toggle-label');
      if (icon) icon.textContent = isDark ? '☀️' : '🌙';
      if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    },

    switchTab(tabName) {
      State.currentTab = tabName;

      // Update Desktop Sidebar
      document.querySelectorAll('.sidebar-nav-item').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
      });

      // Update Mobile Bottom Nav
      document.querySelectorAll('.bottom-nav-item').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
      });

      // Update View Panels
      document.querySelectorAll('.view-panel').forEach(p => {
        p.classList.toggle('active', p.id === `view-${tabName}`);
      });

      if (tabName === 'today') this.renderToday();
      if (tabName === 'tasks') this.renderTasksTable();
      if (tabName === 'calendar') this.renderCalendar();
      if (tabName === 'settings') this.renderSettings();
    },

    renderAll() {
      this.renderToday();
      this.renderTasksTable();
      this.renderCalendar();
      this.renderSettings();

      const taskCountBadge = document.getElementById('sidebar-task-count');
      if (taskCountBadge) {
        const active = State.data.tasks.filter(t => t.status !== 'Completed').length;
        taskCountBadge.textContent = active;
      }
    },

    // =======================================================================
    // 1. TODAY VIEW
    // =======================================================================

    renderToday() {
      const todayStr = getTodayDateString();
      const dateHeading = document.getElementById('today-date-heading');
      if (dateHeading) {
        dateHeading.textContent = new Date().toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric'
        });
      }

      const tasks = State.data.tasks;
      const dueToday = tasks.filter(t => t.dueDate === todayStr || t.dueDate < todayStr);
      const dueTodayPending = dueToday.filter(t => t.status !== 'Completed');
      const dueTodayDone = dueToday.filter(t => t.status === 'Completed');

      // Progress Line
      const totalDueCount = dueToday.length;
      const doneCount = dueTodayDone.length;
      const pct = totalDueCount > 0 ? Math.round((doneCount / totalDueCount) * 100) : 100;

      const progressLabel = document.getElementById('today-progress-label');
      const progressPct = document.getElementById('today-progress-pct');
      const progressFill = document.getElementById('today-progress-fill');

      if (progressLabel) progressLabel.textContent = `${doneCount} of ${totalDueCount} tasks completed`;
      if (progressPct) progressPct.textContent = `${pct}%`;
      if (progressFill) progressFill.style.width = `${pct}%`;

      const summaryText = document.getElementById('today-summary-text');
      if (summaryText) {
        summaryText.textContent = dueTodayPending.length > 0
          ? `${dueTodayPending.length} pending task(s) due today.`
          : 'You are caught up on tasks due today.';
      }

      // Today's Plan Timeline
      const scheduleList = document.getElementById('today-schedule-list');
      const planStatusBadge = document.getElementById('today-plan-status-badge');
      const btnReschedule = document.getElementById('btn-today-reschedule');
      const btnAdjust = document.getElementById('btn-today-adjust-plan');

      const todayPlan = State.data.plans[todayStr];

      if (todayPlan && Array.isArray(todayPlan.blocks) && todayPlan.blocks.length > 0) {
        if (planStatusBadge) {
          planStatusBadge.className = 'badge badge-high';
          planStatusBadge.textContent = 'Active Plan';
        }
        if (btnReschedule) btnReschedule.style.display = 'inline-block';
        if (btnAdjust) btnAdjust.style.display = 'inline-block';

        if (scheduleList) {
          scheduleList.innerHTML = todayPlan.blocks.map(b => `
            <div class="timeline-item">
              <div class="item-left">
                ${b.type === 'study' ? `
                  <input type="checkbox" class="check-toggle"
                         ${b.completed ? 'checked' : ''}
                         data-toggle-block="${escapeHTML(b.id)}">
                ` : '<span style="font-size:0.9rem;">🔒</span>'}
                <span class="item-time">${escapeHTML(b.startTime)} - ${escapeHTML(b.endTime)}</span>
                <span class="item-title ${b.completed ? 'completed' : ''}">${escapeHTML(b.title)}</span>
                ${b.subject ? `<span class="badge badge-subject">${escapeHTML(b.subject)}</span>` : ''}
              </div>
              <div class="item-right">
                <span class="text-sm text-subtle">${b.durationMinutes}m</span>
                <button type="button" class="btn btn-ghost btn-xs text-danger" data-remove-block="${escapeHTML(b.id)}" title="Remove block">&times;</button>
              </div>
            </div>
          `).join('');

          scheduleList.querySelectorAll('[data-toggle-block]').forEach(cb => {
            cb.addEventListener('change', e => {
              const bId = e.target.getAttribute('data-toggle-block');
              State.toggleBlockCompleted(todayStr, bId);
            });
          });

          scheduleList.querySelectorAll('[data-remove-block]').forEach(btn => {
            btn.addEventListener('click', e => {
              const bId = e.currentTarget.getAttribute('data-remove-block');
              State.removeBlock(todayStr, bId);
            });
          });
        }
      } else {
        if (planStatusBadge) {
          planStatusBadge.className = 'badge';
          planStatusBadge.textContent = 'No plan yet';
        }
        if (btnReschedule) btnReschedule.style.display = 'none';
        if (btnAdjust) btnAdjust.style.display = 'none';

        if (scheduleList) {
          scheduleList.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-title">No schedule planned for today</div>
              <p class="empty-state-text">Press "Plan My Day" to generate a suggested timeline around your lessons and bedtime.</p>
              <button type="button" class="btn btn-primary btn-sm" id="btn-empty-today-plan">Plan My Day</button>
            </div>
          `;
          document.getElementById('btn-empty-today-plan')?.addEventListener('click', () => {
            this.openPlanGenerator(todayStr);
          });
        }
      }

      // Urgent & Due Today Checklist
      const tasksChecklist = document.getElementById('today-tasks-checklist');
      const urgentCounter = document.getElementById('today-urgent-counter');
      if (urgentCounter) urgentCounter.textContent = dueTodayPending.length;

      if (tasksChecklist) {
        if (dueToday.length === 0) {
          tasksChecklist.innerHTML = `<div class="empty-state"><p class="text-subtle text-sm">No tasks due today.</p></div>`;
        } else {
          tasksChecklist.innerHTML = dueToday.map(t => `
            <div class="task-row-item">
              <div class="item-left">
                <input type="checkbox" class="check-toggle"
                       ${t.status === 'Completed' ? 'checked' : ''}
                       data-toggle-task="${escapeHTML(t.id)}">
                <span class="item-title ${t.status === 'Completed' ? 'completed' : ''}">${escapeHTML(t.title)}</span>
                <span class="badge badge-subject">${escapeHTML(t.subject)}</span>
              </div>
              <span class="badge badge-${t.priority.toLowerCase()}">${escapeHTML(t.priority)}</span>
            </div>
          `).join('');

          tasksChecklist.querySelectorAll('[data-toggle-task]').forEach(cb => {
            cb.addEventListener('change', e => {
              const tId = e.target.getAttribute('data-toggle-task');
              State.toggleTaskStatus(tId);
            });
          });
        }
      }

      // Today's Fixed Commitments
      const commitmentsList = document.getElementById('today-commitments-list');
      const commsCounter = document.getElementById('today-commitments-counter');
      const todayComms = SchedulerEngine.getCommitmentsForDate(todayStr, State.data.commitments);
      if (commsCounter) commsCounter.textContent = todayComms.length;

      if (commitmentsList) {
        if (todayComms.length === 0) {
          commitmentsList.innerHTML = `<div class="empty-state"><p class="text-subtle text-sm">No fixed commitments today.</p></div>`;
        } else {
          commitmentsList.innerHTML = todayComms.map(c => `
            <div class="commitment-item-row">
              <div class="item-left">
                <span class="item-time">${escapeHTML(c.startTime)} - ${escapeHTML(c.endTime)}</span>
                <span class="item-title">${escapeHTML(c.title)}</span>
              </div>
              <span class="badge">${escapeHTML(c.category.toUpperCase())}</span>
            </div>
          `).join('');
        }
      }
    },

    // =======================================================================
    // 2. TASKS DATABASE VIEW (Notion Style)
    // =======================================================================

    renderTasksTable() {
      const rowsContainer = document.getElementById('tasks-database-rows');
      if (!rowsContainer) return;

      const todayStr = getTodayDateString();
      let list = [...State.data.tasks];
      const filters = State.taskFilters;

      // Filter: Search
      if (filters.search) {
        const q = filters.search;
        list = list.filter(t =>
          t.title.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          (t.notes && t.notes.toLowerCase().includes(q))
        );
      }

      // Filter: Status pill
      if (filters.status === 'active') {
        list = list.filter(t => t.status !== 'Completed');
      } else if (filters.status === 'completed') {
        list = list.filter(t => t.status === 'Completed');
      } else if (filters.status === 'due-today') {
        list = list.filter(t => t.dueDate === todayStr && t.status !== 'Completed');
      } else if (filters.status === 'overdue') {
        list = list.filter(t => t.dueDate < todayStr && t.status !== 'Completed');
      }

      // Filter: Subject
      if (filters.subject !== 'all') {
        list = list.filter(t => t.subject === filters.subject);
      }

      // Filter: Priority
      if (filters.priority !== 'all') {
        list = list.filter(t => t.priority === filters.priority);
      }

      // Sort
      const pScore = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
      list.sort((a, b) => {
        if (filters.sort === 'dueDate-asc') return (a.dueDate || '').localeCompare(b.dueDate || '');
        if (filters.sort === 'priority-desc') return (pScore[b.priority] || 2) - (pScore[a.priority] || 2);
        if (filters.sort === 'duration-asc') return (a.durationMinutes || 0) - (b.durationMinutes || 0);
        if (filters.sort === 'duration-desc') return (b.durationMinutes || 0) - (a.durationMinutes || 0);
        if (filters.sort === 'createdAt-desc') return (b.createdAt || '').localeCompare(a.createdAt || '');
        return 0;
      });

      if (list.length === 0) {
        rowsContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">No tasks found</div>
            <p class="empty-state-text">No tasks match your current filter.</p>
          </div>
        `;
        return;
      }

      rowsContainer.innerHTML = list.map(t => {
        const isOverdue = t.dueDate < todayStr && t.status !== 'Completed';
        const isToday = t.dueDate === todayStr;

        return `
          <div class="task-db-row ${t.status === 'Completed' ? 'completed' : ''}">
            <input type="checkbox" class="check-toggle col-check"
                   ${t.status === 'Completed' ? 'checked' : ''}
                   data-action="toggle"
                   data-task-id="${escapeHTML(t.id)}">

            <span class="col-title" title="${escapeHTML(t.title)}">${escapeHTML(t.title)}</span>

            <span class="col-subject">
              <span class="badge badge-subject">${escapeHTML(t.subject)}</span>
            </span>

            <span class="col-due">
              <span class="badge ${isOverdue ? 'badge-urgent' : (isToday ? 'badge-high' : '')}">
                ${formatDateDisplay(t.dueDate)}
              </span>
            </span>

            <span class="col-priority">
              <span class="badge badge-${t.priority.toLowerCase()}">${escapeHTML(t.priority)}</span>
            </span>

            <span class="col-duration text-subtle text-sm">${t.durationMinutes}m</span>

            <div class="col-actions">
              <button type="button" class="btn btn-ghost btn-xs" data-action="edit" data-task-id="${escapeHTML(t.id)}">✏</button>
              <button type="button" class="btn btn-ghost btn-xs text-danger" data-action="delete" data-task-id="${escapeHTML(t.id)}">✕</button>
            </div>
          </div>
        `;
      }).join('');

      rowsContainer.querySelectorAll('[data-action="toggle"]').forEach(cb => {
        cb.addEventListener('change', e => {
          const id = e.target.getAttribute('data-task-id');
          State.toggleTaskStatus(id);
        });
      });

      rowsContainer.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id = e.currentTarget.getAttribute('data-task-id');
          this.openTaskModal(id);
        });
      });

      rowsContainer.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id = e.currentTarget.getAttribute('data-task-id');
          State.deleteTask(id);
        });
      });
    },

    // =======================================================================
    // 3. CALENDAR & AGENDA VIEW
    // =======================================================================

    renderCalendar() {
      const selectedDate = State.selectedCalendarDate || getTodayDateString();
      const datePicker = document.getElementById('calendar-date-picker');
      if (datePicker) datePicker.value = selectedDate;

      const label = document.getElementById('cal-selected-day-label');
      if (label) label.textContent = formatDateDisplay(selectedDate);

      // Selected Day Agenda: Study blocks + Fixed Commitments
      const agendaList = document.getElementById('cal-day-agenda-list');
      const plan = State.data.plans[selectedDate];
      const comms = SchedulerEngine.getCommitmentsForDate(selectedDate, State.data.commitments);

      if (agendaList) {
        let combined = [];

        if (plan && Array.isArray(plan.blocks)) {
          combined = [...plan.blocks];
        } else {
          // If no plan, show fixed commitments
          comms.forEach(c => {
            combined.push({
              id: 'c_' + c.id,
              title: c.title,
              type: 'fixed',
              startTime: c.startTime,
              endTime: c.endTime,
              durationMinutes: timeStringToMinutes(c.endTime) - timeStringToMinutes(c.startTime)
            });
          });
        }

        if (combined.length === 0) {
          agendaList.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-title">No events for this date</div>
              <p class="empty-state-text">Press "Plan This Day" to schedule your tasks around fixed commitments.</p>
            </div>
          `;
        } else {
          agendaList.innerHTML = combined.map(b => `
            <div class="timeline-item">
              <div class="item-left">
                <span class="item-time">${escapeHTML(b.startTime)} - ${escapeHTML(b.endTime)}</span>
                <span class="item-title">${escapeHTML(b.title)}</span>
                ${b.subject ? `<span class="badge badge-subject">${escapeHTML(b.subject)}</span>` : ''}
              </div>
              <span class="badge">${escapeHTML((b.type || 'fixed').toUpperCase())}</span>
            </div>
          `).join('');
        }
      }

      // Commitments Library List
      const commsList = document.getElementById('cal-commitments-library');
      const totalCounter = document.getElementById('cal-commitments-total');
      const allComms = State.data.commitments;
      if (totalCounter) totalCounter.textContent = allComms.length;

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      if (commsList) {
        if (allComms.length === 0) {
          commsList.innerHTML = `<div class="empty-state"><p class="text-subtle text-sm">No commitments configured.</p></div>`;
        } else {
          commsList.innerHTML = allComms.map(c => {
            const recurStr = c.recurrence === 'recurring'
              ? (Array.isArray(c.daysOfWeek) ? c.daysOfWeek.map(d => dayNames[d]).join(', ') : 'Weekly')
              : `Date: ${formatDateDisplay(c.date)}`;

            return `
              <div class="commitment-item-row">
                <div class="item-left">
                  <span class="item-time">${escapeHTML(c.startTime)} - ${escapeHTML(c.endTime)}</span>
                  <div>
                    <div class="item-title">${escapeHTML(c.title)}</div>
                    <div class="text-sm text-subtle">${escapeHTML(recurStr)} · ${escapeHTML(c.category)}</div>
                  </div>
                </div>
                <div class="item-right">
                  <button type="button" class="btn btn-ghost btn-xs" data-edit-comm="${escapeHTML(c.id)}">✏</button>
                  <button type="button" class="btn btn-ghost btn-xs text-danger" data-delete-comm="${escapeHTML(c.id)}">✕</button>
                </div>
              </div>
            `;
          }).join('');

          commsList.querySelectorAll('[data-edit-comm]').forEach(btn => {
            btn.addEventListener('click', e => {
              const id = e.currentTarget.getAttribute('data-edit-comm');
              this.openCommitmentModal(id);
            });
          });

          commsList.querySelectorAll('[data-delete-comm]').forEach(btn => {
            btn.addEventListener('click', e => {
              const id = e.currentTarget.getAttribute('data-delete-comm');
              State.deleteCommitment(id);
            });
          });
        }
      }
    },

    // =======================================================================
    // 4. SETTINGS VIEW
    // =======================================================================

    renderSettings() {
      const s = State.data.settings;
      const sleepStart = document.getElementById('set-sleep-start');
      const sleepEnd = document.getElementById('set-sleep-end');
      const bufMins = document.getElementById('set-buffer-mins');
      const breakMins = document.getElementById('set-break-mins');

      if (sleepStart) sleepStart.value = s.sleepStart || '23:00';
      if (sleepEnd) sleepEnd.value = s.sleepEnd || '06:30';
      if (bufMins) bufMins.value = s.bufferMinutes || 30;
      if (breakMins) breakMins.value = s.breakDurationMinutes || 10;

      CloudSync.updateStatusBadge();
    },

    // =======================================================================
    // MODAL DIALOGS
    // =======================================================================

    openModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
    },

    closeModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    },

    // Task Modal: Clean, initially showing essential fields
    openTaskModal(taskId = null) {
      const modalTitle = document.getElementById('modal-task-title');
      const idInput = document.getElementById('task-id');
      const titleInput = document.getElementById('task-title');
      const subjectInput = document.getElementById('task-subject');
      const dueInput = document.getElementById('task-due-date');
      const durInput = document.getElementById('task-duration');
      const priorityInput = document.getElementById('task-priority');

      const moreContent = document.getElementById('content-task-more');
      const moreLabel = document.getElementById('label-task-more');
      if (moreContent) moreContent.style.display = 'none';
      if (moreLabel) moreLabel.textContent = '▸ More options (type, study date, notes)';

      const typeInput = document.getElementById('task-type');
      const dueTimeInput = document.getElementById('task-due-time');
      const prefDateInput = document.getElementById('task-preferred-date');
      const statusInput = document.getElementById('task-status');
      const notesInput = document.getElementById('task-notes');

      if (taskId) {
        const task = State.data.tasks.find(t => t.id === taskId);
        if (!task) return;
        if (modalTitle) modalTitle.textContent = 'Edit Task';
        if (idInput) idInput.value = task.id;
        if (titleInput) titleInput.value = task.title;
        if (subjectInput) subjectInput.value = task.subject;
        if (dueInput) dueInput.value = task.dueDate;
        if (durInput) durInput.value = task.durationMinutes;
        if (priorityInput) priorityInput.value = task.priority;

        if (typeInput) typeInput.value = task.type || 'Homework';
        if (dueTimeInput) dueTimeInput.value = task.dueTime || '';
        if (prefDateInput) prefDateInput.value = task.preferredStudyDate || '';
        if (statusInput) statusInput.value = task.status || 'Pending';
        if (notesInput) notesInput.value = task.notes || '';
      } else {
        if (modalTitle) modalTitle.textContent = 'New Task';
        if (idInput) idInput.value = '';
        if (titleInput) titleInput.value = '';
        if (subjectInput) subjectInput.value = 'Math';
        if (dueInput) dueInput.value = getTodayDateString();
        if (durInput) durInput.value = 45;
        if (priorityInput) priorityInput.value = 'Medium';

        if (typeInput) typeInput.value = 'Homework';
        if (dueTimeInput) dueTimeInput.value = '';
        if (prefDateInput) prefDateInput.value = getTodayDateString();
        if (statusInput) statusInput.value = 'Pending';
        if (notesInput) notesInput.value = '';
      }

      this.openModal('modal-task');
      if (titleInput) titleInput.focus();
    },

    saveTaskFromModal() {
      const id = document.getElementById('task-id').value;
      const title = document.getElementById('task-title').value.trim();
      const subject = document.getElementById('task-subject').value;
      const dueDate = document.getElementById('task-due-date').value;
      const durationMinutes = Number(document.getElementById('task-duration').value) || 45;
      const priority = document.getElementById('task-priority').value;

      const type = document.getElementById('task-type')?.value || 'Homework';
      const dueTime = document.getElementById('task-due-time')?.value || null;
      const preferredStudyDate = document.getElementById('task-preferred-date')?.value || null;
      const status = document.getElementById('task-status')?.value || 'Pending';
      const notes = document.getElementById('task-notes')?.value.trim() || '';

      if (!title || !dueDate) {
        this.toast('Title and due date are required.', 'warning');
        return;
      }

      if (id) {
        State.updateTask(id, {
          title, subject, dueDate, durationMinutes, priority, type, dueTime, preferredStudyDate, status, notes
        });
      } else {
        const newTask = {
          id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          title, subject, dueDate, durationMinutes, priority, type, dueTime, preferredStudyDate, status, notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: status === 'Completed' ? new Date().toISOString() : null
        };
        State.addTask(newTask);
      }

      this.closeModal('modal-task');
    },

    // Commitment Modal
    openCommitmentModal(commId = null) {
      const idInput = document.getElementById('commitment-id');
      const titleInput = document.getElementById('commitment-title');
      const catInput = document.getElementById('commitment-category');
      const recInput = document.getElementById('commitment-recurrence');
      const dateInput = document.getElementById('commitment-date');
      const startInput = document.getElementById('commitment-start');
      const endInput = document.getElementById('commitment-end');
      const notesInput = document.getElementById('commitment-notes');

      document.querySelectorAll('input[name="comm-day"]').forEach(c => c.checked = false);

      if (commId) {
        const comm = State.data.commitments.find(c => c.id === commId);
        if (!comm) return;
        if (idInput) idInput.value = comm.id;
        if (titleInput) titleInput.value = comm.title;
        if (catInput) catInput.value = comm.category;
        if (recInput) recInput.value = comm.recurrence;
        if (dateInput) dateInput.value = comm.date || '';
        if (startInput) startInput.value = comm.startTime;
        if (endInput) endInput.value = comm.endTime;
        if (notesInput) notesInput.value = comm.notes || '';

        if (comm.recurrence === 'recurring' && Array.isArray(comm.daysOfWeek)) {
          comm.daysOfWeek.forEach(day => {
            const cb = document.querySelector(`input[name="comm-day"][value="${day}"]`);
            if (cb) cb.checked = true;
          });
        }
      } else {
        if (idInput) idInput.value = '';
        if (titleInput) titleInput.value = '';
        if (catInput) catInput.value = 'lesson';
        if (recInput) recInput.value = 'recurring';
        if (dateInput) dateInput.value = getTodayDateString();
        if (startInput) startInput.value = '16:00';
        if (endInput) endInput.value = '17:30';
        if (notesInput) notesInput.value = '';
        [0, 1, 2, 3, 4].forEach(d => {
          const cb = document.querySelector(`input[name="comm-day"][value="${d}"]`);
          if (cb) cb.checked = true;
        });
      }

      const isRec = (recInput ? recInput.value : 'recurring') === 'recurring';
      document.getElementById('group-commitment-days').style.display = isRec ? 'block' : 'none';
      document.getElementById('group-commitment-date').style.display = isRec ? 'none' : 'block';

      this.openModal('modal-commitment');
      if (titleInput) titleInput.focus();
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
        this.toast('Please provide title and hours.', 'warning');
        return;
      }

      let daysOfWeek = [];
      if (recurrence === 'recurring') {
        document.querySelectorAll('input[name="comm-day"]:checked').forEach(c => daysOfWeek.push(Number(c.value)));
        if (!daysOfWeek.length) {
          this.toast('Select at least one day.', 'warning');
          return;
        }
      }

      if (id) {
        State.updateCommitment(id, { title, category, recurrence, daysOfWeek, date, startTime, endTime, notes });
      } else {
        State.addCommitment({
          id: 'comm_' + Date.now(),
          title, category, recurrence, daysOfWeek, date, startTime, endTime, notes
        });
      }

      this.closeModal('modal-commitment');
    },

    // Plan My Day Workflow
    openPlanGenerator(dateStr) {
      const genDate = document.getElementById('gen-plan-date');
      const genStart = document.getElementById('gen-start-time');
      if (genDate) genDate.value = dateStr || getTodayDateString();
      if (genStart) genStart.value = State.data.settings.studyStartTime || '15:30';

      const checklist = document.getElementById('gen-tasks-checklist');
      const activeTasks = State.data.tasks.filter(t => t.status !== 'Completed');

      if (checklist) {
        if (!activeTasks.length) {
          checklist.innerHTML = `<div class="text-sm text-subtle p-2">No pending tasks. Add a task first.</div>`;
        } else {
          checklist.innerHTML = activeTasks.map(t => `
            <label class="gen-task-item">
              <input type="checkbox" value="${escapeHTML(t.id)}" checked>
              <span class="font-500">${escapeHTML(t.title)}</span>
              <span class="badge badge-subject">${escapeHTML(t.subject)}</span>
              <span class="text-sm text-subtle" style="margin-left:auto;">${t.durationMinutes}m</span>
            </label>
          `).join('');
        }
      }

      const previewSection = document.getElementById('gen-preview-section');
      if (previewSection) previewSection.style.display = 'none';
      const btnApply = document.getElementById('btn-apply-plan');
      if (btnApply) btnApply.disabled = true;

      State.tempProposedPlan = null;
      this.openModal('modal-plan-generator');
    },

    calculatePlanPreview() {
      const dateStr = document.getElementById('gen-plan-date').value;
      const startTimeStr = document.getElementById('gen-start-time').value;

      const checkedIds = Array.from(document.querySelectorAll('#gen-tasks-checklist input:checked')).map(c => c.value);
      const tasksToSchedule = State.data.tasks.filter(t => checkedIds.includes(t.id) && t.status !== 'Completed');

      const proposal = SchedulerEngine.generatePlan({
        dateStr,
        startTimeStr,
        tasksToSchedule,
        commitments: State.data.commitments,
        settings: State.data.settings
      });

      State.tempProposedPlan = proposal;

      const previewSection = document.getElementById('gen-preview-section');
      const previewList = document.getElementById('gen-preview-list');
      const previewBadge = document.getElementById('gen-preview-badge');
      const btnApply = document.getElementById('btn-apply-plan');

      if (previewSection) previewSection.style.display = 'block';
      if (previewBadge) previewBadge.textContent = `${proposal.blocks.length} blocks suggested`;

      if (previewList) {
        if (!proposal.blocks.length) {
          previewList.innerHTML = `<p class="text-subtle text-sm">No blocks could fit. Check start time and sleep schedule.</p>`;
        } else {
          previewList.innerHTML = proposal.blocks.map(b => `
            <div class="timeline-item">
              <span class="item-time">${escapeHTML(b.startTime)} - ${escapeHTML(b.endTime)}</span>
              <span class="item-title">${escapeHTML(b.title)}</span>
              <span class="badge">${escapeHTML(b.type)}</span>
            </div>
          `).join('');

          if (proposal.unscheduledTasks.length > 0) {
            previewList.innerHTML += `
              <div class="migration-alert mt-2">
                <strong>Notice: ${proposal.unscheduledTasks.length} task(s) could not fit before bedtime:</strong>
                <div>${proposal.unscheduledTasks.map(u => escapeHTML(u.title)).join(', ')}</div>
              </div>
            `;
          }
        }
      }

      if (btnApply) btnApply.disabled = false;
    },

    applyPlan() {
      if (!State.tempProposedPlan) return;
      const dateStr = State.tempProposedPlan.date;
      State.saveDailyPlan(dateStr, State.tempProposedPlan);
      this.closeModal('modal-plan-generator');
      this.renderAll();
    },

    triggerReschedule(dateStr) {
      const currentPlan = State.data.plans[dateStr];
      if (!currentPlan) {
        this.toast('No active plan to reschedule. Use "Plan My Day".', 'warning');
        return;
      }

      this.confirm('Reschedule remaining study blocks from current time? Completed work is preserved.', () => {
        const revised = SchedulerEngine.rescheduleRemaining({
          dateStr,
          currentPlan,
          allTasks: State.data.tasks,
          commitments: State.data.commitments,
          settings: State.data.settings
        });

        State.saveDailyPlan(dateStr, revised);
        this.renderAll();
        this.toast('Schedule adjusted around remaining hours.', 'success');
      });
    },

    handleImportBackup(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const parsed = JSON.parse(evt.target.result);
          const validation = Storage.validateImport(parsed);
          if (!validation.valid) {
            this.toast('Invalid backup file: ' + validation.message, 'danger');
            return;
          }

          this.confirm(`Restore backup containing ${parsed.tasks.length} tasks? This replaces current local tasks.`, () => {
            State.data = {
              version: STORAGE_VERSION,
              tasks: parsed.tasks,
              commitments: parsed.commitments,
              plans: parsed.plans || {},
              settings: Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {}),
              lastSavedAt: new Date().toISOString()
            };
            State.save(true);
            this.toast('Backup restored successfully.', 'success');
          });
        } catch (err) {
          this.toast('Failed to parse JSON backup file.', 'danger');
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    },

    confirm(message, onConfirm) {
      const msg = document.getElementById('modal-confirm-message');
      const okBtn = document.getElementById('modal-confirm-ok');
      const cancelBtn = document.getElementById('modal-confirm-cancel');

      if (msg) msg.textContent = message;

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
      }, { once: true });
    },

    toast(message, type = 'info', duration = 3000) {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `
        <span class="toast-message">${escapeHTML(message)}</span>
        <button type="button" class="toast-close">&times;</button>
      `;

      toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
      container.appendChild(toast);

      setTimeout(() => {
        if (toast.parentElement) toast.remove();
      }, duration);
    }
  };

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================

  function getTodayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getRelativeDateString(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function offsetDateString(dateStr, offsetDays) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + offsetDays);
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  }

  function parseDateString(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const today = getTodayDateString();
    if (dateStr === today) return 'Today';
    if (dateStr === offsetDateString(today, 1)) return 'Tomorrow';
    if (dateStr === offsetDateString(today, -1)) return 'Yesterday';

    const d = parseDateString(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
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
  // EXPORTS & BOOTSTRAP
  // =========================================================================

  window.StudyFlow = {
    Storage,
    CloudSync,
    State,
    SchedulerEngine,
    UI
  };

  document.addEventListener('DOMContentLoaded', () => {
    UI.init();
  });

})();
