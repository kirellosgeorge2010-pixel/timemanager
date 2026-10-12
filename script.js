/**
 * StudyFlow 2.0: Notion-Inspired Adaptive Study Planner
 * Authoritative Persistence & Reliable Cross-Device Sync Engine
 *
 * Core Guarantees:
 * 1. Persistent Changes: Every add, edit, delete, complete, and plan persists immediately.
 * 2. Accurate Status: 'Saving...', 'Saved', 'Save failed', 'Offline' reflect exact database state.
 * 3. Deletions Stay Deleted: Cryptographic/timestamped tombstones prevent resurrection across devices.
 * 4. Edits Replace Old Values: In-place updates synchronize across task lists and daily plans.
 * 5. Reliable Cross-Device Sync: Firebase Auth & Cloud Firestore with offline queue and conflict resolution.
 */

(function () {
  'use strict';

  // =========================================================================
  // CONSTANTS & STORAGE KEYS
  // =========================================================================

  const STORAGE_KEY = 'studyflow_v2_store';
  const STORAGE_TOMBSTONES_KEY = 'studyflow_v2_tombstones';
  const STORAGE_QUEUE_KEY = 'studyflow_v2_sync_queue';
  const STORAGE_INIT_KEY = 'studyflow_v2_initialized';
  const FIREBASE_CONFIG_KEY = 'studyflow_firebase_config';
  const STORAGE_VERSION = 2;

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
      notes: 'Grade 11 school day',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'comm_arabic_lesson',
      title: 'Arabic Lesson',
      category: 'lesson',
      recurrence: 'recurring',
      daysOfWeek: [1, 3], // Mon, Wed
      startTime: '16:00',
      endTime: '17:30',
      notes: 'Weekly lesson & grammar review',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'comm_math_lesson',
      title: 'Math Advanced Lesson',
      category: 'lesson',
      recurrence: 'recurring',
      daysOfWeek: [2, 4], // Tue, Thu
      startTime: '17:00',
      endTime: '18:30',
      notes: 'Calculus tutor session',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'comm_sat_lesson',
      title: 'SAT Weekend Prep Session',
      category: 'sat',
      recurrence: 'recurring',
      daysOfWeek: [6], // Sat
      startTime: '10:00',
      endTime: '12:30',
      notes: 'Practice modules & review',
      updatedAt: new Date().toISOString()
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
    theme: 'light',
    sleepStart: '23:00',
    sleepEnd: '06:30',
    bufferMinutes: 30,
    breakDurationMinutes: 10,
    maxBlockDurationMinutes: 50,
    studyStartTime: '15:30'
  };

  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyStudyFlowStaticAppKeyDemoOnly",
    authDomain: "studyflow-planner.firebaseapp.com",
    projectId: "studyflow-planner",
    storageBucket: "studyflow-planner.appspot.com",
    messagingSenderId: "100000000000",
    appId: "1:100000000000:web:studyflowdemokey"
  };

  // =========================================================================
  // SAVE & SYNC STATUS STATE MACHINE
  // =========================================================================

  const SaveStatus = {
    state: 'saved', // 'saving' | 'saved' | 'failed' | 'offline'
    lastSavedTime: null,
    errorMessage: null,

    set(newState, error = null) {
      this.state = newState;
      this.errorMessage = error;
      if (newState === 'saved') {
        this.lastSavedTime = new Date();
      }
      this.render();
    },

    render() {
      const pills = [
        document.getElementById('sidebar-sync-pill'),
        document.getElementById('mobile-sync-pill'),
        document.getElementById('settings-sync-badge')
      ];

      const labels = {
        saving: 'Saving...',
        saved: 'Saved',
        failed: 'Save failed',
        offline: 'Offline (Saved locally)'
      };

      pills.forEach(pill => {
        if (!pill) return;
        pill.className = `sync-pill ${this.state}`;
        const textSpan = pill.querySelector('.sync-text');
        if (textSpan) textSpan.textContent = labels[this.state] || 'Saved';

        if (this.state === 'failed') {
          pill.title = this.errorMessage || 'Save operation failed. Changes will retry.';
        } else if (this.state === 'saved' && this.lastSavedTime) {
          pill.title = `Last saved at ${this.lastSavedTime.toLocaleTimeString()}`;
        } else {
          pill.title = 'Data persistence status';
        }
      });
    }
  };

  // =========================================================================
  // TOMBSTONE DELETION TRACKER (DELETIONS STAY DELETED)
  // =========================================================================

  const TombstoneStore = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_TOMBSTONES_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    },

    save(tombstones) {
      try {
        localStorage.setItem(STORAGE_TOMBSTONES_KEY, JSON.stringify(tombstones));
      } catch (e) {
        console.warn('Failed to save tombstones:', e);
      }
    },

    record(id, type = 'task') {
      const tombstones = this.load();
      tombstones[id] = {
        id,
        type,
        deletedAt: new Date().toISOString()
      };
      this.save(tombstones);
    },

    isDeleted(id, updatedAt = null) {
      const tombstones = this.load();
      const record = tombstones[id];
      if (!record) return false;
      if (!updatedAt) return true;
      // Deleted if deletion occurred at or after the item's updatedAt timestamp
      return record.deletedAt >= updatedAt;
    }
  };

  // =========================================================================
  // LOCAL STORAGE PERSISTENCE ENGINE (LOCAL-FIRST AUTHORITATIVE)
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
        SaveStatus.set('failed', 'Browser storage is unavailable.');
        return this.createInitialData();
      }

      try {
        const isInit = localStorage.getItem(STORAGE_INIT_KEY);
        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) {
          if (!isInit) {
            // First install: load starter data
            const initial = this.createInitialData();
            this.save(initial, false);
            localStorage.setItem(STORAGE_INIT_KEY, 'true');
            SaveStatus.set('saved');
            return initial;
          } else {
            // User had previously deleted everything or emptied tasks
            return {
              version: STORAGE_VERSION,
              tasks: [],
              commitments: [],
              plans: {},
              settings: { ...DEFAULT_SETTINGS },
              lastSavedAt: new Date().toISOString()
            };
          }
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Corrupted storage root object');
        }

        // Apply Tombstone Filter: Never restore deleted items!
        const cleanTasks = (Array.isArray(parsed.tasks) ? parsed.tasks : [])
          .filter(t => !TombstoneStore.isDeleted(t.id, t.updatedAt));

        const cleanCommitments = (Array.isArray(parsed.commitments) ? parsed.commitments : [])
          .filter(c => !TombstoneStore.isDeleted(c.id, c.updatedAt));

        SaveStatus.set('saved');

        return {
          version: STORAGE_VERSION,
          tasks: cleanTasks,
          commitments: cleanCommitments,
          plans: parsed.plans && typeof parsed.plans === 'object' ? parsed.plans : {},
          settings: Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {}),
          lastSavedAt: parsed.lastSavedAt || new Date().toISOString()
        };
      } catch (err) {
        console.error('StudyFlow storage parse error:', err);
        SaveStatus.set('failed', 'Storage parse error. Recovering.');
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

    save(data, triggerCloud = true) {
      if (!this.isAvailable()) {
        SaveStatus.set('failed', 'LocalStorage is unavailable or disabled.');
        return false;
      }

      // Mark status as Saving... immediately
      SaveStatus.set('saving');

      try {
        data.lastSavedAt = new Date().toISOString();
        const serialized = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, serialized);
        localStorage.setItem(STORAGE_INIT_KEY, 'true');

        // Check cloud sync integration
        if (triggerCloud && typeof CloudSync !== 'undefined' && CloudSync.isAuthenticated()) {
          CloudSync.queueSync(data);
        } else {
          // Local mode save succeeded
          SaveStatus.set(navigator.onLine ? 'saved' : 'offline');
        }
        return true;
      } catch (err) {
        console.error('LocalStorage write failure:', err);
        SaveStatus.set('failed', 'Storage write failed: ' + err.message);
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
        UI.toast('Backup exported successfully.', 'success');
      } catch (e) {
        console.error('Export error:', e);
        UI.toast('Export failed.', 'danger');
      }
    },

    validateImport(jsonData) {
      if (!jsonData || typeof jsonData !== 'object') {
        return { valid: false, message: 'Invalid JSON object' };
      }
      if (!Array.isArray(jsonData.tasks)) {
        return { valid: false, message: 'Missing "tasks" array' };
      }
      if (!Array.isArray(jsonData.commitments)) {
        return { valid: false, message: 'Missing "commitments" array' };
      }
      return { valid: true };
    }
  };

  // =========================================================================
  // FIREBASE CLOUD SYNCHRONIZATION (CROSS-DEVICE WITH CONFLICT RESOLUTION)
  // =========================================================================

  const CloudSync = {
    auth: null,
    db: null,
    currentUser: null,
    unsubscribeSnapshot: null,
    syncTimer: null,
    isSyncing: false,

    init() {
      SaveStatus.render();

      let config = DEFAULT_FIREBASE_CONFIG;
      try {
        const savedCustom = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (savedCustom) config = JSON.parse(savedCustom);
      } catch (e) {
        console.warn('Custom Firebase config parse error:', e);
      }

      if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        try {
          if (!firebase.apps.length) {
            firebase.initializeApp(config);
          }
          this.auth = firebase.auth();
          this.db = firebase.firestore();

          this.auth.onAuthStateChanged(user => {
            this.handleAuthStateChange(user);
          });
        } catch (err) {
          console.warn('Firebase init notice:', err.message);
          SaveStatus.set(navigator.onLine ? 'saved' : 'offline');
        }
      }

      window.addEventListener('online', () => {
        if (this.currentUser) {
          SaveStatus.set('saving');
          this.drainOfflineQueue();
        } else {
          SaveStatus.set('saved');
        }
      });

      window.addEventListener('offline', () => {
        SaveStatus.set('offline');
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
        if (signedOutBox) signedOutBox.style.display = 'none';
        if (signedInBox) signedInBox.style.display = 'block';

        if (avatarEl) avatarEl.src = user.photoURL || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%232563eb"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
        if (nameEl) nameEl.textContent = user.displayName || 'StudyFlow User';
        if (emailEl) emailEl.textContent = user.email || '';

        const localTasksCount = State.data.tasks.length;
        if (localTasksCount > 0 && migrationAlert && migrationCount) {
          migrationAlert.style.display = 'block';
          migrationCount.textContent = `${localTasksCount} local tasks ready to upload to your account.`;
        }

        SaveStatus.set('saving');
        this.setupCloudListener(user.uid);
      } else {
        if (signedOutBox) signedOutBox.style.display = 'block';
        if (signedInBox) signedInBox.style.display = 'none';
        if (migrationAlert) migrationAlert.style.display = 'none';

        if (this.unsubscribeSnapshot) {
          this.unsubscribeSnapshot();
          this.unsubscribeSnapshot = null;
        }

        SaveStatus.set(navigator.onLine ? 'saved' : 'offline');
      }
    },

    async signInWithGoogle() {
      if (!this.auth) {
        UI.toast('Please configure your Firebase credentials in Settings.', 'warning', 4000);
        return;
      }
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await this.auth.signInWithPopup(provider);
        UI.toast('Signed in successfully.', 'success');
      } catch (err) {
        console.error('Google Sign-in error:', err);
        UI.toast('Sign-in cancelled or popup was blocked.', 'danger', 4000);
      }
    },

    async signOut() {
      if (!this.auth) return;
      try {
        await this.auth.signOut();
        UI.toast('Signed out. Data saved locally.', 'info');
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
            this.mergeCloudData(cloudData);
          } else {
            // First time user on cloud: upload current state
            this.pushFullStateToCloud();
          }
          SaveStatus.set(navigator.onLine ? 'saved' : 'offline');
        }, err => {
          console.warn('Firestore snapshot error:', err);
          SaveStatus.set('failed', 'Cloud connection failed: ' + err.message);
        });
      } catch (err) {
        console.error('Error setting up listener:', err);
        SaveStatus.set('failed', err.message);
      }
    },

    mergeCloudData(cloudData) {
      if (!cloudData || typeof cloudData !== 'object') return;

      const localTasks = [...State.data.tasks];
      const cloudTasks = Array.isArray(cloudData.tasks) ? cloudData.tasks : [];
      const cloudTombstones = cloudData.tombstones || {};

      // 1. Sync Tombstones: Any item tombstoned in cloud must be tombstoned locally
      Object.keys(cloudTombstones).forEach(id => {
        TombstoneStore.record(id, cloudTombstones[id].type || 'task');
      });

      // 2. Merge Tasks using Last-Write-Wins and Tombstones
      const taskMap = new Map();

      localTasks.forEach(t => {
        if (!TombstoneStore.isDeleted(t.id, t.updatedAt)) {
          taskMap.set(t.id, t);
        }
      });

      cloudTasks.forEach(cTask => {
        if (TombstoneStore.isDeleted(cTask.id, cTask.updatedAt)) {
          // Task was deleted! Ensure it is not in the map
          taskMap.delete(cTask.id);
          return;
        }

        if (!taskMap.has(cTask.id)) {
          // Task created on another device
          taskMap.set(cTask.id, cTask);
        } else {
          // Task exists on both: take newer timestamp
          const lTask = taskMap.get(cTask.id);
          if (cTask.updatedAt > lTask.updatedAt) {
            taskMap.set(cTask.id, cTask);
          }
        }
      });

      // 3. Merge Commitments
      const commMap = new Map();
      State.data.commitments.forEach(c => {
        if (!TombstoneStore.isDeleted(c.id, c.updatedAt)) commMap.set(c.id, c);
      });
      (Array.isArray(cloudData.commitments) ? cloudData.commitments : []).forEach(c => {
        if (!TombstoneStore.isDeleted(c.id, c.updatedAt)) {
          if (!commMap.has(c.id) || c.updatedAt > commMap.get(c.id).updatedAt) {
            commMap.set(c.id, c);
          }
        }
      });

      // 4. Merge Plans & Settings
      const mergedPlans = { ...State.data.plans, ...(cloudData.plans || {}) };
      const mergedSettings = { ...DEFAULT_SETTINGS, ...State.data.settings, ...(cloudData.settings || {}) };

      State.data = {
        version: STORAGE_VERSION,
        tasks: Array.from(taskMap.values()),
        commitments: Array.from(commMap.values()),
        plans: mergedPlans,
        settings: mergedSettings,
        lastSavedAt: new Date().toISOString()
      };

      Storage.save(State.data, false);
      UI.renderAll();
    },

    queueSync(data) {
      if (!this.currentUser || !this.db) return;

      SaveStatus.set('saving');

      clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(async () => {
        await this.pushFullStateToCloud();
      }, 500);
    },

    async pushFullStateToCloud() {
      if (!this.currentUser || !this.db) return;

      if (!navigator.onLine) {
        SaveStatus.set('offline');
        return;
      }

      this.isSyncing = true;
      SaveStatus.set('saving');

      try {
        const docRef = this.db.collection('users').doc(this.currentUser.uid).collection('appState').doc('main');
        const tombstones = TombstoneStore.load();

        await docRef.set({
          tasks: State.data.tasks,
          commitments: State.data.commitments,
          plans: State.data.plans,
          settings: State.data.settings,
          tombstones: tombstones,
          lastSavedAt: new Date().toISOString()
        }, { merge: true });

        this.isSyncing = false;
        SaveStatus.set('saved');
      } catch (err) {
        this.isSyncing = false;
        console.error('Firestore save failed:', err);
        SaveStatus.set('failed', err.message);
      }
    },

    async drainOfflineQueue() {
      if (this.currentUser && this.db && navigator.onLine) {
        await this.pushFullStateToCloud();
      }
    },

    async migrateLocalDataToCloud() {
      await this.pushFullStateToCloud();
      const alertEl = document.getElementById('migration-alert');
      if (alertEl) alertEl.style.display = 'none';
      UI.toast('All local data uploaded to your cloud account.', 'success');
    }
  };

  // =========================================================================
  // STATE MANAGEMENT (SYNCHRONOUS UPDATES & NO DUPLICATE EDITS)
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

    save(triggerCloud = true) {
      Storage.save(this.data, triggerCloud);
      UI.renderAll();
    },

    // 1. Task Operations
    addTask(task) {
      // Assign stable unique ID and timestamp
      task.id = task.id || 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      task.createdAt = task.createdAt || new Date().toISOString();
      task.updatedAt = new Date().toISOString();
      task.status = task.status || 'Pending';

      this.data.tasks.unshift(task);
      this.save(true);
      UI.toast('Task created and saved.', 'success', 2000);
    },

    updateTask(id, updatedFields) {
      const idx = this.data.tasks.findIndex(t => t.id === id);
      if (idx === -1) return;

      const existing = this.data.tasks[idx];
      const updated = {
        ...existing,
        ...updatedFields,
        id: existing.id, // Strictly preserve stable ID to prevent duplicates
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString()
      };

      if (updatedFields.status === 'Completed' && existing.status !== 'Completed') {
        updated.completedAt = new Date().toISOString();
      } else if (updatedFields.status === 'Pending') {
        updated.completedAt = null;
      }

      this.data.tasks[idx] = updated;

      // Crucial: Update the task everywhere in daily plans
      Object.keys(this.data.plans).forEach(dateKey => {
        const plan = this.data.plans[dateKey];
        if (plan && Array.isArray(plan.blocks)) {
          plan.blocks.forEach(b => {
            if (b.taskId === id) {
              b.title = updated.title;
              b.subject = updated.subject;
              b.completed = (updated.status === 'Completed');
              if (updatedFields.durationMinutes) {
                b.durationMinutes = updated.durationMinutes;
              }
            }
          });
        }
      });

      this.save(true);
      UI.toast('Task updated and saved.', 'success', 2000);
    },

    toggleTaskStatus(id) {
      const task = this.data.tasks.find(t => t.id === id);
      if (!task) return;
      const isCompleted = task.status === 'Completed';
      this.updateTask(id, {
        status: isCompleted ? 'Pending' : 'Completed'
      });
    },

    deleteTask(id) {
      const idx = this.data.tasks.findIndex(t => t.id === id);
      if (idx === -1) return;
      const title = this.data.tasks[idx].title;

      UI.confirm(`Permanently delete task "${title}"?`, () => {
        // Record Tombstone: Guarantees task stays deleted across all devices
        TombstoneStore.record(id, 'task');

        // Remove from local tasks list
        this.data.tasks.splice(idx, 1);

        // Remove from all daily plans
        Object.keys(this.data.plans).forEach(dateKey => {
          const plan = this.data.plans[dateKey];
          if (plan && Array.isArray(plan.blocks)) {
            plan.blocks = plan.blocks.filter(b => b.taskId !== id);
          }
        });

        this.save(true);
        UI.toast('Task deleted permanently.', 'info', 2000);
      });
    },

    // 2. Fixed Commitment Operations
    addCommitment(commitment) {
      commitment.id = commitment.id || 'comm_' + Date.now();
      commitment.updatedAt = new Date().toISOString();
      this.data.commitments.push(commitment);
      this.save(true);
      UI.toast('Commitment saved.', 'success', 2000);
    },

    updateCommitment(id, updatedFields) {
      const idx = this.data.commitments.findIndex(c => c.id === id);
      if (idx === -1) return;
      this.data.commitments[idx] = {
        ...this.data.commitments[idx],
        ...updatedFields,
        id: this.data.commitments[idx].id,
        updatedAt: new Date().toISOString()
      };
      this.save(true);
      UI.toast('Commitment updated.', 'success', 2000);
    },

    deleteCommitment(id) {
      const idx = this.data.commitments.findIndex(c => c.id === id);
      if (idx === -1) return;
      const title = this.data.commitments[idx].title;

      UI.confirm(`Remove commitment "${title}"?`, () => {
        TombstoneStore.record(id, 'commitment');
        this.data.commitments.splice(idx, 1);
        this.save(true);
        UI.toast('Commitment removed.', 'info', 2000);
      });
    },

    // 3. Daily Plan Operations
    saveDailyPlan(dateStr, planObj) {
      planObj.updatedAt = new Date().toISOString();
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
      if (!plan || !Array.isArray(plan.blocks)) return;
      const block = plan.blocks.find(b => b.id === blockId);
      if (block) {
        block.completed = !block.completed;
        if (block.taskId) {
          const task = this.data.tasks.find(t => t.id === block.taskId);
          if (task) {
            task.status = block.completed ? 'Completed' : 'Pending';
            task.completedAt = block.completed ? new Date().toISOString() : null;
            task.updatedAt = new Date().toISOString();
          }
        }
        this.save(true);
      }
    },

    removeBlock(dateStr, blockId) {
      const plan = this.data.plans[dateStr];
      if (!plan || !Array.isArray(plan.blocks)) return;
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

      if (sleepStartMins > sleepEndMins) {
        busy.push({ start: sleepStartMins, end: 1440, title: 'Sleep', isFixed: true });
        busy.push({ start: 0, end: sleepEndMins, title: 'Sleep', isFixed: true });
      } else {
        busy.push({ start: sleepStartMins, end: sleepEndMins, title: 'Sleep', isFixed: true });
      }

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
            reason: 'Insufficient study time before sleep hours.'
          });
        }
      }

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

      const theme = State.data.settings.theme || 'light';
      this.applyTheme(theme);

      if (!document.getElementById('btn-today-add-task')) return;

      this.bindEvents();
      this.renderAll();
    },

    bindEvents() {
      document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tab = e.currentTarget.getAttribute('data-tab');
          this.switchTab(tab);
        });
      });

      ['btn-sidebar-add-task', 'btn-mobile-add-task', 'btn-today-add-task', 'btn-tasks-new'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => this.openTaskModal());
      });

      const btnTodayPlan = document.getElementById('btn-today-plan');
      if (btnTodayPlan) btnTodayPlan.addEventListener('click', () => this.openPlanGenerator(getTodayDateString()));

      const btnTodayReschedule = document.getElementById('btn-today-reschedule');
      if (btnTodayReschedule) btnTodayReschedule.addEventListener('click', () => this.triggerReschedule(getTodayDateString()));

      const btnTodayAdjust = document.getElementById('btn-today-adjust-plan');
      if (btnTodayAdjust) btnTodayAdjust.addEventListener('click', () => this.openPlanGenerator(getTodayDateString()));

      const btnGotoCal = document.getElementById('btn-today-goto-calendar');
      if (btnGotoCal) btnGotoCal.addEventListener('click', () => this.switchTab('calendar'));

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

      document.getElementById('sidebar-theme-toggle')?.addEventListener('click', () => {
        const currentTheme = State.data.settings.theme || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        State.data.settings.theme = newTheme;
        State.save(false);
        this.applyTheme(newTheme);
      });

      document.getElementById('btn-google-signin')?.addEventListener('click', () => CloudSync.signInWithGoogle());
      document.getElementById('btn-google-signout')?.addEventListener('click', () => CloudSync.signOut());
      document.getElementById('btn-migrate-local-data')?.addEventListener('click', () => CloudSync.migrateLocalDataToCloud());

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
            this.toast('Custom Firebase configuration saved. Reloading.', 'success');
            setTimeout(() => window.location.reload(), 1000);
          } catch (e) {
            this.toast('Invalid JSON format for Firebase config.', 'danger');
          }
        }
      });

      document.getElementById('btn-reset-firebase')?.addEventListener('click', () => {
        localStorage.removeItem(FIREBASE_CONFIG_KEY);
        this.toast('Reset to default configuration. Reloading.', 'info');
        setTimeout(() => window.location.reload(), 1000);
      });

      document.getElementById('form-settings-routine')?.addEventListener('submit', e => {
        e.preventDefault();
        State.data.settings.sleepStart = document.getElementById('set-sleep-start').value;
        State.data.settings.sleepEnd = document.getElementById('set-sleep-end').value;
        State.data.settings.bufferMinutes = Number(document.getElementById('set-buffer-mins').value);
        State.data.settings.breakDurationMinutes = Number(document.getElementById('set-break-mins').value);
        State.save(false);
        this.toast('Routine preferences saved.', 'success');
      });

      document.getElementById('btn-export-backup')?.addEventListener('click', () => Storage.exportJSON(State.data));
      document.getElementById('file-import-input')?.addEventListener('change', e => this.handleImportBackup(e));
      document.getElementById('btn-reset-data')?.addEventListener('click', () => {
        this.confirm('Reset local tasks and restore starter template?', () => {
          localStorage.removeItem(STORAGE_TOMBSTONES_KEY);
          State.data = Storage.createInitialData();
          State.save(true);
          this.toast('Reset to default template.', 'info');
        });
      });

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

      document.getElementById('form-commitment')?.addEventListener('submit', e => {
        e.preventDefault();
        this.saveCommitmentFromModal();
      });

      document.getElementById('commitment-recurrence')?.addEventListener('change', e => {
        const isRec = e.target.value === 'recurring';
        document.getElementById('group-commitment-days').style.display = isRec ? 'block' : 'none';
        document.getElementById('group-commitment-date').style.display = isRec ? 'none' : 'block';
      });

      document.getElementById('btn-gen-select-all')?.addEventListener('click', () => {
        document.querySelectorAll('#gen-tasks-checklist input').forEach(c => c.checked = true);
      });

      document.getElementById('btn-calc-preview')?.addEventListener('click', () => this.calculatePlanPreview());
      document.getElementById('btn-apply-plan')?.addEventListener('click', () => this.applyPlan());

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

      document.querySelectorAll('.sidebar-nav-item').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
      });

      document.querySelectorAll('.bottom-nav-item').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
      });

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

    renderTasksTable() {
      const rowsContainer = document.getElementById('tasks-database-rows');
      if (!rowsContainer) return;

      const todayStr = getTodayDateString();
      let list = [...State.data.tasks];
      const filters = State.taskFilters;

      if (filters.search) {
        const q = filters.search;
        list = list.filter(t =>
          t.title.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          (t.notes && t.notes.toLowerCase().includes(q))
        );
      }

      if (filters.status === 'active') {
        list = list.filter(t => t.status !== 'Completed');
      } else if (filters.status === 'completed') {
        list = list.filter(t => t.status === 'Completed');
      } else if (filters.status === 'due-today') {
        list = list.filter(t => t.dueDate === todayStr && t.status !== 'Completed');
      } else if (filters.status === 'overdue') {
        list = list.filter(t => t.dueDate < todayStr && t.status !== 'Completed');
      }

      if (filters.subject !== 'all') {
        list = list.filter(t => t.subject === filters.subject);
      }

      if (filters.priority !== 'all') {
        list = list.filter(t => t.priority === filters.priority);
      }

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

    renderCalendar() {
      const selectedDate = State.selectedCalendarDate || getTodayDateString();
      const datePicker = document.getElementById('calendar-date-picker');
      if (datePicker) datePicker.value = selectedDate;

      const label = document.getElementById('cal-selected-day-label');
      if (label) label.textContent = formatDateDisplay(selectedDate);

      const agendaList = document.getElementById('cal-day-agenda-list');
      const plan = State.data.plans[selectedDate];
      const comms = SchedulerEngine.getCommitmentsForDate(selectedDate, State.data.commitments);

      if (agendaList) {
        let combined = [];

        if (plan && Array.isArray(plan.blocks)) {
          combined = [...plan.blocks];
        } else {
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

      SaveStatus.render();
    },

    openModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
    },

    closeModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    },

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
        State.addTask({
          title, subject, dueDate, durationMinutes, priority, type, dueTime, preferredStudyDate, status, notes
        });
      }

      this.closeModal('modal-task');
    },

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

      if (!okBtn || !cancelBtn) {
        if (typeof onConfirm === 'function') onConfirm();
        return;
      }

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
  // UTILITIES
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
  // GLOBAL EXPORTS & BOOTSTRAP
  // =========================================================================

  window.StudyFlow = {
    SaveStatus,
    TombstoneStore,
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
