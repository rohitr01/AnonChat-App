import CryptoJS from "crypto-js";

export function encryptMessage(content: string, secretKey: string): string {
  try {
    return CryptoJS.AES.encrypt(content, secretKey).toString();
  } catch (err) {
    console.error("Encryption error:", err);
    return content;
  }
}

export function decryptMessage(encryptedContent: string, secretKey: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedContent, secretKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText) return "[Decryption Failed - Check Password]";
    return originalText;
  } catch (err) {
    console.error("Decryption error:", err);
    return "[Decryption Failed]";
  }
}
