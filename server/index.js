import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import mongoose from "mongoose";
import crypto from "crypto";
import CryptoJS from "crypto-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
// Predefined foods disabled; leave import commented to avoid accidental usage
// import { searchFoods, getFoodById } from "./foodDatabase.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
// Gemini API keys: support comma-separated list for basic rotation
const GEMINI_API_KEYS = (
  process.env.GEMINI_API_KEYS ||
  process.env.GEMINI_API_KEY ||
  ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
let __geminiIdx = 0;
function getGeminiClient() {
  if (!GEMINI_API_KEYS.length) return null;
  const key = GEMINI_API_KEYS[__geminiIdx++ % GEMINI_API_KEYS.length];
  try {
    return new GoogleGenerativeAI(key);
  } catch (e) {
    console.warn("Failed to init Gemini client:", e?.message);
    return null;
  }
}

const app = express();
app.use(express.json());
app.use(morgan("dev"));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || "*" }));

const PORT = process.env.PORT || 8081;

// --- Mongo connection ---
async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nutripal";
  await mongoose.connect(uri, { dbName: "nutripal" });
  console.log("MongoDB connected");
}
connectDB().catch((err) => {
  console.error("MongoDB connection error:", err);
  process.exit(1);
});

// --- Schemas & Models ---
import { User, Profile, Food, Log } from "./models.js";

// --- Helpers ---
function getBMICategory(bmi) {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

function bmi({ heightCm, weightKg }) {
  const heightM = heightCm / 100;
  return +(weightKg / (heightM * heightM)).toFixed(1);
}

function calorieRecommendation({
  weightKg,
  heightCm,
  age,
  sex,
  activityLevel,
}) {
  // Mifflin-St Jeor Equation
  let bmr =
    sex === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  // Activity multiplier
  const activityMap = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  const multiplier = activityMap[activityLevel] || 1.2;
  return Math.round(bmr * multiplier);
}

// Mifflin St Jeor; defaults if age/sex missing are set in model
function maintenanceCalories({ weightKg, heightCm, age, sex, activityLevel }) {
  const w = weightKg,
    h = heightCm,
    a = age;
  const s = sex === "female" ? -161 : 5;
  const bmr = 10 * w + 6.25 * h - 5 * a + s;
  const factors = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  const f = factors[activityLevel] || 1.2;
  return Math.round(bmr * f);
}

function goalCalories(profile) {
  if (!profile?.targetWeightKg) return maintenanceCalories(profile);
  const diffKg = profile.targetWeightKg - profile.weightKg; // + for gain, - for loss
  // Aim to change ~0.5 kg/week. ~7700 kcal per kg.
  const weeks = Math.max(1, Math.round(Math.abs(diffKg) / 0.5));
  const dailyDelta = Math.round((diffKg * 7700) / (7 * weeks)); // + surplus, - deficit
  return Math.max(1200, maintenanceCalories(profile) + dailyDelta); // don't go below 1200
}

function getPlan(bmiCategory) {
  switch (bmiCategory) {
    case "underweight":
      return {
        diet: "High-calorie, protein-rich foods. Eat 5-6 meals/day. Add healthy fats (nuts, seeds, cheese).",
        workout:
          "Strength training 3-4x/week. Compound lifts. Avoid excessive cardio.",
      };
    case "normal":
      return {
        diet: "Balanced macros. Slight calorie surplus for muscle gain. Lean proteins, whole grains, veggies.",
        workout:
          "Bodybuilding split: train each muscle group 1-2x/week. Progressive overload.",
      };
    case "overweight":
    case "obese":
      return {
        diet: "Calorie deficit. High protein, low sugar. Lots of veggies, lean meats, whole grains.",
        workout:
          "Mix cardio (30 min/day) and resistance training. HIIT 2x/week. Stay active daily.",
      };
    default:
      return {
        diet: "Balanced diet.",
        workout: "Regular exercise.",
      };
  }
}

// NOTE: Predefined foods and rule-based parsing removed per requirement.
// We will rely on Gemini to extract items and estimate nutrition.
async function parseMealTextWithGemini(text) {
  const client = getGeminiClient();
  if (!client) return null;
  try {
    const MODEL_CANDIDATES = [
      "gemini-3.1-pro",
      "gemini-3.0-flash",
      "gemini-3.0-pro",
      "gemini-2.5-flash", // Suggested replacement for newer projects
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash",
      "gemini-1.5-pro-latest", // Added -latest suffix to fix 404
      "gemini-1.5-flash-latest",
      "gemini-1.5-pro",
    ];
    const preferred = process.env.GEMINI_MODEL && [process.env.GEMINI_MODEL];
    const modelsToTry = preferred
      ? [...preferred, ...MODEL_CANDIDATES]
      : MODEL_CANDIDATES;
    const prompt = `From the user's meal description, extract distinct foods with their approximate amounts in grams and total nutrition for that amount.
Return ONLY a JSON array. No code fences, no commentary.
Each item must be an object with these exact fields:
{"name": string, "grams": number, "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number}
Guidelines:
- Convert phrases like "half kg" => 500 grams; "two naan" => typical grams per naan (~120g each) times count.
- Nutrition values are totals for the described grams, not per 100g.
- If fiber is negligible for an item, set 0.
- Round numbers reasonably (grams to nearest 5-10g, macros to nearest 0.5g, calories to nearest 5-10 kcal).
Text: ${text}`;
    let lastErr = null;
    for (const name of modelsToTry) {
      try {
        const model = client.getGenerativeModel({ model: name });
        const resp = await model.generateContent(prompt);
        const raw = resp?.response?.text?.() || "[]";
        const jsonStart = raw.indexOf("[");
        const jsonEnd = raw.lastIndexOf("]");
        const body = jsonStart >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw;
        const parsed = JSON.parse(body);
        const items = [];
        for (const it of parsed) {
          const nm = (it?.name || "").toString().trim();
          if (!nm) continue;
          const grams = Number(it?.grams) || 0;
          const calories = Number(it?.calories) || 0;
          const protein = Number(it?.protein) || 0;
          const carbs = Number(it?.carbs) || 0;
          const fat = Number(it?.fat) || 0;
          const fiber = Number(it?.fiber) || 0;
          if (grams <= 0) continue;
          items.push({ name: nm, grams, calories, protein, carbs, fat, fiber });
        }
        if (items.length) return items;
      } catch (e) {
        if (e.message && e.message.includes("API key not valid")) {
          throw new Error("API_KEY_INVALID");
        }
        lastErr = e;
        continue;
      }
    }
    console.warn(
      "Gemini parse failed across models",
      modelsToTry,
      lastErr?.message
    );
    return null;
  } catch (e) {
    if (e.message === "API_KEY_INVALID") {
      throw e; // Propagate it up
    }
    console.warn("Gemini parse failed, falling back:", e?.message);
    return null;
  }
}

// New API endpoint for BMI and plan
app.post("/api/bmi-plan", (req, res) => {
  const { heightCm, weightKg, age, sex, activityLevel } = req.body;
  if (!heightCm || !weightKg || !age || !sex || !activityLevel) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  const bmiValue = bmi({ heightCm, weightKg });
  const bmiCategory = getBMICategory(bmiValue);
  const calories = calorieRecommendation({
    weightKg,
    heightCm,
    age,
    sex,
    activityLevel,
  });
  const plan = getPlan(bmiCategory);

  res.json({
    bmi: bmiValue,
    bmiCategory,
    calories,
    plan,
  });
});

// --- Authentication Middleware ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
}

