// ===== STATE =====
let appState = {
  habits: [],
  allLogs: [],
  checkinToday: null,
  todayStr: null,
  isFirstSession: false,
  onboardingData: {
    goal: null,
    customGoal: "",
    difficulty: null,
    habitList: []
  }
};

let currentUser = null;
let authMode = "login";

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

// NEW — safe for use inside value="..." attributes (escapeHtml alone is not)
function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getTodayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function $(selector) {
  return document.querySelector(selector);
}

function render(html) {
  $("#app").innerHTML = html;
}

// ===== AUTH SCREEN =====
function renderAuthScreen() {
  render(`
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
      .order("created_at", { ascending: true });

    if (habitsErr) throw habitsErr;
    appState.habits = habits || [];

    if (appState.habits.length === 0) {
      renderOnboardingStep1();
      return;
    }

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
    render(`<div class="error-msg">Error loading app: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="initApp()">Retry</button>`);
  }
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
    <h2>Step 1 of 4</h2>
    <h1>What do you want to improve?</h1>
    <div class="option-list">${optionsHtml}</div>
    ${customInputHtml}
    <button class="btn" onclick="goToStep2()">Next</button>
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
    <h2>Step 2 of 4</h2>
    <h1>How serious are you?</h1>
    <div class="option-list">${optionsHtml}</div>
    <button class="btn btn-secondary" onclick="renderOnboardingStep1()">Back</button>
    <button class="btn" onclick="goToStep3()">Next</button>
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
    <h2>Step 4 of 4</h2>
    <h1>Confirm your habits</h1>
    <div>${habitsHtml}</div>
    <button class="btn btn-secondary" onclick="renderOnboardingStep3()">Back</button>
    <button class="btn" onclick="saveOnboardingHabits()">Confirm & Save</button>
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
    render(`<div class="error-msg">Error saving habits: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderOnboardingStep4()">Back</button>`);
  }
}

// ===== DAILY CHECK-IN =====
function renderCheckIn() {
  const yesterdayHtml = appState.isFirstSession
    ? `<p style="color:#888; font-size:14px; margin: 12px 0;">
        Welcome! This is your first day — no yesterday to review yet.
       </p>`
    : `<div class="checkbox-row">
        <input type="checkbox" id="completedInput" />
        <label for="completedInput">Did you complete yesterday's goals?</label>
       </div>`;

  render(`
    <h1>Daily Check-In</h1>
    <p>${appState.todayStr}</p>

    <label>What's your intention for today?</label>
    <textarea id="intentionInput" rows="3" placeholder="e.g. Stay focused and avoid distractions"></textarea>

    ${yesterdayHtml}

    <label>Reflection</label>
    <textarea id="reflectionInput" rows="3" placeholder="Any thoughts about yesterday or today"></textarea>

    <button class="btn" onclick="saveCheckIn()">Save Check-In</button>
  `);
}

// CHANGED — upsert instead of insert, so a duplicate save updates today's
// row instead of creating a second one
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
    render(`<div class="error-msg">Error saving check-in: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderCheckIn()">Back</button>`);
  }
}

// ===== DASHBOARD =====
// CHANGED — this now only fetches data, then hands off to renderDashboardView()
async function renderDashboard() {
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
    render(`<div class="error-msg">Error loading dashboard: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderDashboard()">Retry</button>`);
  }
}

// NEW — draws the dashboard from whatever is already in memory, no database
// call. This is what makes "Mark Done" feel instant.
function renderDashboardView() {
  const todaysLogs = appState.allLogs.filter(l => l.date === appState.todayStr);

  const habitsHtml = appState.habits.map(habit => {
    const todayLog = todaysLogs.find(l => l.habit_id === habit.id);
    const isDone = todayLog ? todayLog.completed : false;
    const streak = calculateStreak(habit.id);

    return `
      <div class="habit-item">
        <div class="habit-info">
          <div class="habit-name">${escapeHtml(habit.name)}</div>
          <div class="habit-streak">Streak: ${streak} day${streak === 1 ? "" : "s"}</div>
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

  render(`
    <button class="btn btn-secondary" onclick="handleLogout()" style="margin-bottom:16px;">Log Out</button>

    <h1>Dashboard</h1>
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
  `);
}

// ===== HABIT LOGIC =====
function calculateStreak(habitId) {
  const completedDates = new Set(
    appState.allLogs
      .filter(l => l.habit_id === habitId && l.completed)
      .map(l => l.date)
  );

  if (completedDates.size === 0) return 0;

  let streak = 0;
  let cursor = parseLocalDate(appState.todayStr);

  if (!completedDates.has(formatDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (completedDates.has(formatDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

// CHANGED — upsert instead of separate insert/update branches, plus the
// button is disabled while the request is in flight so fast double-taps
// can't create two rows for the same habit on the same day
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

// CHANGED — redraws from memory instead of re-fetching everything
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

// CHANGED — one delete call instead of two (the database now deletes the
// habit's logs automatically), and redraws from memory instead of refetching
async function deleteHabit(habitId) {
  if (!confirm("Remove this habit? This cannot be undone.")) return;

  try {
    const { error } = await supabaseClient
      .from("habits")
      .delete()
      .eq("id", habitId);

    if (error) throw error;

    appState.habits = appState.habits.filter(h => h.id !== habitId);
    appState.allLogs = appState.allLogs.filter(l => l.habit_id !== habitId);
    renderDashboardView();
  } catch (err) {
    alert("Error deleting habit: " + err.message);
  }
}

// ===== START =====
document.addEventListener("DOMContentLoaded", initApp);
