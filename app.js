// ===== STATE =====
let appState = {
  habits: [],
  allLogs: [],
  checkinToday: null,
  todayStr: null,
  isFirstSession: false,
  screen: "today",
  allHabitsEver: null,
  historyOffset: 0,
  historyLogs: [],
  historyCheckins: [],
  selectedDay: null,
  selectedDayMiss: null,
  pendingMissDate: null,
  onboardingData: {
    goal: null,
    customGoal: "",
    difficulty: null,
    habitList: []
  }
};

let currentUser = null;
let authMode = "login";
let historyRequestToken = 0;
let missGuardActive = false;

const HABIT_TEMPLATES = {
  "Discipline / Consistency": {
    Easy: ["Make your bed", "Drink a glass of water on waking", "Write 3 lines in a journal"],
    Moderate: ["Wake up at a fixed time", "No phone for first 30 mins", "Plan tomorrow before bed", "Read 10 pages"],
    Hard: ["Wake up at 5 AM", "Cold shower", "No social media all day", "Read 20 pages", "Plan & review day"]
  },
  "Health / Fitness": {
    Easy: ["Drink 2L water", "10 min walk", "Stretch for 5 mins"],
    Moderate: ["30 min workout", "Drink 2.5L water", "No junk food", "Sleep 7+ hours"],
    Hard: ["1 hour workout", "Drink 3L water", "No sugar", "Sleep 7+ hours", "10k steps"]
  },
  "Focus / Study": {
    Easy: ["Study 30 mins", "No phone during study", "Review notes"],
    Moderate: ["Study 1.5 hours", "Pomodoro sessions x3", "No social media during study", "Review notes daily"],
    Hard: ["Study 3 hours", "Pomodoro sessions x6", "Zero distractions during study", "Daily revision", "Plan next day study"]
  },
  "Mental Control": {
    Easy: ["5 min meditation", "Write 1 gratitude note", "Deep breathing exercise"],
    Moderate: ["10 min meditation", "Journal thoughts", "No complaining for a day", "Gratitude list (3 items)"],
    Hard: ["20 min meditation", "Daily journaling", "No complaining", "Cold exposure", "Gratitude list (5 items)"]
  },
  "Custom": {
    Easy: ["Custom habit 1", "Custom habit 2", "Custom habit 3"],
    Moderate: ["Custom habit 1", "Custom habit 2", "Custom habit 3", "Custom habit 4"],
    Hard: ["Custom habit 1", "Custom habit 2", "Custom habit 3", "Custom habit 4", "Custom habit 5"]
  }
};

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getTodayStr() {
  return formatDate(new Date());
}

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function $(selector) {
  return document.querySelector(selector);
}

function render(html) {
  $("#app").innerHTML = html;
}

function renderWithNav(contentHtml, activeTab) {
  render(`
    <div class="page-content">${contentHtml}</div>
    <nav class="nav-bar">
      <div class="nav-item ${activeTab === 'today' ? 'active' : ''}" onclick="goToToday()">Today</div>
      <div class="nav-item ${activeTab === 'history' ? 'active' : ''}" onclick="goToHistory()">History</div>
    </nav>
  `);
}

// ===== AUTH SCREEN =====
function renderAuthScreen() {
  render(`
    <div class="page-content">
      <h1>Discipline</h1>
      <p>${authMode === "login" ? "Log in to continue" : "Create your account"}</p>

      <label>Email</label>
      <input type="email" id="authEmail" placeholder="you@example.com" />

      <label>Password</label>
      <input type="password" id="authPassword" placeholder="At least 6 characters" />

      <div id="authError" class="error-msg"></div>

      <button class="btn" id="authSubmitBtn" onclick="handleAuthSubmit()">
        ${authMode === "login" ? "Log In" : "Sign Up"}
      </button>

      <button class="btn btn-secondary" onclick="toggleAuthMode()">
        ${authMode === "login" ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
      </button>
    </div>
  `);
}