app.get("/", (req, res) => {
  res.redirect("/api/health");
});

// --- Authentication Routes ---
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ message: "Username, email, and password are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with this email or username already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  // Since we're using JWT tokens, logout is handled client-side by removing the token
  res.json({ message: "Logout successful" });
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// --- Routes ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Profile
app.get("/api/profile", authenticateToken, async (req, res) => {
  const p = await Profile.findOne({ userId: req.user.userId }).lean();
  res.json(p || null);
});

app.post("/api/profile", authenticateToken, async (req, res) => {
  const { heightCm, weightKg, targetWeightKg, age, sex, activityLevel } =
    req.body;
  if (!heightCm || !weightKg)
    return res.status(400).json({ message: "heightCm & weightKg required" });
  await Profile.deleteMany({ userId: req.user.userId });
  const p = await Profile.create({
    userId: req.user.userId,
    heightCm,
    weightKg,
    targetWeightKg,
    age,
    sex,
    activityLevel,
  });
  res.json({
    profile: p,
    bmi: bmi(p),
    maintenance: maintenanceCalories(p),
    goalCalories: goalCalories(p),
  });
});

app.put("/api/profile", authenticateToken, async (req, res) => {
  const p = await Profile.findOne({ userId: req.user.userId });
  if (!p) return res.status(404).json({ message: "Profile not found" });
  Object.assign(p, req.body);
  await p.save();
  res.json({
    profile: p,
    bmi: bmi(p),
    maintenance: maintenanceCalories(p),
    goalCalories: goalCalories(p),
  });
});

