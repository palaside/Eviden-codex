import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. สร้าง Instance ของ SDK โดยอ่าน Key จาก Environment Variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

// 2. ฟังก์ชันหลักสำหรับวิเคราะห์รูปภาพ
export async function extractEvidenceData(imageBase64: string, mimeType: string) {
  try {
    // เลือก Model (แนะนำ 'gemini-1.5-pro' สำหรับงานวิเคราะห์ภาพที่ต้องการความละเอียดสูง)
    // หรือใช้ 'gemini-1.5-flash' ถ้าต้องการความเร็วและต้นทุนถูกกว่า
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // 3. เตรียมไฟล์รูปภาพให้อยู่ในฟอร์แมตที่ SDK ต้องการ (Inline Data)
    const imageParts = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType, // เช่น "image/jpeg" หรือ "image/png"
        },
      },
    ];

    // 4. เขียน System Prompt แบบบังคับ (Structured Prompt)
    const prompt = `
      คุณคือผู้เชี่ยวชาญด้านการวิเคราะห์พยานหลักฐานดิจิทัล (Forensic Parser)
      จงสกัดข้อมูลจากรูปภาพนี้ และตอบกลับมาเป็นรูปแบบ JSON เท่านั้น ห้ามมีคำอธิบายอื่น
      
      กฎเหล็ก: 
      1. หากช่องไหนอ่านไม่ออกหรือถูกเซ็นเซอร์ ให้ใส่ค่าเป็น null และปรับ confidence ให้ต่ำกว่า 0.8
      2. หากเจอสลิปธนาคาร ให้ดึงข้อมูลมาให้ครบ
      
      รูปแบบ JSON ที่ต้องการ:
      {
        "document_type": "SLIP | CHAT | HYBRID",
        "data": {
          "amount": number | null,
          "sender": string | null,
          "receiver": string | null,
          "date": string | null
        },
        "confidence": {
          "amount_score": number,
          "sender_score": number
        },
        "needs_review": boolean
      }
    `;

    // 5. สั่งให้ AI ประมวลผล (ส่งรูปภาพพร้อมคำสั่งเข้าไป)
    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();

    // 6. ล้างอักขระ Markdown ```json ที่ AI อาจจะเผลอใส่มา และแปลงเป็น Object
    const cleanJsonString = responseText.replace(/```json\n?|```/g, "").trim();
    const parsedData = JSON.parse(cleanJsonString);

    return parsedData;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { error: "ไม่สามารถประมวลผลรูปภาพได้", raw_error: error };
  }
}