function toggleAuthMode() {
  authMode = authMode === "login" ? "signup" : "login";
  renderAuthScreen();
}

async function handleAuthSubmit() {
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const errorBox = $("#authError");
  const btn = $("#authSubmitBtn");
  errorBox.textContent = "";

  if (!email || !password) {
    errorBox.textContent = "Please fill in both fields.";
    return;
  }

  btn.disabled = true;

  try {
    if (authMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        errorBox.textContent = "Check your email to confirm your account, then log in.";
        btn.disabled = false;
        return;
      }
      currentUser = data.user;
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
    }
    initApp();
  } catch (err) {
    errorBox.textContent = err.message;
    btn.disabled = false;
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  authMode = "login";
  renderAuthScreen();
}

// ===== INIT =====
async function initApp() {
  render(`<div class="loading">Loading...</div>`);

  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData.session) {
    currentUser = null;
    renderAuthScreen();
    return;
  }
  currentUser = sessionData.session.user;
  appState.todayStr = getTodayStr();

  try {
    const { data: habits, error: habitsErr } = await supabaseClient
      .from("habits")
      .select("*")
      .eq("user_id", currentUser.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (habitsErr) throw habitsErr;
    appState.habits = habits || [];

    if (appState.habits.length === 0) {
      renderOnboardingStep1();
      return;
    }

    const missNeeded = await checkMissModalNeeded();
    if (missNeeded) {
      renderMissModal();
      return;
    }

    await continueInitAfterMissCheck();
  } catch (err) {
    render(`<div class="page-content"><div class="error-msg">Error loading app: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="initApp()">Retry</button></div>`);
  }
}

async function continueInitAfterMissCheck() {
  try {
    const { data: checkins, error: checkinErr } = await supabaseClient
      .from("daily_checkins")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("date", appState.todayStr)
      .limit(1);

    if (checkinErr) throw checkinErr;

    if (!checkins || checkins.length === 0) {
      appState.checkinToday = null;
      appState.isFirstSession = false;
      renderCheckIn();
    } else {
      appState.checkinToday = checkins[0];
      await renderDashboard();
    }
  } catch (err) {
    render(`<div class="page-content"><div class="error-msg">Error loading app: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="initApp()">Retry</button></div>`);
  }
}

// ===== MISS HANDLING ("WHY PROMPT") =====
async function checkMissModalNeeded() {
  const yesterday = parseLocalDate(appState.todayStr);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  const accountCreatedStr = currentUser.created_at.slice(0, 10);
  if (yesterdayStr < accountCreatedStr) return false;

  const { data: completedLogs, error: logsErr } = await supabaseClient
    .from("habit_logs")
    .select("id")
    .eq("user_id", currentUser.id)
    .eq("date", yesterdayStr)
    .eq("completed", true)
    .limit(1);
  if (logsErr) throw logsErr;
  if (completedLogs && completedLogs.length > 0) return false;

  const { data: missRows, error: missErr } = await supabaseClient
    .from("miss_reflections")
    .select("id")
    .eq("user_id", currentUser.id)
    .eq("missed_date", yesterdayStr)
    .limit(1);
  if (missErr) throw missErr;
  if (missRows && missRows.length > 0) return false;

  appState.pendingMissDate = yesterdayStr;
  return true;
}

function renderMissModal() {
  render(`
    <div class="miss-modal">
      <h1>Yesterday you missed.</h1>
      <p class="miss-subtext">What happened?</p>
      <textarea id="missInput" rows="5" placeholder="Write here..." oninput="updateMissButtonState()"></textarea>
      <button class="btn" id="missSubmitBtn" disabled onclick="submitMissReflection()">Own It</button>
    </div>
  `);
  setupMissBackButtonGuard();
  setTimeout(() => {
    const el = $("#missInput");
    if (el) el.focus();
  }, 50);
}

