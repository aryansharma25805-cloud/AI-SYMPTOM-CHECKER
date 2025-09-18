// server.js (Express + Ollama integration, ES Module)
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // frontend files

// ---------------------- Static Data ----------------------
const doctorsList = [
  { id: "1", name: "Dr. Anita Verma", specialty: "Dermatologist", phone: "9123456789", profile: "#" },
  { id: "2", name: "Dr. Arjun Kapoor", specialty: "Pulmonologist", phone: "9988776655", profile: "#" },
  { id: "3", name: "Dr. Meera Sharma", specialty: "General Physician", phone: "9876543210", profile: "#" }
];

const seriousKeywords = ["chest pain", "shortness of breath", "breathless", "high fever", "unconscious", "severe bleeding"];
const mediumKeywords  = ["fever", "cough", "sore throat", "fatigue", "headache", "vomit", "diarrhea"];

const conditionTranslations = {
  "Common Cold": { Hindi: "ज़ुकाम", Punjabi: "ਜੁਕਾਮ" },
  "Flu": { Hindi: "फ्लू", Punjabi: "ਫਲੂ" },
  "Pneumonia": { Hindi: "निमोनिया", Punjabi: "ਨਿਊਮੋਨੀਆ" },
  "Gastritis": { Hindi: "गैस्ट्राइटिस", Punjabi: "ਗੈਸਟ੍ਰਾਈਟਿਸ" },
  "IBS": { Hindi: "आइर्रिटेबल बाउल सिंड्रोम", Punjabi: "ਆਈ.ਬੀ.ਐਸ." },
  "Migraine": { Hindi: "माइग्रेन", Punjabi: "ਮਾਈਗਰੇਨ" },
  "Dehydration": { Hindi: "निर्जलीकरण", Punjabi: "ਪਾਣੀ ਦੀ ਘਾਟ" }
};
const specialtyTranslations = {
  "Dermatologist": { Hindi: "त्वचा रोग विशेषज्ञ", Punjabi: "ਚਮੜੀ ਦਾ ਮਾਹਿਰ" },
  "Pulmonologist": { Hindi: "फेफड़ों के रोग विशेषज्ञ", Punjabi: "ਫੇਫੜਿਆਂ ਦਾ ਮਾਹਿਰ" },
  "General Physician": { Hindi: "सामान्य चिकित्सक", Punjabi: "ਆਮ ਡਾਕਟਰ" }
};

// ---------------------- Helper Functions ----------------------
function classifySeverity(text) {
  const t = (text || "").toLowerCase();
  if (seriousKeywords.some(k => t.includes(k))) return "serious";
  if (mediumKeywords.some(k => t.includes(k))) return "medium";
  return "low";
}

function translateCondition(label, lang) {
  if (!lang || lang === "English") return label;
  const t = conditionTranslations[label];
  return (t && t[lang]) ? t[lang] : label;
}
function translateSpecialty(spec, lang) {
  if (!lang || lang === "English") return spec;
  const t = specialtyTranslations[spec];
  return (t && t[lang]) ? t[lang] : spec;
}

function getAdvice(severity, lang = "English") {
  const msgs = {
    serious: {
      English: "⚠️ Serious symptoms detected. Please consult a doctor immediately.",
      Hindi: "⚠️ गंभीर लक्षण दिख रहे हैं। तुरंत डॉक्टर से संपर्क करें।",
      Punjabi: "⚠️ ਗੰਭੀਰ ਲੱਛਣ ਦਿੱਸ ਰਹੇ ਹਨ। ਫੌਰੀ ਤੌਰ 'ਤੇ ਡਾਕਟਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।"
    },
    medium: {
      English: "Monitor symptoms, rest and hydrate. Seek medical help if it worsens.",
      Hindi: "लक्षणों का ध्यान रखें, आराम करें और हाइड्रेट रहें। अगर बिगड़े तो डॉक्टर से मिलें।",
      Punjabi: "ਲੱਛਣਾਂ 'ਤੇ ਨਿਗਰਾਨੀ ਕਰੋ, ਆਰਾਮ ਕਰੋ ਅਤੇ ਪਾਣੀ ਪੀਓ। ਜੇ ਹਾਲਤ ਖਰਾਬ ਹੋਵੇ ਤਾਂ ਡਾਕਟਰ ਕੋਲ ਜਾਓ।"
    },
    low: {
      English: "Mild symptoms — home remedies and rest should be sufficient.",
      Hindi: "हल्के लक्षण — घर पर आराम व घरेलू इलाज पर्याप्त हैं।",
      Punjabi: "ਹਲਕੇ ਲੱਛਣ — ਘਰੇਲੂ ਇਲਾਜ ਅਤੇ ਆਰਾਮ ਕਾਫੀ ਹਨ।"
    }
  };
  return msgs[severity]?.[lang] || msgs[severity]?.English;
}

