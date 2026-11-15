# Ngân Hà Vũ Môn

Trò chơi may rủi 3D một người chơi, chạy thẳng trên trình duyệt. Bạn là một chú cá chép bơi qua chín tầng trời để vượt Vũ Môn hóa rồng. Mỗi tầng là một hồ nước đêm soi bóng dải Ngân Hà; mỗi ngôi sao là một ngọn hoa đăng nổi trên mặt nước. Không có tiền thật, không có quảng cáo, không cần cài đặt.

## Cách chơi

- Mỗi tầng trời là một chòm hoa đăng. Mỗi ngọn đèn có một **cung sáng** trên mặt nước cho biết tỉ lệ thắp được nó.
- Chạm một ngọn đèn: cá chép bơi vòng quanh rồi dừng lại. Dừng trong cung sáng thì cá quẫy lên thắp đèn, dừng ngoài thì đèn chìm thành xoáy nước và bạn mất 1 ❤.
- **May mắn lây lan.** Đèn đã thắp cộng tỉ lệ cho các đèn kề bên. Ngọn nào chạm 100% sẽ tự bùng cháy và kéo theo phản ứng dây chuyền. Xoáy nước thì hút bớt vận của đèn kề bên.
- Tỉ lệ càng thấp thì ngọc thưởng càng nhiều, thắng liên tiếp thì hệ số chuỗi tăng dần.
- Thắp **Thiên Môn** trước cổng ở cuối hồ để cá chép vọt qua cổng, ngược thác lên tầng trên. Ở lại vét thêm ngọc hay đi ngay là lựa chọn của bạn.
- Sau mỗi tầng, chọn một trong ba bảo vật rồi tiêu ngọc ở **Chợ Trời**: hồi ❤, mua cỏ bốn lá, hoặc rút quẻ cầu may.
- Tầng 3, 6 và 9 là thiên kiếp: sét đánh may rủi, sương che tỉ lệ, và ba ấn phong Vũ Môn.
- **Thời Vận:** mỗi sao thắp được nạp thêm cho viên ngọc ở góc dưới. Đầy thì bấm để tung: 3 lượt kế tiếp cộng 15% tỉ lệ và ngọc nhân đôi. Chọn lúc tung là quyết định của bạn.
- **Sao băng** thỉnh thoảng bay ngang trời. Chạm trúng thì nhận một điều ước ngẫu nhiên: ngọc, mưa vận cho cả chòm sao, cỏ bốn lá, nạp Thời Vận hoặc hồi ❤.
- Phá đảo xong sẽ mở **Kiếp** kế tiếp với tỉ lệ khắt khe hơn.
- **Quẻ hôm nay** là một lượt riêng dùng hạt giống theo ngày: hôm đó ai chơi cũng gặp cùng những chòm sao, kết thúc thì nhận một lời quẻ.
- **Bể cá:** tám giống cá chép, mỗi giống mở khoá bằng một cột mốc và có một món khởi đầu riêng.
- Có 14 **thành tựu** để sưu tầm, lưu ngay trên trình duyệt.

Điều khiển: chạm hoặc bấm chuột vào ngọn đèn. Giữ ngón tay (hoặc rê chuột) trên một ngọn đèn để xem chi tiết. Kéo trên mặt nước để xoay góc nhìn, chạm nhẹ vào mặt nước để gọi cá chép bơi tới. Đang quay mà muốn nhanh hơn thì chạm màn hình để tua.

## Chạy

Mở `index.html` bằng trình duyệt là chơi được. Nếu muốn chạy qua máy chủ cục bộ:

```bash
python3 -m http.server 8000
# rồi mở http://localhost:8000
```

Trò chơi không có bước biên dịch. Cảnh 3D dùng Three.js r128, đã để sẵn trong `vendor/` (giấy phép MIT) nên chơi được khi không có mạng. Cần trình duyệt bật WebGL. Phông chữ lấy từ Google Fonts; nếu không có mạng, trang tự dùng phông hệ thống.

## Cấu trúc

| Tệp | Vai trò |
| --- | --- |
| `index.html`, `css/style.css` | Khung trang, HUD, Chợ Trời, các màn phủ |
| `js/core.js` | Toàn bộ luật chơi, không đụng DOM. Mỗi hành động trả về danh sách sự kiện |
| `js/scene3d.js` | Cảnh 3D: mặt nước soi bóng trời sao, hoa đăng, cá chép, thác và cổng Vũ Môn, thời tiết từng tầng, hậu kỳ toả sáng |
| `js/gfx.js` | Đồng hồ hoạt cảnh và lớp 2D phủ lên trên: con số tỉ lệ, chữ bay, tia lửa |
| `js/audio.js` | Âm thanh tổng hợp bằng WebAudio theo thang ngũ cung |
| `js/ui.js` | Lớp giao diện DOM |
| `js/main.js` | Vòng chơi: diễn lại sự kiện của `core.js` bằng hình và tiếng |
| `tools/sim.js` | Mô phỏng hàng nghìn lượt chơi để cân bằng độ khó |
| `vendor/three.min.js` | Thư viện Three.js r128 |
| `tools/build.js` | Gộp tất cả thành một tệp HTML duy nhất |

## Công cụ

```bash
node tools/sim.js 4000        # tỉ lệ phá đảo và thống kê từng tầng ở kiếp 1
node tools/sim.js 4000 2      # tương tự ở kiếp 3
node tools/build.js           # tạo dist/ngan-ha-vu-mon.html
```

Kết quả quay sao là thật: góc dừng của cá chép được rút ngẫu nhiên đều trên cả vòng tròn, nên tỉ lệ hiển thị đúng bằng tỉ lệ thắng. Con số 100% chỉ hiện khi ngôi sao chắc chắn sáng; các khoản cộng tạm thời dừng ở 99%.