function updateMissButtonState() {
  const val = $("#missInput").value;
  $("#missSubmitBtn").disabled = val.trim().length < 10;
}

async function submitMissReflection() {
  const val = $("#missInput").value.trim();
  if (val.length < 10) return;

  const btn = $("#missSubmitBtn");
  btn.disabled = true;

  try {
    const { error } = await supabaseClient
      .from("miss_reflections")
      .upsert(
        [{ user_id: currentUser.id, missed_date: appState.pendingMissDate, response: val }],
        { onConflict: "user_id,missed_date" }
      );
    if (error) throw error;

    teardownMissBackButtonGuard();
    await continueInitAfterMissCheck();
  } catch (err) {
    alert("Error saving: " + err.message);
    btn.disabled = false;
  }
}

function missPopStateHandler() {
  if (missGuardActive) {
    history.pushState({ missModal: true }, "");
  }
}

function setupMissBackButtonGuard() {
  missGuardActive = true;
  history.pushState({ missModal: true }, "");
  window.addEventListener("popstate", missPopStateHandler);
}

function teardownMissBackButtonGuard() {
  missGuardActive = false;
  window.removeEventListener("popstate", missPopStateHandler);
}

// ===== ONBOARDING STEP 1 =====
function renderOnboardingStep1() {
  const options = [
    "Discipline / Consistency",
    "Health / Fitness",
    "Focus / Study",
    "Mental Control",
    "Custom"
  ];

  const optionsHtml = options.map(opt => `
    <div class="option-item ${appState.onboardingData.goal === opt ? "selected" : ""}"
         onclick="selectGoal('${opt}')">
      ${escapeHtml(opt)}
    </div>
  `).join("");

  let customInputHtml = "";
  if (appState.onboardingData.goal === "Custom") {
    customInputHtml = `
      <input type="text" id="customGoalInput" placeholder="Describe your goal"
        value="${escapeAttr(appState.onboardingData.customGoal || "")}"
        oninput="appState.onboardingData.customGoal = this.value" />
    `;
  }

  render(`
    <div class="page-content">
      <h2>Step 1 of 4</h2>
      <h1>What do you want to improve?</h1>
      <div class="option-list">${optionsHtml}</div>
      ${customInputHtml}
      <button class="btn" onclick="goToStep2()">Next</button>
    </div>
  `);
}

function selectGoal(goal) {
  appState.onboardingData.goal = goal;
  renderOnboardingStep1();
}

function goToStep2() {
  if (!appState.onboardingData.goal) {
    alert("Please select an option.");
    return;
  }
  if (appState.onboardingData.goal === "Custom" && !appState.onboardingData.customGoal.trim()) {
    alert("Please describe your custom goal.");
    return;
  }
  renderOnboardingStep2();
}

// ===== ONBOARDING STEP 2 =====
function renderOnboardingStep2() {
  const options = ["Easy", "Moderate", "Hard"];

  const optionsHtml = options.map(opt => `
    <div class="option-item ${appState.onboardingData.difficulty === opt ? "selected" : ""}"
         onclick="selectDifficulty('${opt}')">
      ${escapeHtml(opt)}
    </div>
  `).join("");

  render(`
    <div class="page-content">
      <h2>Step 2 of 4</h2>
      <h1>How serious are you?</h1>
      <div class="option-list">${optionsHtml}</div>
      <button class="btn btn-secondary" onclick="renderOnboardingStep1()">Back</button>
      <button class="btn" onclick="goToStep3()">Next</button>
    </div>
  `);
}

function selectDifficulty(level) {
  appState.onboardingData.difficulty = level;
  renderOnboardingStep2();
}

function goToStep3() {
  if (!appState.onboardingData.difficulty) {
    alert("Please select an option.");
    return;
  }

  const goal = appState.onboardingData.goal;
  const difficulty = appState.onboardingData.difficulty;
  const template = HABIT_TEMPLATES[goal] || HABIT_TEMPLATES["Custom"];
  const habits = template[difficulty] || template["Moderate"];

  appState.onboardingData.habitList = [...habits];
  renderOnboardingStep3();
}

