// ===== STATE =====
let appState = {
  habits: [],
  allLogs: [],
  allHabitsEver: null,
  checkinToday: null,
  todayStr: null,
  isFirstSession: false,
  screen: "today",
  historyOffset: 0,
  historyLogs: [],
  historyCheckins: [],
  selectedDay: null,
  selectedDayMiss: null,
  pendingMissDate: null,
  memorySourceDateForSave: null,
  memoryCardData: null,
  weekScoreLabel: null,
  weekScoreValue: 0,
  weeklyScores: [],
  onboardingData: {
    goal: null,
    customGoal: "",
    difficulty: null,
    habitList: []
  }
};

let currentUser = null;
let authMode = "login";
let recoveryMode = false;
let historyRequestToken = 0;
let missGuardActive = false;
let checkinYesterdayCompleted = false;

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

// ===== UTILITIES =====
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

function getTodayStr() { return formatDate(new Date()); }

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

function addDaysToStr(dateStr, n) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

function getHumanDate(dateStr) {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}

function getUserInitial() {
  const email = currentUser?.email || "?";
  return email[0].toUpperCase();
}

function $(selector) { return document.querySelector(selector); }

function render(html) { $("#app").innerHTML = html; }

// ===== BOTTOM NAV =====
function renderWithNav(contentHtml, activeTab) {
  render(`
    <div class="page-content">${contentHtml}</div>
    <nav class="nav-bar">
      <button class="nav-item ${activeTab === 'today' ? 'active' : ''}" onclick="goToToday()">
        <svg class="nav-icon" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        <span>Today</span>
      </button>
      <button class="nav-item ${activeTab === 'history' ? 'active' : ''}" onclick="goToHistory()">
        <svg class="nav-icon" viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
        <span>History</span>
      </button>
      <button class="nav-item" onclick="openProfileSheet()">
        <svg class="nav-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
        <span>Account</span>
      </button>
    </nav>
  `);
}

// ===== PROFILE SHEET =====
function openProfileSheet() {
  closeHabitMenu();
  const existing = document.getElementById('profileSheet');
  if (existing) { existing.remove(); return; } // toggle behaviour: tap again to close
  const sheet = document.createElement('div');
  sheet.id = 'profileSheet';
  sheet.className = 'bottom-sheet-overlay';
  sheet.innerHTML = `
    <div class="bottom-sheet-backdrop" onclick="closeProfileSheet()"></div>
    <div class="bottom-sheet">
      <div class="bottom-sheet-handle"></div>
      <div class="sheet-section">
        <div class="sheet-label">Account</div>
        <div class="sheet-value">${escapeHtml(currentUser?.email || '')}</div>
      </div>
      <div class="sheet-divider"></div>
      <div class="sheet-action danger" onclick="handleLogout()">Log Out</div>
    </div>
  `;
  document.body.appendChild(sheet);
}

function closeProfileSheet() {
  const s = document.getElementById('profileSheet');
  if (s) s.remove();
}

// ===== HABIT CONTEXT MENU =====
function openHabitMenu(habitId, event) {
  event.stopPropagation();
  closeHabitMenu();
  const menu = document.createElement('div');
  menu.id = 'habitMenu';
  menu.className = 'habit-menu';
  const anchor = event.target.closest('button') || event.target;
  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.right = '20px';
  menu.innerHTML = `
    <div class="habit-menu-item danger" onclick="deleteHabit('${habitId}'); closeHabitMenu();">Delete habit</div>
  `;
  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', closeHabitMenu, { once: true });
  }, 50);
}

function closeHabitMenu() {
  const m = document.getElementById('habitMenu');
  if (m) m.remove();
}

// ===== YES/NO TOGGLE =====
function setCheckinCompleted(val) {
  checkinYesterdayCompleted = val;
  const yesBtn = document.getElementById('toggleYes');
  const noBtn = document.getElementById('toggleNo');
  if (yesBtn && noBtn) {
    yesBtn.className = 'yn-option' + (val ? ' active-yes' : '');
    noBtn.className = 'yn-option' + (!val ? ' active-no' : '');
  }
}

// ===== AUTH STATE LISTENER =====
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    renderResetPasswordScreen();
  }
});