// Foods
app.get("/api/foods", authenticateToken, async (req, res) => {
  const foods = await Food.find().sort({ name: 1 }).lean();
  res.json(foods);
});

app.post("/api/foods", authenticateToken, async (req, res) => {
  try {
    const f = await Food.create(req.body);
    res.json(f);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Third-party food APIs removed per requirement (AI-only)

// FatSecret Food Search API
// Disable predefined foods search per requirement
app.get("/api/foods/search", async (req, res) => {
  return res.json([]);
});

// Logs
import dayjs from "dayjs";
app.get("/api/logs/:date", authenticateToken, async (req, res) => {
  const { date } = req.params; // YYYY-MM-DD
  const log = await Log.findOne({ userId: req.user.userId, date })
    .populate("items.foodId")
    .lean();
  res.json(log || { date, items: [] });
});

app.post("/api/logs/:date/add", authenticateToken, async (req, res) => {
  const { date } = req.params;
  const { foodName, quantity = 1 } = req.body;
  let log = await Log.findOne({ userId: req.user.userId, date });
  if (!log)
    log = await Log.create({ userId: req.user.userId, date, items: [] });
  // Predefined foods disabled: add a placeholder custom entry (no macros).
  log.items.push({ name: foodName, quantity });
  await log.save();
  res.json(log);
});

app.delete(
  "/api/logs/:date/items/:itemIndex",
  authenticateToken,
  async (req, res) => {
    const { date, itemIndex } = req.params;
    const index = parseInt(itemIndex);

    const log = await Log.findOne({ userId: req.user.userId, date });
    if (!log) return res.status(404).json({ message: "Log not found" });

    if (index < 0 || index >= log.items.length) {
      return res.status(400).json({ message: "Invalid item index" });
    }

    log.items.splice(index, 1);
    await log.save();

    const updatedLog = await Log.findOne({ userId: req.user.userId, date })
      .populate("items.foodId")
      .lean();
    res.json(updatedLog || { date, items: [] });
  }
);

app.get("/api/summary/:date", authenticateToken, async (req, res) => {
  const p = await Profile.findOne({ userId: req.user.userId }).lean();
  const { date } = req.params;
  const log = await Log.findOne({ userId: req.user.userId, date })
    .populate("items.foodId")
    .lean();
  const items = log?.items || [];
  const totals = items.reduce(
    (acc, it) => {
      if (it.nutrition) {
        acc.calories += it.nutrition.calories || 0;
        acc.protein += it.nutrition.protein || 0;
        acc.carbs += it.nutrition.carbs || 0;
        acc.fat += it.nutrition.fat || 0;
        acc.fiber += it.nutrition.fiber || 0;
      } else {
        const f = it.foodId || {};
        const q = it.quantity || 1;
        acc.calories += (f.calories || 0) * q;
        acc.protein += (f.protein || 0) * q;
        acc.carbs += (f.carbs || 0) * q;
        acc.fat += (f.fat || 0) * q;
        acc.fiber += (f.fiber || 0) * q;
      }
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  const goal = p ? goalCalories(p) : 2000;
  res.json({ date, totals, goal, items });
});

// AI parse meal from free text and optionally add to log
app.post("/api/ai/parse-meal", authenticateToken, async (req, res) => {
  try {
    const { text, date, autoAdd = false, useAI = true } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Text is required" });
    }
    if (!useAI) {
      return res
        .status(400)
        .json({ message: "AI mode required. Predefined foods are disabled." });
    }
    const parsed = await parseMealTextWithGemini(text);
    if (!parsed || !parsed.length) {
      return res.json({ items: [], added: 0, message: "No items recognized" });
    }

    const theDate = date || dayjs().format("YYYY-MM-DD");

    let added = 0;
    let log = null;
    if (autoAdd) {
      log = await Log.findOne({ userId: req.user.userId, date: theDate });
      if (!log)
        log = await Log.create({
          userId: req.user.userId,
          date: theDate,
          items: [],
        });
    }

    const results = [];
    for (const it of parsed) {
      const entry = {
        name: it.name,
        quantity: 1,
        grams: it.grams,
        nutrition: {
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fat: it.fat,
          fiber: it.fiber,
        },
      };
      results.push(entry);
      if (autoAdd && log) {
        log.items.push(entry);
        added++;
      }
    }

    if (autoAdd && log) await log.save();
    return res.json({ items: results, date: theDate, added });
  } catch (error) {
    if (error.message === "API_KEY_INVALID") {
      return res.status(401).json({ message: "Invalid Gemini API Key. Please update your .env file with a valid key in the server directory." });
    }
    console.error("AI parse-meal error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