// ===== ONBOARDING STEP 3 =====
function renderOnboardingStep3() {
  const habitsHtml = appState.onboardingData.habitList.map((habit, idx) => `
    <div class="habit-item">
      <div class="habit-info">
        <div class="habit-name">${escapeHtml(habit)}</div>
      </div>
      <div class="habit-actions">
        <button class="remove-btn" onclick="removeOnboardingHabit(${idx})">Remove</button>
      </div>
    </div>
  `).join("");

  render(`
    <div class="page-content">
      <h2>Step 3 of 4</h2>
      <h1>Your habits</h1>
      <p>Based on your answers, here are some suggested habits. You can add or remove them.</p>
      <div id="habitListContainer">${habitsHtml}</div>
      <div class="add-habit-row">
        <input type="text" id="newHabitInput" placeholder="Add a habit" />
        <button class="btn" onclick="addOnboardingHabit()" style="margin:0;">Add</button>
      </div>
      <button class="btn btn-secondary" onclick="renderOnboardingStep2()">Back</button>
      <button class="btn" onclick="goToStep4()">Next</button>
    </div>
  `);
}

function removeOnboardingHabit(idx) {
  appState.onboardingData.habitList.splice(idx, 1);
  renderOnboardingStep3();
}

function addOnboardingHabit() {
  const input = $("#newHabitInput");
  const val = input.value.trim();
  if (!val) return;
  appState.onboardingData.habitList.push(val);
  renderOnboardingStep3();
}

function goToStep4() {
  if (appState.onboardingData.habitList.length === 0) {
    alert("Please add at least one habit.");
    return;
  }
  renderOnboardingStep4();
}

// ===== ONBOARDING STEP 4 =====
function renderOnboardingStep4() {
  const habitsHtml = appState.onboardingData.habitList.map(habit => `
    <div class="habit-item">
      <div class="habit-info">
        <div class="habit-name">${escapeHtml(habit)}</div>
      </div>
    </div>
  `).join("");

  render(`
    <div class="page-content">
      <h2>Step 4 of 4</h2>
      <h1>Confirm your habits</h1>
      <div>${habitsHtml}</div>
      <button class="btn btn-secondary" onclick="renderOnboardingStep3()">Back</button>
      <button class="btn" onclick="saveOnboardingHabits()">Confirm & Save</button>
    </div>
  `);
}

async function saveOnboardingHabits() {
  render(`<div class="loading">Saving...</div>`);

  try {
    const rows = appState.onboardingData.habitList.map(name => ({
      name,
      user_id: currentUser.id
    }));
    const { data, error } = await supabaseClient
      .from("habits")
      .insert(rows)
      .select();

    if (error) throw error;

    appState.habits = data || [];
    appState.isFirstSession = true;
    renderCheckIn();
  } catch (err) {
    render(`<div class="page-content"><div class="error-msg">Error saving habits: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderOnboardingStep4()">Back</button></div>`);
  }
}

// ===== DAILY CHECK-IN =====
function renderCheckIn() {
  appState.screen = "today";
  const yesterdayHtml = appState.isFirstSession
    ? `<p style="color:#888; font-size:14px; margin: 12px 0;">
        Welcome! This is your first day — no yesterday to review yet.
       </p>`
    : `<div class="checkbox-row">
        <input type="checkbox" id="completedInput" />
        <label for="completedInput">Did you complete yesterday's goals?</label>
       </div>`;

  renderWithNav(`
    <h1>Daily Check-In</h1>
    <p>${appState.todayStr}</p>

    <label>What's your intention for today?</label>
    <textarea id="intentionInput" rows="3" placeholder="e.g. Stay focused and avoid distractions"></textarea>

    ${yesterdayHtml}

    <label>Reflection</label>
    <textarea id="reflectionInput" rows="3" placeholder="Any thoughts about yesterday or today"></textarea>

    <button class="btn" onclick="saveCheckIn()">Save Check-In</button>
  `, "today");
}

