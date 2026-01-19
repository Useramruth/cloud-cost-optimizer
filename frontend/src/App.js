import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { Github, Linkedin, Cloud } from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = process.env.REACT_APP_API_BASE;

/* =====================
   JWT ROLE DECODER
===================== */
const getRoleFromToken = (token) => {
  try {
    return JSON.parse(atob(token.split(".")[1])).role;
  } catch {
    return null;
  }
};

const isTokenValid = (token) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const now = Date.now() / 1000;
    return payload.exp && payload.exp > now;
  } catch {
    return false;
  }
};

function App() {

  const goBackToLogin = () => {
  setForgotMode(false);
  setUsername("");
  setPassword("");
  setOtp("");
  setNewPassword("");
  setMessage("");
};

/* 🔔 GLOBAL TOAST CONTAINER — MUST BE HERE */
  const ToastRoot = (
    <ToastContainer
      position="top-right"
      autoClose={3000}
      newestOnTop
      closeOnClick
      pauseOnHover
      draggable
      theme={localStorage.getItem("theme") || "light"}
    />
  );

  const sanitize = (text = "") =>
  text.replace(/[<>]/g, "");

  /* =====================
     AUTH STATE
  ===================== */
  const storedToken =
    localStorage.getItem("token") || sessionStorage.getItem("token");

  const [token, setToken] = useState(
    storedToken && isTokenValid(storedToken) ? storedToken : null
  );

  const [role, setRole] = useState(token ? getRoleFromToken(token) : null);

  useEffect(() => {
  if (token && !isTokenValid(token)) {
    localStorage.clear();
    sessionStorage.clear();
    setToken(null);
    setRole(null);
    toast.error("Session expired. Please login again.");
  }
}, [token]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [auditLogs, setAuditLogs] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showClearLogsModal, setShowClearLogsModal] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [totalLogs, setTotalLogs] = useState(0);
  const [cpuData, setCpuData] = useState([]);
  const [costData, setCostData] = useState([]);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [showClearModal, setShowClearModal] = useState(false);


  /* =====================
   THEME MODE
===================== */
const [theme, setTheme] = useState(
  localStorage.getItem("theme") || "light"
);

useEffect(() => {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  localStorage.setItem("theme", theme);
}, [theme]);

const toggleTheme = () => {
  setTheme(prev => (prev === "light" ? "dark" : "light"));
};

/* =====================
   COMMENTS (VIEWER → ADMIN)
===================== */
const [comments, setComments] = useState(() => {
  try {
    const saved = localStorage.getItem("comments");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
});

const [commentText, setCommentText] = useState("");
const [replyText, setReplyText] = useState("");
const [activeReplyIndex, setActiveReplyIndex] = useState(null);

useEffect(() => {
  localStorage.setItem("comments", JSON.stringify(comments));
}, [comments]);

/* =====================
   SUBMIT COMMENT (VIEWER)
===================== */
const submitComment = () => {
  if (!commentText.trim()) return;

  setComments(prev => [
    ...prev,
    {
      message: sanitize(commentText),    // ✅ unified key
      author: role,
      username: username || "anonymous",
      likes: 0,
      replies: [],               // ✅ IMPORTANT
      time: new Date().toLocaleString()
    }
  ]);

  setCommentText("");
  toast.success("Comment submitted successfully");
};

/* =====================
   SUBMIT THREAD REPLY (ADMIN + VIEWER)
===================== */
const submitThreadReply = (index) => {
  if (!replyText.trim()) return;

  setComments(prev =>
    prev.map((c, i) =>
      i === index
        ? {
            ...c,
            replies: [
              ...c.replies,
              {
                author: role === "admin" ? username : username || "anonymous",
                role: role,
                message: sanitize(replyText),
                time: new Date().toLocaleString()
              }
            ]
          }
        : c
    )
  );

  setReplyText("");
  setActiveReplyIndex(null);
};

/* =====================
   LIKE COMMENT (ADMIN ONLY)
===================== */
const likeComment = (i) => {
  if (role !== "admin") return;

  setComments(prev =>
    prev.map((c, idx) =>
      idx === i ? { ...c, likes: c.likes + 1 } : c
    )
  );
};

/* =====================
   ADMIN REPLY
===================== */
const submitReply = (index) => {
  if (!replyText.trim()) return;

  setComments(prev =>
    prev.map((c, i) =>
      i === index ? { ...c, reply: replyText } : c
    )
  );

  setReplyText("");
  setActiveReplyIndex(null);
};

/* =====================
   CLEAR ALL COMMENTS (ADMIN)
===================== */
const clearAllComments = () => {
  if (role !== "admin") return;
  setShowClearModal(true);
};

const confirmClearComments = () => {
  setComments([]);
localStorage.removeItem("comments");
setShowClearModal(false);
toast.success("All comments cleared");
};


  /* =====================
     FORGOT PASSWORD
  ===================== */
  const [forgotMode, setForgotMode] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  /* =====================
     DATA STATE
  ===================== */
  const [instances, setInstances] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  /* =====================
   SUMMARY CARD CALCULATIONS
===================== */
const totalMonthlyCost = instances.reduce(
  (sum, i) => sum + (i.EstimatedMonthlyCostUSD || 0),
  0
);

const totalSavings = instances.reduce(
  (sum, i) => sum + (i.SavingsUSD || 0),
  0
);

const runningCount = instances.filter(i => i.State === "running").length;
const stoppedCount = instances.filter(i => i.State === "stopped").length;


  /* =====================
   DELETE USER MODAL STATE
===================== */
const [deleteUserConfirm, setDeleteUserConfirm] = useState(null);

  /* =====================
     ADMIN USER FORM
  ===================== */
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("viewer");

  /* =====================
     LOGIN
  ===================== */
  const login = async () => {
  setLoginError("");

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    // ❌ LOGIN FAILED
    if (!res.ok || !data.access_token) {
      const msg = data?.error || "Invalid username or password";
      setLoginError(msg);
      toast.error(msg);
      return;
    }

    // ✅ LOGIN SUCCESS (toast FIRST)
    toast.success("Login successful 🎉");

    // ⏳ delay state change so toast renders
    setTimeout(() => {
      rememberMe
        ? localStorage.setItem("token", data.access_token)
        : sessionStorage.setItem("token", data.access_token);

      setToken(data.access_token);
      setRole(getRoleFromToken(data.access_token));
    }, 300);

  } catch (err) {
    toast.error("Server unreachable. Please try again.");
    setLoginError("Server error");
  }
};

  const logout = () => {
    localStorage.clear();
    sessionStorage.clear();
    setToken(null);
    setRole(null);
  };

  /* =====================
     FORGOT PASSWORD
  ===================== */
  const sendOTP = async () => {
    const res = await fetch(`${API_BASE}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    setMessage(data.message || data.error);
  };

  const resetPassword = async () => {
    const res = await fetch(`${API_BASE}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, otp, new_password: newPassword })
    });
    const data = await res.json();
    setMessage(data.message || data.error);
  };

  /* =====================
     FETCH DATA
  ===================== */
  const fetchInstances = async () => {
  try {
    const res = await fetch(`${API_BASE}/instances`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 401) {
      logout();
      return;
    }

    const data = await res.json();

    // ✅ ensure instances is always an array
    setInstances(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("FETCH INSTANCES ERROR:", err);

    // ✅ prevent UI crash
    setInstances([]);
  }
};

const fetchCPUHistory = async (instanceId) => {
  const res = await fetch(
    `${API_BASE}/instances/${instanceId}/cpu-history`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  setCpuData(Array.isArray(data) ? data : []);
};

const fetchCostHistory = async (instanceId) => {
  const res = await fetch(
    `${API_BASE}/instances/${instanceId}/cost-history`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  setCostData(Array.isArray(data) ? data : []);
};

  const fetchUsers = async () => {
  if (role !== "admin") {
    setUsers([]);           // ✅ ensure array
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 401) {
      logout();
      return;
    }

    if (!res.ok) {
      console.warn("Fetch users failed:", res.status);
      setUsers([]);         // ✅ always array
      return;
    }

    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);  // ✅ GUARANTEE
  } catch (err) {
    console.error("Fetch users error:", err);
    setUsers([]);           // ✅ GUARANTEE
  }
};

  const fetchAuditLogs = async () => {
  if (role !== "admin") {
    setAuditLogs([]);
    return;
  }

  let url = `${API_BASE}/audit-logs?page=${page}&limit=${limit}`;

  if (fromDate && toDate) {
    url += `?from=${fromDate}&to=${toDate}`;
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      logout(); // 🔥 FIX HERE
      return;
    }

    const data = await res.json();

if (data?.data) {
  setAuditLogs(data.data);
  setTotalLogs(data.total);
}

  } catch (err) {
    console.warn("Audit logs fetch failed:", err);
    setAuditLogs([]);
  }
};

