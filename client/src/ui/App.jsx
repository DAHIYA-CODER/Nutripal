import { useEffect, useMemo, useState, createContext, useContext } from "react";
import dayjs from "dayjs";

// Use CRA proxy in development (empty base), and REACT_APP_API_URL in production
const API =
  process.env.NODE_ENV === "development"
    ? ""
    : process.env.REACT_APP_API_URL || "";

// Authentication Context
const AuthContext = createContext();

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      // Verify token and get user info
      fetch(API + "/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((userData) => {
          setUser(userData);
          setLoading(false);
        })
        .catch(() => {
          localStorage.removeItem("token");
          setToken(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email, password) => {
    const response = await fetch(API + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } else {
      const error = await response.json();
      return { success: false, message: error.message };
    }
  };

  const register = async (username, email, password) => {
    const response = await fetch(API + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } else {
      const error = await response.json();
      return { success: false, message: error.message };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  const getAuthHeaders = () => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, register, logout, getAuthHeaders, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={"bg-white rounded-2xl shadow-sm p-5 " + className}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="text-xl font-semibold text-emerald-900">{children}</h2>;
}

function Button({ children, ...props }) {
  return (
    <button
      {...props}
      className={
        "px-4 py-2 rounded-xl shadow-sm bg-emerald-500 hover:bg-emerald-600 text-white transition " +
        (props.className || "")
      }
    >
      {children}
    </button>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="block">
      <div className="text-sm text-emerald-900 mb-1">{label}</div>
      <input
        {...props}
        className="w-full px-3 py-2 rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-emerald-50/50"
      />
    </label>
  );
}

function ProgressWater({ pct = 0, calories = 0, goal = 2000 }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="progress-wrap" style={{ "--pct": clamped }}>
        <div className="progress-ring" style={{ "--pct": clamped }} />
        <div className="progress-water" style={{ "--pct": clamped }}>
          <div className="wave" />
          <div className="wave" />
          <div className="wave" />
        </div>
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold text-emerald-800">
          {calories} / {goal} kcal
        </div>
        <div className="text-emerald-700">Calories completed</div>
      </div>
    </div>
  );
}

function MacroBar({ label, value = 0, max = 100 }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-emerald-900">{label}</div>
      <div className="flex-1 h-3 bg-emerald-100 rounded-full overflow-hidden">
        <div className="h-3 bg-emerald-400" style={{ width: pct + "%" }} />
      </div>
      <div className="w-16 text-right text-emerald-900">
        {Math.round(value)}g
      </div>
    </div>
  );
}

function useProfile() {
  const { getAuthHeaders } = useAuth();
  const [profile, setProfile] = useState(null);
  const [meta, setMeta] = useState(null);
  const refresh = async () => {
    const r = await fetch(API + "/api/profile", {
      headers: getAuthHeaders(),
    });
    const data = await r.json();
    setProfile(data);
    if (data) {
      const resp = await fetch(
        API + "/api/summary/" + dayjs().format("YYYY-MM-DD"),
        {
          headers: getAuthHeaders(),
        }
      );
      const d = await resp.json();
      setMeta(d);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  return { profile, meta, refresh, setProfile };
}

function LoginForm({ onSwitchToRegister }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await login(email, password);
    if (!result.success) {
      setError(result.message);
    }
    setLoading(false);
  };

  return (
    <Card className="max-w-md mx-auto">
      <h1 className="text-3xl font-bold text-emerald-900 mb-2">Welcome Back</h1>
      <p className="text-emerald-800/80 mb-6">
        Sign in to your NutriPal account
      </p>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      <p className="text-center mt-4 text-emerald-700">
        Don't have an account?{" "}
        <button
          onClick={onSwitchToRegister}
          className="text-emerald-600 hover:text-emerald-800 font-medium"
        >
          Sign up
        </button>
      </p>
    </Card>
  );
}

function RegisterForm({ onSwitchToLogin }) {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await register(username, email, password);
    if (!result.success) {
      setError(result.message);
    }
    setLoading(false);
  };

  return (
    <Card className="max-w-md mx-auto">
      <h1 className="text-3xl font-bold text-emerald-900 mb-2">
        Join NutriPal
      </h1>
      <p className="text-emerald-800/80 mb-6">
        Create your account to start tracking
      </p>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Creating account..." : "Sign Up"}
        </Button>
      </form>

      <p className="text-center mt-4 text-emerald-700">
        Already have an account?{" "}
        <button
          onClick={onSwitchToLogin}
          className="text-emerald-600 hover:text-emerald-800 font-medium"
        >
          Sign in
        </button>
      </p>
    </Card>
  );
}

function Setup({ onDone }) {
  const { getAuthHeaders } = useAuth();
  const [heightCm, setH] = useState("");
  const [weightKg, setW] = useState("");
  const [targetWeightKg, setT] = useState("");
  const [age, setAge] = useState("25");
  const [sex, setSex] = useState("male");
  const [activity, setAct] = useState("sedentary");

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      heightCm: +heightCm,
      weightKg: +weightKg,
      targetWeightKg: targetWeightKg ? +targetWeightKg : undefined,
      age: +age,
      sex,
      activityLevel: activity,
    };
    const r = await fetch(API + "/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
    if (r.ok) onDone();
  };

  return (
    <Card className="max-w-xl mx-auto">
      <h1 className="text-3xl font-bold text-emerald-900 mb-2">
        Welcome to Nutripal
      </h1>
      <p className="text-emerald-800/80 mb-6">
        Start by entering your details. We’ll compute your BMI and daily calorie
        goal.
      </p>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Height (cm)"
          type="number"
          step="0.1"
          value={heightCm}
          onChange={(e) => setH(e.target.value)}
          required
        />
        <Input
          label="Weight (kg)"
          type="number"
          step="0.1"
          value={weightKg}
          onChange={(e) => setW(e.target.value)}
          required
        />
        <Input
          label="Target Weight (kg)"
          type="number"
          step="0.1"
          value={targetWeightKg}
          onChange={(e) => setT(e.target.value)}
        />
        <Input
          label="Age"
          type="number"
          value={age}
          onChange={(e) => setAge(e.target.value)}
        />
        <label className="block">
          <div className="text-sm text-emerald-900 mb-1">Sex</div>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/50"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label className="block">
          <div className="text-sm text-emerald-900 mb-1">Activity Level</div>
          <select
            value={activity}
            onChange={(e) => setAct(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/50"
          >
            <option value="sedentary">Sedentary</option>
            <option value="light">Light</option>
            <option value="moderate">Moderate</option>
            <option value="active">Active</option>
            <option value="very_active">Very Active</option>
          </select>
        </label>
        <div className="md:col-span-2 flex justify-end">
          <Button type="submit">Save & Continue</Button>
        </div>
      </form>
    </Card>
  );
}

function FoodAdder({ onAdd, foods }) {
  const [query, setQ] = useState("");
  const [qty, setQty] = useState(1);
  const [selectedFood, setSelectedFood] = useState(null);
  const [searchResults, setSearchResults] = useState([]);

  // Search using the API instead of local foods
  useEffect(() => {
    const searchFoods = async () => {
      if (!query.trim()) {
        setSearchResults(foods.slice(0, 3));
        return;
      }

      try {
        const response = await fetch(
          `${API}/api/foods/search?query=${encodeURIComponent(query)}`
        );
        const results = await response.json();
        setSearchResults(results.slice(0, 3));
      } catch (error) {
        console.error("Error searching foods:", error);
        setSearchResults([]);
      }
    };

    const timeoutId = setTimeout(searchFoods, 300); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [query, foods]);

  const localMatches = searchResults;

  const handleAddFood = async () => {
    if (!selectedFood || qty <= 0) return;

    // Local food
    await onAdd(selectedFood.name, qty);

    setSelectedFood(null);
    setQ("");
  };

  return (
    <Card>
      <SectionTitle>Add Food</SectionTitle>
      <div className="mt-3 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <Input
            label="Search food"
            value={query}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g., apple, chicken breast"
          />
          <Input
            label="Quantity"
            type="number"
            min="0.1"
            step="0.1"
            value={qty}
            onChange={(e) => setQty(+e.target.value)}
          />
        </div>

        {selectedFood && (
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-medium text-emerald-900">
                  {selectedFood.name}
                </h4>
                <p className="text-sm text-emerald-700">
                  {selectedFood.calories}cal, {selectedFood.protein}g protein
                  per {selectedFood.serving}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddFood}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Add Food
                </Button>
                <button
                  onClick={() => setSelectedFood(null)}
                  className="px-3 py-2 text-emerald-600 hover:bg-emerald-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {localMatches.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-emerald-900 mb-2">
              Local Foods
            </h4>
            <div className="flex gap-2 flex-wrap">
              {localMatches.map((m) => (
                <button
                  key={m._id || m.fdcId}
                  onClick={() => setSelectedFood(m)}
                  className="px-3 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 text-sm"
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function MealFromText({ onAfterAdd }) {
  const { getAuthHeaders } = useAuth();
  const [text, setText] = useState("");
  const [autoAdd, setAutoAdd] = useState(true);
  const [useAI, setUseAI] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const today = dayjs().format("YYYY-MM-DD");

  const parse = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null); // Clear previous results
    try {
      const r = await fetch(API + "/api/ai/parse-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ text, date: today, autoAdd, useAI }),
      });
      const data = await r.json();
      setResult(data);
      if (autoAdd && onAfterAdd) await onAfterAdd();
    } catch (e) {
      console.error("parse-meal error", e);
    } finally {
      setLoading(false);
    }
  };

  const addAll = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(API + "/api/ai/parse-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ text, date: today, autoAdd: true, useAI }),
      });
      const data = await r.json();
      setResult(data);
      if (onAfterAdd) await onAfterAdd();
    } catch (e) {
      console.error("add-all error", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <SectionTitle>Add from text (AI)</SectionTitle>
      <div className="mt-3 space-y-3">
        <label className="block">
          <div className="text-sm text-emerald-900 mb-1">
            Describe your meal
          </div>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g., 2 eggs and a cup of rice with broccoli"
            className="w-full px-3 py-2 rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-emerald-50/50"
            disabled={loading}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-emerald-900">
              <input
                type="checkbox"
                checked={autoAdd}
                onChange={(e) => setAutoAdd(e.target.checked)}
                disabled={loading}
              />
              Auto-add to today's log
            </label>
            <label className="flex items-center gap-2 text-emerald-900">
              <input
                type="checkbox"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                disabled={loading}
              />
              Use Gemini AI
            </label>
          </div>
          <Button onClick={parse} disabled={loading || !text.trim()}>
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing…
              </span>
            ) : autoAdd ? (
              "Parse & Add"
            ) : (
              "Parse"
            )}
          </Button>
        </div>

        {/* AI Processing Animation */}
        {loading && (
          <div className="p-6 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl">🤖</span>
                </div>
              </div>
              <div className="text-center">
                <div className="font-medium text-emerald-900 mb-1">
                  AI is analyzing your meal...
                </div>
                <div className="text-sm text-emerald-700">
                  Extracting nutrition information
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {result && !autoAdd && (
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
            <div className="font-medium text-emerald-900 mb-2">Preview</div>
            {result.items?.length ? (
              <ul className="list-disc pl-6 text-emerald-800">
                {result.items.map((it, idx) => (
                  <li key={idx}>
                    {it.name}
                    {it.grams ? ` · ~${it.grams}g` : null}
                    {it.nutrition
                      ? ` · ${Math.round(
                          it.nutrition.calories || 0
                        )} kcal, P ${Math.round(
                          it.nutrition.protein || 0
                        )}g, C ${Math.round(
                          it.nutrition.carbs || 0
                        )}g, F ${Math.round(
                          it.nutrition.fat || 0
                        )}g, Fib ${Math.round(it.nutrition.fiber || 0)}g`
                      : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-emerald-800">No foods recognized.</div>
            )}
            {result.items?.length ? (
              <div className="mt-3">
                <Button onClick={addAll}>Add all to today</Button>
              </div>
            ) : null}
          </div>
        )}

        {result && autoAdd && (
          <div className="text-emerald-800">
            Added {result.added || 0} item(s) to {result.date}.
          </div>
        )}
      </div>
    </Card>
  );
}

function Dashboard() {
  const { profile, meta, refresh } = useProfile();
  const { user, logout, getAuthHeaders } = useAuth();
  const [summary, setSummary] = useState(null);
  const today = dayjs().format("YYYY-MM-DD");

  const loadSummary = async () => {
    const r = await fetch(API + "/api/summary/" + today, {
      headers: getAuthHeaders(),
    });
    setSummary(await r.json());
  };

  const addFood = async (name, quantity) => {
    const body = { foodName: name, quantity };

    await fetch(API + "/api/logs/" + today + "/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
    await loadSummary();
  };

  const handleDeleteFood = async (itemIndex) => {
    try {
      await fetch(API + "/api/logs/" + today + "/items/" + itemIndex, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      await loadSummary();
    } catch (error) {
      console.error("Error deleting food item:", error);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  if (!profile) return <Setup onDone={refresh} />;

  const goal = summary?.goal || 2000;
  const calories = summary?.totals?.calories || 0;
  const pct = Math.round((calories / goal) * 100);

  // rough macro targets proportional to calories: P=25%, C=50%, F=25%
  const targetProtein = Math.round((goal * 0.25) / 4);
  const targetCarbs = Math.round((goal * 0.5) / 4);
  const targetFat = Math.round((goal * 0.25) / 9);
  const targetFiber = 30;

  const totals = summary?.totals || { protein: 0, carbs: 0, fat: 0, fiber: 0 };

  return (
    <div className="max-w-5xl mx-auto p-5 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-emerald-900">Nutripal</h1>
        <div className="flex items-center gap-4">
          <span className="text-emerald-700">Welcome, {user?.username}!</span>
          <Button onClick={logout} className="bg-red-500 hover:bg-red-600">
            Logout
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="flex items-center justify-center">
          <ProgressWater pct={pct} calories={calories} goal={goal} />
        </Card>
        <Card>
          <SectionTitle>Today’s macros</SectionTitle>
          <div className="mt-4 space-y-3">
            <MacroBar
              label="Protein"
              value={totals.protein}
              max={targetProtein}
            />
            <MacroBar label="Carbs" value={totals.carbs} max={targetCarbs} />
            <MacroBar label="Fat" value={totals.fat} max={targetFat} />
            <MacroBar label="Fiber" value={totals.fiber} max={targetFiber} />
          </div>
        </Card>
      </div>

      <MealFromText onAfterAdd={loadSummary} />

      <Card>
        <SectionTitle>Today’s food</SectionTitle>
        <table className="w-full mt-3 text-sm">
          <thead className="text-left text-emerald-900">
            <tr>
              <th className="py-2">Food</th>
              <th>Qty</th>
              <th>Calories</th>
              <th>Protein</th>
              <th>Carbs</th>
              <th>Fat</th>
              <th>Fiber</th>
              <th>Category</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody className="text-emerald-800/90">
            {(summary?.items || []).map((it, idx) => {
              const f = it.foodId || {};
              const q = it.quantity || 1;
              const hasAI = !!it.nutrition;
              const calories = hasAI
                ? it.nutrition.calories || 0
                : (f.calories || 0) * q;
              const protein = hasAI
                ? it.nutrition.protein || 0
                : (f.protein || 0) * q;
              const carbs = hasAI
                ? it.nutrition.carbs || 0
                : (f.carbs || 0) * q;
              const fat = hasAI ? it.nutrition.fat || 0 : (f.fat || 0) * q;
              const fiber = hasAI
                ? it.nutrition.fiber || 0
                : (f.fiber || 0) * q;
              return (
                <tr key={idx} className="border-t border-emerald-100">
                  <td className="py-2">
                    {it.name}
                    {hasAI && it.grams ? ` (${it.grams}g)` : null}
                  </td>
                  <td>{q}</td>
                  <td>{Math.round(calories)}</td>
                  <td>{Math.round(protein)}</td>
                  <td>{Math.round(carbs)}</td>
                  <td>{Math.round(fat)}</td>
                  <td>{Math.round(fiber)}</td>
                  <td>{hasAI ? "ai" : f.category || "other"}</td>
                  <td>
                    <button
                      onClick={() => handleDeleteFood(idx)}
                      className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
                      title="Delete this food item"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p className="text-center text-emerald-800/70">
        Soft mint UI • Built with React + Tailwind • Server: Express + MongoDB
      </p>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center">
        <div className="text-emerald-700 text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center">
        <div className="w-full max-w-md">
          {showRegister ? (
            <RegisterForm onSwitchToLogin={() => setShowRegister(false)} />
          ) : (
            <LoginForm onSwitchToRegister={() => setShowRegister(true)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-50">
      <Dashboard />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