async function saveCheckIn() {
  const intention = $("#intentionInput").value.trim();
  const completedCheckbox = $("#completedInput");
  const completed = completedCheckbox ? completedCheckbox.checked : false;
  const reflection = $("#reflectionInput").value.trim();

  render(`<div class="loading">Saving check-in...</div>`);

  try {
    const { data, error } = await supabaseClient
      .from("daily_checkins")
      .upsert(
        {
          date: appState.todayStr,
          intention,
          completed,
          reflection,
          user_id: currentUser.id
        },
        { onConflict: "user_id,date" }
      )
      .select();

    if (error) throw error;

    appState.checkinToday = data[0];
    await renderDashboard();
  } catch (err) {
    render(`<div class="page-content"><div class="error-msg">Error saving check-in: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderCheckIn()">Back</button></div>`);
  }
}

// ===== DASHBOARD =====
async function renderDashboard() {
  appState.screen = "today";
  appState.todayStr = getTodayStr();
  render(`<div class="loading">Loading dashboard...</div>`);

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoff = formatDate(cutoffDate);

    const { data: logs, error: logsErr } = await supabaseClient
      .from("habit_logs")
      .select("*")
      .eq("user_id", currentUser.id)
      .gte("date", cutoff);

    if (logsErr) throw logsErr;

    appState.allLogs = logs || [];
    renderDashboardView();
  } catch (err) {
    render(`<div class="page-content"><div class="error-msg">Error loading dashboard: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderDashboard()">Retry</button></div>`);
  }
}

function renderDashboardView() {
  const todaysLogs = appState.allLogs.filter(l => l.date === appState.todayStr);

  const habitsHtml = appState.habits.map(habit => {
    const todayLog = todaysLogs.find(l => l.habit_id === habit.id);
    const isDone = todayLog ? todayLog.completed : false;
    const streakResult = calculateStreak(habit);
    const streakLabel = formatStreakLabel(streakResult);

    return `
      <div class="habit-item">
        <div class="habit-info">
          <div class="habit-name">${escapeHtml(habit.name)}</div>
          <div class="habit-streak">${streakLabel}</div>
        </div>
        <div class="habit-actions">
          <button class="done-btn ${isDone ? "done" : ""}"
            onclick="toggleHabitDone(this, '${habit.id}', ${isDone})">
            ${isDone ? "Done ✓" : "Mark Done"}
          </button>
          <button class="remove-btn" onclick="deleteHabit('${habit.id}')">X</button>
        </div>
      </div>
    `;
  }).join("");

  const completionPercent = calculateCompletionPercent();

  renderWithNav(`
    <button class="btn btn-secondary" onclick="handleLogout()" style="margin-bottom:16px;">Log Out</button>

    <h1>Today</h1>
    <p>${appState.todayStr}</p>

    <div class="summary-box">
      <div class="percent">${completionPercent}%</div>
      <div>Overall completion</div>
    </div>

    <div class="section">
      <h2>Your Habits</h2>
      <div id="habitListContainer">${habitsHtml}</div>
    </div>

    <div class="section">
      <h2>Add a new habit</h2>
      <div class="add-habit-row">
        <input type="text" id="newDashHabitInput" placeholder="New habit name" />
        <button class="btn" onclick="addDashboardHabit()" style="margin:0;">Add</button>
      </div>
    </div>

    <div class="section">
      <h2>Today's Check-In</h2>
      <p><strong>Intention:</strong> ${escapeHtml(appState.checkinToday.intention || "-")}</p>
      <p><strong>Completed yesterday's goals:</strong> ${appState.checkinToday.completed ? "Yes" : "No"}</p>
      <p><strong>Reflection:</strong> ${escapeHtml(appState.checkinToday.reflection || "-")}</p>
    </div>
  `, "today");
}