const clearAuditLogs = async () => {
  try {
    const res = await fetch(`${API_BASE}/audit-logs/clear`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ days: 0 })
    });

    if (!res.ok) throw new Error("Failed to clear logs");

    setShowClearLogsModal(false);
    await fetchAuditLogs();
  } catch (err) {
    alert(err.message || "Error clearing logs");
  }
};

const exportCSV = async () => {
  try {
    let url = `${API_BASE}/audit-logs/export`;

    // include date filters if selected
    if (fromDate && toDate) {
      url += `?from=${fromDate}&to=${toDate}`;
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      alert("CSV export failed");
      return;
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "audit_logs.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    console.error("EXPORT CSV ERROR:", err);
    alert("Unable to export CSV");
  }
};

const exportPDF = async () => {
  try {
    let url = `${API_BASE}/audit-logs/export-pdf`;

    if (fromDate && toDate) {
      url += `?from=${fromDate}&to=${toDate}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      alert("PDF export failed");
      return;
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "audit_logs.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    console.error("EXPORT PDF ERROR:", err);
    alert("Unable to export PDF");
  }
};


const clearFilters = () => {
  setFromDate("");
  setToDate("");

  // fetch logs AFTER state clears
  setTimeout(() => {
    fetchAuditLogs();
  }, 0);
};

  /* =====================
     AUTO REFRESH
  ===================== */
  useEffect(() => {
  if (!token) return;

  setLoading(true);
  Promise.allSettled([
  fetchInstances(),
  fetchUsers(),
  fetchAuditLogs(),]).finally(() => setLoading(false));

  const interval = setInterval(fetchInstances, 10000);
  return () => clearInterval(interval);
}, [token, page, limit]); // ✅ keep only token here

  /* =====================
     ADMIN ACTIONS
  ===================== */
  const createUser = async () => {
  // 🔐 ROLE HARDENING
  if (role !== "admin") {
    toast.error("Unauthorized action");
    return;
  }

  await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: newUser,
      password: newPass,
      role: newRole
    })
  });

  setNewUser("");
  setNewPass("");
  fetchUsers();
  toast.success("User created successfully");
};

  const toggleUser = async (u) => {
  // 🔐 ROLE HARDENING
  if (role !== "admin") {
    toast.error("Unauthorized action");
    return;
  }

  await fetch(`${API_BASE}/users/${u}/toggle`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  fetchUsers();
};

  const deleteUser = async (u) => {
  // 🔐 ROLE HARDENING
  if (role !== "admin") {
    toast.error("Unauthorized action");
    return;
  }

  await fetch(`${API_BASE}/users/${u}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });

  setDeleteUserConfirm(null);
  fetchUsers();
};

  const handleInstanceAction = async (id, state) => {
  try {
    if (role !== "admin") {
      alert("Only admin can start/stop instances");
      return;
    }

    const url =
      state === "running"
        ? `${API_BASE}/stop/${id}`
        : `${API_BASE}/start/${id}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // ✅ Safely handle backend errors
    if (!res.ok) {
      let errorMsg = "Action failed";
      try {
        const errData = await res.json();
        errorMsg = errData?.error || errorMsg;
      } catch (_) {
        // ignore JSON parse errors
      }
      throw new Error(errorMsg);
    }

    // ✅ ALWAYS refresh UI
    await fetchInstances();
    await fetchAuditLogs();

  } catch (err) {
    console.error("INSTANCE ACTION ERROR:", err);

    // ✅ Ignore browser/network false alarms
    if (
      err.message === "Failed to fetch" ||
      err.message.includes("NetworkError")
    ) {
      console.warn("Ignored transient network error");
      return;
    }

    toast.error(err.message || "Instance action failed");
  }
};

const getInstanceAlert = (instance) => {
  if (instance.State !== "running") {
    return { level: "ok", text: "Stopped (no cost)" };
  }

  if (instance.AvgCPUUtilization > 80) {
    return { level: "danger", text: "High CPU usage" };
  }

  if (instance.AvgCPUUtilization < 5) {
    return { level: "warning", text: "Idle – wasting cost" };
  }

  return { level: "ok", text: "Normal usage" };
};

  /* =====================
     LOGIN UI
  ===================== */
  if (!token) {
  return (
    <>
      {ToastRoot}

      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">

      {/* ================= LEFT BRAND SECTION ================= */}
      <div className="hidden lg:flex flex-col justify-center px-16 bg-gradient-to-br from-indigo-700 via-blue-600 to-indigo-800 text-white relative overflow-hidden">

        <div className="absolute inset-0 opacity-20 animate-pulse bg-gradient-to-r from-blue-400 to-indigo-500" />

        <h1 className="text-4xl font-extrabold mb-4 relative z-10">
          ☁️ Cloud Cost Optimizer
        </h1>

        <p className="text-lg text-blue-100 mb-8 relative z-10 max-w-md">
          A smart platform to monitor, analyze, and reduce cloud infrastructure
          costs in real time.
        </p>

        <ul className="space-y-4 text-blue-100 relative z-10">
          <li>✔ Real-time cloud cost monitoring</li>
          <li>✔ Idle resource detection & savings</li>
          <li>✔ Secure role-based access</li>
          <li>✔ Complete audit & activity logs</li>
        </ul>

        <p className="mt-10 text-sm text-blue-200 relative z-10">
          Designed as a production-ready DevOps & Cloud project
        </p>
      </div>

      {/* ================= RIGHT LOGIN SECTION ================= */}
      <div className="flex items-center justify-center bg-gray-50 px-4">

        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 animate-fadeIn">

          <h2 className="text-2xl font-bold text-gray-800 text-center mb-1">
            Welcome Back 👋
          </h2>

          <p className="text-sm text-gray-500 text-center mb-6">
            Login to manage and optimize cloud resources
          </p>

          {!forgotMode ? (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  login();
                }}
                className="space-y-4"
              >
                {/* Username */}
                <div className="relative">
                  <input
                    className="w-full border rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 transition"
                    placeholder="Username"
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <span className="absolute left-3 top-2.5 text-gray-400">
                    👤
                  </span>
                </div>

                {/* Password */}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full border rounded-lg pl-10 pr-14 py-2 focus:ring-2 focus:ring-blue-500 transition"
                    placeholder="Password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <span className="absolute left-3 top-2.5 text-gray-400">
                    🔒
                  </span>
                  <span
                    className="absolute right-4 top-2.5 text-blue-600 text-sm cursor-pointer"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    Remember me
                  </label>
                </div>

                {loginError && (
                  <p className="text-red-500 text-sm">{loginError}</p>
                )}

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition transform hover:scale-[1.02]"
                >
                  Login
                </button>
              </form>

              <p
                className="text-center text-blue-600 mt-4 cursor-pointer text-sm hover:underline"
                onClick={() => setForgotMode(true)}
              >
                Forgot password?
              </p>
{/* FOOTER */}
<div className="mt-6 text-center text-xs text-gray-400 relative z-50">
  <p>Built for real-world cloud cost optimization</p>

  <div className="flex justify-center gap-6 mt-3">
    {/* GitHub */}
    <a
      href="https://github.com/Useramruth"
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-500 hover:text-black transition transform hover:scale-110 cursor-pointer"
    >
      <Github size={20} />
    </a>

    {/* LinkedIn */}
    <a
      href="https://linkedin.com/in/jakkani-amruth/"
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-500 hover:text-blue-600 transition transform hover:scale-110 cursor-pointer"
    >
      <Linkedin size={20} />
    </a>

    {/* AWS / Cloud */}
    <a
      href="https://aws.amazon.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-500 hover:text-orange-500 transition transform hover:scale-110 cursor-pointer"
      title="AWS Cloud Project"
    >
      <Cloud size={20} />
    </a>
  </div>
</div>

            </>
          ) : (
            <>
              {/* FORGOT PASSWORD FLOW (UNCHANGED LOGIC) */}
              <input
                className="w-full border rounded-lg px-4 py-2 mb-3"
                placeholder="Username"
                onChange={(e) => setUsername(e.target.value)}
              />

              <button
                onClick={sendOTP}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg mb-3"
              >
                Send OTP
              </button>

              <input
                className="w-full border rounded-lg px-4 py-2 mb-3"
                placeholder="OTP"
                onChange={(e) => setOtp(e.target.value)}
              />

              <input
                className="w-full border rounded-lg px-4 py-2 mb-3"
                placeholder="New Password"
                onChange={(e) => setNewPassword(e.target.value)}
              />

              <button
                onClick={resetPassword}
                className="w-full bg-green-600 text-white py-2 rounded-lg"
              >
                Reset Password
              </button>

              {message && (
                <>
                  <p className="text-center text-sm mt-3">{message}</p>
                  <button
                    onClick={goBackToLogin}
                    className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg"
                  >
                    ← Back to Login
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

  /* =====================
   DASHBOARD
===================== */
return (
  <>
    {ToastRoot}

    <div
      id="dashboard"
      className="p-4 sm:p-6 min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
    >

  {/* HEADER */}
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">

    {/* TITLE */}
    <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
      ☁️ Cloud Cost Optimizer ({role})
    </h1>

    {/* RIGHT SIDE ACTIONS */}
    <div className="flex items-center gap-3 w-full sm:w-auto">

      {/* THEME TOGGLE */}
      <button
        onClick={toggleTheme}
        className="
          px-4 py-2 rounded-md text-sm font-medium
          bg-gray-200 dark:bg-gray-700
          text-gray-800 dark:text-gray-200
          hover:bg-gray-300 dark:hover:bg-gray-600
          transition
        "
      >
        {theme === "light" ? "🌙 Dark" : "☀️ Light"}
      </button>

      {/* LOGOUT */}
      <button
        onClick={logout}
        className="
          px-4 py-2 rounded-md text-sm font-medium
          bg-gray-700 hover:bg-gray-800
          text-white
          transition
        "
      >
        Logout
      </button>

    </div>
  </div>

{/* SUMMARY CARDS — OUTSIDE HEADER */}
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <div className="bg-white dark:bg-gray-800 p-4 rounded shadow text-gray-900 dark:text-gray-100">
    <p className="text-gray-500 text-sm">Monthly Cost</p>
    <p className="text-2xl font-bold">${totalMonthlyCost.toFixed(2)}</p>
  </div>

  <div className="bg-white dark:bg-gray-800 p-4 rounded shadow text-gray-900 dark:text-gray-100">
    <p className="text-gray-500 text-sm">Potential Savings</p>
    <p className="text-2xl font-bold text-green-600">
      ${totalSavings.toFixed(2)}
    </p>
  </div>

  <div className="bg-white dark:bg-gray-800 p-4 rounded shadow text-gray-900 dark:text-gray-100">
    <p className="text-gray-500 text-sm">Running Instances</p>
    <p className="text-2xl font-bold text-blue-600">{runningCount}</p>
  </div>

  <div className="bg-white dark:bg-gray-800 p-4 rounded shadow text-gray-900 dark:text-gray-100">
    <p className="text-gray-500 text-sm">Stopped Instances</p>
    <p className="text-2xl font-bold text-red-600">{stoppedCount}</p>
  </div>
</div>


    {/* =====================
        USER MANAGEMENT (ADMIN ONLY)
    ===================== */}
    {role === "admin" && (
      <div className="bg-white dark:bg-gray-800 rounded shadow p-4 text-gray-900 dark:text-gray-100">
        <h2 className="text-xl font-bold mb-3">👤 User Management</h2>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            className="border p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-300 border-gray-300 dark:border-gray-600"
            placeholder="Username"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
         />
          <input
            className="border p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-300 border-gray-300 dark:border-gray-600"
            placeholder="Password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
          />

          <select
            className="border p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          >
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={createUser}
            className="bg-green-600 text-white px-4 rounded"
          >
            Add
          </button>
        </div>
      <div className="relative overflow-x-auto">
          <table className="w-full border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
          <thead className="bg-gray-200 dark:bg-gray-700">
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={i} className="border-t text-center border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{u.active ? "✅" : "❌"}</td>
              <td>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <button
                    onClick={() => toggleUser(u.username)}
                    className="bg-yellow-500 text-white px-2 mr-2 rounded"
                  >
                    Toggle
                  </button>
                  <button
                    onClick={() => setDeleteUserConfirm(u.username)}
                    className="bg-red-600 text-white px-2 rounded"
                  >
                    Delete
                  </button>
                </div>
              </td>
              </tr>
            ))}
          </tbody>
          </table>
      </div>
      </div>
    )}

    {/* =====================
        INSTANCE TABLE
    ===================== */}
    <div id="instances" className="bg-white dark:bg-gray-800 rounded shadow p-4 text-gray-900 dark:text-gray-100 overflow-x-auto">
      <table className="min-w-[900px] w-full border">
        <thead className="bg-gray-200 dark:bg-gray-700">
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>State</th>
            <th>CPU %</th>
            <th>Monthly $</th>
            <th>Savings $</th>
            <th>Recommendation</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(instances) && instances.map((i, idx) => (
            <tr key={idx} className="border-t text-center border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
              <td>{i.InstanceId}</td>
              <td>{i.InstanceType}</td>
              <td>{i.State}</td>
              <td>{i.AvgCPUUtilization}</td>
              <td>${i.EstimatedMonthlyCostUSD}</td>
              <td className="text-green-600 font-semibold">
               ${i.State === "stopped" ? i.EstimatedMonthlyCostUSD : 0}</td>
              <td className="text-sm">
  {(() => {
    const alert = getInstanceAlert(i);

    return (
      <div className="flex flex-col items-center gap-1">
        {/* Badge */}
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            alert.level === "danger"
              ? "bg-red-100 text-red-700"
              : alert.level === "warning"
              ? "bg-yellow-100 text-yellow-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {alert.level === "danger"
            ? "ALERT"
            : alert.level === "warning"
            ? "WARNING"
            : "OK"}
        </span>

        {/* Text */}
        <span className="text-gray-600">{alert.text}</span>
      </div>
    );
  })()}
</td>

              {/* ✅ FIXED ROLE-BASED ACTION */}
              <td>
                {role === "admin" ? (
                  <button
  onClick={() => {
    handleInstanceAction(i.InstanceId, i.State);   // 🔥 THIS WAS MISSING
    setSelectedInstance(i.InstanceId);
    fetchCPUHistory(i.InstanceId);
    fetchCostHistory(i.InstanceId);
  }}
  className={`px-3 py-1 text-white rounded ${
    i.State === "running" ? "bg-red-500" : "bg-green-500"
  }`}
>
  {i.State === "running" ? "STOP" : "START"}
</button>

                ) : (
                  <span className="text-gray-400 text-sm">View only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {selectedInstance && (
  <div className="bg-white dark:bg-gray-800 rounded shadow p-4 text-gray-900 dark:text-gray-100">
    <h2 className="text-xl font-bold mb-4">
      📈 Instance Analytics ({selectedInstance})
    </h2>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* CPU Chart */}
      <div>
        <h3 className="font-semibold mb-2">CPU Usage (Last 24h)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={cpuData}>
            <XAxis dataKey="time" hide />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="cpu"
              stroke="#2563eb"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cost Chart */}
      <div>
        <h3 className="font-semibold mb-2">Daily Cost (Last 7 days)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={costData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="cost" fill="#16a34a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
)}

    {role === "admin" && (
  <div id="audit-logs" className="bg-white dark:bg-gray-800 rounded shadow p-4 text-gray-900 dark:text-gray-100">
    <h2 className="text-xl font-bold mb-3">📊 Audit Logs</h2>
    <div className="flex flex-col sm:flex-row gap-3 mb-4 items-end">
  <div>
    <label className="text-sm block">From</label>
    <input
      type="date"
      className="border p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
      value={fromDate}
      onChange={(e) => setFromDate(e.target.value)}
    />
  </div>

  <div>
    <label className="text-sm block">To</label>
    <input
      type="date"
      className="border p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
      value={toDate}
      onChange={(e) => setToDate(e.target.value)}
    />
  </div>

  <button
    onClick={fetchAuditLogs}
    className="bg-blue-600 text-white px-4 py-2 rounded"
  >
    Apply Filter
  </button>

  <button
  onClick={clearFilters}
  className="px-4 py-2 rounded bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-100">
  Clear
</button>

<button
  onClick={exportCSV}
  className="bg-green-600 text-white px-4 py-2 rounded"
>
  Export CSV
</button>

<button
  onClick={exportPDF}
  className="bg-red-600 text-white px-4 py-2 rounded"
>
  Export PDF
</button>

<button
  onClick={() => setShowClearLogsModal(true)}
  className="bg-red-600 text-white px-4 py-2 rounded"
>
  Clear Logs
</button>

</div>

    <div className="relative overflow-x-auto">
      <table className="w-full border text-sm text-gray-900 dark:text-gray-100">
      <thead className="bg-gray-200 dark:bg-gray-700">
        <tr>
          <th>User</th>
          <th>Action</th>
          <th>Resource</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {auditLogs.map((log, i) => (
  <tr key={i} className="border-t text-center">
  <td>{log.username}</td>

  <td className="font-semibold">
    {log.action}
  </td>
  <td>{log.resource}</td>
  <td>{log.created_at}</td>
</tr>
))}
      </tbody>
    </table>
    </div>
    
    <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mt-4">
  <button
    disabled={page === 1}
    onClick={() => setPage(p => Math.max(1, p - 1))}
    className="px-4 py-1 rounded bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-100">
    Prev
  </button>

  <span className="px-2 py-1">
    Page {page}
  </span>

  <button
    disabled={page * limit >= totalLogs}
    onClick={() => setPage(p => p + 1)}
    className="px-4 py-1 rounded bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-100">
    Next
  </button>
</div>

  </div>
)}

{deleteUserConfirm && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
   <div className="bg-white text-gray-800 rounded-lg p-6 w-80 shadow-xl transform transition-all scale-95 animate-fade-in">
      <h3 className="text-lg font-bold text-gray-900 mb-3 text-center">
  Confirm Delete
</h3>

<p className="text-sm text-gray-600 text-center mb-5">
  Are you sure you want to delete this user?
</p>

      <div className="flex justify-between mt-4">
  <button
    onClick={() => setDeleteUserConfirm(null)}
    className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition"
  >
    Cancel
  </button>

  <button
    onClick={() => deleteUser(deleteUserConfirm)}
    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
  >
    Delete
  </button>
</div>
    </div>
  </div>
)}

{showClearLogsModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white text-gray-800 rounded-lg p-6 w-80 shadow-xl transform transition-all scale-95 animate-fade-in">
      <h3 className="text-lg font-bold mb-3">Clear Audit Logs</h3>
      <p className="text-gray-600 mb-6">
        Are you sure you want to permanently delete all audit logs?
      </p>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => setShowClearLogsModal(false)}
          className="px-4 py-2 bg-gray-300 rounded"
        >
          Cancel
        </button>

        <button
          onClick={clearAuditLogs}
          className="px-4 py-2 bg-red-600 text-white rounded"
        >
          Yes, Clear
        </button>
      </div>
    </div>
  </div>
)}

{/* =====================
    PROFESSIONAL FOOTER
===================== */}
<div className="bg-gray-900 text-gray-300 mt-10 rounded p-8">

  {/* TOP SECTION */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

    {/* ABOUT */}
    <div>
      <h3 className="text-white font-semibold mb-2">
        Cloud Cost Optimizer
      </h3>
      <p className="text-sm">
        A real-world cloud cost monitoring and optimization platform designed to
        track infrastructure usage, reduce unnecessary spending, and provide
        actionable insights with audit transparency.
      </p>
    </div>

    {/* QUICK LINKS */}
    {role === "admin" && (
<div>
  <h4 className="text-white font-semibold mb-2">Quick Links</h4>
  <ul className="space-y-1 text-sm">
    <li
      onClick={() =>
        document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" })
      }
      className="hover:text-white cursor-pointer"
    >
      Dashboard
    </li>

    <li
      onClick={() =>
        document.getElementById("instances")?.scrollIntoView({ behavior: "smooth" })
      }
      className="hover:text-white cursor-pointer"
    >
      Instances
    </li>

    <li
      onClick={() =>
        document.getElementById("audit-logs")?.scrollIntoView({ behavior: "smooth" })
      }
      className="hover:text-white cursor-pointer"
    >
      Audit Logs
    </li>
  </ul>
</div>
)}

    {/* SOCIAL */}
<div className="relative z-50">
  <h4 className="text-white font-semibold mb-2">Connect</h4>

  <div className="flex gap-4 text-xl">
    {/* GitHub */}
    <a
      href="https://github.com/Useramruth"
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-white transition cursor-pointer"
      title="GitHub"
    >
      <i className="fab fa-github"></i>
    </a>

    {/* LinkedIn */}
    <a
      href="https://linkedin.com/in/jakkani-amruth/"
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-white transition cursor-pointer"
      title="LinkedIn"
    >
      <i className="fab fa-linkedin"></i>
    </a>

    {/* AWS */}
    <a
      href="https://aws.amazon.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-orange-400 transition cursor-pointer"
      title="AWS"
    >
      <i className="fab fa-aws"></i>
    </a>
  </div>
</div>
  </div>

  {/* COMMENTS SECTION */}
  <div className="mt-8 border-t border-gray-700 pt-6">

    <h4 className="text-white font-semibold mb-3">
      Viewer Feedback
    </h4>

    {/* VIEWER COMMENT BOX */}
    {role === "viewer" && (
      <>
        <textarea
          className="w-full p-2 rounded text-black"
          rows="3"
          placeholder="Share your feedback..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
        />
        <button
          onClick={submitComment}
          className="mt-2 bg-blue-600 text-white px-4 py-2 rounded"
        >
          Submit
        </button>
      </>
    )}

    {/* ADMIN CLEAR ALL COMMENTS */}
    {role === "admin" && comments.length > 0 && (
      <button
  onClick={clearAllComments}
  className="mb-3 bg-red-600 text-white px-3 py-1 rounded"
>
  Clear All Comments
</button>

    )}

    <div className="space-y-4 mt-4">
  {Array.isArray(comments) && comments.map((c, i) => (
    <div key={i} className="bg-gray-800 p-4 rounded-lg">

      <p className="text-sm font-semibold text-gray-300">
        {c.username} ({c.author})
      </p>

      <p className="text-white mt-1">
        {c.message}
      </p>

      <p className="text-xs text-gray-400 mt-1">
        {c.time}
      </p>

      {role === "admin" && (
        <button
          onClick={() => likeComment(i)}
          className="mt-2 text-red-400 text-sm flex items-center gap-1"
        >
          ❤️ {c.likes}
        </button>
      )}

      {/* THREAD REPLIES */}
      {Array.isArray(c.replies) && (
        <div className="mt-3 space-y-2 pl-4 border-l border-gray-600">
          {c.replies.map((r, idx) => (
            <div key={idx} className="text-sm">
              <p className={r.role === "admin" ? "text-green-400" : "text-blue-300"}>
                {r.role === "admin" ? "Admin" : "Viewer"} ({r.author})
              </p>
              <p className="text-gray-200">{r.message}</p>
              <p className="text-xs text-gray-500">{r.time}</p>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setActiveReplyIndex(i)}
        className="mt-3 text-blue-400 text-sm"
      >
        Reply
      </button>

      {activeReplyIndex === i && (
        <>
          <textarea
            className="w-full mt-2 p-2 rounded text-black"
            rows="2"
            placeholder="Write reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
          />
          <button
            onClick={() => submitThreadReply(i)}
            className="mt-2 bg-blue-600 text-white px-3 py-1 rounded"
          >
            Send
          </button>
        </>
      )}
    </div>
  ))}
</div>
  </div>

  <p className="text-center text-xs text-gray-500 mt-6">
           Built for real-world cloud cost optimization <br></br>Copyright © 2025-2026 Amruth. All rights reserved.
  </p>
</div>
{/* =====================
   CLEAR COMMENTS MODAL
===================== */}
{showClearModal && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-gray-900 text-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fadeIn">

      <h3 className="text-xl font-semibold mb-2 text-center text-red-400">
        ⚠️ Clear All Viewer Comments
      </h3>

      <p className="text-sm text-gray-300 text-center mb-6">
        This action will permanently delete all viewer feedback.
        <br />This cannot be undone.
      </p>

      <div className="flex justify-center gap-4">
        <button
          onClick={() => setShowClearModal(false)}
          className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 transition"
        >
          Cancel
        </button>

        <button
          onClick={confirmClearComments}
          className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 transition font-semibold"
        >
          Yes, Delete
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  </>
);
}

export default App;