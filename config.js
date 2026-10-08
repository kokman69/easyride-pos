/* ================================================================
   ეს ერთადერთი ფაილია, რომელიც უნდა შეცვალო (იხ. README.md, ნაბიჯი 4).
   Supabase → Project Settings → API (ან "Connect") გვერდიდან დააკოპირე:
     - Project URL        → SUPABASE_URL
     - anon / public key  → SUPABASE_ANON_KEY
   anon key საჯარო გასაღებია და GitHub-ზე მისი ატვირთვა უსაფრთხოა:
   მონაცემებს ბაზის წესები (RLS) იცავს და პაროლის გარეშე არაფერი ჩანს.
   service_role key აქ არასოდეს ჩაწერო!
   ================================================================ */
window.ER_CONFIG = {
  SUPABASE_URL: "https://gcmzyosqhpdagtuolhfa.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjbXp5b3NxaHBkYWd0dW9saGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NTEyOTgsImV4cCI6MjEwNzAyNzI5OH0.MrYvUsfoAH6yTWbC5ap42s8-iYVZ5kejJjo9BRiY4ek",

  // ორი საერთო ანგარიში (Supabase → Authentication → Users).
  // თუ სხვა ელფოსტებს შექმნი, აქაც და schema.sql-ის staff ცხრილშიც შეცვალე.
  ADMIN_EMAIL: "admin@easyride.app",
  STAFF_EMAIL: "staff@easyride.app"
};