// ===== HABIT LOGIC =====
// Streak now tolerates misses inside a rolling 30-day window:
// - up to 2 misses total → streak continues, label shows the miss count
// - a 3rd miss in the window, OR 3 misses in a row → streak resets to 0
function calculateStreak(habit) {
  const completedDates = new Set(
    appState.allLogs
      .filter(l => l.habit_id === habit.id && l.completed)
      .map(l => l.date)
  );

  const createdStr = habit.created_at.slice(0, 10);
  let cursor = parseLocalDate(appState.todayStr);

  // Today still "in progress" if not completed yet — don't count it as a miss
  if (!completedDates.has(formatDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streakDays = 0;
  let missesInWindow = 0;
  let consecutiveMisses = 0;
  let daysChecked = 0;

  while (true) {
    const cursorStr = formatDate(cursor);
    if (cursorStr < createdStr) break;

    const withinRollingWindow = daysChecked < 30;
    const isCompleted = completedDates.has(cursorStr);

    if (isCompleted) {
      streakDays++;
      consecutiveMisses = 0;
    } else if (withinRollingWindow) {
      missesInWindow++;
      consecutiveMisses++;

      if (consecutiveMisses >= 3 || missesInWindow > 2) {
        streakDays = 0;
        missesInWindow = 0;
        break;
      }
      streakDays++;
    } else {
      break;
    }

    daysChecked++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { days: streakDays, misses: missesInWindow };
}

function formatStreakLabel(result) {
  if (result.days === 0) return "Streak: 0 days";
  let label = `${result.days} day${result.days === 1 ? "" : "s"} ⚡`;
  if (result.misses === 1) label += " (1 miss)";
  else if (result.misses === 2) label += " (2 misses)";
  return label;
}

function calculateCompletionPercent() {
  if (appState.habits.length === 0) return 0;

  const activeIds = new Set(appState.habits.map(h => h.id));
  const todaysLogs = appState.allLogs.filter(
    l => l.date === appState.todayStr && activeIds.has(l.habit_id)
  );
  const completed = todaysLogs.filter(l => l.completed).length;
  const total = appState.habits.length;

  return Math.round((completed / total) * 100);
}

async function toggleHabitDone(btnEl, habitId, currentlyDone) {
  btnEl.disabled = true;

  try {
    const newStatus = !currentlyDone;

    const { data, error } = await supabaseClient
      .from("habit_logs")
      .upsert(
        {
          habit_id: habitId,
          date: appState.todayStr,
          completed: newStatus,
          user_id: currentUser.id
        },
        { onConflict: "user_id,habit_id,date" }
      )
      .select();

    if (error) throw error;

    const idx = appState.allLogs.findIndex(
      l => l.habit_id === habitId && l.date === appState.todayStr
    );
    if (idx >= 0) appState.allLogs[idx] = data[0];
    else appState.allLogs.push(data[0]);

    renderDashboardView();
  } catch (err) {
    alert("Error updating habit: " + err.message);
    btnEl.disabled = false;
  }
}

async function addDashboardHabit() {
  const input = $("#newDashHabitInput");
  const val = input.value.trim();
  if (!val) return;

  try {
    const { data, error } = await supabaseClient
      .from("habits")
      .insert([{ name: val, user_id: currentUser.id }])
      .select();

    if (error) throw error;

    appState.habits.push(data[0]);
    renderDashboardView();
  } catch (err) {
    alert("Error adding habit: " + err.message);
  }
}

async function deleteHabit(habitId) {
  if (!confirm("Remove this habit? This cannot be undone.")) return;

  try {
    const { error } = await supabaseClient
      .from("habits")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", habitId)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    appState.habits = appState.habits.filter(h => h.id !== habitId);
    appState.allLogs = appState.allLogs.filter(l => l.habit_id !== habitId);
    renderDashboardView();
  } catch (err) {
    alert("Error deleting habit: " + err.message);
  }
}

// ===== NAVIGATION =====
function goToToday() {
  appState.screen = "today";
  if (appState.checkinToday) {
    renderDashboardView();
  } else {
    renderCheckIn();
  }
}

async function goToHistory() {
  appState.screen = "history";

  if (!appState.allHabitsEver) {
    render(`<div class="loading">Loading history...</div>`);
    try {
      const { data, error } = await supabaseClient
        .from("habits")
        .select("*")
        .eq("user_id", currentUser.id);
      if (error) throw error;
      appState.allHabitsEver = data || [];
    } catch (err) {
      renderWithNav(`<div class="error-msg">Error loading history: ${escapeHtml(err.message)}</div>`, "history");
      return;
    }
  }

  appState.historyOffset = 0;
  await loadHistoryMonth();
}

// ===== HISTORY =====
function getHistoryMonthYearMonth() {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() - appState.historyOffset);
  return { year: base.getFullYear(), month: base.getMonth() };
}

function getMonthMatrix(year, month) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

async function loadHistoryMonth() {
  const myToken = ++historyRequestToken;
  render(`<div class="loading">Loading...</div>`);
  const { year, month } = getHistoryMonthYearMonth();
  const monthStart = formatDate(new Date(year, month, 1));
  const monthEnd = formatDate(new Date(year, month + 1, 0));

  try {
    const [logsRes, checkinsRes] = await Promise.all([
      supabaseClient.from("habit_logs").select("*").eq("user_id", currentUser.id).gte("date", monthStart).lte("date", monthEnd),
      supabaseClient.from("daily_checkins").select("*").eq("user_id", currentUser.id).gte("date", monthStart).lte("date", monthEnd)
    ]);
    if (logsRes.error) throw logsRes.error;
    if (checkinsRes.error) throw checkinsRes.error;

    if (myToken !== historyRequestToken) return;

    appState.historyLogs = logsRes.data || [];
    appState.historyCheckins = checkinsRes.data || [];
    renderHistoryCalendar();
  } catch (err) {
    if (myToken !== historyRequestToken) return;
    renderWithNav(`<div class="error-msg">Error loading history: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="loadHistoryMonth()">Retry</button>`, "history");
  }
}

function changeHistoryMonth(dir) {
  let newOffset = appState.historyOffset + (dir === "back" ? 1 : -1);
  if (newOffset < 0) newOffset = 0;
  if (newOffset > 6) newOffset = 6;
  if (newOffset === appState.historyOffset) return;
  appState.historyOffset = newOffset;
  loadHistoryMonth();
}

function getHabitsExistingOn(dateStr) {
  return appState.allHabitsEver.filter(h => {
    const createdStr = h.created_at.slice(0, 10);
    const deletedStr = h.deleted_at ? h.deleted_at.slice(0, 10) : null;
    return createdStr <= dateStr && (!deletedStr || deletedStr > dateStr);
  });
}

function computeDayStatus(dateStr, accountCreatedStr) {
  if (dateStr > appState.todayStr) return "future";
  if (dateStr < accountCreatedStr) return "grey";

  const existingHabits = getHabitsExistingOn(dateStr);
  if (existingHabits.length === 0) return "grey";

  const existingIds = new Set(existingHabits.map(h => h.id));
  const completedCount = appState.historyLogs.filter(
    l => l.date === dateStr && l.completed && existingIds.has(l.habit_id)
  ).length;

  if (completedCount === 0) return "red";
  if (completedCount === existingHabits.length) return "green";
  return "yellow";
}

function renderHistoryCalendar() {
  const { year, month } = getHistoryMonthYearMonth();
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const matrix = getMonthMatrix(year, month);
  const accountCreatedStr = currentUser.created_at.slice(0, 10);
  const weekdaysHtml = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<div>${d}</div>`).join('');

  const cellsHtml = matrix.flat().map(dayNum => {
    if (dayNum === null) return `<div class="calendar-day empty"></div>`;
    const dateStr = formatDate(new Date(year, month, dayNum));
    const status = computeDayStatus(dateStr, accountCreatedStr);
    const clickable = status !== "grey" && status !== "future";
    const onclickAttr = clickable ? ` onclick="openDayDetail('${dateStr}')"` : '';
    return `<div class="calendar-day day-${status}"${onclickAttr}>${dayNum}</div>`;
  }).join('');

  const canGoBack = appState.historyOffset < 6;
  const canGoForward = appState.historyOffset > 0;

  renderWithNav(`
    <h1>History</h1>
    <div class="month-nav">
      <span class="month-nav-arrow ${canGoBack ? '' : 'disabled'}"${canGoBack ? ` onclick="changeHistoryMonth('back')"` : ''}>&lt;</span>
      <h2>${monthLabel}</h2>
      <span class="month-nav-arrow ${canGoForward ? '' : 'disabled'}"${canGoForward ? ` onclick="changeHistoryMonth('forward')"` : ''}>&gt;</span>
    </div>
    <div class="calendar-weekdays">${weekdaysHtml}</div>
    <div class="calendar-grid">${cellsHtml}</div>
    <div class="calendar-legend">
      <div class="legend-item"><span class="legend-swatch" style="background:#2E7D52"></span>Green</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#A67C00"></span>Yellow</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#7D2E2E"></span>Red</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#333333"></span>Grey</div>
    </div>
  `, "history");
}

async function openDayDetail(dateStr) {
  render(`<div class="loading">Loading...</div>`);
  try {
    const { data: missData, error: missErr } = await supabaseClient
      .from("miss_reflections")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("missed_date", dateStr)
      .limit(1);
    if (missErr) throw missErr;

    appState.selectedDayMiss = (missData && missData[0]) || null;
    appState.selectedDay = dateStr;
    renderDayDetail();
  } catch (err) {
    renderWithNav(`<div class="error-msg">Error loading day: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderHistoryCalendar()">Back</button>`, "history");
  }
}

function renderDayDetail() {
  const dateStr = appState.selectedDay;
  const dateObj = parseLocalDate(dateStr);
  const heading = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const existingHabits = getHabitsExistingOn(dateStr);
  const dayLogs = appState.historyLogs.filter(l => l.date === dateStr);

  const habitsHtml = existingHabits.map(h => {
    const log = dayLogs.find(l => l.habit_id === h.id);
    const done = log ? log.completed : false;
    return `<div class="day-detail-habit ${done ? 'completed' : 'missed'}">${done ? '✓' : '✕'} ${escapeHtml(h.name)}</div>`;
  }).join('');

  const checkin = appState.historyCheckins.find(c => c.date === dateStr);
  const reflectionHtml = checkin && checkin.reflection
    ? `<p class="reflection-text">${escapeHtml(checkin.reflection)}</p>`
    : `<p class="reflection-empty">No reflection written</p>`;

  const missHtml = appState.selectedDayMiss
    ? `<div class="divider"></div>
       <div class="section">
         <h2>Why you missed</h2>
         <p class="reflection-text">${escapeHtml(appState.selectedDayMiss.response)}</p>
       </div>`
    : '';

  renderWithNav(`
    <button class="btn btn-secondary" onclick="renderHistoryCalendar()" style="width:auto; padding:0 16px;">← Back</button>
    <h1>${heading}</h1>
    <div class="divider"></div>
    <div class="section">
      <h2>Habits</h2>
      ${habitsHtml || '<p class="subtext">No habits existed this day.</p>'}
    </div>
    <div class="divider"></div>
    <div class="section">
      <h2>Reflection</h2>
      ${reflectionHtml}
    </div>
    ${missHtml}
  `, "history");
}

// ===== START =====
document.addEventListener("DOMContentLoaded", initApp);
        
