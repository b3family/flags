# Cờ Thủ Nhí

Game đoán lá cờ đối kháng cho 2 bé (5-10 tuổi), chơi trên iPad dọc.
Mỗi trận gồm 10 câu trắc nghiệm 4 đáp án; trả lời đúng càng nhanh càng nhiều điểm.

- Chơi: https://b3family.github.io/flags/
- Chế độ: tạo phòng bằng mã 4 ký tự (online) hoặc 2 bé chung 1 iPad.
- Công nghệ: web thuần (HTML/JS/CSS), Supabase (đăng nhập ẩn danh, phòng, realtime).

## Chạy thử

```
npm run serve 8765   # mở http://localhost:8765
npm test             # chạy unit test
```

## Supabase

Chạy `supabase/schema.sql` trong SQL Editor, bật Anonymous Sign-Ins, rồi điền URL và
anon key vào `src/config/supabase.json`. Chỉ dùng anon key, không bao giờ đưa `service_role` key vào repo.