// ===== AUTH SCREENS =====
function renderAuthScreen() {
  render(`
    <div class="page-content">
      <h1 style="margin-top:40px; margin-bottom:4px;">Discipline</h1>
      <p style="color:#888; margin-bottom:24px;">${authMode === "login" ? "Log in to continue" : "Create your account"}</p>

      <label>Email</label>
      <input type="email" id="authEmail" placeholder="you@example.com" />

      <label>Password</label>
      <input type="password" id="authPassword" placeholder="At least 6 characters" />

      <div id="authError" class="error-msg"></div>

      <button class="btn" id="authSubmitBtn" onclick="handleAuthSubmit()">
        ${authMode === "login" ? "Log In" : "Sign Up"}
      </button>

      ${authMode === "login" ? `<div class="link-text" onclick="renderForgotPasswordScreen()">Forgot password?</div>` : ""}

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

  if (!email || !password) { errorBox.textContent = "Please fill in both fields."; return; }
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
  closeProfileSheet();
  await supabaseClient.auth.signOut();
  currentUser = null;
  authMode = "login";
  renderAuthScreen();
}

// ===== PASSWORD RECOVERY =====
function renderForgotPasswordScreen(confirmationShown) {
  render(`
    <div class="page-content">
      <button class="back-btn" onclick="renderAuthScreen()">← Back</button>
      <h1>Reset password</h1>
      <p style="color:#888; margin-bottom:16px;">Enter the email you signed up with</p>

      <label>Email</label>
      <input type="email" id="forgotEmail" placeholder="Email address" />
      <div id="forgotError" class="error-msg"></div>

      <button class="btn" id="forgotSubmitBtn" onclick="handleSendResetLink()">Send reset link</button>
      ${confirmationShown ? `<div class="divider"></div><p class="subtext">If that email is registered, a reset link has been sent.</p>` : ""}
    </div>
  `);
}

async function handleSendResetLink() {
  const email = $("#forgotEmail").value.trim();
  const errorBox = $("#forgotError");
  const btn = $("#forgotSubmitBtn");
  errorBox.textContent = "";
  if (!email) { errorBox.textContent = "Please enter your email."; return; }
  btn.disabled = true;
  try {
    await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
  } catch (err) { /* always show same confirmation for security */ }
  renderForgotPasswordScreen(true);
}

function renderResetPasswordScreen() {
  render(`
    <div class="page-content">
      <h1 style="margin-top:40px;">Set new password</h1>
      <label>New password</label>
      <input type="password" id="newPasswordInput" placeholder="New password" />
      <label>Confirm password</label>
      <input type="password" id="confirmPasswordInput" placeholder="Confirm new password" />
      <div id="resetError" class="error-msg"></div>
      <button class="btn" id="resetSubmitBtn" onclick="handleUpdatePassword()">Update password</button>
    </div>
  `);
}

async function handleUpdatePassword() {
  const pw1 = $("#newPasswordInput").value;
  const pw2 = $("#confirmPasswordInput").value;
  const errorBox = $("#resetError");
  const btn = $("#resetSubmitBtn");
  errorBox.textContent = "";
  if (pw1 !== pw2) { errorBox.textContent = "Passwords do not match"; return; }
  if (pw1.length < 8) { errorBox.textContent = "Password must be at least 8 characters"; return; }
  btn.disabled = true;
  try {
    const { error } = await supabaseClient.auth.updateUser({ password: pw1 });
    if (error) throw error;
    recoveryMode = false;
    await supabaseClient.auth.signOut();
    currentUser = null;
    authMode = "login";
    render(`<div class="page-content"><div class="banner-success">Password updated. Please log in.</div></div>`);
    setTimeout(renderAuthScreen, 1200);
  } catch (err) {
    errorBox.textContent = "Something went wrong. Please try again.";
    btn.disabled = false;
  }
}

// ===== INIT =====
async function initApp() {
  if (recoveryMode) return;
  render(`<div class="loading">Loading...</div>`);

  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (recoveryMode) return;
  if (!sessionData.session) { currentUser = null; renderAuthScreen(); return; }

  currentUser = sessionData.session.user;
  appState.todayStr = getTodayStr();
  appState.memorySourceDateForSave = null;

  try {
    const { data: habits, error: habitsErr } = await supabaseClient
      .from("habits").select("*").eq("user_id", currentUser.id)
      .is("deleted_at", null).order("created_at", { ascending: true });
    if (habitsErr) throw habitsErr;
    if (recoveryMode) return;
    appState.habits = habits || [];

    const { data: allHabits, error: allHabitsErr } = await supabaseClient
      .from("habits").select("*").eq("user_id", currentUser.id);
    if (allHabitsErr) throw allHabitsErr;
    if (recoveryMode) return;
    appState.allHabitsEver = allHabits || [];

    if (appState.habits.length === 0) { renderOnboardingStep1(); return; }

    const missNeeded = await checkMissModalNeeded();
    if (recoveryMode) return;
    if (missNeeded) { renderMissModal(); return; }

    await continueInitAfterMissCheck();
  } catch (err) {
    if (recoveryMode) return;
    render(`<div class="page-content"><div class="error-msg">Error: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="initApp()">Retry</button></div>`);
  }
}

async function continueInitAfterMissCheck() {
  try {
    await calculateAndStoreWeeklyScores();
    if (recoveryMode) return;

    const { data: checkins, error: checkinErr } = await supabaseClient
      .from("daily_checkins").select("*").eq("user_id", currentUser.id)
      .eq("date", appState.todayStr).limit(1);
    if (checkinErr) throw checkinErr;
    if (recoveryMode) return;

    if (!checkins || checkins.length === 0) {
      appState.checkinToday = null;
      appState.isFirstSession = false;
      renderCheckIn();
    } else {
      appState.checkinToday = checkins[0];
      await renderDashboard();
    }
  } catch (err) {
    if (recoveryMode) return;
    render(`<div class="page-content"><div class="error-msg">Error: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="initApp()">Retry</button></div>`);
  }
}

// ===== MISS HANDLING =====
async function checkMissModalNeeded() {
  const yesterday = parseLocalDate(appState.todayStr);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);
  const accountCreatedStr = currentUser.created_at.slice(0, 10);
  if (yesterdayStr < accountCreatedStr) return false;

  const { data: completedLogs, error: logsErr } = await supabaseClient
    .from("habit_logs").select("id").eq("user_id", currentUser.id)
    .eq("date", yesterdayStr).eq("completed", true).limit(1);
  if (logsErr) throw logsErr;
  if (completedLogs && completedLogs.length > 0) return false;

  const { data: missRows, error: missErr } = await supabaseClient
    .from("miss_reflections").select("id").eq("user_id", currentUser.id)
    .eq("missed_date", yesterdayStr).limit(1);
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
      <p class="miss-hint">Write at least 10 characters to continue.</p>
      <textarea id="missInput" rows="5" placeholder="Write here..." oninput="updateMissButtonState()"></textarea>
      <button class="btn" id="missSubmitBtn" disabled onclick="submitMissReflection()">Own It</button>
    </div>
  `);
  setupMissBackButtonGuard();
  setTimeout(() => { const el = $("#missInput"); if (el) el.focus(); }, 50);
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
    const { error } = await supabaseClient.from("miss_reflections").upsert(
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

function missPopStateHandler() { if (missGuardActive) history.pushState({ missModal: true }, ""); }
function setupMissBackButtonGuard() {
  missGuardActive = true;
  history.pushState({ missModal: true }, "");
  window.addEventListener("popstate", missPopStateHandler);
}
function teardownMissBackButtonGuard() {
  missGuardActive = false;
  window.removeEventListener("popstate", missPopStateHandler);
}

// ===== ONBOARDING =====
function renderOnboardingStep1() {
  const options = ["Discipline / Consistency","Health / Fitness","Focus / Study","Mental Control","Custom"];
  const optionsHtml = options.map(opt => `
    <div class="option-item ${appState.onboardingData.goal === opt ? "selected" : ""}" onclick="selectGoal('${opt}')">
      ${escapeHtml(opt)}
    </div>`).join("");
  let customInputHtml = appState.onboardingData.goal === "Custom"
    ? `<input type="text" id="customGoalInput" placeholder="Describe your goal"
        value="${escapeAttr(appState.onboardingData.customGoal || "")}"
        oninput="appState.onboardingData.customGoal = this.value" />` : "";
  render(`
    <div class="page-content">
      <p class="subtext" style="margin-top:40px;">Step 1 of 4</p>
      <h1>What do you want to improve?</h1>
      <div class="option-list">${optionsHtml}</div>
      ${customInputHtml}
      <button class="btn" onclick="goToStep2()">Next</button>
    </div>`);
}

function selectGoal(goal) { appState.onboardingData.goal = goal; renderOnboardingStep1(); }

function goToStep2() {
  if (!appState.onboardingData.goal) { alert("Please select an option."); return; }
  if (appState.onboardingData.goal === "Custom" && !appState.onboardingData.customGoal.trim()) {
    alert("Please describe your custom goal."); return;
  }
  renderOnboardingStep2();
}

function renderOnboardingStep2() {
  const options = ["Easy","Moderate","Hard"];
  const optionsHtml = options.map(opt => `
    <div class="option-item ${appState.onboardingData.difficulty === opt ? "selected" : ""}" onclick="selectDifficulty('${opt}')">
      ${escapeHtml(opt)}
    </div>`).join("");
  render(`
    <div class="page-content">
      <p class="subtext" style="margin-top:40px;">Step 2 of 4</p>
      <h1>How serious are you?</h1>
      <div class="option-list">${optionsHtml}</div>
      <button class="btn btn-secondary" onclick="renderOnboardingStep1()">Back</button>
      <button class="btn" onclick="goToStep3()">Next</button>
    </div>`);
}

function selectDifficulty(level) { appState.onboardingData.difficulty = level; renderOnboardingStep2(); }

function goToStep3() {
  if (!appState.onboardingData.difficulty) { alert("Please select an option."); return; }
  const goal = appState.onboardingData.goal;
  const difficulty = appState.onboardingData.difficulty;
  const template = HABIT_TEMPLATES[goal] || HABIT_TEMPLATES["Custom"];
  appState.onboardingData.habitList = [...(template[difficulty] || template["Moderate"])];
  renderOnboardingStep3();
}

function renderOnboardingStep3() {
  const habitsHtml = appState.onboardingData.habitList.map((habit, idx) => `
    <div class="habit-card">
      <div class="habit-card-row">
        <div class="habit-card-info"><div class="habit-card-name">${escapeHtml(habit)}</div></div>
        <button class="btn btn-secondary btn-small" onclick="removeOnboardingHabit(${idx})">Remove</button>
      </div>
    </div>`).join("");
  render(`
    <div class="page-content">
      <p class="subtext" style="margin-top:40px;">Step 3 of 4</p>
      <h1>Your habits</h1>
      <p style="color:#888; margin-bottom:16px;">Based on your answers. Add or remove as needed.</p>
      <div id="habitListContainer">${habitsHtml}</div>
      <div class="add-habit-row">
        <input type="text" id="newHabitInput" placeholder="Add a habit" />
        <button class="add-btn" onclick="addOnboardingHabit()">Add</button>
      </div>
      <button class="btn btn-secondary" onclick="renderOnboardingStep2()">Back</button>
      <button class="btn" onclick="goToStep4()">Next</button>
    </div>`);
}

function removeOnboardingHabit(idx) { appState.onboardingData.habitList.splice(idx, 1); renderOnboardingStep3(); }
function addOnboardingHabit() {
  const input = $("#newHabitInput");
  const val = input.value.trim();
  if (!val) return;
  appState.onboardingData.habitList.push(val);
  renderOnboardingStep3();
}
function goToStep4() {
  if (appState.onboardingData.habitList.length === 0) { alert("Please add at least one habit."); return; }
  renderOnboardingStep4();
}

function renderOnboardingStep4() {
  const habitsHtml = appState.onboardingData.habitList.map(habit => `
    <div class="habit-card">
      <div class="habit-card-row">
        <div class="habit-card-info"><div class="habit-card-name">${escapeHtml(habit)}</div></div>
      </div>
    </div>`).join("");
  render(`
    <div class="page-content">
      <p class="subtext" style="margin-top:40px;">Step 4 of 4</p>
      <h1>Confirm your habits</h1>
      <div>${habitsHtml}</div>
      <button class="btn btn-secondary" onclick="renderOnboardingStep3()">Back</button>
      <button class="btn" onclick="saveOnboardingHabits()">Confirm & Save</button>
    </div>`);
}

async function saveOnboardingHabits() {
  render(`<div class="loading">Saving...</div>`);
  try {
    const rows = appState.onboardingData.habitList.map(name => ({ name, user_id: currentUser.id }));
    const { data, error } = await supabaseClient.from("habits").insert(rows).select();
    if (error) throw error;
    appState.habits = data || [];
    appState.allHabitsEver = data || [];
    appState.isFirstSession = true;
    renderCheckIn();
  } catch (err) {
    render(`<div class="page-content"><div class="error-msg">Error: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderOnboardingStep4()">Back</button></div>`);
  }
}

// ===== DAILY CHECK-IN =====
function renderCheckIn(editMode) {
  appState.screen = "today";
  const existing = appState.checkinToday;
  const isEditing = !!editMode && !!existing;

  let prefillIntention = "";
  let prefillCompleted = false;
  let prefillReflection = "";

  if (isEditing) {
    prefillIntention = existing.intention || "";
    prefillCompleted = !!existing.completed;
    prefillReflection = existing.reflection || "";
  }

  if (appState.memorySourceDateForSave) {
    const label = parseLocalDate(appState.memorySourceDateForSave)
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const promptLine = `Revisiting: ${label}. Respond below:`;
    prefillReflection = prefillReflection
      ? `${promptLine}\n\n${prefillReflection}` : `${promptLine}\n`;
  }

  checkinYesterdayCompleted = prefillCompleted;

  const humanDate = getHumanDate(appState.todayStr);

  const yesterdaySection = (appState.isFirstSession && !isEditing)
    ? `<p style="color:#888; font-size:14px; margin: 14px 0;">Welcome! This is your first day — no yesterday to review yet.</p>`
    : `<div class="yn-label">Did you complete yesterday's goals?</div>
       <div class="yn-toggle">
         <button id="toggleYes" class="yn-option ${prefillCompleted ? 'active-yes' : ''}" onclick="setCheckinCompleted(true)">Yes</button>
         <button id="toggleNo" class="yn-option ${!prefillCompleted ? 'active-no' : ''}" onclick="setCheckinCompleted(false)">No</button>
       </div>`;

  renderWithNav(`
    <h1>${isEditing ? "Edit Check-In" : "Check-In"}</h1>
    <p style="color:#888; margin-bottom:20px;">${humanDate}</p>

    <label>What's your intention for today?</label>
    <textarea id="intentionInput" rows="3" placeholder="e.g. Stay focused and avoid distractions">${escapeHtml(prefillIntention)}</textarea>

    ${yesterdaySection}

    <label>Reflection</label>
    <textarea id="reflectionInput" rows="4" placeholder="Any thoughts about yesterday or today">${escapeHtml(prefillReflection)}</textarea>

    <button class="btn" onclick="saveCheckIn()">${isEditing ? "Save Changes" : "Save Check-In"}</button>
    ${isEditing ? `<button class="btn btn-secondary" onclick="cancelEditCheckIn()">Cancel</button>` : ""}
  `, "today");
}

function cancelEditCheckIn() {
  appState.memorySourceDateForSave = null;
  renderDashboardView();
}

async function saveCheckIn() {
  const intention = $("#intentionInput").value.trim();
  const completed = checkinYesterdayCompleted;
  const reflection = $("#reflectionInput").value.trim();
  const memorySourceDate = appState.memorySourceDateForSave;

  render(`<div class="loading">Saving...</div>`);
  try {
    const payload = {
      date: appState.todayStr,
      intention, completed, reflection,
      user_id: currentUser.id
    };
    if (memorySourceDate) payload.memory_source_date = memorySourceDate;

    const { data, error } = await supabaseClient
      .from("daily_checkins").upsert(payload, { onConflict: "user_id,date" }).select();
    if (error) throw error;

    appState.checkinToday = data[0];
    appState.memorySourceDateForSave = null;
    await renderDashboard();
  } catch (err) {
    render(`<div class="page-content"><div class="error-msg">Error: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderCheckIn()">Back</button></div>`);
  }
}

// ===== DASHBOARD =====
async function renderDashboard() {
  appState.screen = "today";
  appState.todayStr = getTodayStr();
  render(`<div class="loading">Loading...</div>`);
  try {
    const cutoff = formatDate(new Date(Date.now() - 90 * 86400000));
    const { data: logs, error: logsErr } = await supabaseClient
      .from("habit_logs").select("*").eq("user_id", currentUser.id).gte("date", cutoff);
    if (logsErr) throw logsErr;
    appState.allLogs = logs || [];
    await checkMemoryCard();
    renderDashboardView();
  } catch (err) {
    render(`<div class="page-content"><div class="error-msg">Error: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderDashboard()">Retry</button></div>`);
  }
}

function renderDashboardView() {
  const todaysLogs = appState.allLogs.filter(l => l.date === appState.todayStr);
  const completionPercent = calculateCompletionPercent();
  const initial = getUserInitial();
  const greeting = getGreeting();
  const humanDate = getHumanDate(appState.todayStr);

  // Score card
  const scoreVal = appState.weekScoreValue || 0;
  const scoreDisplay = scoreVal > 0 ? scoreVal : "—";
  const scoreFill = Math.min(100, Math.max(0, scoreVal));

  // Habit cards
  const habitsHtml = appState.habits.map(habit => {
    const todayLog = todaysLogs.find(l => l.habit_id === habit.id);
    const isDone = todayLog ? todayLog.completed : false;
    const streakResult = calculateStreak(habit);
    const streakLabel = formatStreakLabel(streakResult);
    const icon = isDone ? "✅" : "⭕";

    return `
      <div class="habit-card">
        <div class="habit-card-row">
          <span class="habit-card-icon">${icon}</span>
          <div class="habit-card-info">
            <div class="habit-card-name">${escapeHtml(habit.name)}</div>
            <div class="habit-card-sub">${escapeHtml(streakLabel)}</div>
          </div>
          <button class="habit-more-btn" onclick="openHabitMenu('${habit.id}', event)">···</button>
        </div>
        <div class="habit-card-footer">
          <button class="pill-btn ${isDone ? 'pill-done' : 'pill-undone'}"
            onclick="toggleHabitDone(this, '${habit.id}', ${isDone})">
            ${isDone ? "Done ✓" : "Mark Done"}
          </button>
        </div>
      </div>`;
  }).join("");

  // Memory card
  const memoryCardHtml = appState.memoryCardData ? `
    <div class="memory-card">
      <div class="memory-card-close" onclick="dismissMemoryCard()">✕</div>
      <div class="memory-card-label">${escapeHtml(appState.memoryCardData.daysAgoLabel)} — ${escapeHtml(appState.memoryCardData.dateLabel)}</div>
      <p class="memory-card-text">${escapeHtml(appState.memoryCardData.reflectionText)}</p>
      <button class="btn" onclick="respondToMemoryCard()">How are you doing now?</button>
    </div>` : "";

  // Checkin section
  const checkin = appState.checkinToday;

  renderWithNav(`
    <div class="page-header">
      <div>
        <div class="header-greeting">${greeting}</div>
        <div class="header-date">${humanDate}</div>
      </div>
      <div class="avatar-btn" onclick="openProfileSheet()">${initial}</div>
    </div>

    ${memoryCardHtml}

    <div class="score-card">
      <div class="score-card-top">
        <span class="score-card-title">Weekly Score</span>
        <span class="score-card-status">${scoreVal > 0 ? 'Last week' : 'In progress'}</span>
      </div>
      <span class="score-card-num">${scoreDisplay}</span>
      <span class="score-card-denom">/ 100</span>
      <div class="score-progress-track">
        <div class="score-progress-fill" style="width:${scoreFill}%"></div>
      </div>
    </div>

    <div class="completion-card">
      <div class="completion-pct">${completionPercent}%</div>
      <div class="completion-label">Today's completion</div>
    </div>

    <div class="section">
      <h2>Your Habits</h2>
      <div id="habitListContainer">${habitsHtml}</div>
      <div class="add-habit-row" style="margin-top:8px;">
        <input type="text" id="newDashHabitInput" placeholder="Add a habit" />
        <button class="add-btn" onclick="addDashboardHabit()">Add</button>
      </div>
    </div>

    <div class="checkin-info-card">
      <div class="checkin-info-header">
        <h2>Today's Check-In</h2>
        <button class="btn btn-secondary btn-small" onclick="renderCheckIn(true)">Edit</button>
      </div>
      <div class="checkin-info-row">
        <div class="checkin-info-label">Intention</div>
        <div class="checkin-info-value">${escapeHtml(checkin.intention || "—")}</div>
      </div>
      <div class="divider"></div>
      <div class="checkin-info-row">
        <div class="checkin-info-label">Yesterday's goals</div>
        <div class="checkin-info-value">${checkin.completed ? "Completed ✓" : "Not completed"}</div>
      </div>
      <div class="divider"></div>
      <div class="checkin-info-row">
        <div class="checkin-info-label">Reflection</div>
        <div class="checkin-info-value">${escapeHtml(checkin.reflection || "—")}</div>
      </div>
    </div>
  `, "today");
}

// ===== HABIT LOGIC =====
function calculateStreak(habit) {
  const completedDates = new Set(
    appState.allLogs.filter(l => l.habit_id === habit.id && l.completed).map(l => l.date)
  );
  const createdStr = habit.created_at.slice(0, 10);
  let cursor = parseLocalDate(appState.todayStr);
  if (!completedDates.has(formatDate(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streakDays = 0, missesInWindow = 0, consecutiveMisses = 0, daysChecked = 0;
  while (true) {
    const cursorStr = formatDate(cursor);
    if (cursorStr < createdStr) break;
    const withinWindow = daysChecked < 30;
    const isCompleted = completedDates.has(cursorStr);
    if (isCompleted) { streakDays++; consecutiveMisses = 0; }
    else if (withinWindow) {
      missesInWindow++; consecutiveMisses++;
      if (consecutiveMisses >= 3 || missesInWindow > 2) { streakDays = 0; missesInWindow = 0; break; }
      streakDays++;
    } else break;
    daysChecked++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { days: streakDays, misses: missesInWindow, createdStr };
}

function formatStreakLabel(result) {
  if (result.days === 0) {
    const createdDate = parseLocalDate(result.createdStr)
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Started ${createdDate}`;
  }
  let label = `Streak: ${result.days} day${result.days === 1 ? "" : "s"} ⚡`;
  if (result.misses === 1) label += " (1 miss)";
  else if (result.misses === 2) label += " (2 misses)";
  return label;
}

function calculateCompletionPercent() {
  if (appState.habits.length === 0) return 0;
  const activeIds = new Set(appState.habits.map(h => h.id));
  const todaysLogs = appState.allLogs.filter(l => l.date === appState.todayStr && activeIds.has(l.habit_id));
  return Math.round((todaysLogs.filter(l => l.completed).length / appState.habits.length) * 100);
}

async function toggleHabitDone(btnEl, habitId, currentlyDone) {
  btnEl.disabled = true;
  try {
    const newStatus = !currentlyDone;
    const { data, error } = await supabaseClient.from("habit_logs").upsert(
      { habit_id: habitId, date: appState.todayStr, completed: newStatus, user_id: currentUser.id },
      { onConflict: "user_id,habit_id,date" }
    ).select();
    if (error) throw error;
    const idx = appState.allLogs.findIndex(l => l.habit_id === habitId && l.date === appState.todayStr);
    if (idx >= 0) appState.allLogs[idx] = data[0]; else appState.allLogs.push(data[0]);
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
    const { data, error } = await supabaseClient.from("habits")
      .insert([{ name: val, user_id: currentUser.id }]).select();
    if (error) throw error;
    appState.habits.push(data[0]);
    if (appState.allHabitsEver) appState.allHabitsEver.push(data[0]);
    renderDashboardView();
  } catch (err) { alert("Error adding habit: " + err.message); }
}

async function deleteHabit(habitId) {
  if (!confirm("Remove this habit? This cannot be undone.")) return;
  try {
    const deletedAt = new Date().toISOString();
    const { error } = await supabaseClient.from("habits")
      .update({ deleted_at: deletedAt }).eq("id", habitId).eq("user_id", currentUser.id);
    if (error) throw error;
    appState.habits = appState.habits.filter(h => h.id !== habitId);
    appState.allLogs = appState.allLogs.filter(l => l.habit_id !== habitId);
    if (appState.allHabitsEver) {
      const h = appState.allHabitsEver.find(x => x.id === habitId);
      if (h) h.deleted_at = deletedAt;
    }
    renderDashboardView();
  } catch (err) { alert("Error deleting habit: " + err.message); }
}

// ===== NAVIGATION =====
function goToToday() {
  appState.screen = "today";
  closeHabitMenu();
  closeProfileSheet();
  if (appState.checkinToday) renderDashboardView(); else renderCheckIn();
}

async function goToHistory() {
  appState.screen = "history";
  closeHabitMenu();
  closeProfileSheet();
  if (!appState.allHabitsEver) {
    render(`<div class="loading">Loading...</div>`);
    try {
      const { data, error } = await supabaseClient.from("habits").select("*").eq("user_id", currentUser.id);
      if (error) throw error;
      appState.allHabitsEver = data || [];
    } catch (err) {
      renderWithNav(`<div class="error-msg">Error: ${escapeHtml(err.message)}</div>`, "history");
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
    const [logsRes, checkinsRes, scoresRes] = await Promise.all([
      supabaseClient.from("habit_logs").select("*").eq("user_id", currentUser.id).gte("date", monthStart).lte("date", monthEnd),
      supabaseClient.from("daily_checkins").select("*").eq("user_id", currentUser.id).gte("date", monthStart).lte("date", monthEnd),
      supabaseClient.from("weekly_scores").select("*").eq("user_id", currentUser.id).order("week_start", { ascending: false }).limit(8)
    ]);
    if (logsRes.error) throw logsRes.error;
    if (checkinsRes.error) throw checkinsRes.error;
    if (scoresRes.error) throw scoresRes.error;
    if (myToken !== historyRequestToken) return;
    appState.historyLogs = logsRes.data || [];
    appState.historyCheckins = checkinsRes.data || [];
    appState.weeklyScores = (scoresRes.data || []).slice().reverse();
    renderHistoryCalendar();
  } catch (err) {
    if (myToken !== historyRequestToken) return;
    renderWithNav(`<div class="error-msg">Error: ${escapeHtml(err.message)}</div>
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

function getHabitsActiveInWeek(monday, sunday) {
  return appState.allHabitsEver.filter(h => {
    const createdStr = h.created_at.slice(0, 10);
    const deletedStr = h.deleted_at ? h.deleted_at.slice(0, 10) : null;
    return createdStr <= sunday && (!deletedStr || deletedStr > monday);
  });
}

function computeDayStatus(dateStr, accountCreatedStr) {
  if (dateStr > appState.todayStr) return "future";
  if (dateStr < accountCreatedStr) return "grey";
  const existingHabits = getHabitsExistingOn(dateStr);
  if (existingHabits.length === 0) return "grey";
  const existingIds = new Set(existingHabits.map(h => h.id));
  const completedCount = appState.historyLogs.filter(l => l.date === dateStr && l.completed && existingIds.has(l.habit_id)).length;
  if (completedCount === 0) return "red";
  if (completedCount === existingHabits.length) return "green";
  return "yellow";
}

function renderScoreChart() {
  if (appState.weeklyScores.length === 0) {
    return `<div class="score-chart-card">
      <h2>Score History</h2>
      <p class="score-empty">No completed weeks yet.</p>
    </div>`;
  }
  const barsHtml = appState.weeklyScores.map(s => {
    const heightPx = Math.max(4, Math.round((s.score / 100) * 100));
    const label = parseLocalDate(s.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `
      <div class="score-bar-col">
        <div class="score-bar-num">${s.score}</div>
        <div class="score-bar" style="height:${heightPx}px;"></div>
        <div class="score-bar-date">${label}</div>
      </div>`;
  }).join("");
  return `
    <div class="score-chart-card">
      <h2>Score History</h2>
      <div class="score-chart-wrap">${barsHtml}</div>
    </div>`;
}

function renderHistoryCalendar() {
  const { year, month } = getHistoryMonthYearMonth();
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const matrix = getMonthMatrix(year, month);
  const accountCreatedStr = currentUser.created_at.slice(0, 10);
  const weekdaysHtml = ['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => `<div>${d}</div>`).join('');

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
      <div class="legend-item"><span class="legend-swatch" style="background:#2D6A4F"></span>All habits done</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#A67C00"></span>Some habits done</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#8B1A1A"></span>Nothing done</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#2E2E2E"></span>Before you started</div>
    </div>
    ${renderScoreChart()}
  `, "history");
}

async function openDayDetail(dateStr) {
  render(`<div class="loading">Loading...</div>`);
  try {
    const { data: missData, error: missErr } = await supabaseClient
      .from("miss_reflections").select("*").eq("user_id", currentUser.id).eq("missed_date", dateStr).limit(1);
    if (missErr) throw missErr;
    appState.selectedDayMiss = (missData && missData[0]) || null;
    appState.selectedDay = dateStr;
    renderDayDetail();
  } catch (err) {
    renderWithNav(`<div class="error-msg">Error: ${escapeHtml(err.message)}</div>
      <button class="btn" onclick="renderHistoryCalendar()">Back</button>`, "history");
  }
}

function renderDayDetail() {
  const dateStr = appState.selectedDay;
  const heading = getHumanDate(dateStr);
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
       <div class="section"><h2>Why you missed</h2>
       <p class="reflection-text">${escapeHtml(appState.selectedDayMiss.response)}</p></div>` : '';

  renderWithNav(`
    <button class="back-btn" onclick="renderHistoryCalendar()">← Back</button>
    <h1>${heading}</h1>
    <div class="divider"></div>
    <div class="section"><h2>Habits</h2>
      ${habitsHtml || '<p class="subtext">No habits existed this day.</p>'}
    </div>
    <div class="divider"></div>
    <div class="section"><h2>Reflection</h2>${reflectionHtml}</div>
    ${missHtml}
  `, "history");
}

// ===== WEEKLY DISCIPLINE SCORE =====
function getMondayOf(dateStr) {
  const d = parseLocalDate(dateStr);
  const dow = d.getDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diffToMonday);
  return formatDate(d);
}

async function calculateAndStoreWeeklyScores() {
  const accountCreatedStr = currentUser.created_at.slice(0, 10);
  const thisMonday = getMondayOf(appState.todayStr);
  let cursorMonday = addDaysToStr(thisMonday, -7);

  for (let i = 0; i < 10; i++) {
    const weekSunday = addDaysToStr(cursorMonday, 6);
    if (weekSunday >= appState.todayStr) { cursorMonday = addDaysToStr(cursorMonday, -7); continue; }
    if (cursorMonday < accountCreatedStr && weekSunday < accountCreatedStr) break;

    const { data: existingScore, error: existingErr } = await supabaseClient
      .from("weekly_scores").select("id").eq("user_id", currentUser.id)
      .eq("week_start", cursorMonday).limit(1);
    if (existingErr) throw existingErr;
    if (!existingScore || existingScore.length === 0) await computeAndStoreOneWeek(cursorMonday, weekSunday);
    cursorMonday = addDaysToStr(cursorMonday, -7);
  }

  await loadCurrentWeekScoreLabel();
}

async function computeAndStoreOneWeek(monday, sunday) {
  const activeHabits = getHabitsActiveInWeek(monday, sunday);
  if (activeHabits.length === 0) return;

  const [logsRes, checkinsRes, missRes] = await Promise.all([
    supabaseClient.from("habit_logs").select("*").eq("user_id", currentUser.id).gte("date", monday).lte("date", sunday),
    supabaseClient.from("daily_checkins").select("*").eq("user_id", currentUser.id).gte("date", monday).lte("date", sunday),
    supabaseClient.from("miss_reflections").select("*").eq("user_id", currentUser.id).gte("missed_date", monday).lte("missed_date", sunday)
  ]);
  if (logsRes.error || checkinsRes.error || missRes.error) return;

  const weekLogs = logsRes.data || [];
  const weekCheckins = checkinsRes.data || [];
  const weekMisses = missRes.data || [];
  const activeIds = new Set(activeHabits.map(h => h.id));
  const perHabitPoints = 80 / activeHabits.length;

  let habitScore = 0;
  for (const h of activeHabits) {
    const daysCompleted = weekLogs.filter(l => l.habit_id === h.id && l.completed).length;
    habitScore += perHabitPoints * (daysCompleted / 7);
  }

  const reflectionDays = weekCheckins.filter(c => c.reflection && c.reflection.trim().length > 0).length;
  const reflectionBonus = reflectionDays >= 4 ? 5 : 0;

  let missDays = [];
  let cur = monday;
  while (cur <= sunday) {
    const dayActiveIds = new Set(getHabitsExistingOn(cur).filter(h => activeIds.has(h.id)).map(h => h.id));
    if (dayActiveIds.size > 0) {
      const completedCount = weekLogs.filter(l => l.date === cur && l.completed && dayActiveIds.has(l.habit_id)).length;
      if (completedCount === 0) missDays.push(cur);
    }
    cur = addDaysToStr(cur, 1);
  }

  let missBonus = missDays.length === 0 ? 5
    : missDays.every(d => weekMisses.some(m => m.missed_date === d)) ? 5 : 0;

  const rawScore = habitScore + reflectionBonus + missBonus;
  const displayedScore = Math.round((rawScore / 90) * 100);

  try {
    await supabaseClient.from("weekly_scores").upsert(
      { user_id: currentUser.id, week_start: monday, week_end: sunday,
        score: Math.max(0, Math.min(100, displayedScore)), raw_score: rawScore },
      { onConflict: "user_id,week_start" }
    );
  } catch (err) { /* non-fatal */ }
}

async function loadCurrentWeekScoreLabel() {
  try {
    const { data, error } = await supabaseClient.from("weekly_scores").select("*")
      .eq("user_id", currentUser.id).order("week_start", { ascending: false }).limit(1);
    if (error) throw error;
    if (data && data.length > 0) {
      appState.weekScoreValue = data[0].score;
      appState.weekScoreLabel = `${data[0].score} / 100`;
    } else {
      appState.weekScoreValue = 0;
      appState.weekScoreLabel = null;
    }
  } catch (err) {
    appState.weekScoreValue = 0;
    appState.weekScoreLabel = null;
  }
}

// ===== REFLECTION MEMORY =====
async function checkMemoryCard() {
  appState.memoryCardData = null;
  const accountCreatedStr = currentUser.created_at.slice(0, 10);
  const accountAgeDays = Math.floor((parseLocalDate(appState.todayStr) - parseLocalDate(accountCreatedStr)) / 86400000);
  if (accountAgeDays < 31) return;

  try {
    const { data: rows, error } = await supabaseClient.from("memory_state").select("*")
      .eq("user_id", currentUser.id).lte("window_start", appState.todayStr)
      .order("window_start", { ascending: false }).limit(1);
    if (error) throw error;

    let row = rows && rows[0];
    const windowEnd = row ? addDaysToStr(row.window_start, 6) : null;
    const rowCoversToday = row && windowEnd >= appState.todayStr;

    if (!rowCoversToday) {
      const randomOffset = Math.floor(Math.random() * 7);
      const newRow = {
        user_id: currentUser.id,
        window_start: appState.todayStr,
        scheduled_day: addDaysToStr(appState.todayStr, randomOffset),
        source_reflection_date: null, dismissed_today: null
      };
      const { data: inserted, error: insErr } = await supabaseClient.from("memory_state")
        .upsert(newRow, { onConflict: "user_id,window_start" }).select();
      if (insErr) throw insErr;
      row = inserted[0];
    }

    if (row.dismissed_today === appState.todayStr) return;
    if (row.scheduled_day !== appState.todayStr) return;

    let sourceDate = null, reflectionText = null;
    for (const daysAgo of [90, 60, 30]) {
      const candidateDate = addDaysToStr(appState.todayStr, -daysAgo);
      const { data: checkinData, error: checkinErr } = await supabaseClient
        .from("daily_checkins").select("date, reflection").eq("user_id", currentUser.id)
        .eq("date", candidateDate).limit(1);
      if (checkinErr) continue;
      if (checkinData && checkinData.length > 0 && checkinData[0].reflection?.trim().length > 0) {
        sourceDate = candidateDate;
        reflectionText = checkinData[0].reflection;
        break;
      }
    }
    if (!sourceDate) return;

    if (row.source_reflection_date !== sourceDate) {
      await supabaseClient.from("memory_state").update({ source_reflection_date: sourceDate }).eq("id", row.id);
    }

    const daysAgoActual = Math.round((parseLocalDate(appState.todayStr) - parseLocalDate(sourceDate)) / 86400000);
    const dateLabel = parseLocalDate(sourceDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    appState.memoryCardData = {
      sourceDate, reflectionText,
      daysAgoLabel: `${daysAgoActual} days ago`, dateLabel,
      memoryStateId: row.id
    };
  } catch (err) { appState.memoryCardData = null; }
}

async function dismissMemoryCard() {
  if (!appState.memoryCardData) return;
  const id = appState.memoryCardData.memoryStateId;
  appState.memoryCardData = null;
  renderDashboardView();
  try {
    await supabaseClient.from("memory_state").update({ dismissed_today: appState.todayStr }).eq("id", id);
  } catch (err) { /* non-fatal */ }
}

function respondToMemoryCard() {
  if (!appState.memoryCardData) return;
  appState.memorySourceDateForSave = appState.memoryCardData.sourceDate;
  appState.memoryCardData = null;
  renderCheckIn(true);
}

// ===== START =====
document.addEventListener("DOMContentLoaded", initApp);
