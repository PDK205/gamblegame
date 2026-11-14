# Ngân Hà Vũ Môn

Trò chơi may rủi một người chơi, chạy thẳng trên trình duyệt. Bạn là một chú cá chép ánh sáng bơi ngược dải Ngân Hà qua chín tầng trời để vượt Vũ Môn hóa rồng. Không có tiền thật, không có quảng cáo, không cần cài đặt.

## Cách chơi

- Mỗi tầng trời là một chòm sao. Mỗi ngôi sao có một **cung sáng** cho biết tỉ lệ thắp được nó.
- Chạm một ngôi sao: cá chép bơi vòng quanh rồi dừng lại. Dừng trong cung sáng thì sao bừng cháy, dừng ngoài thì sao sụp thành hố đen và bạn mất 1 ❤.
- **May mắn lây lan.** Sao sáng cộng tỉ lệ cho các sao kề bên. Sao nào chạm 100% sẽ tự bùng cháy và kéo theo phản ứng dây chuyền. Hố đen thì hút bớt vận của sao kề bên.
- Tỉ lệ càng thấp thì ngọc thưởng càng nhiều, thắng liên tiếp thì hệ số chuỗi tăng dần.
- Thắp **Thiên Môn** ở đỉnh chòm sao để lên tầng. Ở lại vét thêm ngọc hay đi ngay là lựa chọn của bạn.
- Sau mỗi tầng, chọn một trong ba bảo vật rồi tiêu ngọc ở **Chợ Trời**: hồi ❤, mua cỏ bốn lá, hoặc rút quẻ cầu may.
- Tầng 3, 6 và 9 là thiên kiếp: sét đánh may rủi, sương che tỉ lệ, và ba ấn phong Vũ Môn.
- **Thời Vận:** mỗi sao thắp được nạp thêm cho viên ngọc ở góc dưới. Đầy thì bấm để tung: 3 lượt kế tiếp cộng 15% tỉ lệ và ngọc nhân đôi. Chọn lúc tung là quyết định của bạn.
- **Sao băng** thỉnh thoảng bay ngang trời. Chạm trúng thì nhận một điều ước ngẫu nhiên: ngọc, mưa vận cho cả chòm sao, cỏ bốn lá, nạp Thời Vận hoặc hồi ❤.
- Phá đảo xong sẽ mở **Kiếp** kế tiếp với tỉ lệ khắt khe hơn.
- **Quẻ hôm nay** là một lượt riêng dùng hạt giống theo ngày: hôm đó ai chơi cũng gặp cùng những chòm sao, kết thúc thì nhận một lời quẻ.
- Có 14 **thành tựu** để sưu tầm, lưu ngay trên trình duyệt.

Điều khiển: chạm hoặc bấm chuột vào ngôi sao. Giữ ngón tay (hoặc rê chuột) trên một ngôi sao để xem chi tiết. Đang quay mà muốn nhanh hơn thì chạm màn hình để tua.

## Chạy

Mở `index.html` bằng trình duyệt là chơi được. Nếu muốn chạy qua máy chủ cục bộ:

```bash
python3 -m http.server 8000
# rồi mở http://localhost:8000
```

Trò chơi không có bước biên dịch và không phụ thuộc thư viện nào. Phông chữ lấy từ Google Fonts; nếu không có mạng, trang tự dùng phông hệ thống.

## Cấu trúc

| Tệp | Vai trò |
| --- | --- |
| `index.html`, `css/style.css` | Khung trang, HUD, Chợ Trời, các màn phủ |
| `js/core.js` | Toàn bộ luật chơi, không đụng DOM. Mỗi hành động trả về danh sách sự kiện |
| `js/gfx.js` | Nền tinh vân (shader WebGL), chòm sao, cá chép, hạt sáng (Canvas 2D) |
| `js/audio.js` | Âm thanh tổng hợp bằng WebAudio theo thang ngũ cung |
| `js/ui.js` | Lớp giao diện DOM |
| `js/main.js` | Vòng chơi: diễn lại sự kiện của `core.js` bằng hình và tiếng |
| `tools/sim.js` | Mô phỏng hàng nghìn lượt chơi để cân bằng độ khó |
| `tools/build.js` | Gộp tất cả thành một tệp HTML duy nhất |

## Công cụ

```bash
node tools/sim.js 4000        # tỉ lệ phá đảo và thống kê từng tầng ở kiếp 1
node tools/sim.js 4000 2      # tương tự ở kiếp 3
node tools/build.js           # tạo dist/ngan-ha-vu-mon.html
```

Kết quả quay sao là thật: góc dừng của cá chép được rút ngẫu nhiên đều trên cả vòng tròn, nên tỉ lệ hiển thị đúng bằng tỉ lệ thắng. Con số 100% chỉ hiện khi ngôi sao chắc chắn sáng; các khoản cộng tạm thời dừng ở 99%.
