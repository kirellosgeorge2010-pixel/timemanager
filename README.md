# StudyFlow: Lightweight Dynamic Study Planner for Grade 11

**StudyFlow** is a client-side, zero-dependency web application designed specifically for Grade 11 students facing unpredictable school workloads, demanding exam prep (SAT Math & English, Quarter Exams, GP Weekly Exams), and variable private or school lessons (Arabic, History, English, Math).

Hosted seamlessly on **GitHub Pages** or run directly from your local browser with no build step, no Node.js, and no backend.

---

## 🚀 Key Features

### 1. Reliable Data Persistence & Data Safety (Highest Priority)
- **Automatic Browser Saving:** All tasks, commitments, daily plans, and settings are saved automatically to browser `localStorage` under the versioned key `studyflow_v1_store`.
- **Fault-Tolerant Corruption Handling:** If stored data is ever malformed or corrupted, StudyFlow preserves the raw data to an emergency backup key (`studyflow_corrupt_backup_<timestamp>`) and initializes safe defaults rather than silently erasing your data.
- **Export Backup:** One-click JSON backup export (`studyflow-backup-YYYY-MM-DD.json`) anytime you want a portable copy.
- **Import Backup:** Schema-validated JSON backup restore with explicit confirmation dialog to prevent accidental overwrites.
- **Storage Transparency:** Displays stored record counts and last-saved timestamps in the Settings view.
- *Notice:* Browser `localStorage` is tied to your current browser and device. Clearing browser history or cache may remove local data; regular JSON backups are recommended.

### 2. Realistic Dynamic Daily Scheduling ("Plan My Day")
- **Availability Gap Detection:** Automatically parses fixed commitments (school hours, lessons, meals, sleep) and determines real free study windows.
- **Urgency-Based Prioritization:** Orders tasks by deadline urgency, overdue status, upcoming exam types (Quarter Exam Prep, GP Weekly Exam, SAT), and preferred study dates.
- **Break Insertion:** Inserts configurable short breaks (e.g., 10 minutes) between sessions to prevent burnout.
- **Surprise Homework Buffer:** Automatically reserves a configurable buffer (e.g., 30–45 minutes) for unexpected school assignments or runovers.
- **Anti-Overload Protection:** If workload exceeds available hours, StudyFlow will **never** silently delete breaks or cut into sleep hours. Instead, it generates an explicit **Unscheduled Tasks Notice** explaining why tasks could not fit and suggesting they be deferred.
- **User-Controlled Approval:** The app never silently overrides your schedule. You can inspect, modify, move, or reject the proposed plan before applying.

### 3. Mid-Day Rescheduling ("Reschedule Remaining Tasks")
- When surprise homework arrives or an earlier task takes longer than expected, hit **Reschedule Remaining Tasks**.
- The algorithm calculates available time starting from the **current minute** until bedtime.
- Preserves all completed sessions and earlier blocks.
- Re-aligns remaining pending tasks without double-booking or truncating sleep hours.

### 4. Flexible Task Management
- **Task Types:** Homework, SAT Math, SAT English, Quarter Exam Preparation, GP Weekly Exam Preparation, Revision, and Other.
- **Metadata:** Subject, estimated duration, due date, optional due time, priority (Urgent, High, Medium, Low), preferred study date, and notes.
- **Filtering & Search:** Real-time search, filter by subject, status (Active, Completed, Due Today, Overdue), priority, and sort options.

### 5. Fixed Commitments & Availability Routine
- Configure recurring weekly commitments (e.g., school hours, Arabic lessons on Mon/Wed, Math on Tue/Thu, SAT on Saturday, sleep times).
- Configure one-time commitments for specific dates.
- Filter commitments by day of the week to inspect free gaps.

### 6. Modern Dark-Themed Interface
- Polished, eye-friendly dark palette designed for late-night study sessions without visual fatigue.
- Responsive design tailored for smartphones, tablets, and desktop computers.
- Accessible in-app toast alerts and confirmation dialogs (no browser popup blockers).

---

## 📁 Project Structure

```text
myhelper/
├── index.html       # Semantic HTML5 markup, views, and accessible modals
├── style.css        # Pure CSS3 dark theme, responsive grid/flexbox, animations
├── script.js        # Storage engine, scheduling algorithms, and UI controllers
└── README.md        # Documentation and deployment instructions
```

---

## 💻 Running Locally

No installation, build tools, or package managers are required.

### Option 1: Direct File Open
Double-click `index.html` or open it directly in any modern browser (Chrome, Edge, Firefox, Safari).

### Option 2: Local HTTP Server (Optional)
If you prefer running a local server:
- **Python 3:**
  ```bash
  python -m http.server 8000
  ```
  Open `http://localhost:8000` in your browser.
- **VS Code:** Install the *Live Server* extension and click "Go Live".

---

## 🌐 Deploying to GitHub Pages

StudyFlow is built with relative asset links and static files, making it completely compatible with GitHub Pages, including repository subpaths (e.g., `https://<username>.github.io/<repository-name>/`).

1. Push the project files to your GitHub repository:
   ```bash
   git add index.html style.css script.js README.md
   git commit -m "Deploy StudyFlow dynamic study planner"
   git push origin main
   ```
2. Navigate to your repository on GitHub:
   - Click **Settings** (tab at the top).
   - In the left sidebar, click **Pages**.
   - Under **Build and deployment > Source**, select **Deploy from a branch**.
   - Under **Branch**, select `main` (or your default branch) and folder `/ (root)`.
   - Click **Save**.
3. In 1–2 minutes, your site will be live at:
   `https://<your-username>.github.io/<your-repo-name>/`

---

## 🧪 Verification & Testing Checklist

1. **Task CRUD Operations:**
   - Add a task with title, subject, duration, priority, and due date.
   - Edit the task and verify fields update immediately.
   - Toggle the task completion checkbox; verify progress metric and counters update.
   - Delete a task; verify confirmation modal appears before removal.
2. **Persistence After Refresh:**
   - Add or complete tasks, refresh the page (`F5`), and verify all states remain preserved.
   - Close the browser window and reopen; verify local storage reloads seamlessly.
3. **Daily Planning Workflow:**
   - Open **Plan My Day** or **Daily Plan**.
   - Click **Generate / Regenerate Plan**.
   - Notice how fixed school hours (07:30–14:30), lessons, and sleep hours (23:00–06:30) are automatically respected.
   - Observe the 10-minute breaks placed between study sessions and the 30-minute unexpected homework buffer.
4. **Overload Prevention Test:**
   - Add several tasks with large durations (e.g., three 120-minute tasks) due today.
   - Run plan generation.
   - Confirm that the algorithm **does not** squeeze tasks into sleep time or drop breaks.
   - Confirm the **Insufficient Available Time Notice** appears, clearly listing unscheduled tasks.
5. **Mid-Day Reschedule Test:**
   - With an active plan, add a new urgent homework task.
   - Click **Reschedule Remaining Tasks**.
   - Verify completed blocks are untouched while future blocks are dynamically rearranged from the current time.
6. **Backup Export & Import:**
   - Go to **Backup & Settings** tab and click **Export Backup (JSON)**; verify `.json` file downloads.
   - Test **Import Backup** with the downloaded file; verify confirmation prompt and data reload.
   - Test importing an invalid file; confirm a clear error toast appears without corrupting existing data.
7. **Mobile Responsiveness:**
   - Test across mobile viewport widths (360px–480px); verify navigation tabs, form controls, and cards stack smoothly.
