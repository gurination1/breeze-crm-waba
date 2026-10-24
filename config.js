require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5055,
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN || "EAATgzC3mrI4BS6Jjdpb50VR3I7mvpUzymsZBy1upegdTCEgYYk7mnCAJLvSQlz292ZCEe6UUbr4YlGJ2vTpxZCZBlfWZAhOWdv1pPYLqS8OvXKk6oRQKrnft2UY25t8dO8GkvX536OWZByDf7viHtZA07joJboknkExtgsfjynWkdZB4yJwJydeIbAqkEGZClHLPKvO99ZBIUyfvxm1h5pUIcXRpd6TdxWg1e7JfazJSpzX9Kw78pBmohP58w0tYezZC0QM98IZD",
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN || "guri_enterprise_waba_token_2026",
  
  // Phone numbers configuration
  PHONE_NUMBERS: {
    "1310338315506407": {
      display: "+91 62808 34006",
      name: "Gu / Enterprise Coexistence",
      wabaId: "1547330757161571"
    },
    "1346591765206499": {
      display: "+91 62808 34006",
      name: "Mystery DeMysters / Enterprise Direct",
      wabaId: "1061799510013265"
    },
    "1351625371363106": {
      display: "+91 62803 33252",
      name: "Edu Fun Learning / Tech Provider Hub",
      wabaId: "1066902379091253"
    },
    "1345576425313536": {
      display: "+91 97792 20581",
      name: "CP System (Funded Live Ads / Sales Hub)",
      wabaId: "2333275180764745"
    }
  },

  DEFAULT_PHONE_ID: process.env.DEFAULT_PHONE_ID || "1345576425313536",
  ADMIN_PHONE: "919041172159",

  // CP System Configuration
  CP_SYSTEM: {
    COORDINATOR_NAME: "Karan Singh",
    COORDINATOR_PHONE: process.env.CP_COORDINATOR_PHONE || "919915730338",
    ALT_COORDINATOR_PHONE: "919915730338",
    MARKETING_HEAD_PHONE: "919915730338",
    NOTIFY_LEAD_PHONES: process.env.CP_LEAD_NOTIFY_PHONE ? process.env.CP_LEAD_NOTIFY_PHONE.split(',').map(p => p.trim()) : ["919915730338"], // Leads go strictly to Head Marketing Karan Singh (+91 99157 30338)
    NOTIFY_ADMIN_PHONES: process.env.ADMIN_NOTIFY_PHONE ? process.env.ADMIN_NOTIFY_PHONE.split(',').map(p => p.trim()) : ["919041172159"], // Admin receives Complaints, Repairs, and General inquiries with subject & special note
    WEBSITE_URL: "https://www.cpsystem.in",
    BROCHURE_URL: "https://drive.google.com/file/d/1KBlyJZeFHJF0txk5NGLl4NTdfRtQ-A93/view?usp=sharing",
    YOUTUBE_URL: "https://www.youtube.com/@acandelectricaleducation"
  },

  // Gemini API Key pool for enterprise 99.99% uptime (Verified working keys prioritized)
  GEMINI_API_KEYS: (process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()) : [
    "AQ.Ab8RN6IeJS5T_8N2BA-VpdlU14YVOudPRxHpsNCetFBNiRVwRQ",
    "AQ.Ab8RN6L0tfBTUC2RxdaOSCC-ztWTiiMSbcLS_bwqxtXju9qVew",
    "AQ.Ab8RN6LOSvw-zxR966kZ8BLVdNpL2SVUKIVRg4pFQyAEmvJmeg",
    "AQ.Ab8RN6KDlOI_W1_dzVBfLcD8CcNC-R468VG_ggb6WlSDQmXCDg",
    "AQ.Ab8RN6LjNA2q2JY8RG-2_ZSffhRl2bZUzES8VurZmp913TRsQw",
    "AQ.Ab8RN6IF3wYCEaTwLvmRjCVttRp1MkoV9W8fKbGueS5guUhCow",
    "AQ.Ab8RN6Inlsrl8Xvu_ooqYjEiWQ4fIksPaZlSqJws8ym04y7y8g",
    "AQ.Ab8RN6KfymaYVTWj0KhpwBuLQ9xSF0SBeDxSDljrdaNVMBDInw",
    "AQ.Ab8RN6K7aC0SkDNWcIrbD7iQrehDjxL2Vs4QyAARO959k2Qvcg",
    "AQ.Ab8RN6KuhP1vOLQwD-QgE8KP4H1eWxXYMuQpuJ4or6biVi7pIQ"
  ]),

  // Groq Ultra-Fast High-Availability Engine & Pool
  GROQ_API_KEYS: (process.env.GROQ_API_KEYS ? process.env.GROQ_API_KEYS.split(',').map(k => k.trim()) : [
    "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",
    "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"
  ]),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "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",
  GROQ_MODEL: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",

  // Mistral AI High-Throughput Engine & Pool (376 RPM combined free tier)
  MISTRAL_API_KEYS: (process.env.MISTRAL_API_KEYS ? process.env.MISTRAL_API_KEYS.split(',').map(k => k.trim()) : [
    "mstrl_BDLw0I7yiDUizEbrMyO5NqKkbYHPRX85_2ARlJC",
    "mstrl_RJNq7qMXYkdYRlb443W5yhuiMrA2o67P_4dLXl5"
  ]),
  MISTRAL_MODEL: process.env.MISTRAL_MODEL || "open-mistral-nemo"
};