function extractJSONFromText(text) {
  if (!text || typeof text !== "string") return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function heuristicDiagnoses(text) {
  const t = (text || "").toLowerCase();
  if (/stomach|abdominal|पेट|pet|dard|pain/.test(t)) {
    return ["Gastritis", "IBS", "Dehydration"];
  }
  if (/cough|breath|chest|छाती|साँस|saan/.test(t)) {
    return ["Common Cold", "Flu", "Pneumonia"];
  }
  return ["Common Cold", "Flu", "Migraine"];
}

// ---------------------- Routes ----------------------
app.post("/api/analyze", async (req, res) => {
  const { text, lang = "English" } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "Missing text" });

  const severityGuess = classifySeverity(text);

  const prompt = `
You are a medical triage assistant.
Analyze the symptoms and return STRICT JSON ONLY.

Language: ${lang}
Symptoms: "${text}"

Format:
{
  "diagnoses": [
    {"label":"Condition name","type":"home-remedy|doctor"},
    {"label":"Condition name","type":"home-remedy|doctor"},
    {"label":"Condition name","type":"home-remedy|doctor"}
  ],
  "severity": "low|medium|serious",
  "advice": "one short sentence in ${lang}"
}
Keep answers short, top-3 conditions only.
`;

  try {
    const aiResp = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt,
        stream: false,
        max_tokens: 400,
        temperature: 0.0
      })
    });

    if (aiResp.ok) {
      const aiData = await aiResp.json();
      const output = aiData?.response || "";
      console.log("AI output preview:", output.slice(0, 300).replace(/\n/g, " "));

      const parsed = extractJSONFromText(output);
      if (parsed?.diagnoses?.length) {
        const diagnoses = parsed.diagnoses.map(d => ({
          label: translateCondition(d.label?.trim() || "", lang),
          type: d.type || (severityGuess === "serious" ? "doctor" : "home-remedy")
        }));
        const severity = parsed.severity || severityGuess;
        const advice   = parsed.advice || getAdvice(severity, lang);

        return res.json({
          diagnoses: diagnoses.map(d => d.label),
          severity,
          advice,
          ...(severity === "serious" && {
            doctors: doctorsList.map(doc => ({
              id: doc.id,
              name: doc.name,
              specialty: translateSpecialty(doc.specialty, lang),
              phone: doc.phone,
              profile: doc.profile
            }))
          })
        });
      }
    } else {
      console.warn("Ollama failed:", aiResp.status, await aiResp.text());
    }
  } catch (err) {
    console.error("Error calling Ollama:", err.message);
  }

  // ----------- Fallback if AI fails -----------
  const fallbackDiag = heuristicDiagnoses(text);
  return res.json({
    diagnoses: fallbackDiag.map(d => translateCondition(d, lang)),
    severity: severityGuess,
    advice: getAdvice(severityGuess, lang),
    ...(severityGuess === "serious" && {
      doctors: doctorsList.map(doc => ({
        id: doc.id,
        name: doc.name,
        specialty: translateSpecialty(doc.specialty, lang),
        phone: doc.phone,
        profile: doc.profile
      }))
    })
  });
});

// list of doctors
app.get("/api/doctors", (req, res) => res.json(doctorsList));

// test endpoint
app.get("/api/test", (req, res) => res.json({ ok: true, message: "Backend ready" }));

// ---------------------- Start Server ----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Catch-all → serve frontend SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
