# StudyFlow 2.0: Simple, Notion-Inspired Study Planner

**StudyFlow 2.0** is a clean, lightweight, Notion-inspired study planner with cross-device synchronization designed for Grade 11 students managing unpredictable homework, SAT preparation, quarter exams, and variable subject lessons.

Hosted seamlessly on **GitHub Pages** with zero build pipelines, no Node.js server, and client-side Google Authentication & Cloud Firestore synchronization.

---

## 🎨 Design & Notion-Inspired Philosophy

* **Clean White/Light Theme by Default:** Calm, distraction-free whitespace, subtle borders (`#e5e7eb`), and soft pastel tags.
* **Optional Dark Mode:** Switchable instantly from the desktop sidebar or settings.
* **Compact Desktop Sidebar:** Clean left navigation bar with workspace title, sync status indicator, quick `+ New Task` button, and theme toggle.
* **Native Phone Navigation:** Fluid mobile layout with a fixed bottom navigation bar (`Today`, `Tasks`, `Calendar`, `Settings`) and large touch-friendly controls.
* **PWA Installable:** Installable directly to your Android or iPhone home screen via `manifest.json`.

---

## 🗂 The Four Main Sections

1. **Today (`Today`):**
   * Real-time greeting with today's date and pending workload summary.
   * Minimalist progress line (`X of Y tasks completed`).
   * Suggested daily schedule timeline with direct completion checkboxes and "Reschedule Remaining" action.
   * Immediate checklist for tasks due today or overdue.
   * Glance at today's fixed commitments (School, private lessons, sleep).

2. **Tasks (`Tasks`):**
   * Clean Notion database-style list with real-time keyword search.
   * Filter pills: `Active`, `All`, `Due Today`, `Overdue`, `Completed`.
   * Dropdown filters for Subject, Priority, and Sort Order.
   * Clickable checkboxes, subject tags, priority badges, and estimated duration.

3. **Calendar (`Calendar`):**
   * Clean daily agenda viewer for any selected date.
   * Chronological breakdown of study blocks and fixed commitments for that day.
   * Fixed routine manager: Add and configure recurring weekly lessons (Arabic, History, Math, SAT prep) or one-time exam dates.

4. **Settings (`Settings`):**
   * **Google Sign-In & Cross-Device Cloud Sync:** Sign in with Google to synchronize tasks seamlessly between laptop and phone.
   * **Sync Status Indicator:** Real-time indicator (`Synced` 🟢, `Syncing...` 🟡, `Offline` 🔴, `Local Mode` ⚪).
   * **Local Data Cloud Migration:** 1-click upload of pre-existing local tasks to your Google account upon sign-in.
   * **Study & Sleep Routine:** Configure sleep bedtime (default 23:00), wake-up time (06:30), short breaks (10m), and surprise homework buffer (30m).
   * **Backup & Safety:** One-click JSON export/import backup.
   * **Diagnostics:** Run the integrated 16-test automated diagnostic suite.

---

## ☁️ Cross-Device Cloud Sync (Firebase Setup Guide)

StudyFlow uses a **local-first** architecture: it works completely offline using browser `localStorage` out-of-the-box, and syncs seamlessly across devices when connected to Firebase.

### Setup Instructions (Free Google Firebase Tier)

1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add project**.
2. Name your project (e.g., `studyflow-planner`) and click **Create project**.
3. **Enable Google Authentication:**
   * In the left menu, navigate to **Build > Authentication > Sign-in method**.
   * Click **Google**, toggle **Enable**, select your support email, and click **Save**.
   * Under **Authorized domains**, ensure your GitHub Pages domain is listed (e.g., `<your-username>.github.io` and `localhost`).
4. **Create Cloud Firestore Database:**
   * In the left menu, navigate to **Build > Firestore Database** and click **Create database**.
   * Choose a location close to you and select **Production mode**.
   * Go to the **Rules** tab in Firestore and paste the contents of `firestore.rules` (included in this repository):
     ```javascript
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /users/{userId} {
           allow read, write: if request.auth != null && request.auth.uid == userId;
           match /{allChildren=**} {
             allow read, write: if request.auth != null && request.auth.uid == userId;
           }
         }
       }
     }
     ```
   * Click **Publish**. This guarantees that **each student can only access their own private data**.
5. **Get Your Web Config:**
   * In Project Settings (gear icon), scroll to **Your apps**, click the Web icon (`</>`), and register your app.
   * Copy the `firebaseConfig` object.
   * In StudyFlow, go to **Settings > ⚙ Firebase Cloud Setup**, paste your config object, and click **Save Custom Firebase Config**.

---

## 📱 Installing on Your Phone (PWA)

* **Android (Chrome / Edge):** Open StudyFlow URL, tap the three dots menu (⋮), and tap **Install App** or **Add to Home screen**.
* **iPhone (Safari):** Open StudyFlow URL, tap the Share button (square with arrow), and tap **Add to Home Screen**.

---

## ⚡ Dynamic Scheduling & Mid-Day Rescheduling

* **Gap Calculation:** Subtracts school hours, lessons, and sleep hours from the day to find real free study windows.
* **Prioritization:** Orders tasks by overdue status, immediate deadline, exam type (Quarter Exam, GP Weekly Exam, SAT), and priority level.
* **Burnout & Sleep Protection:** Automatically places 10-minute rest breaks between sessions and reserves an unexpected homework buffer. If tasks exceed available hours, StudyFlow will **never** cut into sleep time; it alerts you with an **Unscheduled Tasks Notice**.
* **Mid-Day Rescheduling:** If surprise homework arrives at 17:00, click **Reschedule Remaining**. The engine preserves already-completed blocks and re-arranges remaining tasks starting from the current minute.

---

## 📁 Project Structure

```text
myhelper/
├── index.html       # Notion-inspired semantic layout (Today, Tasks, Calendar, Settings)
├── style.css        # Clean Notion light theme, dark mode, compact sidebar, mobile nav
├── script.js        # Storage, Firebase Auth, Firestore sync, scheduler, and UI
├── manifest.json    # PWA configuration for phone home screen installability
├── firestore.rules  # Cloud Firestore private-user security rules
├── test.html        # Comprehensive automated 16-test diagnostic suite
└── README.md        # Documentation and deployment guide
```

---

## 💻 Running Locally

No npm or build tools needed. Simply double-click `index.html` in your browser, or start a local static server:
```bash
python -m http.server 8000
```
Open `http://localhost:8000`.

---

## 🌐 Deploying to GitHub Pages

1. Push all files to your GitHub repository:
   ```bash
   git add .
   git commit -m "Deploy StudyFlow 2.0"
   git push origin main
   ```
2. On GitHub, navigate to **Settings > Pages**.
3. Under **Build and deployment > Source**, choose **Deploy from a branch**.
4. Select `main` branch and `/ (root)` folder, then click **Save**.
5. Your app will be live in 1–2 minutes at `https://<username>.github.io/<repo-name>/`.
