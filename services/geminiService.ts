import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

const getAIClient = () => {
    if (!ai) {
        // process.env.API_KEY is replaced by Vite at build time based on vite.config.ts
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            console.warn("CourtMas: API Key is missing. AI features will not work.");
        }
        ai = new GoogleGenAI({ apiKey: apiKey || 'MISSING_KEY' });
    }
    return ai;
};

export const generateAIResponse = async (userMessage: string): Promise<string> => {
  try {
    const aiClient = getAIClient();
    const model = 'gemini-3-flash-preview'; 
    const systemInstruction = `
      Anda adalah "CourtBot", pembantu maya untuk Pusat Badminton CourtMas.
      
      Peranan anda:
      1. Menjawab soalan tentang peraturan badminton.
      2. Memberi info tentang kemudahan (kami ada kedai air, sewa raket RM5, bilik persalinan).
      3. Waktu operasi kami: 8 Pagi - 12 Malam setiap hari.
      4. Polisi pembatalan: Tiada pemulangan wang (no refund) jika batal kurang dari 24 jam.
      
      Gaya bahasa:
      - Santai, mesra, dan menggunakan Bahasa Melayu yang mudah difahami.
      - Pendek dan ringkas (sesuai untuk chat mobile).
    `;

    const response = await aiClient.models.generateContent({
      model: model,
      contents: userMessage,
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 0 } // Fast response needed for chat
      }
    });

    return response.text || "Maaf, saya tidak dapat memproses permintaan anda sekarang.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Maaf, perkhidmatan AI sedang sibuk atau tidak tersedia. Sila cuba sebentar lagi.";
  }
};